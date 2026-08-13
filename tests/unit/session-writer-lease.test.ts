import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireSessionWriterLease, leaseDirectory } from "../../src/runtime/web/session-writer-lease.js";

async function withLeaseRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "aili-web-lease-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function processIdentity(id: number) {
  return { pid: id, startFingerprint: `start-${id}` } as const;
}

describe("session writer lease", () => {
  it("admits exactly one first writer and releases only its own generation", async () => {
    await withLeaseRoot(async (root) => {
      const [tui, web] = await Promise.all([
        acquireSessionWriterLease(root, "internal-session-1", "tui", {
          idFactory: () => "tui",
          processIdentity: processIdentity(101),
          livenessEndpointId: "endpoint-tui",
        }),
        acquireSessionWriterLease(root, "internal-session-1", "web", {
          idFactory: () => "web",
          processIdentity: processIdentity(102),
          livenessEndpointId: "endpoint-web",
        }),
      ]);

      const acquired = [tui, web].filter((result) => result.acquired);
      const denied = [tui, web].filter((result) => !result.acquired);
      expect(acquired).toHaveLength(1);
      expect(denied).toHaveLength(1);

      const winner = acquired[0];
      if (!winner?.acquired) throw new Error("fixture writer lease was not acquired");
      expect(winner.lease.generation).toMatch(/^generation-(?:tui|web)$/);
      expect(winner.lease.record).toMatchObject({ schemaVersion: 1, activeTurn: false, connectionState: "connected" });
      const settledContender = await acquireSessionWriterLease(root, "internal-session-1", winner.lease.owner === "tui" ? "web" : "tui", {
        idFactory: () => "settled",
        processIdentity: processIdentity(104),
        livenessEndpointId: "endpoint-settled",
      });
      expect(settledContender).toMatchObject({ acquired: false, reason: "held", holder: { generation: winner.lease.generation } });
      expect(await winner.lease.release()).toBe(true);
      expect(await winner.lease.release()).toBe(false);

      const next = await acquireSessionWriterLease(root, "internal-session-1", "web", {
        idFactory: () => "next",
        processIdentity: processIdentity(103),
        livenessEndpointId: "endpoint-next",
      });
      expect(next.acquired).toBe(true);
      if (next.acquired) await next.lease.release();
    });
  });

  it("renews the current generation and does not let an expired holder remove its successor", async () => {
    await withLeaseRoot(async (root) => {
      let now = new Date("2026-08-13T00:00:00.000Z");
      const first = await acquireSessionWriterLease(root, "internal-session-2", "tui", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => "old",
        processIdentity: processIdentity(201),
        livenessEndpointId: "endpoint-old",
      });
      if (!first.acquired) throw new Error("fixture writer lease was not acquired");

      now = new Date("2026-08-13T00:00:00.500Z");
      expect(await first.lease.renew(2_000, now)).toBe(true);
      expect(first.lease.record.expiresAt).toBe("2026-08-13T00:00:02.500Z");

      const held = await acquireSessionWriterLease(root, "internal-session-2", "web", {
        ttlMs: 1_000,
        now: () => new Date("2026-08-13T00:00:02.000Z"),
        idFactory: () => "held",
        processIdentity: processIdentity(202),
        livenessEndpointId: "endpoint-held",
      });
      expect(held).toMatchObject({
        acquired: false,
        reason: "held",
        holder: { owner: "tui", generation: "generation-old", activeTurn: false },
      });

      now = new Date("2026-08-13T00:00:03.000Z");
      const generated = ["retired-directory", "new"];
      const successor = await acquireSessionWriterLease(root, "internal-session-2", "web", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => generated.shift() ?? "unexpected-id",
        processIdentity: processIdentity(202),
        livenessEndpointId: "endpoint-new",
        isProcessAlive: () => false,
        probeLiveness: () => false,
      });
      expect(successor.acquired).toBe(true);
      if (!successor.acquired) throw new Error("expired lease was not recovered");
      expect(successor.lease.generation).toBe("generation-new");

      expect(await first.lease.release()).toBe(false);
      const stillHeld = await acquireSessionWriterLease(root, "internal-session-2", "tui", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => "third",
        processIdentity: processIdentity(203),
        livenessEndpointId: "endpoint-third",
      });
      expect(stillHeld).toMatchObject({ acquired: false, reason: "held", holder: { owner: "web" } });
      await successor.lease.release();
    });
  });

  it("protects active turns through disconnect grace and requires proven interruption before recovery", async () => {
    await withLeaseRoot(async (root) => {
      let now = new Date("2026-08-13T00:00:00.000Z");
      const first = await acquireSessionWriterLease(root, "internal-session-3", "web", {
        ttlMs: 1_000,
        disconnectGraceMs: 1_000,
        now: () => now,
        idFactory: () => "active",
        processIdentity: processIdentity(301),
        livenessEndpointId: "endpoint-active",
      });
      if (!first.acquired) throw new Error("fixture writer lease was not acquired");
      expect(await first.lease.setActiveTurn(true, "turn-1")).toBe(true);
      expect(await first.lease.release()).toBe(false);
      expect(await first.lease.disconnect()).toBe(true);

      now = new Date("2026-08-13T00:00:00.500Z");
      const grace = await acquireSessionWriterLease(root, "internal-session-3", "tui", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => "grace",
        processIdentity: processIdentity(302),
        livenessEndpointId: "endpoint-contender",
      });
      expect(grace).toMatchObject({ acquired: false, reason: "grace", holder: { activeTurn: true } });

      now = new Date("2026-08-13T00:00:02.000Z");
      const noInterruptionOwner = await acquireSessionWriterLease(root, "internal-session-3", "tui", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => "blocked",
        processIdentity: processIdentity(302),
        livenessEndpointId: "endpoint-contender",
        isProcessAlive: () => false,
        probeLiveness: () => false,
      });
      expect(noInterruptionOwner).toMatchObject({ acquired: false, reason: "active-turn" });

      let interruptedGeneration = "";
      const generated = ["retired", "recovered"];
      const recovered = await acquireSessionWriterLease(root, "internal-session-3", "tui", {
        ttlMs: 1_000,
        now: () => now,
        idFactory: () => generated.shift() ?? "unexpected",
        processIdentity: processIdentity(302),
        livenessEndpointId: "endpoint-contender",
        isProcessAlive: () => false,
        probeLiveness: () => false,
        markInterrupted: (record) => { interruptedGeneration = record.generation; },
      });
      expect(interruptedGeneration).toBe("generation-active");
      expect(recovered).toMatchObject({ acquired: true, lease: { generation: "generation-recovered", owner: "tui" } });
      if (recovered.acquired) await recovered.lease.release();
    });
  });

  it("isolates sessions and hashes internal identities in lease paths", async () => {
    await withLeaseRoot(async (root) => {
      const internalId = "internal/session/name-that-must-not-appear";
      expect(leaseDirectory(root, internalId)).not.toContain(internalId);

      const first = await acquireSessionWriterLease(root, "session-a", "tui", {
        idFactory: () => "a",
        processIdentity: processIdentity(401),
        livenessEndpointId: "endpoint-a",
      });
      const second = await acquireSessionWriterLease(root, "session-b", "web", {
        idFactory: () => "b",
        processIdentity: processIdentity(402),
        livenessEndpointId: "endpoint-b",
      });
      expect(first.acquired).toBe(true);
      expect(second.acquired).toBe(true);
      if (first.acquired) await first.lease.release();
      if (second.acquired) await second.lease.release();
    });
  });

  it("rejects invalid owners, process identities, and unbounded TTLs before acquisition", async () => {
    await withLeaseRoot(async (root) => {
      await expect(acquireSessionWriterLease(root, "session", "web", { ttlMs: 999 })).rejects.toThrow(/ttl/i);
      await expect(acquireSessionWriterLease(root, "session", "web", { ttlMs: 600_001 })).rejects.toThrow(/ttl/i);
      await expect(acquireSessionWriterLease(root, "session", "web", { processIdentity: { pid: 0, startFingerprint: "start" } }))
        .rejects.toThrow(/process identity/i);
      await expect(acquireSessionWriterLease(root, "", "web")).rejects.toThrow(/invalid/i);
    });
  });
});
