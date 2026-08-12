import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadWorkflowRuntimeBundle } from "../../src/runtime/workflow-bundle/index.js";

const scratchRoots: string[] = [];

async function fixture(): Promise<{ root: string; lock: string; bundle: string }> {
  await mkdir(resolve(".tmp"), { recursive: true });
  const root = await mkdtemp(resolve(".tmp/workflow-bundle-"));
  scratchRoots.push(root);
  const lock = join(root, "aili-workflows.lock.json");
  const bundle = join(root, "runtime");
  await Promise.all([
    cp(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), lock),
    cp(new URL("../../upstream/aili-workflows-runtime/", import.meta.url), bundle, { recursive: true }),
  ]);
  return { root, lock, bundle };
}

async function load(paths: { lock: string; bundle: string }) {
  return await loadWorkflowRuntimeBundle({
    lockUrl: pathToFileURL(paths.lock),
    bundleUrl: new URL("./", pathToFileURL(`${paths.bundle}/placeholder`)),
  });
}

async function replaceLockedArtifact(paths: { lock: string; bundle: string }, relative: string, transform: (value: string) => string): Promise<void> {
  const artifact = join(paths.bundle, relative);
  const content = transform(await readFile(artifact, "utf8"));
  await writeFile(artifact, content, "utf8");
  const lock = JSON.parse(await readFile(paths.lock, "utf8"));
  const record = lock.runtimeBundle.files.find((item: { path: string }) => item.path === relative);
  record.bytes = Buffer.byteLength(content);
  record.sha256 = createHash("sha256").update(content).digest("hex");
  lock.runtimeBundle.contentHash = createHash("sha256").update(lock.runtimeBundle.files
    .map((file: { path: string; sha256: string; bytes: number }) => `${file.path}\0${file.sha256}\0${file.bytes}\n`).join("")).digest("hex");
  await writeFile(paths.lock, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("validated Workflow runtime bundle", () => {
  it("loads one immutable 0.4.7 view with all 20 canonical specialists", async () => {
    const bundle = await loadWorkflowRuntimeBundle();
    expect(bundle).toMatchObject({
      package: "rose-aili",
      version: "0.4.7",
      commit: "a69f3149d8f1db81726128c2819a3ccc954b9ccc",
    });
    expect(bundle.canonicalSpecialists).toHaveLength(20);
    expect(bundle.canonicalSpecialists).toContain("solution-architect");
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.roleMetadata.roles)).toBe(true);
    expect(Object.keys(bundle.protocols)).toEqual(["agentSelection", "formalTaskBoard", "packageEnvelope"]);
  });

  it("fails closed for missing and byte-drifted artifacts", async () => {
    const missing = await fixture();
    await rm(join(missing.bundle, "system.md"));
    await expect(load(missing)).rejects.toThrow(/artifact missing or unreadable: system\.md/);

    const drift = await fixture();
    await writeFile(join(drift.bundle, "system.md"), "drift\n");
    await expect(load(drift)).rejects.toThrow(/byte mismatch|hash mismatch/);
  });

  it("rejects mixed cross-file identity and unsupported schemas even when the lock is rebound", async () => {
    const mixed = await fixture();
    await replaceLockedArtifact(mixed, "selection-map.json", (content) => content.replace(
      /"inputSha256": "[0-9a-f]{64}"/,
      `"inputSha256": "${"0".repeat(64)}"`,
    ));
    await expect(load(mixed)).rejects.toThrow(/cross-file identity mismatch/);

    const unsupported = await fixture();
    await replaceLockedArtifact(unsupported, "role-metadata.json", (content) => content.replace('"schemaVersion": 1', '"schemaVersion": 2'));
    await expect(load(unsupported)).rejects.toThrow(/schema is unsupported/);
  });

  it("rejects a partial selector catalog instead of accepting the former 19-role contract", async () => {
    const paths = await fixture();
    const lock = JSON.parse(await readFile(paths.lock, "utf8"));
    lock.release.canonicalSpecialists = lock.release.canonicalSpecialists.filter((role: string) => role !== "solution-architect");
    await writeFile(paths.lock, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await expect(load(paths)).rejects.toThrow(/accepted 20 roles/);
  });
});
