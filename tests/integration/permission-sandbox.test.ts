import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { lstat, mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composePersistentAgentSandboxConfig } from "../../src/runtime/persistent-agents/child-sandbox.js";
import {
  createSandboxedBashOps,
  SandboxController,
} from "../../src/vendor/pi-permission-modes/index.js";

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

async function permissionDefaults(): Promise<PermissionDefaults> {
  const defaults = await import("pi-permission-modes/permission-mode.defaults.json", { with: { type: "json" } }) as unknown as { default: PermissionDefaults };
  return defaults.default;
}

async function expectDeniedMarker(
  operations: BashOperations,
  marker: string,
  cwd: string,
  successOutput: string,
): Promise<void> {
  const output: Buffer[] = [];
  const command = `if cat ${JSON.stringify(marker)} >/dev/null 2>&1; then exit 97; fi; printf ${JSON.stringify(successOutput)}`;
  const result = await operations.exec(command, cwd, { onData: (data) => output.push(data) });
  expect(result).toEqual({ exitCode: 0 });
  expect(Buffer.concat(output).toString()).toContain(successOutput);
}

describe("pi-permission-modes sandbox behavior", () => {
  it("executes Build-profile commands while preserving denied-read symlink targets", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "aili-permission-sandbox-ready-"));
    const home = join(cwd, "home");
    const deniedLink = join(home, ".ssh");
    const deniedTarget = join(cwd, "denied-read-target");
    const marker = join(deniedTarget, "marker.txt");
    const missingDenied = join(home, ".gnupg");
    const markerContents = "sandbox-denied-marker\n";
    await mkdir(home, { recursive: true });
    if (process.platform === "linux") {
      await mkdir(deniedTarget, { recursive: true });
      await writeFile(marker, markerContents);
      await symlink(deniedTarget, deniedLink);
    } else {
      await Promise.all([".ssh", ".aws", ".gnupg"].map((name) => mkdir(join(home, name), { recursive: true })));
    }

    const originalCwd = process.cwd();
    const originalHome = process.env.HOME;
    const notices: string[] = [];
    let sandbox: SandboxController | undefined;
    try {
      process.chdir(cwd);
      process.env.HOME = home;
      const defaults = await permissionDefaults();
      const profile = defaults.modes.build!.sandbox;
      sandbox = new SandboxController();
      await sandbox.init({ cwd, noSandbox: false, hasUI: true, notify: (message) => notices.push(message), profile });
      expect({ ready: sandbox.ready, disabled: sandbox.disabled, warn: sandbox.warn, notices }).toEqual({ ready: true, disabled: false, warn: undefined, notices: [] });
      expect(profile.denyRead).toContain("~/.ssh");

      const controllerOperations = sandbox.bashOps();
      if (!controllerOperations) throw new Error("ready sandbox operations are missing");
      if (process.platform === "linux") {
        await expectDeniedMarker(controllerOperations, marker, cwd, "controller-sandbox-enabled");
      } else {
        const output: Buffer[] = [];
        expect(await controllerOperations.exec("printf sandbox-enabled", cwd, { onData: (data) => output.push(data) })).toEqual({ exitCode: 0 });
        expect(Buffer.concat(output).toString()).toContain("sandbox-enabled");
      }

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
        composePersistentAgentSandboxConfig(profile, false, [board, progress]),
      );
      if (process.platform === "linux") {
        await expectDeniedMarker(formalOperations, marker, cwd, "custom-config-sandbox-enabled");
      }
      await formalOperations.exec(`printf changed > ${JSON.stringify(board)}`, cwd, { onData: () => undefined });
      await formalOperations.exec(`printf changed > ${JSON.stringify(progress)}`, cwd, { onData: () => undefined });
      expect(await readFile(board, "utf8")).toBe("board-before\n");
      expect(await readFile(progress, "utf8")).toBe("progress-before\n");
      expect(await formalOperations.exec(`printf lawful > ${JSON.stringify(adjacent)}`, cwd, { onData: () => undefined })).toEqual({ exitCode: 0 });
      expect(await readFile(adjacent, "utf8")).toBe("lawful");

      if (process.platform === "linux") {
        expect((await lstat(deniedLink)).isSymbolicLink()).toBe(true);
        expect(await readlink(deniedLink)).toBe(deniedTarget);
        expect((await lstat(deniedTarget)).isDirectory()).toBe(true);
        expect(await readFile(marker, "utf8")).toBe(markerContents);
        await expect(lstat(missingDenied)).rejects.toThrow();
      }
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
    const defaults = await permissionDefaults();
    const sandbox = new SandboxController();
    const notices: string[] = [];
    await sandbox.init({ cwd, noSandbox: false, hasUI: true, notify: (message) => notices.push(message), profile: defaults.modes.build!.sandbox });

    expect(sandbox.ready).toBe(false);
    expect(sandbox.disabled).toBe(false);
    expect(sandbox.warn).toContain(".git is a file");
    expect(notices.join("\n")).toContain("will prompt for confirmation instead");
  });
});
