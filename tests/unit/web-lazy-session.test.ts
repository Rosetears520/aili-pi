import { describe, expect, it } from "vitest";
import {
  LazyOfficialAgentSession,
  OFFICIAL_PI_VERSION,
  assertOfficialPiCompatible,
  isOfficialPiCompatible,
} from "../../src/runtime/web/lazy-agent-session.js";

describe("lazy official Pi AgentSession bridge", () => {
  it("does not materialize a session for read-only construction", () => {
    let calls = 0;
    const lazy = new LazyOfficialAgentSession({
      sessionId: "internal-session-1",
      compatible: () => true,
      factory: { create: () => { calls += 1; return { id: "agent-1" }; } },
    });

    expect(lazy.loaded).toBe(false);
    expect(calls).toBe(0);
  });

  it("coalesces concurrent first mutation loads and then reuses the same official session", async () => {
    let calls = 0;
    let resolveFactory!: (value: { id: string }) => void;
    const factoryValue = new Promise<{ id: string }>((resolve) => { resolveFactory = resolve; });
    const lazy = new LazyOfficialAgentSession({
      sessionId: "internal-session-1",
      compatible: () => true,
      factory: {
        create: (sessionId) => {
          calls += 1;
          expect(sessionId).toBe("internal-session-1");
          return factoryValue;
        },
      },
    });

    const first = lazy.get();
    const second = lazy.get();
    expect(calls).toBe(1);
    expect(lazy.loaded).toBe(false);
    resolveFactory({ id: "agent-1" });

    const [left, right] = await Promise.all([first, second]);
    expect(left).toBe(right);
    expect(lazy.loaded).toBe(true);
    await expect(lazy.get()).resolves.toBe(left);
    expect(calls).toBe(1);
  });

  it("fails closed on incompatible Pi without calling the factory", async () => {
    let calls = 0;
    const lazy = new LazyOfficialAgentSession({
      sessionId: "internal-session-1",
      compatible: () => false,
      factory: { create: () => { calls += 1; return { id: "agent-1" }; } },
    });

    await expect(lazy.get()).rejects.toThrow(/0\.84\.1 compatibility/);
    expect(calls).toBe(0);
    expect(lazy.loaded).toBe(false);
  });

  it("clears a failed load so a later admitted request can retry", async () => {
    let calls = 0;
    const lazy = new LazyOfficialAgentSession({
      sessionId: "internal-session-1",
      compatible: () => true,
      factory: {
        create: () => {
          calls += 1;
          if (calls === 1) throw new Error("fixture factory failure");
          return { id: "agent-2" };
        },
      },
    });

    await expect(lazy.get()).rejects.toThrow("fixture factory failure");
    expect(lazy.loaded).toBe(false);
    await expect(lazy.get()).resolves.toEqual({ id: "agent-2" });
    expect(calls).toBe(2);
  });

  it("disposes a materialized session and prevents resurrection", async () => {
    let disposals = 0;
    const lazy = new LazyOfficialAgentSession({
      sessionId: "internal-session-1",
      compatible: () => true,
      factory: { create: () => ({ id: "agent-1", dispose: () => { disposals += 1; } }) },
    });
    await lazy.get();
    lazy.dispose();
    lazy.dispose();
    expect(disposals).toBe(1);
    expect(lazy.loaded).toBe(false);
    await expect(lazy.get()).rejects.toThrow(/disposed/);
  });

  it("accepts only the pinned official Pi baseline", () => {
    expect(OFFICIAL_PI_VERSION).toBe("0.84.1");
    expect(isOfficialPiCompatible("0.84.1")).toBe(true);
    expect(isOfficialPiCompatible("0.84.2")).toBe(false);
    expect(() => assertOfficialPiCompatible("0.84.1")).not.toThrow();
    expect(() => assertOfficialPiCompatible("0.84.0")).toThrow(/expected 0\.84\.1/);
  });
});
