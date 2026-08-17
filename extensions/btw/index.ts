import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { BtwSideThreadRuntime, type BtwMessage, type BtwModelSelection, type BtwSideTurnRequest, type BtwSideTurnRunner, type BtwThreadSnapshot } from "../../src/runtime/btw/side-thread.js";

export const BTW_COMMAND_NAME = "btw" as const;
const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const MAX_SIDE_CONTEXT_MESSAGES = 12;
const MAX_SIDE_CONTEXT_CHARS = 24_000;
const MAX_SIDE_QUESTION_CHARS = 12_000;
const SIDE_THREAD_SYSTEM_PROMPT = "You are an isolated BTW side thread. Answer using only the bounded side-thread material supplied for this turn. Do not invoke tools or assume access to the main Pi conversation, session, editor, or files.";

/**
 * Produce the only context sent to a BTW provider turn. It is deliberately
 * bounded, has no tools, and is built exclusively from copied side-thread data.
 */
export function buildBtwSideOnlyContext(request: BtwSideTurnRequest): Context {
  const messages = request.messages.slice(-MAX_SIDE_CONTEXT_MESSAGES)
    .map((message: BtwMessage) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`);
  const steering = request.steering.map((item: string) => `Steering: ${item}`);
  const currentQuestion = `Current question: ${request.question.slice(0, MAX_SIDE_QUESTION_CHARS)}`;
  const material = [...messages, ...steering].join("\n\n");
  const availableMaterialChars = Math.max(0, MAX_SIDE_CONTEXT_CHARS - currentQuestion.length);
  const boundedMaterial = material.length > availableMaterialChars
    ? material.slice(-availableMaterialChars)
    : material;
  return {
    systemPrompt: SIDE_THREAD_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `BTW side-thread material (bounded):\n${boundedMaterial}\n\n${currentQuestion}\n\nRespond to the current side-thread question only.`,
      timestamp: 0,
    }],
    tools: [],
  };
}

/**
 * Binds Pi's configured ModelRegistry at the command boundary. The resulting
 * runner has only a model lookup and one complete() call; it receives neither
 * AgentSession nor Pi JSONL capabilities.
 */
export function createBtwModelRegistrySideTurnRunner(modelRegistry: Pick<ModelRegistry, "find" | "complete">): BtwSideTurnRunner {
  return async (request) => {
    const model = modelRegistry.find(request.selection.provider, request.selection.model);
    if (!model) throw new Error("BTW selected model is no longer available");
    const answer = await modelRegistry.complete(model, buildBtwSideOnlyContext(request), { reasoning: request.selection.thinking });
    return assistantText(answer);
  };
}

/** TUI-only controller; its registry is intentionally process-local and never persisted. */
export class BtwTuiController {
  private readonly runtimes = new Map<string, BtwSideThreadRuntime>();

  public constructor(private readonly sideTurnRunner?: BtwSideTurnRunner) {}

  public runtime(sessionId: string, sideTurnRunner = this.sideTurnRunner): BtwSideThreadRuntime {
    let runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      runtime = new BtwSideThreadRuntime({ sideTurnRunner });
      this.runtimes.set(sessionId, runtime);
    }
    return runtime;
  }

  public clear(sessionId: string): void { this.runtimes.get(sessionId)?.clear(); this.runtimes.delete(sessionId); }

  public async open(context: ExtensionCommandContext): Promise<void> {
    if (context.mode !== "tui" || !context.hasUI) {
      context.ui.notify("BTW is available only in the interactive Pi TUI", "warning");
      return;
    }
    const runtime = this.runtime(
      context.sessionManager.getSessionId(),
      this.sideTurnRunner ?? createBtwModelRegistrySideTurnRunner(context.modelRegistry),
    );
    const threads = runtime.list();
    const choices = ["New side thread", ...threads.map(threadLabel)];
    const selection = await context.ui.select("BTW side threads (in memory only)", choices);
    if (!selection) return;
    if (selection === "New side thread") {
      await this.createThread(runtime, context);
      return;
    }
    const thread = threads.find((candidate) => threadLabel(candidate) === selection);
    if (thread) await this.manageThread(runtime, thread, context);
  }

  private async createThread(runtime: BtwSideThreadRuntime, context: ExtensionCommandContext): Promise<void> {
    const candidates = modelCandidates(context);
    if (candidates.length === 0) {
      context.ui.notify("BTW needs an explicitly selectable model; no session model is available", "error");
      return;
    }
    const modelOptions = candidates.map((candidate) => `${candidate.provider} / ${candidate.model}`);
    const selectedModel = await context.ui.select("BTW model (explicit)", modelOptions);
    if (!selectedModel) return;
    const candidate = candidates[modelOptions.indexOf(selectedModel)];
    if (!candidate) return;
    const thinking = await context.ui.select("BTW thinking level (explicit)", [...THINKING_LEVELS]);
    if (!thinking || !isThinkingLevel(thinking)) return;
    const thread = runtime.create({ ...candidate, thinking });
    const prompt = await context.ui.input("BTW side-thread question (optional)", "This remains outside the main conversation");
    if (prompt?.trim()) await this.runSideTurn(runtime, thread.id, prompt, context);
    context.ui.notify(`BTW ${thread.id} created in memory with ${candidate.provider}/${candidate.model} thinking=${thinking}; no main-session mutation was made`, "info");
  }

  private async manageThread(runtime: BtwSideThreadRuntime, thread: BtwThreadSnapshot, context: ExtensionCommandContext): Promise<void> {
    const action = await context.ui.select(`BTW ${thread.id}`, ["Ask side-thread question", "Queue isolated steering", "Preview bring to main editor", "Cancel side thread"]);
    if (!action) return;
    if (action === "Ask side-thread question") {
      const text = await context.ui.input("BTW side-thread question");
      if (text?.trim()) await this.runSideTurn(runtime, thread.id, text, context);
      return;
    }
    if (action === "Queue isolated steering") {
      const text = await context.ui.input("BTW steering for the side thread");
      if (text?.trim()) {
        runtime.queueSteering(thread.id, text);
        context.ui.notify("BTW steering was queued only for the side thread", "info");
      }
      return;
    }
    if (action === "Cancel side thread") {
      runtime.cancel(thread.id);
      context.ui.notify("BTW side thread cancelled; its pending steering was discarded", "info");
      return;
    }
    await this.previewAndBring(runtime, thread.id, context);
  }

  private async runSideTurn(runtime: BtwSideThreadRuntime, threadId: string, question: string, context: ExtensionCommandContext): Promise<void> {
    try {
      await runtime.runSideTurn(threadId, question);
      context.ui.notify("BTW side answer retained only in the in-memory side thread", "info");
    } catch (error) {
      context.ui.notify(boundedError(error), "error");
    }
  }

  private async previewAndBring(runtime: BtwSideThreadRuntime, threadId: string, context: ExtensionCommandContext): Promise<void> {
    let preview;
    try { preview = runtime.previewBringToMain(threadId); }
    catch (error) { context.ui.notify(boundedError(error), "warning"); return; }
    // Preview is read-only with respect to both Pi JSONL and the main editor.
    await context.ui.editor(`BTW preview: ${threadId}`, preview.text);
    const confirmed = await context.ui.confirm("Bring BTW draft to main editor?", "This only places the reviewed draft in the editor. It does not send a main-session message.");
    if (!confirmed) return;
    try {
      // The TUI is the current interactive editor authority. No sendMessage,
      // sendUserMessage, appendEntry, or session mutation is performed.
      const draft = runtime.bringToMain(preview.previewId, `tui-${randomUUID()}`, context.mode === "tui");
      const existing = context.ui.getEditorText().trim();
      context.ui.setEditorText(existing ? `${existing}\n\n${draft.text}` : draft.text);
      context.ui.notify("BTW draft placed in the editor. Review and submit it yourself to affect the main conversation.", "info");
    } catch (error) {
      context.ui.notify(boundedError(error), "error");
    }
  }
}

/** The command uses either an injected test runner or the TUI context's ModelRegistry; it never creates a provider client or touches session persistence. */
export function registerBtwCommand(pi: ExtensionAPI, controller = new BtwTuiController()): void {
  pi.registerCommand(BTW_COMMAND_NAME, {
    description: "Create an ephemeral independent BTW side thread and explicitly preview a draft for the main editor",
    handler: async (_args, context) => controller.open(context),
  });
  pi.on("session_shutdown", (_event, context) => controller.clear(context.sessionManager.getSessionId()));
}

function modelCandidates(context: ExtensionCommandContext): readonly Omit<BtwModelSelection, "thinking">[] {
  const candidates: Array<Omit<BtwModelSelection, "thinking">> = [];
  const add = (model: { provider?: unknown; id?: unknown } | undefined) => {
    if (!model || typeof model.provider !== "string" || typeof model.id !== "string" || !model.provider.trim() || !model.id.trim()) return;
    if (!candidates.some((candidate) => candidate.provider === model.provider && candidate.model === model.id)) candidates.push({ provider: model.provider, model: model.id });
  };
  for (const scoped of context.scopedModels) add(scoped.model);
  add(context.model);
  return candidates;
}

function threadLabel(thread: BtwThreadSnapshot): string {
  return `${thread.id} — ${thread.selection.provider}/${thread.selection.model} (${thread.selection.thinking}, ${thread.state}, messages=${thread.messages.length}, steering=${thread.steeringQueue.length})`;
}

export function assistantText(message: AssistantMessage): string {
  const text = message.content
    .filter((content): content is Extract<AssistantMessage["content"][number], { type: "text" }> => content.type === "text")
    .map((content) => content.text)
    .join("")
    .trim();
  if (!text) throw new Error("BTW selected model returned no text answer");
  return text;
}

function isThinkingLevel(value: string): value is ThinkingLevel { return THINKING_LEVELS.includes(value as ThinkingLevel); }
function boundedError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 240) || "BTW operation failed";
}
