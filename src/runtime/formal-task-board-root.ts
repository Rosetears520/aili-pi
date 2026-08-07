import { constants } from "node:fs";
import { lstat, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import {
  validateFormalTaskBoard,
  type FormalTaskBoardBootstrapBridgeIdentity,
  type FormalTaskBoardValidationResult,
} from "./formal-task-board.js";

export type FormalTaskBoardIdentity =
  | { state: "resolved"; changeId: string }
  | { state: "missing" }
  | { state: "ambiguous" };

export interface FormalTaskBoardRootRequest {
  repositoryRoot: string;
  identity: FormalTaskBoardIdentity;
  bootstrapBridge?: FormalTaskBoardBootstrapBridgeIdentity;
}

export interface FormalTaskBoardRootPaths {
  repositoryRoot: string;
  rootPath: string;
  tasksPath: string;
  progressPath: string;
}

export type FormalTaskBoardRootDiagnosticCode =
  | "IDENTITY_MISSING"
  | "IDENTITY_AMBIGUOUS"
  | "CHANGE_ID_INVALID"
  | "REPOSITORY_ROOT_INVALID"
  | "PATH_MISSING"
  | "PATH_SYMLINK"
  | "PATH_TYPE_MISMATCH"
  | "PATH_CANONICAL_MISMATCH"
  | "PATH_OUTSIDE_REPOSITORY"
  | "OWNED_PATH_COLLISION"
  | "OWNED_PAIR_INCOMPLETE"
  | "EXISTING_PAIR_LEGACY_UNMANAGED"
  | "EXISTING_PAIR_INVALID"
  | "EXISTING_IDENTITY_MISMATCH"
  | "INITIAL_SOURCES_MISSING"
  | "CANDIDATE_LEGACY_UNMANAGED"
  | "CANDIDATE_INVALID"
  | "CANDIDATE_IDENTITY_MISMATCH"
  | "CREATE_RACE"
  | "CREATE_FAILED"
  | "ROLLBACK_FAILED"
  | "IO_FAILURE";

export interface FormalTaskBoardRootDiagnostic {
  code: FormalTaskBoardRootDiagnosticCode;
  message: string;
  path?: string;
  relatedCodes?: readonly string[];
}

export interface FormalTaskBoardRootBlockedResult {
  status: "blocked";
  repositoryRoot: string;
  rootPath?: string;
  tasksPath?: string;
  progressPath?: string;
  diagnostics: readonly FormalTaskBoardRootDiagnostic[];
}

export type FormalTaskBoardRootResolvedResult =
  | (FormalTaskBoardRootPaths & {
      status: "resolved";
      pairState: "absent";
      diagnostics: readonly [];
    })
  | (FormalTaskBoardRootPaths & {
      status: "resolved";
      pairState: "present";
      tasksSource: string;
      progressSource: string;
      diagnostics: readonly [];
    });

export type FormalTaskBoardRootResolution = FormalTaskBoardRootResolvedResult | FormalTaskBoardRootBlockedResult;

export interface FormalTaskBoardRootOperationHooks {
  beforeCreate?: (path: string, ordinal: 1 | 2) => void | Promise<void>;
}

export interface InitializeFormalTaskBoardRootRequest extends FormalTaskBoardRootRequest {
  tasksSource?: string;
  progressSource?: string;
  hooks?: FormalTaskBoardRootOperationHooks;
}

export interface FormalTaskBoardRootCreatedResult extends FormalTaskBoardRootPaths {
  status: "created";
  diagnostics: readonly [];
}

export interface FormalTaskBoardRootReusedResult extends FormalTaskBoardRootPaths {
  status: "reused";
  diagnostics: readonly [];
}

export type FormalTaskBoardRootInitializationResult =
  | FormalTaskBoardRootCreatedResult
  | FormalTaskBoardRootReusedResult
  | FormalTaskBoardRootBlockedResult;

type OwnedPathState =
  | { state: "absent" }
  | { state: "file"; device: number | bigint; inode: number | bigint };

interface CreatedFileIdentity {
  path: string;
  device: number | bigint;
  inode: number | bigint;
}

class ExclusiveCreateFailure extends Error {
  constructor(
    readonly errno: string | undefined,
    readonly cleanupFailed: boolean,
  ) {
    super("Exclusive file creation failed.");
  }
}

class CreatedFileRaceFailure extends Error {
  constructor() {
    super("A file created by this operation changed before pair completion.");
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
}

function isMissingError(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

function boundedValidationCodes(validation: FormalTaskBoardValidationResult): string[] {
  return [...new Set(validation.diagnostics.map((diagnostic) => diagnostic.code))].slice(0, 32);
}

function blocked(
  repositoryRoot: string,
  diagnostics: readonly FormalTaskBoardRootDiagnostic[],
  paths?: FormalTaskBoardRootPaths,
): FormalTaskBoardRootBlockedResult {
  return {
    status: "blocked",
    repositoryRoot,
    rootPath: paths?.rootPath,
    tasksPath: paths?.tasksPath,
    progressPath: paths?.progressPath,
    diagnostics,
  };
}

function ordinaryChangeId(identity: FormalTaskBoardIdentity):
  | { changeId: string }
  | { diagnostic: FormalTaskBoardRootDiagnostic } {
  if (!identity || identity.state === "missing") {
    return { diagnostic: { code: "IDENTITY_MISSING", message: "No lifecycle-resolved OpenSpec change identity was supplied." } };
  }
  if (identity.state === "ambiguous") {
    return { diagnostic: { code: "IDENTITY_AMBIGUOUS", message: "The lifecycle-resolved OpenSpec change identity is ambiguous." } };
  }
  if (identity.state !== "resolved" || typeof identity.changeId !== "string") {
    return { diagnostic: { code: "CHANGE_ID_INVALID", message: "The resolved OpenSpec change ID is not an ordinary path segment." } };
  }
  const changeId = identity.changeId;
  const invalid = changeId.length === 0
    || changeId !== changeId.trim()
    || Buffer.byteLength(changeId, "utf8") > 255
    || changeId === "."
    || changeId === ".."
    || changeId.includes("/")
    || changeId.includes("\\")
    || changeId.includes("\0")
    || isAbsolute(changeId)
    || win32.isAbsolute(changeId);
  return invalid
    ? { diagnostic: { code: "CHANGE_ID_INVALID", message: "The resolved OpenSpec change ID is not an ordinary path segment." } }
    : { changeId };
}

function derivePaths(repositoryRoot: string, changeId: string): FormalTaskBoardRootPaths {
  const rootPath = resolve(repositoryRoot, "openspec", "changes", changeId);
  return {
    repositoryRoot,
    rootPath,
    tasksPath: resolve(rootPath, "formal-task-board.md"),
    progressPath: resolve(rootPath, "progress.txt"),
  };
}

async function inspectDirectory(
  path: string,
  repositoryRoot: string,
): Promise<FormalTaskBoardRootDiagnostic | undefined> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    return isMissingError(error)
      ? { code: "PATH_MISSING", message: "A required formal-root directory does not exist.", path }
      : { code: "IO_FAILURE", message: "A required formal-root directory could not be inspected.", path };
  }
  if (metadata.isSymbolicLink()) {
    return { code: "PATH_SYMLINK", message: "A formal-root path is a symbolic link.", path };
  }
  if (!metadata.isDirectory()) {
    return { code: "PATH_TYPE_MISMATCH", message: "A formal-root path is not an ordinary directory.", path };
  }
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    return { code: "IO_FAILURE", message: "A required formal-root directory could not be canonicalized.", path };
  }
  if (canonical !== path) {
    return { code: "PATH_CANONICAL_MISMATCH", message: "A formal-root path does not match its canonical path.", path };
  }
  if (!isInside(repositoryRoot, canonical)) {
    return { code: "PATH_OUTSIDE_REPOSITORY", message: "A formal-root path resolves outside the repository.", path };
  }
  return undefined;
}

