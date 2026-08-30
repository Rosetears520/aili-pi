import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { AgentSessionWrapper } = await jiti.import("../../src/web/lib/rpc-manager.ts");

test("Gateway-owned safe delete reparents children before removing the selected JSONL", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "aili-safe-session-delete-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, "target.jsonl");
  const child = join(directory, "child.jsonl");
  const parent = join(directory, "parent.jsonl");
  const timestamp = "2026-08-27T00:00:00.000Z";
  await writeFile(target, `${JSON.stringify({ type: "session", version: 3, id: "target", timestamp, cwd: directory, parentSession: parent })}\n`);
  await writeFile(child, `${JSON.stringify({ type: "session", version: 3, id: "child", timestamp, cwd: directory, parentSession: target })}\n`);

  const inner = {
    sessionId: "target",
    sessionFile: target,
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    extensionRunner: { emit: async () => undefined },
    dispose: () => undefined,
  };
  const wrapper = new AgentSessionWrapper(inner);
  const result = await wrapper.send({ type: "safe_delete" });

  assert.deepEqual(result, { deleted: true });
  await assert.rejects(readFile(target, "utf8"), (error) => error?.code === "ENOENT");
  const childHeader = JSON.parse((await readFile(child, "utf8")).split("\n", 1)[0]);
  assert.equal(childHeader.parentSession, parent);
});
