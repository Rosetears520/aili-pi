import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAgentSessionServices, getAgentDir, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { BtwSideThreadRuntime, type BtwSideTurnRequest } from "../../../../../runtime/btw/side-thread.js";
import { assistantText, buildBtwSideOnlyContext } from "../../../../../../extensions/btw/index.js";

const THINKING_LEVELS: readonly string[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const MAX_QUESTION_CHARS = 12_000;

/**
 * Process-local side threads for the Web composer. The runtime instance is
 * intentionally never persisted: losing the server process loses the threads,
 * and the UI must not present them as recoverable.
 */
const globalRef = globalThis as { __ailiBtwRuntime?: BtwSideThreadRuntime };

async function runtime(): Promise<BtwSideThreadRuntime> {
  if (!globalRef.__ailiBtwRuntime) {
    const services = await createAgentSessionServices({ cwd: process.cwd(), agentDir: getAgentDir() });
    const registry = new ModelRegistry(services.modelRuntime);
    const runner = async (request: BtwSideTurnRequest) => {
      const model = registry.find(request.selection.provider, request.selection.model);
      if (!model) throw new Error("BTW selected model is no longer available");
      const answer = await registry.complete(model, buildBtwSideOnlyContext(request), { reasoning: request.selection.thinking });
      return assistantText(answer);
    };
    globalRef.__ailiBtwRuntime = new BtwSideThreadRuntime({ sideTurnRunner: runner });
  }
  return globalRef.__ailiBtwRuntime;
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    const threads = (await runtime()).list();
    return NextResponse.json({ threads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return badRequest("invalid-json");
    body = parsed as Record<string, unknown>;
  } catch {
    return badRequest("invalid-json");
  }

  const action = boundedString(body.action, 32);
  if (!action) return badRequest("missing action");

  try {
    const rt = await runtime();

    if (action === "list") {
      return NextResponse.json({ threads: rt.list() }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "create") {
      const provider = boundedString(body.provider, 120);
      const model = boundedString(body.model, 240);
      const thinking = boundedString(body.thinking, 16);
      if (!provider || !model) return badRequest("provider and model are required");
      if (!thinking || !THINKING_LEVELS.includes(thinking)) return badRequest("thinking level is invalid");
      const thread = rt.create({ provider, model, thinking: thinking as ThinkingLevel });
      return NextResponse.json({ thread }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "ask") {
      const threadId = boundedString(body.threadId, 120);
      const question = boundedString(body.question, MAX_QUESTION_CHARS);
      if (!threadId || !question) return badRequest("threadId and question are required");
      try {
        const thread = await rt.runSideTurn(threadId, question);
        return NextResponse.json({ thread }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
      }
    }

    if (action === "cancel") {
      const threadId = boundedString(body.threadId, 120);
      if (!threadId) return badRequest("threadId is required");
      try {
        const thread = rt.cancel(threadId);
        return NextResponse.json({ thread }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
      }
    }

    if (action === "preview") {
      const threadId = boundedString(body.threadId, 120);
      if (!threadId) return badRequest("threadId is required");
      try {
        const preview = rt.previewBringToMain(threadId);
        return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
      }
    }

    if (action === "bring") {
      const previewId = boundedString(body.previewId, 120);
      if (!previewId) return badRequest("previewId is required");
      try {
        // The Web composer is the interactive editor authority for this draft;
        // bringToMain only returns text and never sends a main-session message.
        const draft = rt.bringToMain(previewId, `web-${randomUUID()}`, true);
        return NextResponse.json({ text: draft.text, threadId: draft.threadId }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
      }
    }

    if (action === "clear") {
      rt.clear();
      return NextResponse.json({ threads: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    return badRequest("unknown action");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
