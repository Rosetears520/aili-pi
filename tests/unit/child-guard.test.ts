import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import registerChildGuard from "../../src/runtime/child-guard.js";

const ROOT = resolve(import.meta.dirname, "../..");
let scratch = "";
let previousPolicy: string | undefined;

beforeEach(async () => {
  await mkdir(join(ROOT, ".tmp"), { recursive: true });
  scratch = await mkdtemp(join(ROOT, ".tmp/guard-"));
  previousPolicy = process.env.AILI_CHILD_POLICY_FILE;
});

afterEach(async () => {
  if (previousPolicy === undefined) delete process.env.AILI_CHILD_POLICY_FILE;
  else process.env.AILI_CHILD_POLICY_FILE = previousPolicy;
  await rm(scratch, { recursive: true, force: true });
});

describe("child-only permission guard", () => {
  it("enforces explicit task paths and fails closed on malformed events", async () => {
    const policyPath = join(scratch, "policy.json");
    await writeFile(policyPath, JSON.stringify({ schemaVersion: 1, taskId: "task", role: "code-scout", projectRoot: ROOT, mode: "standard", allowedTools: ["read"], taskBoundaries: [join(ROOT, "src")] }));
    process.env.AILI_CHILD_POLICY_FILE = policyPath;
    let handler: ((event: ToolCallEvent) => Promise<ToolCallEventResult | undefined>) | undefined;
    registerChildGuard({ on(event: string, candidate: typeof handler) { if (event === "tool_call") handler = candidate; } } as unknown as ExtensionAPI);
    expect(await handler?.({ toolName: "read", input: { path: join(ROOT, "src/runtime/index.ts") } } as ToolCallEvent)).toBeUndefined();
    expect(await handler?.({ toolName: "read", input: { path: join(ROOT, "package.json") } } as ToolCallEvent)).toEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("task path boundary") }));
    expect(await handler?.({ toolName: "read", input: null } as unknown as ToolCallEvent)).toEqual({ block: true, reason: "AILI child denied by classification.error.fail-closed" });
    expect(await handler?.({ toolName: "write", input: { path: join(ROOT, "src/nope") } } as ToolCallEvent)).toEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("tool ceiling") }));
  });

  it("allows projected role writes only inside every explicit policy boundary", async () => {
    const policyPath = join(scratch, "writer-policy.json");
    const policy = { schemaVersion: 1, taskId: "task", role: "implementer", projectRoot: ROOT, allowedTools: ["read", "write", "edit"], taskBoundaries: [join(ROOT, "src")] };
    await writeFile(policyPath, JSON.stringify(policy));
    process.env.AILI_CHILD_POLICY_FILE = policyPath;
    let handler: ((event: ToolCallEvent) => Promise<ToolCallEventResult | undefined>) | undefined;
    registerChildGuard({ on(event: string, candidate: typeof handler) { if (event === "tool_call") handler = candidate; } } as unknown as ExtensionAPI);
    expect(await handler?.({ toolName: "write", input: { path: join(ROOT, "src/generated.ts"), content: "x" } } as ToolCallEvent)).toBeUndefined();
    expect(await handler?.({ type: "tool_call", toolCallId: "edit-outside", toolName: "edit", input: { path: join(ROOT, "package.json"), oldText: "x", newText: "y" } } as ToolCallEvent)).toEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("task path boundary") }));
    expect(await handler?.({ toolName: "bash", input: { command: "git status" } } as ToolCallEvent)).toEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("tool ceiling") }));
  });
});
