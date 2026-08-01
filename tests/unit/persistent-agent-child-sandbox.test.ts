import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  composePersistentAgentSandboxConfig,
  formalChildBashHardDenied,
  formalChildHardDeniedTools,
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
    const requested: Array<{ readOnly: boolean; denyWrite: readonly string[] }> = [];
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(buildProfile),
      operations: (options) => {
        requested.push(options);
        return operations;
      },
      diagnostic: () => undefined,
    });
    try {
      expect(resolvePersistentAgentSandbox(buildProfile)).toEqual({ available: true, operations });
      expect(requested).toEqual([{ readOnly: false, denyWrite: [] }]);
      const mismatched = resolvePersistentAgentSandbox({ ...buildProfile, writable: false });
      expect(mismatched).toMatchObject({
        available: false,
        reason: expect.stringContaining("profiles differ"),
      });
      expect(formalChildHardDeniedTools([
        "/project/openspec/changes/change/formal-task-board.md",
        "/project/openspec/changes/change/progress.txt",
      ], mismatched)).toEqual(["bash"]);
      expect(resolvePersistentAgentSandbox({ ...buildProfile, askOnBlockedHost: false })).toEqual({ available: true, operations });
      expect(resolvePersistentAgentSandbox({ ...buildProfile, askOnBlockedHost: false }, [
        "/project/openspec/changes/change/formal-task-board.md",
        "/project/openspec/changes/change/progress.txt",
      ])).toMatchObject({
        available: false,
        reason: expect.stringContaining("profiles differ"),
      });
    } finally {
      restore();
    }
  });

  it("selects read-only operations for an exact Plan profile and fails closed when unready", () => {
    const plan = { ...buildProfile, writable: false };
    const readOnly: Array<{ readOnly: boolean; denyWrite: readonly string[] }> = [];
    let ready = true;
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(plan),
      operations: (options) => {
        readOnly.push(options);
        return ready ? { exec: vi.fn<BashOperations["exec"]>() } : null;
      },
      diagnostic: () => "sandbox runtime unavailable",
    });
    try {
      expect(resolvePersistentAgentSandbox(plan).available).toBe(true);
      expect(readOnly).toEqual([{ readOnly: true, denyWrite: [] }]);
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

  it("composes exactly two per-command formal denies without dropping profile/network fields", () => {
    const owning = ["/project/openspec/changes/change/formal-task-board.md", "/project/openspec/changes/change/progress.txt"] as const;
    const seen: Array<{ readOnly: boolean; denyWrite: readonly string[] }> = [];
    const operations: BashOperations = { exec: vi.fn<BashOperations["exec"]>() };
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(buildProfile),
      operations: (options) => {
        seen.push(options);
        return operations;
      },
      diagnostic: () => undefined,
    });
    try {
      expect(resolvePersistentAgentSandbox(buildProfile, owning)).toEqual({ available: true, operations });
      expect(seen).toEqual([{ readOnly: false, denyWrite: owning }]);
      expect(resolvePersistentAgentSandbox(buildProfile, [owning[0]])).toEqual({
        available: false,
        reason: "formal child sandbox requires exactly two distinct absolute denyWrite paths",
      });
      const yolo = resolvePersistentAgentSandbox({ ...buildProfile, enabled: false }, owning);
      expect(yolo).toEqual({
        available: false,
        reason: "active mode does not require a sandbox",
      });
      expect(formalChildBashHardDenied(owning, yolo)).toBe(true);
      expect(formalChildBashHardDenied([], yolo)).toBe(false);
      expect(formalChildHardDeniedTools(owning, yolo)).toEqual(["bash"]);
      expect(formalChildHardDeniedTools([], yolo)).toEqual([]);
    } finally {
      restore();
    }

    expect(composePersistentAgentSandboxConfig({ ...buildProfile, denyWrite: [".git"] }, false, owning)).toEqual({
      enabled: true,
      network: { allowedDomains: ["github.com"], deniedDomains: [] },
      filesystem: {
        denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
        allowWrite: [".", "/tmp"],
        denyWrite: [".git", ...owning],
      },
    });
    expect(composePersistentAgentSandboxConfig(buildProfile, true, owning).filesystem?.allowWrite).toEqual([]);
  });

  it("removes formal bash when exact operation construction fails instead of allowing an approval fallback", () => {
    const owning = ["/project/openspec/changes/change/formal-task-board.md", "/project/openspec/changes/change/progress.txt"] as const;
    const restore = installPersistentAgentSandboxProvider({
      currentProfile: () => structuredClone(buildProfile),
      operations: () => { throw new Error("operation factory failed"); },
      diagnostic: () => undefined,
    });
    try {
      const resolution = resolvePersistentAgentSandbox(buildProfile, owning);
      expect(resolution).toMatchObject({ available: false, reason: expect.stringContaining("operation factory failed") });
      expect(formalChildHardDeniedTools(owning, resolution)).toEqual(["bash"]);
      expect(formalChildHardDeniedTools([owning[0]], { available: true })).toEqual(["bash"]);
    } finally {
      restore();
    }
  });
});
