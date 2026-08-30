import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_EXECUTION_BACKEND,
  isExecutionBackendKind,
  type ExecutionBackendKind,
} from "./types.js";

/** User-only backend selection (ADR-005). Same config-file family as the
 *  model-overrides store so discovery stays uniform. */
export const BACKEND_CONFIG_SCHEMA_VERSION = 1 as const;

export interface BackendConfigFile {
  schemaVersion: typeof BACKEND_CONFIG_SCHEMA_VERSION;
  backend?: ExecutionBackendKind;
  herdr?: { maxLiveSurfaces?: number };
}

/** Herdr backend options resolved from the same config file family. */
export interface HerdrRuntimeOptions {
  maxLiveSurfaces: number;
}

export const DEFAULT_MAX_LIVE_SURFACES = 8;

export function herdrOptionsFromConfig(file: BackendConfigFile | undefined): HerdrRuntimeOptions {
  const max = file?.herdr?.maxLiveSurfaces;
  if (max !== undefined && (!Number.isSafeInteger(max) || max < 1 || max > 64)) {
    throw new Error("herdr.maxLiveSurfaces must be an integer between 1 and 64");
  }
  return { maxLiveSurfaces: max ?? DEFAULT_MAX_LIVE_SURFACES };
}

export type BackendSelectionSource = "session-override" | "project-settings" | "global-settings" | "default";

export interface BackendSelection {
  backend: ExecutionBackendKind;
  source: BackendSelectionSource;
  projectConfigPresent: boolean;
  globalConfigPresent: boolean;
  sessionOverridePresent: boolean;
}

export function defaultGlobalBackendConfigPath(home = homedir()): string {
  return join(home, ".pi", "agent", "aili", "agent-backend.json");
}

export function defaultProjectBackendConfigPath(projectRoot: string): string {
  return resolve(projectRoot, ".pi", "aili", "agent-backend.json");
}

export interface BackendConfigStoreOptions {
  globalPath: string;
  /** Deterministic failure-injection seam for the replacement boundary. */
  beforeRename?: (temporaryPath: string, targetPath: string) => void | Promise<void>;
}

/**
 * User-global backend settings writer. It serializes writers with an adjacent
 * exclusive lock and swaps a fully-synced temporary file into place, so a
 * malformed source, lock failure, or replacement failure cannot partially
 * replace the prior config. The narrowly scoped update retains valid Herdr
 * options while changing only the backend preference.
 */
export class BackendConfigStore {
  constructor(private readonly options: BackendConfigStoreOptions) {}