async function inspectDirectories(paths: FormalTaskBoardRootPaths): Promise<FormalTaskBoardRootDiagnostic | undefined> {
  const directories = [
    paths.repositoryRoot,
    resolve(paths.repositoryRoot, "openspec"),
    resolve(paths.repositoryRoot, "openspec", "changes"),
    paths.rootPath,
  ];
  for (const directory of directories) {
    const diagnostic = await inspectDirectory(directory, paths.repositoryRoot);
    if (diagnostic) return diagnostic;
  }
  return undefined;
}

async function inspectOwnedPath(
  path: string,
  repositoryRoot: string,
): Promise<OwnedPathState | FormalTaskBoardRootDiagnostic> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isMissingError(error)) return { state: "absent" };
    return { code: "IO_FAILURE", message: "An owned formal-board path could not be inspected.", path };
  }
  if (metadata.isSymbolicLink()) {
    return { code: "PATH_SYMLINK", message: "An owned formal-board path is a symbolic link.", path };
  }
  if (!metadata.isFile()) {
    return { code: "OWNED_PATH_COLLISION", message: "An owned formal-board path collides with a non-regular file.", path };
  }
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    return { code: "IO_FAILURE", message: "An owned formal-board path could not be canonicalized.", path };
  }
  if (canonical !== path) {
    return { code: "PATH_CANONICAL_MISMATCH", message: "An owned formal-board path does not match its canonical path.", path };
  }
  if (!isInside(repositoryRoot, canonical)) {
    return { code: "PATH_OUTSIDE_REPOSITORY", message: "An owned formal-board path resolves outside the repository.", path };
  }
  return { state: "file", device: metadata.dev, inode: metadata.ino };
}

