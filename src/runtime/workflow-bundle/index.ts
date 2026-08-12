import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../../", import.meta.url);
const LOCK_URL = new URL("upstream/aili-workflows.lock.json", ROOT);
const BUNDLE_URL = new URL("upstream/aili-workflows-runtime/", ROOT);
const SUPPORTED_LOCK_SCHEMA = 1;
const SUPPORTED_RUNTIME_SCHEMA = 1;
const EXPECTED_PACKAGE = "rose-aili";
const EXPECTED_VERSION = "0.4.7";
const EXPECTED_COMMIT = "a69f3149d8f1db81726128c2819a3ccc954b9ccc";
const MAX_ARTIFACT_BYTES = 512 * 1024;

export const WORKFLOW_RUNTIME_ARTIFACTS = Object.freeze({
  system: "system.md",
  roleMetadata: "role-metadata.json",
  selectionMap: "selection-map.json",
  installationContract: "installation-contract.json",
  agentSelectionProtocol: "protocols/aili-agent-selection.v1.schema.json",
  formalTaskBoardProtocol: "protocols/aili-task-board.v1.schema.json",
  packageEnvelopeProtocol: "protocols/package-envelope.schema.json",
  provenance: "provenance.json",
} as const);

interface FileRecord { path: string; sha256: string; bytes: number }
interface WorkflowLock {
  schemaVersion: number;
  commit: string;
  release: { package: string; version: string; npmGitHead: string; canonicalSpecialists: string[] };
  runtimeBundle: {
    sourceRoot: string;
    targetRoot: string;
    fileCount: number;
    contentHash: string;
    files: FileRecord[];
  };
}

interface RoleMetadata {
  schemaVersion: number;
  protocol: string;
  roles: Array<{ id: string; title: string; mode: string; description: string; goal: string; output: string }>;
  authorityBoundary: string;
  generated: { generator: string; inputSha256: string };
}

interface SelectionMap {
  schemaVersion: number;
  protocol: string;
  roles: Array<{ id: string; mode: string }>;
  decisionOwner: string;
  generated: { generator: string; inputSha256: string };
}

interface InstallationContract {
  schemaVersion: number;
  adapter: string;
  installation: {
    globalContext: { source: string; destination: string };
    allowedSourceGlob: string;
    destinationGlob: string;
    packageOnly: string[];
  };
  generated: { generator: string; inputSha256: string };
}

interface ProvenanceOutput {
  path: string;
  outputSha256: string;
}

interface RuntimeProvenance {
  schemaVersion: number;
  generator: string;
  adapter: string;
  inputSha256: string;
  outputs: ProvenanceOutput[];
}

export interface WorkflowRuntimeBundle {
  package: typeof EXPECTED_PACKAGE;
  version: typeof EXPECTED_VERSION;
  commit: typeof EXPECTED_COMMIT;
  system: string;
  canonicalSpecialists: readonly string[];
  roleMetadata: Readonly<RoleMetadata>;
  selectionMap: Readonly<SelectionMap>;
  installationContract: Readonly<InstallationContract>;
  protocols: Readonly<Record<"agentSelection" | "formalTaskBoard" | "packageEnvelope", Readonly<Record<string, unknown>>>>;
  provenance: Readonly<RuntimeProvenance>;
}

export interface WorkflowRuntimeBundleOptions {
  lockUrl?: URL;
  bundleUrl?: URL;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function aggregateHash(files: readonly FileRecord[]): string {
  return sha256(files.map((file) => `${file.path}\0${file.sha256}\0${file.bytes}\n`).join(""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson<T>(content: Buffer, label: string): T {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content)) as T;
  } catch {
    throw new Error(`Workflow runtime bundle ${label} is not valid UTF-8 JSON`);
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) freeze(item);
  }
  return value;
}

function validateFileRecord(file: FileRecord): void {
  if (!file || typeof file.path !== "string" || file.path.startsWith("/") || file.path.includes("..")
    || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_ARTIFACT_BYTES
    || typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256)) {
    throw new Error("Workflow runtime bundle lock contains an invalid file record");
  }
}

