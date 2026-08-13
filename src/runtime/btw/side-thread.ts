import { randomUUID } from "node:crypto";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

const MAX_THREADS = 16;
const MAX_MESSAGES_PER_THREAD = 256;
const MAX_STEERING_ITEMS = 32;
const MAX_TEXT_LENGTH = 32_000;
const SAFE_THREAD_ID = /^btw-[A-Za-z0-9_-]{1,128}$/;

export type BtwThreadState = "idle" | "running" | "cancelled";
export type BtwMessageRole = "user" | "assistant";

/** The model and thinking level are always captured at side-thread creation. */
export interface BtwModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly thinking: ThinkingLevel;
}

export interface BtwMessage {
  readonly id: string;
  readonly role: BtwMessageRole;
  readonly text: string;
  readonly createdAt: string;
}

export interface BtwThreadSnapshot {
  readonly id: string;
  readonly selection: BtwModelSelection;
  readonly state: BtwThreadState;
  readonly messages: readonly BtwMessage[];
  readonly steeringQueue: readonly string[];
  readonly createdAt: string;
}

export interface BtwBringToMainPreview {
  readonly threadId: string;
  readonly previewId: string;
  readonly text: string;
  readonly messageCount: number;
}

export interface BtwMainEditorDraft {
  readonly threadId: string;
  readonly previewId: string;
  readonly requestId: string;
  readonly text: string;
}

/**
 * An injected, side-thread-only execution boundary. The runner receives copied
 * side state and has no Pi command or session capability.
 */
export interface BtwSideTurnRequest {
  readonly threadId: string;
  readonly selection: BtwModelSelection;
  readonly question: string;
  readonly messages: readonly BtwMessage[];
  readonly steering: readonly string[];
}

export type BtwSideTurnRunner = (request: BtwSideTurnRequest) => Promise<string>;

export interface BtwRuntimeOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly maxThreads?: number;
  readonly sideTurnRunner?: BtwSideTurnRunner;
}

interface Thread {
  id: string;
  selection: BtwModelSelection;
  state: BtwThreadState;
  messages: BtwMessage[];
  steeringQueue: string[];
  createdAt: string;
}

/**
 * Ephemeral, deliberately provider-free BTW state. It does not read or write
 * Pi JSONL, call a provider, or retain anything after its owning process exits.
 * Its injected side-turn runner receives only copied side-thread state and never
 * receives access to the main conversation.
 */
export class BtwSideThreadRuntime {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly maxThreads: number;
  private readonly sideTurnRunner: BtwSideTurnRunner | undefined;
  private readonly threads = new Map<string, Thread>();
  private readonly previews = new Map<string, BtwBringToMainPreview>();
  private readonly appliedDrafts = new Map<string, BtwMainEditorDraft>();

