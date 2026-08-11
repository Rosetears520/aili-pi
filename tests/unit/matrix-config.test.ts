import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadRoseMatrixConfig } from "../../extensions/matrix/index.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aili-rose-matrix-"));
  roots.push(root);
  return { root, canonical: join(root, "rose-cyberdeck-matrix.json"), legacy: join(root, "sakura-cyberdeck-matrix.json") };
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("Rose Matrix config migration", () => {
  it("defaults the optional waterfall off while retaining its 12 FPS cadence when enabled", () => {
    const { canonical, legacy } = fixture();
    expect(loadRoseMatrixConfig(canonical, legacy).config).toMatchObject({ version: 3, enabled: false, rainEnabled: true, fps: 12, density: 0.65, height: 4 });
  });

  it("migrates a valid legacy file to explicit schema v3 without deleting it", () => {
    const { canonical, legacy } = fixture();
    writeFileSync(legacy, JSON.stringify({ enabled: false, fps: 12, density: 0.7, height: 6 }));
    const result = loadRoseMatrixConfig(canonical, legacy);
    expect(result.migrated).toBe(true);
    expect(result.config).toEqual({ version: 3, enabled: false, rainEnabled: true, fps: 12, density: 0.7, height: 4, appearance: "auto" });
    expect(JSON.parse(readFileSync(canonical, "utf8"))).toEqual(result.config);
    expect(JSON.parse(readFileSync(legacy, "utf8"))).toMatchObject({ height: 6 });
  });

  it("rewrites canonical v2 config to v3 while preserving the master switch", () => {
    const { canonical, legacy } = fixture();
    writeFileSync(canonical, JSON.stringify({ version: 2, enabled: false, fps: 14, density: 0.8, height: 4, appearance: "light" }));
    const result = loadRoseMatrixConfig(canonical, legacy);
    expect(result.migrated).toBe(true);
    expect(result.config).toEqual({
      version: 3,
      enabled: false,
      rainEnabled: true,
      fps: 14,
      density: 0.8,
      height: 4,
      appearance: "light",
    });
    expect(JSON.parse(readFileSync(canonical, "utf8"))).toEqual(result.config);
  });

  it("does not overwrite corrupt or unsafe files", () => {
    const corrupt = fixture();
    writeFileSync(corrupt.legacy, "not json");
    expect(loadRoseMatrixConfig(corrupt.canonical, corrupt.legacy).migrated).toBe(false);
    expect(readFileSync(corrupt.legacy, "utf8")).toBe("not json");

    const unsafe = fixture();
    const target = join(unsafe.root, "target.json");
    writeFileSync(target, "{}");
    symlinkSync(target, unsafe.legacy);
    const result = loadRoseMatrixConfig(unsafe.canonical, unsafe.legacy);
    expect(result.warning).toContain("unsafe");
    expect(result.migrated).toBe(false);
  });
});