  async setGlobalBackend(backend: ExecutionBackendKind | undefined): Promise<BackendConfigFile | undefined> {
    if (backend !== undefined && !isExecutionBackendKind(backend)) {
      throw new Error("global backend must be one of: managed, herdr");
    }
    const path = this.options.globalPath;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const lockPath = `${path}.lock`;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      throw new Error(`global backend config lock unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    let temporary: string | undefined;
    try {
      const current = await loadBackendConfigFile(path);
      // Clearing an absent preference is a no-op: do not create a config file
      // merely to represent the built-in/default resolution path.
      if (backend === undefined && current === undefined) return undefined;
      const next: BackendConfigFile = {
        schemaVersion: BACKEND_CONFIG_SCHEMA_VERSION,
        ...(current?.herdr === undefined ? {} : { herdr: { ...current.herdr } }),
        ...(backend === undefined ? {} : { backend }),
      };
      temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.options.beforeRename?.(temporary, path);
      await rename(temporary, path);
      temporary = undefined;
      return next;
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
      if (lock) await lock.close().catch(() => undefined);
      await rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

/** Parses one backend config file. Missing files are absent (undefined);
 *  malformed or invalid files fail explicitly rather than being ignored. */
export async function loadBackendConfigFile(path: string): Promise<BackendConfigFile | undefined> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${path}: backend config is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${path}: backend config must be an object`);
  const file = parsed as Record<string, unknown>;
  if (file.schemaVersion !== BACKEND_CONFIG_SCHEMA_VERSION) {
    throw new Error(`${path}: unsupported backend config schemaVersion ${String(file.schemaVersion)} (expected ${BACKEND_CONFIG_SCHEMA_VERSION})`);
  }
  const unknownKeys = Object.keys(file).filter((key) => key !== "schemaVersion" && key !== "backend" && key !== "herdr");
  if (unknownKeys.length > 0) throw new Error(`${path}: backend config contains unknown fields: ${unknownKeys.join(", ")}`);
  if (file.backend !== undefined && !isExecutionBackendKind(file.backend)) {
    throw new Error(`${path}: backend must be one of: managed, herdr`);
  }
  if (file.herdr !== undefined) {
    if (!file.herdr || typeof file.herdr !== "object" || Array.isArray(file.herdr)) {
      throw new Error(`${path}: herdr config must be an object`);
    }
    const herdr = file.herdr as Record<string, unknown>;
    const herdrUnknown = Object.keys(herdr).filter((key) => key !== "maxLiveSurfaces");
    if (herdrUnknown.length > 0) throw new Error(`${path}: herdr config contains unknown fields: ${herdrUnknown.join(", ")}`);
    herdrOptionsFromConfig({ schemaVersion: BACKEND_CONFIG_SCHEMA_VERSION, herdr: herdr as { maxLiveSurfaces?: number } });
  }
  return {
    schemaVersion: BACKEND_CONFIG_SCHEMA_VERSION,
    ...(file.backend === undefined ? {} : { backend: file.backend }),
    ...(file.herdr === undefined ? {} : { herdr: { maxLiveSurfaces: (file.herdr as Record<string, unknown>).maxLiveSurfaces as number | undefined } }),
  };
}

export interface BackendSelectionInput {
  cwd: string;
  sessionOverride?: ExecutionBackendKind | undefined;
  projectTrusted: boolean;
  globalPath?: string;
  projectPath?: string;
}

/** Resolution precedence: session override > project settings > global
 *  settings > default `managed`. Untrusted projects never contribute their
 *  config file (same trust boundary as the model-override store). */
export async function resolveBackendSelection(input: BackendSelectionInput): Promise<BackendSelection> {
  if (input.sessionOverride !== undefined && !isExecutionBackendKind(input.sessionOverride)) {
    throw new Error(`session backend override must be one of: managed, herdr (got '${String(input.sessionOverride)}')`);
  }
  const globalPath = input.globalPath ?? defaultGlobalBackendConfigPath();
  const projectPath = input.projectPath ?? defaultProjectBackendConfigPath(input.cwd);
  const globalFile = await loadBackendConfigFile(globalPath);
  // An untrusted project config is still read for presence reporting but can
  // never win the selection, mirroring how untrusted model overrides behave.
  const projectFile = await loadBackendConfigFile(projectPath);
  const projectEligible = input.projectTrusted && projectFile?.backend !== undefined;
  if (input.sessionOverride !== undefined) {
    return {
      backend: input.sessionOverride,
      source: "session-override",
      projectConfigPresent: projectFile !== undefined,
      globalConfigPresent: globalFile !== undefined,
      sessionOverridePresent: true,
    };
  }
  if (projectEligible) {
    return {
      backend: projectFile!.backend!,
      source: "project-settings",
      projectConfigPresent: true,
      globalConfigPresent: globalFile !== undefined,
      sessionOverridePresent: false,
    };
  }
  if (globalFile?.backend !== undefined) {
    return {
      backend: globalFile.backend,
      source: "global-settings",
      projectConfigPresent: projectFile !== undefined,
      globalConfigPresent: true,
      sessionOverridePresent: false,
    };
  }
  return {
    backend: DEFAULT_EXECUTION_BACKEND,
    source: "default",
    projectConfigPresent: projectFile !== undefined,
    globalConfigPresent: globalFile !== undefined,
    sessionOverridePresent: false,
  };
}

/** Herdr runtime options: the project config's herdr block wins over the
 *  global one (same file family and trust rule as backend selection). */
export async function resolveHerdrRuntimeOptions(input: BackendSelectionInput): Promise<HerdrRuntimeOptions> {
  const globalPath = input.globalPath ?? defaultGlobalBackendConfigPath();
  const projectPath = input.projectPath ?? defaultProjectBackendConfigPath(input.cwd);
  const files = await Promise.all([
    loadBackendConfigFile(globalPath),
    input.projectTrusted ? loadBackendConfigFile(projectPath) : Promise.resolve(undefined),
  ]);
  return herdrOptionsFromConfig(files[1] ?? files[0]);
}

/** Normalizes the existing session-only command aliases without changing
 * durable backend names. Global commands are parsed separately so `clear`
 * cannot accidentally clear a session-only override. */
export function normalizeBackendCommandAction(value: string): "status" | ExecutionBackendKind | undefined {
  const action = value.trim().toLowerCase() || "status";
  if (action === "s" || action === "status") return "status";
  if (action === "h" || action === "herdr") return "herdr";
  if (action === "m" || action === "manage" || action === "managed") return "managed";
  return undefined;
}

export type BackendCommand =
  | { scope: "session"; action: "status" | ExecutionBackendKind }
  | { scope: "global"; action: ExecutionBackendKind | "clear" };

/** Parses the direct-user backend command. Durable global values deliberately
 * accept only their canonical spellings, keeping the legacy s|h|m surface
 * session-local. */
export function parseBackendCommand(value: string): BackendCommand | undefined {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts[0] === "global") {
    if (parts.length !== 2) return undefined;
    const action = parts[1];
    if (action === "herdr" || action === "managed" || action === "clear") return { scope: "global", action };
    return undefined;
  }
  const action = normalizeBackendCommandAction(value);
  return action === undefined ? undefined : { scope: "session", action };
}

/** Renders the `/aili-agent-backend s` status summary. */
export function describeBackendSelection(selection: BackendSelection, availableKinds: readonly string[]): string {
  const availability = (["managed", "herdr"] as const)
    .map((kind) => `${kind}: ${availableKinds.includes(kind) ? "available" : "not available in this build"}`)
    .join("; ");
  return [
    `New Agents backend: ${selection.backend} (source: ${selection.source})`,
    `Config files: project ${selection.projectConfigPresent ? "present" : "absent"}, global ${selection.globalConfigPresent ? "present" : "absent"}; session override ${selection.sessionOverridePresent ? "set" : "none"}`,
    `Backends: ${availability}`,
    "Global preference: /aili-agent-backend global <herdr|managed|clear>; trusted project settings apply after global clear",
    "Existing Agents: unchanged (frozen at creation)",
  ].join("\n");
}
