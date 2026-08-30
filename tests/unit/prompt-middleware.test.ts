import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPromptPolicyPatch, assemblePromptModifiers, assertPolicyPatchMonotonic, discoverPromptModifiers, PromptModifierProvenanceStore, resolvePromptModifiers, type PromptModifierDefinition } from "../../src/runtime/prompt-middleware/index.js";

function modifier(id: string, placement: "prepend" | "append", order: number, extra: Partial<PromptModifierDefinition> = {}): PromptModifierDefinition {
  const body = extra.body ?? `body:${id}`;
  return { id, name: id, placement, order, scopes: ["main", "subagent", "role:aili.code-scout"], oneShot: true, requires: [], conflicts: [], body, sourcePath: `/trusted/${id}.md`, hash: createHash("sha256").update(body).digest("hex"), ...extra };
}

describe("prompt middleware", () => {
  it("discovers trusted definitions deterministically and ignores untrusted roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "prompt-modifiers-"));
    const ignored = await mkdtemp(join(tmpdir(), "prompt-modifiers-untrusted-"));
    try {
      await writeFile(join(root, "b.md"), "---\nid: b\nplacement: prepend\norder: 2\nscopes: [main]\n---\nBody B\n");
      await writeFile(join(root, "a.md"), "---\nid: a\nplacement: append\nscopes: [main]\n---\nBody A\n");
      await writeFile(join(ignored, "secret.md"), "---\nid: secret\n---\nIgnore\n");
      const found = await discoverPromptModifiers([{ path: ignored, trusted: false }, { path: root, trusted: true }]);
      expect(found.map((item) => item.id)).toEqual(["a", "b"]);
      expect(found.every((item) => /^[a-f0-9]{64}$/.test(item.hash))).toBe(true);
      await symlink(join(root, "a.md"), join(root, "linked.md"));
      await expect(discoverPromptModifiers([{ path: root, trusted: true }])).rejects.toThrow(/symlink is forbidden/);
    } finally { await Promise.all([rm(root, { recursive: true, force: true }), rm(ignored, { recursive: true, force: true })]); }
  });

  it("resolves stable order, dependencies, conflicts and role scope", () => {
    const a = modifier("a", "prepend", 20, { requires: ["b"] });
    const b = modifier("b", "prepend", 10, { runtimePolicyPatch: { forceReadOnly: true } });
    const resolved = resolvePromptModifiers([a, b], ["a", "b"], { surface: "subagent", role: "aili.code-scout", allowedIds: ["a", "b"] });
    expect(resolved.ordered.map((item) => item.id)).toEqual(["b", "a"]);
    expect(resolved.policyPatch.forceReadOnly).toBe(true);
    expect(() => resolvePromptModifiers([a, b], ["a"], { surface: "main" })).toThrow(/requires b/);
    expect(() => resolvePromptModifiers([modifier("x", "append", 1, { conflicts: ["y"] }), modifier("y", "append", 2)], ["x", "y"], { surface: "main" })).toThrow(/conflict/);
  });

  it("keeps stable prefix hash while assembling deterministic dynamic blocks", () => {
    const pre = modifier("pre", "prepend", 1);
    const post = modifier("post", "append", 1);
    const first = assemblePromptModifiers("stable", "user", [pre, post], "memory", "delta");
    const second = assemblePromptModifiers("stable", "user", [pre, post], "memory", "delta");
    expect(first).toEqual(second);
    expect(first.dynamicMessage).toBe("memory\n\nbody:pre\n\nuser\n\nbody:post\n\ndelta");
    expect(assemblePromptModifiers("stable", "other", [], "", "").stablePrefixHash).toBe(first.stablePrefixHash);
  });

  it("applies runtime restrictions monotonically", () => {
    expect(applyPromptPolicyPatch(["read", "write", "edit", "bash", "grep", "custom_mutator"], { forceReadOnly: true })).toEqual(["read", "grep"]);
    expect(applyPromptPolicyPatch(["read", "grep"], { denyTools: ["grep"] })).toEqual(["read"]);
    expect(() => assertPolicyPatchMonotonic(["read"], ["read", "write"])).toThrow(/widen/);
  });

  it("records bounded provenance without modifier bodies", () => {
    const resolved = resolvePromptModifiers([modifier("audit", "prepend", 1)], ["audit"], { surface: "main" });
    const store = new PromptModifierProvenanceStore();
    store.record(1, resolved);
    expect(store.list()[0]).toMatchObject({ turn: 1, applied: [{ id: "audit", hash: expect.any(String) }] });
    expect(JSON.stringify(store.list())).not.toContain("body:audit");
    store.recordRejected(2, ["unknown"], "credential-like detail\nsecond line");
    expect(store.list()[1]).toMatchObject({ rejected: { ids: ["unknown"], reason: "credential-like detail second line" } });
  });

  it("fails closed on duplicate definitions and unauthorized role selection", () => {
    const a = modifier("same", "prepend", 1);
    expect(() => resolvePromptModifiers([a, a], ["same"], { surface: "main" })).toThrow(/duplicate/);
    expect(() => resolvePromptModifiers([a], ["same"], { surface: "subagent", role: "aili.implementer", allowedIds: [] })).toThrow(/not allowed/);
    expect(() => resolvePromptModifiers([a], ["same"], { surface: "subagent", role: "aili.implementer" })).toThrow(/explicit role allowlist/);
  });
});
