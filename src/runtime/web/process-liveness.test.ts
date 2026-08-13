import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OwnerOnlyProcessLivenessServer,
  currentProcessIdentity,
  isExactProcessAlive,
  probeOwnerProcessLiveness,
} from "./process-liveness.js";

describe("owner-only process liveness", () => {
  it("proves the exact current pid/start identity and rejects a reused fingerprint", () => {
    const current = currentProcessIdentity();
    expect(isExactProcessAlive(current)).toBe(true);
    expect(isExactProcessAlive({ ...current, startFingerprint: "wrong-start" })).toBe(false);
  });

  it("authenticates only a currently owned lease generation and cleans discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-process-liveness-"));
    let generation = "generation-current";
    const server = new OwnerOnlyProcessLivenessServer(root, (candidate) => candidate === generation, "liveness-fixture");
    try {
      await server.start();
      await expect(probeOwnerProcessLiveness(root, server.endpointId, "generation-current")).resolves.toBe(true);
      await expect(probeOwnerProcessLiveness(root, server.endpointId, "generation-stale")).resolves.toBe(false);
      generation = "generation-next";
      await expect(probeOwnerProcessLiveness(root, server.endpointId, "generation-current")).resolves.toBe(false);
      await expect(probeOwnerProcessLiveness(root, server.endpointId, "generation-next")).resolves.toBe(true);
    } finally {
      await server.close();
    }
    await expect(probeOwnerProcessLiveness(root, server.endpointId, "generation-next")).resolves.toBe(false);
    await rm(root, { recursive: true, force: true });
  });
});
