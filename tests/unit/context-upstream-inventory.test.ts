import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("frozen context and retry upstream inventory", () => {
  it("retains complete billion-context source metadata and the bounded AILI routing patch", async () => {
    const pkg = JSON.parse(await readFile(new URL("upstream/billion-context-pi/package.json", root), "utf8"));
    const source = await readFile(new URL("upstream/billion-context-pi/src/index.ts", root), "utf8");
    const runtime = await readFile(new URL("upstream/billion-context-pi/dist/index.js", root), "utf8");
    expect(pkg.version).toBe("0.1.34");
    expect(pkg.license).toBe("MIT");
    expect(source).toContain("createAcpExtension");
    expect(source).toContain("AcpOwnershipRouter");
    expect(source).toContain("makeDelegateCancelTool");
    expect(runtime).toContain("DEFAULT_OWNERSHIP_ROUTER");
    expect(await readFile(new URL("upstream/billion-context-pi/LICENSE", root), "utf8")).toContain("MIT License");
  });

  it("retains published pi-retry and exact Codex source/license identities", async () => {
    const retry = JSON.parse(await readFile(new URL("upstream/pi-retry-0.31.0/package.json", root), "utf8"));
    const codex = JSON.parse(await readFile(new URL("node_modules/@narumitw/pi-codex-compact/package.json", root), "utf8"));
    expect(retry).toMatchObject({ version: "0.31.0", license: "MIT" });
    expect(codex).toMatchObject({ version: "0.50.0", license: "MIT" });
    expect(sha256(await readFile(new URL("upstream/pi-retry-0.31.0/src/retry.ts", root)))).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(new URL("upstream/pi-codex-compact-0.50.0-LICENSE", root), "utf8")).toContain("MIT License");
  });
});