async function readLockedFile(root: URL, record: FileRecord): Promise<Buffer> {
  validateFileRecord(record);
  const rootPath = resolve(fileURLToPath(root));
  const path = resolve(rootPath, record.path);
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) throw new Error(`Workflow runtime bundle artifact escapes root: ${record.path}`);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw new Error(`Workflow runtime bundle artifact missing or unreadable: ${record.path}`);
  }
  if (bytes.byteLength !== record.bytes) throw new Error(`Workflow runtime bundle artifact byte mismatch: ${record.path}`);
  if (sha256(bytes) !== record.sha256) throw new Error(`Workflow runtime bundle artifact hash mismatch: ${record.path}`);
  return bytes;
}

function generatedIdentity(value: unknown, label: string): { generator: string; inputSha256: string } {
  if (!isRecord(value) || value.generator !== "aili-runtime-projections/v1"
    || typeof value.inputSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.inputSha256)) {
    throw new Error(`Workflow runtime bundle ${label} generated identity is unsupported`);
  }
  return value as unknown as { generator: string; inputSha256: string };
}

function validateCrossFileIdentity(roleMetadata: RoleMetadata, selectionMap: SelectionMap, installation: InstallationContract, provenance: RuntimeProvenance): void {
  const identities = [
    generatedIdentity(roleMetadata.generated, "role metadata"),
    generatedIdentity(selectionMap.generated, "selection map"),
    generatedIdentity(installation.generated, "installation contract"),
  ];
  if (identities[0]!.inputSha256 !== identities[1]!.inputSha256) {
    throw new Error("Workflow runtime bundle cross-file identity mismatch between role metadata and selection map");
  }
  if (provenance.generator !== "aili-runtime-projections/v1" || provenance.adapter !== "pi" || !/^[0-9a-f]{64}$/.test(provenance.inputSha256)) {
    throw new Error("Workflow runtime bundle provenance identity is unsupported");
  }
  if (installation.adapter !== "pi") throw new Error("Workflow runtime bundle installation adapter is not Pi");
}

function validateRoleInventory(canonical: readonly string[], roleMetadata: RoleMetadata, selectionMap: SelectionMap): void {
  if (canonical.length !== 20 || new Set(canonical).size !== canonical.length || !canonical.includes("solution-architect")) {
    throw new Error("Workflow runtime bundle canonical specialist inventory must contain the accepted 20 roles");
  }
  const metadataIds = roleMetadata.roles.map((role) => role.id).filter((id) => id !== "rose");
  const selectionIds = selectionMap.roles.map((role) => role.id).filter((id) => id !== "rose");
  for (const [label, ids] of [["role metadata", metadataIds], ["selection map", selectionIds]] as const) {
    if (ids.length !== canonical.length || new Set(ids).size !== ids.length
      || ids.some((id) => !canonical.includes(id)) || canonical.some((id) => !ids.includes(id))) {
      throw new Error(`Workflow runtime bundle ${label} canonical role inventory mismatch`);
    }
  }
  if (roleMetadata.schemaVersion !== SUPPORTED_RUNTIME_SCHEMA || roleMetadata.protocol !== "aili-pi-role-metadata/v1") {
    throw new Error("Workflow runtime bundle role metadata schema is unsupported");
  }
  if (selectionMap.schemaVersion !== SUPPORTED_RUNTIME_SCHEMA || selectionMap.protocol !== "aili-agent-selection/v1" || selectionMap.decisionOwner !== "ROSE") {
    throw new Error("Workflow runtime bundle selection map schema is unsupported");
  }
}

