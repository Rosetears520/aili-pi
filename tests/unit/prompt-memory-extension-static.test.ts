import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveContextOwner } from "../../src/runtime/context-runtime.js";

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Prompt Middleware and Observational Memory extension surfaces", () => {
  it("registers prompt controls, one-shot injection and runtime denial", async () => {
    const [entry, prompt] = await Promise.all([source("extensions/index.ts"), source("extensions/prompt-middleware/index.ts")]);
    expect(entry).toContain("registerPromptMiddleware(pi)");
    expect(prompt).toContain('registerCommand("snippets"');
    expect(prompt).toContain('registerShortcut("alt+s"');
    expect(prompt).toContain('pi.on("before_agent_start"');
    expect(prompt).toContain('pi.on("tool_call"');
    expect(prompt).toContain("promptPolicyAllowsTool");
    expect(prompt).toContain('pi.on("turn_end"');
  });

  it("keeps observational memory default-on locally, hybrid, early, managed-internal and externally fail-closed", async () => {
    const [entry, memory, lifecycle, adapter] = await Promise.all([source("extensions/index.ts"), source("extensions/observational-memory/index.ts"), source("src/runtime/observational-memory/lifecycle.ts"), source("src/runtime/observational-memory/mempalace-adapter.ts")]);
    expect(entry.indexOf("registerObservationalMemory(pi)")).toBeLessThan(entry.indexOf("registerAiliRuntime(pi)"));
    expect(memory).toContain('registerCommand("memory-auto"');
    expect(memory).toContain("t/on 开启，f/off 关闭，s/status 状态");
    expect(memory).toContain("checkpoint 检查点，authorize 授权，revoke 撤销");
    expect(memory).toContain('pi.on("session_before_compact"');
    expect(memory).toContain("return undefined");
    expect(memory).not.toMatch(/ctx\.compact|cancel:\s*true|compaction:/);
    expect(lifecycle).toContain("private enabled = true");
    expect(lifecycle).toContain("ManagedInternalMemoryScheduler");
    expect(lifecycle).toContain("detectHighValueEvent");
    expect(lifecycle).toContain("tokenThreshold");
    expect(memory).toContain('customType: "observational-memory-recall"');
    expect(memory).toContain("projectionInjected");
    expect(memory).toContain("getBranch()");
    expect(memory).toContain("sessionOwnedMcpInvokerFor(pi)");
    expect(memory).toContain("authority.revoke(); memory.revoke()");
    expect(memory).toContain("evidence.installed === evidence.accepted");
    expect(memory).toContain('accepted: MEMPALACE_VERSION');
    expect(memory).toContain("resolveProviderVersion");
    expect(memory).toContain('execFileAsync("mempalace", ["--version"]');
    expect(memory).toContain("timeout: VERSION_PROBE_TIMEOUT_MS");
    expect(memory).toContain("maxBuffer: VERSION_PROBE_MAX_BUFFER");
    expect(adapter).toContain("requiresExternalWrite: true");
    expect(adapter).not.toMatch(/tools\.call|mcp\.call|write_memory/);
  });

  it("registers memory before final ACP/Codex context owners without changing their owner fixtures", async () => {
    const [entry, memory, context] = await Promise.all([source("extensions/index.ts"), source("extensions/observational-memory/index.ts"), source("src/runtime/context-runtime.ts")]);
    expect(entry.indexOf("registerObservationalMemory(pi)")).toBeLessThan(entry.indexOf("registerAiliRuntime(pi)"));
    expect(resolveContextOwner({ provider: "openai-codex", api: "openai-codex-responses", modelId: "fixture" })).toBe("codex-remote-v2");
    expect(resolveContextOwner({ provider: "anthropic", api: "anthropic-messages", modelId: "fixture" })).toBe("billion-context");
    expect(context).toContain("acp(pi);\n    codex(pi);");
    expect(context).not.toContain("observational-memory");
    expect(memory).not.toMatch(/createAcpExtension|createCodexCompactExtension|resolveContextOwner/);
  });

  it("has no public memory tool or Agent/Herdr/general process-spawn surface", async () => {
    const [memory, production] = await Promise.all([source("extensions/observational-memory/index.ts"), source("src/runtime/observational-memory/production.ts")]);
    expect(memory).not.toMatch(/registerTool|createAgent|new\s+Agent|herdr|\bspawn\s*\(|(?<!\.)\bexec\s*\(/i);
    expect(memory).toContain('execFileAsync("mempalace", ["--version"]');
    expect(production).not.toMatch(/registerTool|createAgent|new\s+Agent|herdr|child_process|\bspawn\s*\(/i);
  });
});