function isPathDiagnostic(value: OwnedPathState | FormalTaskBoardRootDiagnostic): value is FormalTaskBoardRootDiagnostic {
  return "code" in value;
}

async function readOrdinaryFile(
  path: string,
  expected: Extract<OwnedPathState, { state: "file" }> | CreatedFileIdentity,
  repositoryRoot: string,
): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.dev !== expected.device || metadata.ino !== expected.inode) {
      throw new Error("Owned path changed identity before read.");
    }
    const source = await handle.readFile({ encoding: "utf8" });
    const current = await lstat(path);
    if (current.isSymbolicLink()
      || !current.isFile()
      || current.dev !== expected.device
      || current.ino !== expected.inode) {
      throw new Error("Owned path changed identity during read.");
    }
    const canonical = await realpath(path);
    if (canonical !== path || !isInside(repositoryRoot, canonical)) {
      throw new Error("Owned path became non-canonical during read.");
    }
    return source;
  } finally {
    await handle?.close();
  }
}

function validatePair(
  tasksSource: string,
  progressSource: string,
  changeId: string,
  source: "existing" | "candidate",
  bootstrapBridge?: FormalTaskBoardBootstrapBridgeIdentity,
): FormalTaskBoardRootDiagnostic | undefined {
  const validation = validateFormalTaskBoard(tasksSource, progressSource, bootstrapBridge ? { bootstrapBridge } : undefined);
  if (validation.classification === "legacy/unmanaged") {
    return {
      code: source === "existing" ? "EXISTING_PAIR_LEGACY_UNMANAGED" : "CANDIDATE_LEGACY_UNMANAGED",
      message: source === "existing"
        ? "The existing task file is legacy/unmanaged and was not changed."
        : "The supplied task source is legacy/unmanaged and cannot initialize a v1 board.",
      relatedCodes: boundedValidationCodes(validation),
    };
  }
  if (!validation.valid) {
    return {
      code: source === "existing" ? "EXISTING_PAIR_INVALID" : "CANDIDATE_INVALID",
      message: source === "existing"
        ? "The existing owned pair failed formal v1 validation and was not changed."
        : "The supplied owned pair failed formal v1 validation.",
      relatedCodes: boundedValidationCodes(validation),
    };
  }
  if (source === "candidate" && validation.progress?.events.length !== 1) {
    return {
      code: "CANDIDATE_INVALID",
      message: "The supplied initial progress source must contain only its BOARD BOARD_CREATED event.",
      relatedCodes: ["INITIAL_PROGRESS_EVENT_SET_INVALID"],
    };
  }
  if (validation.board?.headers["Task identity"]?.value !== changeId) {
    return {
      code: source === "existing" ? "EXISTING_IDENTITY_MISMATCH" : "CANDIDATE_IDENTITY_MISMATCH",
      message: source === "existing"
        ? "The existing board identity does not match the exact resolved change ID."
        : "The supplied board identity does not match the exact resolved change ID.",
    };
  }
  return undefined;
}

