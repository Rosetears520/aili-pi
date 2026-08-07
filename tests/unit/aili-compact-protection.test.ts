import { describe, expect, it } from "vitest";
import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { classifyProtection, hasBalancedProtectRegion, matchProtectionGlob, normalizeProtectionPath } from "../../src/runtime/aili-compact/protection.js";

const cwd = "/work/project";
const message = (id: string, role: string, content: unknown): SessionLikeEntry => ({ id, type: "message", message: { role, content } });
const call = (name: string, args: unknown = {}, id = "tc"): SessionLikeEntry => message("call", "assistant", [{ type: "toolCall", id, name, arguments: args }]);
const result = (name: string, content: unknown = "output", id = "tc"): SessionLikeEntry => ({ id: "result", type: "message", message: { role: "toolResult", toolCallId: id, toolName: name, content } });
const reasons = (entries: readonly SessionLikeEntry[], index: number, extra = {}) => classifyProtection(entries, index, { cwd, ...extra }).reasons;

describe("AILI Compact pure protection classifier", () => {
  it("hard-protects lowercase-normalized AILI protocol and incomplete/unpaired atoms", () => {
    const complete = [call("AILI_COMPACT"), result("AILI_COMPACT"), message("after", "assistant", "done")];
    expect(reasons(complete, 0)).toContain("protocol");
    expect(reasons(complete, 1)).toContain("protocol");
    expect(reasons([call("read")], 0)).toContain("incomplete");
    expect(reasons([result("read")], 0)).toEqual(expect.arrayContaining(["incomplete", "metadata-unknown"]));
  });

  it("protects image and mixed binary atoms", () => {
    const entries = [call("read"), result("read", [{ type: "text", text: "x" }, { type: "image", data: "opaque" }]), message("after", "assistant", "done")];
    expect(reasons(entries, 0)).toContain("binary");
    expect(reasons(entries, 1)).toContain("binary");
  });

  it("protects current-turn/unconsumed entries but releases consumed tool results", () => {
    const current = [message("u", "user", "ask"), call("read"), result("read")];
    expect(reasons(current, 2)).toContain("current-turn");
    expect(reasons([...current, message("after", "assistant", "used")], 2)).not.toContain("current-turn");
  });

  it("always protects at least two recent users and optionally all users", () => {
    const entries = [message("u1", "user", "1"), message("a1", "assistant", "a"), message("u2", "user", "2"), message("a2", "assistant", "a"), message("u3", "user", "3"), message("a3", "assistant", "a")];
    expect(reasons(entries, 0)).not.toContain("recent-user");
    expect(reasons(entries, 2)).toContain("recent-user");
    expect(reasons(entries, 4)).toContain("recent-user");
    expect(reasons(entries, 0, { protectUserMessages: true })).toContain("protected-user");
    expect(reasons(entries, 2, { recentUserMessages: 1 })).toContain("recent-user");
  });

  it("normalizes configured tool names without weakening hard protocol", () => {
    const entries = [call("BASH"), result("bash"), message("after", "assistant", "done")];
    expect(reasons(entries, 1, { tools: ["BaSh"] })).toContain("protected-tool");
    const protocol = [call("AILI_PRUNE"), result("aili_prune"), message("after", "assistant", "done")];
    expect(reasons(protocol, 1, { tools: [] })).toContain("protocol");
  });

  it("uses known string path/file arguments and fails protected on uncertainty", () => {
    const hard = [call("read", { path: "src/../.env.local" }), result("read"), message("after", "assistant", "done")];
    expect(reasons(hard, 1, { fileGlobs: [] })).toContain("protected-file");
    const configured = [call("read", { filePath: "src/private/a.txt" }), result("read"), message("after", "assistant", "done")];
    expect(reasons(configured, 1, { fileGlobs: ["src/**/a.?xt"] })).toContain("protected-file");
    const unknown = [call("read", { path: ["a"] }), result("read"), message("after", "assistant", "done")];
    expect(reasons(unknown, 1)).toContain("metadata-unknown");
    const ignored = [call("read", { destination: ".env" }), result("read"), message("after", "assistant", "done")];
    expect(reasons(ignored, 1)).not.toContain("protected-file");
  });

  it("supports the documented glob subset", () => {
    expect(matchProtectionGlob("src/a/file.ts", "src/**/*.ts")).toBe(true);
    expect(matchProtectionGlob("src/file.ts", "src/**/*.ts")).toBe(true);
    expect(matchProtectionGlob("src/a/file.ts", "src/*.ts")).toBe(false);
    expect(matchProtectionGlob("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchProtectionGlob("src/ab.ts", "src/?.ts")).toBe(false);
  });

  it("resolves traversal lexically against cwd", () => {
    expect(normalizeProtectionPath("a/../../outside/note.txt", cwd)).toEqual({ absolute: "/work/outside/note.txt" });
    expect(normalizeProtectionPath("./src/../file.ts", cwd)).toEqual({ absolute: "/work/project/file.ts", relative: "file.ts" });
    expect(normalizeProtectionPath("C:\\repo\\a\\..\\.env", "C:\\repo")).toEqual({ absolute: "c:/repo/.env", relative: ".env" });
  });

  it("protects only balanced protect regions when enabled", () => {
    expect(hasBalancedProtectRegion("before <protect>safe <protect>x</protect></protect> after")).toBe(true);
    expect(hasBalancedProtectRegion("<protect>unfinished")).toBe(false);
    const entries = [message("old", "assistant", "<protect>retain</protect>"), message("u", "user", "now"), message("after", "assistant", "done")];
    expect(reasons(entries, 0, { protectTags: true })).toContain("protected-tag");
    expect(reasons(entries, 0, { protectTags: false })).not.toContain("protected-tag");
  });

  it("returns bounded reason codes without source content", () => {
    const marker = "RAW_MARKER_123";
    const entries = [call("read", { path: ".env" }), result("read", marker), message("after", "assistant", "done")];
    const classified = classifyProtection(entries, 1, { cwd });
    expect(JSON.stringify(classified)).not.toContain(marker);
    expect(classified).toEqual({ protected: true, reasons: ["protected-file"] });
    expect(classifyProtection(entries, 99, { cwd })).toEqual({ protected: true, reasons: ["metadata-unknown"] });
  });
});
