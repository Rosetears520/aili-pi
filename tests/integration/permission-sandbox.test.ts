import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface SandboxController {
  ready: boolean;
  disabled: boolean;
  warn: string | undefined;
  init(options: {
    cwd: string;
    noSandbox: boolean;
    hasUI: boolean;
    notify(message: string): void;
    profile: {
      enabled: boolean;
      writable: boolean;
      allowWrite: string[];
      denyWrite: string[];
      denyRead: string[];
      network?: { allowedDomains: string[]; deniedDomains: string[] };
    };
  }): Promise<void>;
  bashOps(options?: { readOnly?: boolean }): {
    exec(command: string, cwd: string, options: {
      onData(data: Buffer): void;
      signal?: AbortSignal;
      timeout?: number;
    }): Promise<{ exitCode: number | null }>;
  } | null;
  reset(): Promise<void>;
}

interface PermissionDefaults {
  modes: {
    build: {
      sandbox: {
        enabled: boolean;
        writable: boolean;
        allowWrite: string[];
        denyWrite: string[];
        denyRead: string[];
        network?: { allowedDomains: string[]; deniedDomains: string[] };
      };
    };
  };
}

async function vendorSandbox(): Promise<{ SandboxController: new () => SandboxController; defaults: PermissionDefaults }> {
  const [sandboxModule, defaults] = await Promise.all([
    import("pi-permission-modes/src/sandbox.ts") as Promise<{ SandboxController: new () => SandboxController }>,
    import("pi-permission-modes/permission-mode.defaults.json", { with: { type: "json" } }) as unknown as Promise<{ default: PermissionDefaults }>,
  ]);
  return { SandboxController: sandboxModule.SandboxController, defaults: defaults.default };
}

describe("pi-permission-modes sandbox behavior", () => {
  it("executes a Build-profile command through the installed vendor sandbox runtime", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "aili-permission-sandbox-ready-"));
    const home = join(cwd, "home");
    await Promise.all([".ssh", ".aws", ".gnupg"].map((name) => mkdir(join(home, name), { recursive: true })));
    const originalCwd = process.cwd();
    const originalHome = process.env.HOME;
    const notices: string[] = [];
    let sandbox: SandboxController | undefined;
    try {
      process.chdir(cwd);
      process.env.HOME = home;
      const { SandboxController, defaults } = await vendorSandbox();
      sandbox = new SandboxController();
      await sandbox.init({ cwd, noSandbox: false, hasUI: true, notify: (message) => notices.push(message), profile: defaults.modes.build!.sandbox });
      expect({ ready: sandbox.ready, disabled: sandbox.disabled, warn: sandbox.warn, notices }).toEqual({ ready: true, disabled: false, warn: undefined, notices: [] });

      const output: Buffer[] = [];
      const result = await sandbox.bashOps()?.exec("printf sandbox-enabled", cwd, { onData: (data) => output.push(data) });
      expect(result).toEqual({ exitCode: 0 });
      expect(Buffer.concat(output).toString()).toContain("sandbox-enabled");
    } finally {
      await sandbox?.reset();
      process.chdir(originalCwd);
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  }, 30_000);

  it("visibly degrades rather than claiming a sandbox when worktree topology is incompatible", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "aili-permission-sandbox-degraded-"));
    await writeFile(join(cwd, ".git"), "gitdir: /nonexistent/worktree\n");
    const { SandboxController, defaults } = await vendorSandbox();
    const sandbox = new SandboxController();
    const notices: string[] = [];
    await sandbox.init({ cwd, noSandbox: false, hasUI: true, notify: (message) => notices.push(message), profile: defaults.modes.build!.sandbox });

    expect(sandbox.ready).toBe(false);
    expect(sandbox.disabled).toBe(false);
    expect(sandbox.warn).toContain(".git is a file");
    expect(notices.join("\n")).toContain("will prompt for confirmation instead");
  });
});