async function inspectFormalRoot(request: FormalTaskBoardRootRequest): Promise<FormalTaskBoardRootResolution> {
  if (typeof request?.repositoryRoot !== "string" || request.repositoryRoot.length === 0) {
    return blocked("", [{ code: "REPOSITORY_ROOT_INVALID", message: "The repository root must be a non-empty path." }]);
  }
  const repositoryRoot = resolve(request.repositoryRoot);
  if (!isAbsolute(request.repositoryRoot) || request.repositoryRoot !== repositoryRoot) {
    return blocked(repositoryRoot, [{
      code: "REPOSITORY_ROOT_INVALID",
      message: "The repository root must be one exact absolute normalized path.",
    }]);
  }
  const identity = ordinaryChangeId(request.identity);
  if ("diagnostic" in identity) return blocked(repositoryRoot, [identity.diagnostic]);
  const paths = derivePaths(repositoryRoot, identity.changeId);

  const directoryDiagnostic = await inspectDirectories(paths);
  if (directoryDiagnostic) return blocked(repositoryRoot, [directoryDiagnostic], paths);

  const tasksState = await inspectOwnedPath(paths.tasksPath, repositoryRoot);
  if (isPathDiagnostic(tasksState)) return blocked(repositoryRoot, [tasksState], paths);
  const progressState = await inspectOwnedPath(paths.progressPath, repositoryRoot);
  if (isPathDiagnostic(progressState)) return blocked(repositoryRoot, [progressState], paths);

  if (tasksState.state === "absent" && progressState.state === "absent") {
    return { ...paths, status: "resolved", pairState: "absent", diagnostics: [] };
  }
  if (tasksState.state === "absent" || progressState.state === "absent") {
    return blocked(repositoryRoot, [{
      code: "OWNED_PAIR_INCOMPLETE",
      message: "Exactly one owned formal-board file exists; no repair or creation was attempted.",
    }], paths);
  }

  let tasksSource: string;
  let progressSource: string;
  try {
    [tasksSource, progressSource] = await Promise.all([
      readOrdinaryFile(paths.tasksPath, tasksState, repositoryRoot),
      readOrdinaryFile(paths.progressPath, progressState, repositoryRoot),
    ]);
  } catch {
    return blocked(repositoryRoot, [{ code: "IO_FAILURE", message: "The existing owned pair could not be read safely." }], paths);
  }
  const pairDiagnostic = validatePair(tasksSource, progressSource, identity.changeId, "existing", request.bootstrapBridge);
  if (pairDiagnostic) return blocked(repositoryRoot, [pairDiagnostic], paths);
  return { ...paths, status: "resolved", pairState: "present", tasksSource, progressSource, diagnostics: [] };
}

export async function resolveFormalTaskBoardRoot(request: FormalTaskBoardRootRequest): Promise<FormalTaskBoardRootResolution> {
  try {
    return await inspectFormalRoot(request);
  } catch {
    const repositoryRoot = typeof request?.repositoryRoot === "string" && request.repositoryRoot.length > 0
      ? resolve(request.repositoryRoot)
      : "";
    return blocked(repositoryRoot, [{ code: "IO_FAILURE", message: "Formal-root inspection failed without mutating owned files." }]);
  }
}

async function removeCreatedFile(identity: CreatedFileIdentity): Promise<boolean> {
  try {
    const metadata = await lstat(identity.path);
    if (metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.dev !== identity.device
      || metadata.ino !== identity.inode) {
      return false;
    }
    await unlink(identity.path);
    return true;
  } catch (error) {
    return isMissingError(error);
  }
}

async function createExclusiveFile(path: string, source: string): Promise<CreatedFileIdentity> {
  let handle: FileHandle | undefined;
  let identity: CreatedFileIdentity | undefined;
  let failure: unknown;
  try {
    handle = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const metadata = await handle.stat();
    identity = { path, device: metadata.dev, inode: metadata.ino };
    await handle.writeFile(source, { encoding: "utf8" });
  } catch (error) {
    failure = error;
  }
  try {
    await handle?.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    const cleanupFailed = identity ? !(await removeCreatedFile(identity)) : false;
    throw new ExclusiveCreateFailure(errorCode(failure), cleanupFailed);
  }
  return identity!;
}

function createFailureDiagnostics(error: unknown): FormalTaskBoardRootDiagnostic[] {
  const race = error instanceof CreatedFileRaceFailure
    || (error instanceof ExclusiveCreateFailure && error.errno === "EEXIST");
  const diagnostics: FormalTaskBoardRootDiagnostic[] = [{
    code: race ? "CREATE_RACE" : "CREATE_FAILED",
    message: race
      ? "Exclusive creation lost a race; no existing file was overwritten."
      : "Exclusive creation failed without overwriting an existing file.",
  }];
  if (error instanceof ExclusiveCreateFailure && error.cleanupFailed) {
    diagnostics.push({ code: "ROLLBACK_FAILED", message: "A file created by this operation could not be safely rolled back." });
  }
  return diagnostics;
}

async function rollbackFirst(
  first: CreatedFileIdentity,
  diagnostics: FormalTaskBoardRootDiagnostic[],
): Promise<FormalTaskBoardRootDiagnostic[]> {
  if (!(await removeCreatedFile(first))) {
    diagnostics.push({ code: "ROLLBACK_FAILED", message: "The first file created by this operation could not be safely rolled back." });
  }
  return diagnostics;
}

