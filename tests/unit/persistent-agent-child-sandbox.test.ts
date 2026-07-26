import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  installPersistentAgentSandboxProvider,
  resolvePersistentAgentSandbox,
} from "../../src/runtime/persistent-agents/child-sandbox.js";
import type { SandboxProfile } from "pi-permission-modes/src/schema.ts";

const buildProfile: SandboxProfile = {
  enabled: true,
  writable: true,
  allowWrite: [".", "/tmp"],
  denyWrite: [],
  denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
  network: { allowedDomains: ["github.com"], deniedDomains: [] },
};

describe("persistent Agent process-owned child sandbox bridge", () => {
  it("returns the active shared operations only for an exact ready profile", () => {
    const exec = vi.fn<BashOperations["exec"]>();
    const operations: BashOperations = { exec };
    const requested: boolean[] = [];
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(buildProfile),
      operations: ({ readOnly }) => {
        requested.push(readOnly);
        return operations;
      },
      diagnostic: () => undefined,
    });
    try {
      expect(resolvePersistentAgentSandbox(buildProfile)).toEqual({ available: true, operations });
      expect(requested).toEqual([false]);
      expect(resolvePersistentAgentSandbox({ ...buildProfile, writable: false })).toMatchObject({
        available: false,
        reason: expect.stringContaining("profiles differ"),
      });
    } finally {
      restore();
    }
  });

  it("selects read-only operations for an exact Plan profile and fails closed when unready", () => {
    const plan = { ...buildProfile, writable: false };
    const readOnly: boolean[] = [];
    let ready = true;
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(plan),
      operations: (options) => {
        readOnly.push(options.readOnly);
        return ready ? { exec: vi.fn<BashOperations["exec"]>() } : null;
      },
      diagnostic: () => "sandbox runtime unavailable",
    });
    try {
      expect(resolvePersistentAgentSandbox(plan).available).toBe(true);
      expect(readOnly).toEqual([true]);
      ready = false;
      expect(resolvePersistentAgentSandbox(plan)).toEqual({
        available: false,
        reason: "sandbox runtime unavailable",
      });
    } finally {
      restore();
    }
    expect(resolvePersistentAgentSandbox(buildProfile)).toMatchObject({
      available: false,
      reason: expect.stringContaining("provider is unavailable"),
    });
  });
});