export async function loadWorkflowRuntimeBundle(options: WorkflowRuntimeBundleOptions = {}): Promise<WorkflowRuntimeBundle> {
  const lockUrl = options.lockUrl ?? LOCK_URL;
  const bundleUrl = options.bundleUrl ?? BUNDLE_URL;
  const lock = JSON.parse(await readFile(lockUrl, "utf8")) as WorkflowLock;
  if (lock.schemaVersion !== SUPPORTED_LOCK_SCHEMA
    || lock.commit !== EXPECTED_COMMIT
    || lock.release?.package !== EXPECTED_PACKAGE
    || lock.release.version !== EXPECTED_VERSION
    || lock.release.npmGitHead !== EXPECTED_COMMIT) {
    throw new Error("Workflow runtime bundle release identity is unsupported or mixed");
  }
  const records = lock.runtimeBundle?.files;
  if (lock.runtimeBundle?.sourceRoot !== "generated/pi"
    || lock.runtimeBundle.targetRoot !== "upstream/aili-workflows-runtime"
    || !Array.isArray(records) || records.length !== lock.runtimeBundle.fileCount
    || aggregateHash(records) !== lock.runtimeBundle.contentHash) {
    throw new Error("Workflow runtime bundle lock identity is incomplete or inconsistent");
  }
  const byPath = new Map(records.map((record) => [record.path, record]));
  if (byPath.size !== records.length) throw new Error("Workflow runtime bundle lock contains duplicate paths");
  const required = Object.values(WORKFLOW_RUNTIME_ARTIFACTS);
  for (const path of required) if (!byPath.has(path)) throw new Error(`Workflow runtime bundle required artifact missing from lock: ${path}`);

  const loaded = new Map<string, Buffer>();
  await Promise.all(records.map(async (record) => loaded.set(record.path, await readLockedFile(bundleUrl, record))));
  const roleMetadata = parseJson<RoleMetadata>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.roleMetadata)!, "role metadata");
  const selectionMap = parseJson<SelectionMap>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.selectionMap)!, "selection map");
  const installationContract = parseJson<InstallationContract>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.installationContract)!, "installation contract");
  const provenance = parseJson<RuntimeProvenance>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.provenance)!, "provenance");
  if (installationContract.schemaVersion !== SUPPORTED_RUNTIME_SCHEMA || provenance.schemaVersion !== SUPPORTED_RUNTIME_SCHEMA) {
    throw new Error("Workflow runtime bundle schema is unsupported");
  }
  validateCrossFileIdentity(roleMetadata, selectionMap, installationContract, provenance);
  validateRoleInventory(lock.release.canonicalSpecialists, roleMetadata, selectionMap);
  const outputHashes = new Map(provenance.outputs.map((output) => [output.path.replace(/^generated\/pi\//, ""), output.outputSha256]));
  for (const path of required.filter((path) => path !== WORKFLOW_RUNTIME_ARTIFACTS.provenance)) {
    if (outputHashes.get(path) !== byPath.get(path)!.sha256) throw new Error(`Workflow runtime bundle provenance mismatch: ${path}`);
  }

  const protocols = {
    agentSelection: parseJson<Record<string, unknown>>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.agentSelectionProtocol)!, "agent-selection protocol"),
    formalTaskBoard: parseJson<Record<string, unknown>>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.formalTaskBoardProtocol)!, "formal-task-board protocol"),
    packageEnvelope: parseJson<Record<string, unknown>>(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.packageEnvelopeProtocol)!, "package-envelope protocol"),
  };
  if ([protocols.agentSelection, protocols.formalTaskBoard, protocols.packageEnvelope].some((schema) => !isRecord(schema) || typeof schema.$id !== "string")) {
    throw new Error("Workflow runtime bundle protocol schema is unsupported");
  }

  return freeze({
    package: EXPECTED_PACKAGE,
    version: EXPECTED_VERSION,
    commit: EXPECTED_COMMIT,
    system: new TextDecoder("utf-8", { fatal: true }).decode(loaded.get(WORKFLOW_RUNTIME_ARTIFACTS.system)!),
    canonicalSpecialists: [...lock.release.canonicalSpecialists],
    roleMetadata,
    selectionMap,
    installationContract,
    protocols,
    provenance,
  });
}