  public constructor(options: BtwRuntimeOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => randomUUID());
    this.maxThreads = bounded(options.maxThreads ?? MAX_THREADS, 1, MAX_THREADS, "maxThreads");
    this.sideTurnRunner = options.sideTurnRunner;
  }

  public create(selection: BtwModelSelection): BtwThreadSnapshot {
    if (this.threads.size >= this.maxThreads) throw new Error("BTW thread limit reached");
    const normalized = normalizeSelection(selection);
    const id = this.newThreadId();
    const thread: Thread = {
      id,
      selection: normalized,
      state: "idle",
      messages: [],
      steeringQueue: [],
      createdAt: this.now().toISOString(),
    };
    this.threads.set(id, thread);
    return snapshot(thread);
  }

  public list(): readonly BtwThreadSnapshot[] { return [...this.threads.values()].map(snapshot); }

  public get(threadId: string): BtwThreadSnapshot | undefined {
    const thread = this.threads.get(threadId);
    return thread ? snapshot(thread) : undefined;
  }

  public appendUser(threadId: string, text: string): BtwThreadSnapshot {
    return this.append(threadId, "user", text);
  }

  /** A side-turn runner may append its result here; it can never affect main Pi state. */
  public appendAssistant(threadId: string, text: string): BtwThreadSnapshot {
    this.append(threadId, "assistant", text);
    const thread = this.requireThread(threadId);
    if (thread.state === "running") thread.state = "idle";
    return snapshot(thread);
  }

  public queueSteering(threadId: string, text: string): BtwThreadSnapshot {
    const thread = this.requireActiveThread(threadId);
    if (thread.steeringQueue.length >= MAX_STEERING_ITEMS) throw new Error("BTW steering queue limit reached");
    thread.steeringQueue.push(normalizeText(text));
    return snapshot(thread);
  }

  /** Atomically consume queued steering for an isolated side-turn runner. */
  public takeSteering(threadId: string): readonly string[] {
    const thread = this.requireActiveThread(threadId);
    const queued = Object.freeze([...thread.steeringQueue]);
    thread.steeringQueue.length = 0;
    return queued;
  }

  public beginTurn(threadId: string): BtwThreadSnapshot {
    const thread = this.requireActiveThread(threadId);
    if (thread.state === "running") throw new Error("BTW thread is already running");
    thread.state = "running";
    return snapshot(thread);
  }

  /**
   * Runs one explicitly injected side turn. The selected model/thinking and all
   * input are copied to the runner; only its returned answer is appended here.
   * This runtime intentionally has no Pi session, editor, or provider access.
   */
  public async runSideTurn(threadId: string, question: string): Promise<BtwThreadSnapshot> {
    if (!this.sideTurnRunner) throw new Error("BTW side-turn runner is not configured");
    const normalizedQuestion = normalizeText(question);
    this.appendUser(threadId, normalizedQuestion);
    this.beginTurn(threadId);
    const thread = this.requireThread(threadId);
    const steering = this.takeSteering(threadId);
    const request: BtwSideTurnRequest = Object.freeze({
      threadId: thread.id,
      selection: Object.freeze({ ...thread.selection }),
      question: normalizedQuestion,
      messages: snapshot(thread).messages,
      steering,
    });
    try {
      const answer = await this.sideTurnRunner(request);
      if (typeof answer !== "string") throw new Error("BTW side-turn runner returned a non-text answer");
      return this.appendAssistant(threadId, answer);
    } catch (error) {
      // Retain unconsumed isolated steering for a later retry, unless the user
      // explicitly cancelled the thread while its injected runner was pending.
      if (thread.state !== "cancelled") thread.steeringQueue.unshift(...steering);
      // A failed isolated turn must not strand an in-memory thread as running.
      if (thread.state === "running") thread.state = "idle";
      throw error;
    }
  }

  public cancel(threadId: string): BtwThreadSnapshot {
    const thread = this.requireThread(threadId);
    thread.state = "cancelled";
    thread.steeringQueue.length = 0;
    return snapshot(thread);
  }

  /** Build a draft only. Calling preview never changes the Pi editor or session. */
  public previewBringToMain(threadId: string): BtwBringToMainPreview {
    const thread = this.requireThread(threadId);
    const text = thread.messages.map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`).join("\n\n");
    if (!text) throw new Error("BTW thread has no messages to bring to main");
    const preview: BtwBringToMainPreview = Object.freeze({
      threadId,
      previewId: `preview-${this.createId()}`,
      text,
      messageCount: thread.messages.length,
    });
    this.previews.set(preview.previewId, preview);
    return preview;
  }

  /**
   * Gate explicit confirmation before returning an editor-only draft. No Pi
   * message is sent here; the caller must still leave it in the editor for the
   * user to inspect and submit themselves.
   */
  public bringToMain(previewId: string, requestId: string, writerAuthorized: boolean): BtwMainEditorDraft {
    if (!writerAuthorized) throw new Error("BTW bring-to-main requires current TUI writer authorization");
    if (!isSafeId(requestId)) throw new Error("invalid BTW bring-to-main request id");
    const prior = this.appliedDrafts.get(requestId);
    if (prior) return prior;
    const preview = this.previews.get(previewId);
    if (!preview) throw new Error("BTW bring-to-main preview is missing or expired");
    const draft: BtwMainEditorDraft = Object.freeze({
      threadId: preview.threadId,
      previewId: preview.previewId,
      requestId,
      text: preview.text,
    });
    this.appliedDrafts.set(requestId, draft);
    return draft;
  }

  /** Process/session shutdown intentionally discards all ephemeral BTW state. */
  public clear(): void {
    this.threads.clear();
    this.previews.clear();
    this.appliedDrafts.clear();
  }

  private append(threadId: string, role: BtwMessageRole, text: string): BtwThreadSnapshot {
    const thread = this.requireActiveThread(threadId);
    if (thread.messages.length >= MAX_MESSAGES_PER_THREAD) throw new Error("BTW message limit reached");
    thread.messages.push(Object.freeze({ id: `message-${this.createId()}`, role, text: normalizeText(text), createdAt: this.now().toISOString() }));
    return snapshot(thread);
  }

  private requireThread(threadId: string): Thread {
    if (!SAFE_THREAD_ID.test(threadId)) throw new Error("invalid BTW thread id");
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error("BTW thread was not found");
    return thread;
  }

  private requireActiveThread(threadId: string): Thread {
    const thread = this.requireThread(threadId);
    if (thread.state === "cancelled") throw new Error("BTW thread is cancelled");
    return thread;
  }

  private newThreadId(): string {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = `btw-${this.createId()}`;
      if (SAFE_THREAD_ID.test(id) && !this.threads.has(id)) return id;
    }
    throw new Error("unable to allocate BTW thread id");
  }
}

function snapshot(thread: Thread): BtwThreadSnapshot {
  return Object.freeze({
    id: thread.id,
    selection: Object.freeze({ ...thread.selection }),
    state: thread.state,
    messages: Object.freeze(thread.messages.map((message) => Object.freeze({ ...message }))),
    steeringQueue: Object.freeze([...thread.steeringQueue]),
    createdAt: thread.createdAt,
  });
}

function normalizeSelection(value: BtwModelSelection): BtwModelSelection {
  if (!isSafeText(value.provider, 128) || !isSafeText(value.model, 256)) throw new Error("BTW requires an explicit provider and model");
  if (!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value.thinking)) throw new Error("BTW requires an explicit thinking level");
  return Object.freeze({ provider: value.provider.trim(), model: value.model.trim(), thinking: value.thinking });
}

function normalizeText(value: string): string {
  if (!isSafeText(value, MAX_TEXT_LENGTH)) throw new Error("BTW text must be non-empty and within its size limit");
  return value.trim();
}

function isSafeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function isSafeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function bounded(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} out of range`);
  return value;
}
