import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSharedPromotion, mapMemPalaceScope } from "../../src/runtime/mempalace.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("MemPalace deterministic mapping", () => {
  it("maps one trusted canonical project and stable Agent deterministically", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-palace-map-"));
    roots.push(root);
    const input = { root, remote: "https://example.test/owner/repo.git", trusted: true };
    const first = await mapMemPalaceScope(input, "aili.code-scout");
    const second = await mapMemPalaceScope({ ...input, root: await realpath(root) }, "aili.code-scout");
    expect(first).toEqual(second);
    expect(first.palace).toBe("/home/rosetears/code/ai/.mempalace");
    expect(first.shared).toBe("shared");
    expect(first.wing).not.toBe(first.diary);
  });

  it("fails untrusted and unstable identities closed", async () => {
    await expect(mapMemPalaceScope({ root: "/tmp", trusted: false }, "agent")).rejects.toThrow(/trusted/);
    await expect(mapMemPalaceScope({ root: "/tmp", trusted: true }, "")).rejects.toThrow(/stable Agent/);
    expect(() => assertSharedPromotion(false)).toThrow(/explicit authority/);
    expect(assertSharedPromotion(true)).toBe("shared");
  });
});