async function rollbackCreatedPair(
  first: CreatedFileIdentity,
  second: CreatedFileIdentity,
  diagnostics: FormalTaskBoardRootDiagnostic[],
): Promise<FormalTaskBoardRootDiagnostic[]> {
  if (!(await removeCreatedFile(second))) {
    diagnostics.push({ code: "ROLLBACK_FAILED", message: "The second file created by this operation could not be safely rolled back." });
  }
  return await rollbackFirst(first, diagnostics);
}

async function verifyCreatedFile(
  identity: CreatedFileIdentity,
  expectedSource: string,
  repositoryRoot: string,
): Promise<void> {
  try {
    const source = await readOrdinaryFile(identity.path, identity, repositoryRoot);
    if (source !== expectedSource) throw new CreatedFileRaceFailure();
  } catch (error) {
    if (error instanceof CreatedFileRaceFailure) throw error;
    throw new CreatedFileRaceFailure();
  }
}

export async function initializeFormalTaskBoardRoot(
  request: InitializeFormalTaskBoardRootRequest,
): Promise<FormalTaskBoardRootInitializationResult> {
  const resolution = await resolveFormalTaskBoardRoot(request);
  if (resolution.status === "blocked") return resolution;
  if (resolution.pairState === "present") {
    const { status: _status, pairState: _pairState, tasksSource: _tasksSource, progressSource: _progressSource, ...paths } = resolution;
    return { ...paths, status: "reused" };
  }
  const paths: FormalTaskBoardRootPaths = resolution;
  if (typeof request.tasksSource !== "string" || typeof request.progressSource !== "string") {
    return blocked(paths.repositoryRoot, [{
      code: "INITIAL_SOURCES_MISSING",
      message: "Both caller-supplied initial v1 sources are required when the owned pair is absent.",
    }], paths);
  }
  const identity = ordinaryChangeId(request.identity);
  if ("diagnostic" in identity) return blocked(paths.repositoryRoot, [identity.diagnostic], paths);
  const candidateDiagnostic = validatePair(request.tasksSource, request.progressSource, identity.changeId, "candidate", request.bootstrapBridge);
  if (candidateDiagnostic) return blocked(paths.repositoryRoot, [candidateDiagnostic], paths);

  const refreshed = await resolveFormalTaskBoardRoot(request);
  if (refreshed.status === "blocked") return refreshed;
  if (refreshed.pairState === "present") {
    const { status: _status, pairState: _pairState, tasksSource: _tasksSource, progressSource: _progressSource, ...refreshedPaths } = refreshed;
    return { ...refreshedPaths, status: "reused" };
  }

  let first: CreatedFileIdentity;
  try {
    await request.hooks?.beforeCreate?.(paths.tasksPath, 1);
    const directoryDiagnostic = await inspectDirectories(paths);
    if (directoryDiagnostic) return blocked(paths.repositoryRoot, [directoryDiagnostic], paths);
    first = await createExclusiveFile(paths.tasksPath, request.tasksSource);
  } catch (error) {
    return blocked(paths.repositoryRoot, createFailureDiagnostics(error), paths);
  }

  let second: CreatedFileIdentity | undefined;
  try {
    await request.hooks?.beforeCreate?.(paths.progressPath, 2);
    const directoryDiagnostic = await inspectDirectories(paths);
    if (directoryDiagnostic) {
      return blocked(paths.repositoryRoot, await rollbackFirst(first, [directoryDiagnostic]), paths);
    }
    try {
      await verifyCreatedFile(first, request.tasksSource, paths.repositoryRoot);
    } catch (error) {
      return blocked(paths.repositoryRoot, await rollbackFirst(first, createFailureDiagnostics(error)), paths);
    }
    second = await createExclusiveFile(paths.progressPath, request.progressSource);
    const finalDirectoryDiagnostic = await inspectDirectories(paths);
    if (finalDirectoryDiagnostic) {
      return blocked(paths.repositoryRoot, await rollbackCreatedPair(first, second, [finalDirectoryDiagnostic]), paths);
    }
    try {
      await Promise.all([
        verifyCreatedFile(first, request.tasksSource, paths.repositoryRoot),
        verifyCreatedFile(second, request.progressSource, paths.repositoryRoot),
      ]);
    } catch (error) {
      return blocked(paths.repositoryRoot, await rollbackCreatedPair(first, second, createFailureDiagnostics(error)), paths);
    }
  } catch (error) {
    const diagnostics = createFailureDiagnostics(error);
    return blocked(
      paths.repositoryRoot,
      second
        ? await rollbackCreatedPair(first, second, diagnostics)
        : await rollbackFirst(first, diagnostics),
      paths,
    );
  }

  return { ...paths, status: "created", diagnostics: [] };
}
