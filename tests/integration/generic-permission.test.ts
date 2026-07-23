import { describe, expect, it } from "vitest";

interface ModeDefaults {
  modes: Record<string, unknown>;
}

describe("generic external-write permission boundary", () => {
  it("uses the vendor Plan policy to ask for an external write and denies the ask without UI", async () => {
    const [resolveModule, approvalsModule, defaultsModule] = await Promise.all([
      import("pi-permission-modes/src/resolve.ts") as Promise<{ decide: (mode: unknown, surface: string, target: string, options: { isOutside: boolean }) => string }>,
      import("pi-permission-modes/src/approvals.ts") as Promise<{ SessionApprovals: new () => unknown; askWithSession: (ui: { hasUI: boolean; select: () => Promise<undefined> }, approvals: unknown, mode: string, surface: string, target: string, title: string) => Promise<boolean> }>,
      import("pi-permission-modes/permission-mode.defaults.json", { with: { type: "json" } }) as unknown as Promise<{ default: ModeDefaults }>,
    ]);
    const target = "/tmp/aili-generic-external/marker.txt";
    const planAction = resolveModule.decide(defaultsModule.default.modes.plan, "write", target, { isOutside: true });
    const defaultAction = resolveModule.decide(defaultsModule.default.modes.default, "write", target, { isOutside: true });
    expect(planAction).toBe("deny");
    expect(defaultAction).toBe("ask");
    await expect(approvalsModule.askWithSession(
      { hasUI: false, select: async () => undefined },
      new approvalsModule.SessionApprovals(),
      "plan",
      "write",
      target,
      "Outside project — allow write?",
    )).resolves.toBe(false);
  });
});
