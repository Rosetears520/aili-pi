import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composePersistentAgentSandboxConfig } from "../../src/runtime/persistent-agents/child-sandbox.js";
import type { SandboxConfig } from "pi-permission-modes/src/config-load.ts";

interface SandboxController {
  ready: boolean;
  disabled: boolean;
  warn: string | undefined;
  sandboxManager: unknown | null;
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

async function vendorSandbox(): Promise<{
  SandboxController: new () => SandboxController;
  createSandboxedBashOps(manager: unknown, config?: Partial<SandboxConfig>): BashOperations;
  defaults: PermissionDefaults;
}> {
  const [sandboxModule, defaults] = await Promise.all([
    import("pi-permission-modes/src/sandbox.ts") as unknown as Promise<{
      SandboxController: new () => SandboxController;
      createSandboxedBashOps(manager: unknown, config?: Partial<SandboxConfig>): BashOperations;
    }>,
    import("pi-permission-modes/permission-mode.defaults.json", { with: { type: "json" } }) as unknown as Promise<{ default: PermissionDefaults }>,
  ]);
  return {
    SandboxController: sandboxModule.SandboxController,
    createSandboxedBashOps: sandboxModule.createSandboxedBashOps,
    defaults: defaults.default,
  };
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
      const { SandboxController, createSandboxedBashOps, defaults } = await vendorSandbox();
      sandbox = new SandboxController();
      await sandbox.init({ cwd, noSandbox: false, hasUI: true, notify: (message) => notices.push(message), profile: defaults.modes.build!.sandbox });
      expect({ ready: sandbox.ready, disabled: sandbox.disabled, warn: sandbox.warn, notices }).toEqual({ ready: true, disabled: false, warn: undefined, notices: [] });

      const output: Buffer[] = [];
      const result = await sandbox.bashOps()?.exec("printf sandbox-enabled", cwd, { onData: (data) => output.push(data) });
      expect(result).toEqual({ exitCode: 0 });
      expect(Buffer.concat(output).toString()).toContain("sandbox-enabled");

      const owningRoot = join(cwd, "openspec", "changes", "formal");
      const board = join(owningRoot, "formal-task-board.md");
      const progress = join(owningRoot, "progress.txt");
      const adjacent = join(owningRoot, "evidence.txt");
      await mkdir(owningRoot, { recursive: true });
      await writeFile(board, "board-before\n");
      await writeFile(progress, "progress-before\n");
      if (!sandbox.sandboxManager) throw new Error("ready sandbox manager is missing");
      const formalOperations = createSandboxedBashOps(
        sandbox.sandboxManager,
        composePersistentAgentSandboxConfig(defaults.modes.build!.sandbox, false, [board, progress]),
      );
      await formalOperations.exec(`printf changed > ${JSON.stringify(board)}`, cwd, { onData: () => undefined });
      await formalOperations.exec(`printf changed > ${JSON.stringify(progress)}`, cwd, { onData: () => undefined });
      expect(await readFile(board, "utf8")).toBe("board-before\n");
      expect(await readFile(progress, "utf8")).toBe("progress-before\n");
      expect(await formalOperations.exec(`printf lawful > ${JSON.stringify(adjacent)}`, cwd, { onData: () => undefined })).toEqual({ exitCode: 0 });
      expect(await readFile(adjacent, "utf8")).toBe("lawful");
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
