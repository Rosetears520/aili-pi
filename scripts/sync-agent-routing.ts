import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = "upstream/aili-workflows.lock.json";
const MATRIX_PATH = "skills/parallel-subagent-dispatch/references/agent-selection-matrix.md";
const ROLES_PATH = "manifests/roles.json";
const OUTPUT_PATH = "manifests/agent-routing.generated.json";
const SUPPORTED_PROTOCOL = "aili-agent-selection/v1";
const UPSTREAM_MATRIX_PATH = ".agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md";
const EXPECTED_REPOSITORY = "https://github.com/Rosetears520/aili-workflows.git";
const EXPECTED_COLUMNS = [
  "Role ID",
  "Use when",
  "Do not use when",
  "Expected evidence",
  "Phase affinity",
  "Execution guidance",
] as const;

type JsonRecord = Record<string, unknown>;

export interface AgentRoutingRole {
  roleId: string;
  selector: string;
  positiveTriggers: string[];
  nearMisses: string[];
  expectedEvidence: string[];
  phaseAffinity: string[];
  executionGuidance: string;
}

export interface AgentRoutingManifest {
  schemaVersion: 1;
  source: {
    repository: string;
    commit: string;
    protocol: typeof SUPPORTED_PROTOCOL;
    sourceSha256: string;
  };
  roles: AgentRoutingRole[];
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(content: string, label: string): JsonRecord {
  try {
    return record(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON: ${error.message}`);
    throw error;
  }
}

function parseTableLine(line: string, label: string): string[] {
  if (!line.startsWith("|") || !line.endsWith("|")) throw new Error(`${label}: malformed table row`);
  const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
  if (cells.length !== EXPECTED_COLUMNS.length || cells.some((cell) => cell.length === 0)) {
    throw new Error(`${label}: malformed table row`);
  }
  return cells;
}

function parseMatrix(markdown: string): Array<Omit<AgentRoutingRole, "selector">> {
  const protocols = [...markdown.matchAll(/^- Protocol:\s*`([^`]+)`\s*$/gm)].map((match) => match[1]!);
  if (protocols.length !== 1 || protocols[0] !== SUPPORTED_PROTOCOL) {
    throw new Error(`unsupported agent-selection protocol: ${protocols.join(", ") || "missing"}`);
  }

  const markdownLines = markdown.split(/\r?\n/);
  const headingIndex = markdownLines.findIndex((line) => line.trim() === "## Selection matrix");
  if (headingIndex < 0) throw new Error("selection matrix table is missing");
  const nextHeadingOffset = markdownLines.slice(headingIndex + 1).findIndex((line) => /^##\s/.test(line.trim()));
  const sectionEnd = nextHeadingOffset < 0 ? markdownLines.length : headingIndex + 1 + nextHeadingOffset;
  const sectionLines = markdownLines.slice(headingIndex + 1, sectionEnd).map((line) => line.trim());
  const tableStart = sectionLines.findIndex((line) => line.startsWith("|"));
  if (tableStart < 0) throw new Error("selection matrix table is missing");
  const lines: string[] = [];
  for (const line of sectionLines.slice(tableStart)) {
    if (line === "") break;
    lines.push(line);
  }
  if (lines.length < 3) throw new Error("selection matrix table is incomplete");

  const header = parseTableLine(lines[0]!, "selection matrix header");
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_COLUMNS)) {
    throw new Error("selection matrix header does not match the supported schema");
  }
  const separator = parseTableLine(lines[1]!, "selection matrix separator");
  if (separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    throw new Error("selection matrix separator is malformed");
  }

  const rows: Array<Omit<AgentRoutingRole, "selector">> = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.slice(2).entries()) {
    const [roleCell, positiveTrigger, nearMiss, evidence, phases, guidance] = parseTableLine(
      line,
      `selection matrix row ${index + 1}`,
    );
    const roleId = roleCell.match(/^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/)?.[1];
    if (!roleId) throw new Error(`selection matrix row ${index + 1}: malformed role ID`);
    if (roleId === "general") throw new Error("general is not a canonical specialist role");
    if (seen.has(roleId)) throw new Error(`duplicate role ID in selection matrix: ${roleId}`);
    seen.add(roleId);
    const phaseAffinity = phases.split("/").map((phase) => phase.trim());
    if (phaseAffinity.some((phase) => !phase)) {
      throw new Error(`${roleId}: malformed phase affinity`);
    }
    rows.push({
      roleId,
      positiveTriggers: [positiveTrigger],
      nearMisses: [nearMiss],
      expectedEvidence: [evidence],
      phaseAffinity,
      executionGuidance: guidance,
    });
  }
  return rows;
}

export async function buildAgentRoutingManifest(root = DEFAULT_ROOT): Promise<AgentRoutingManifest> {
  const projectRoot = resolve(root);
  const [lockText, matrix, rolesText] = await Promise.all([
    readFile(join(projectRoot, LOCK_PATH), "utf8"),
    readFile(join(projectRoot, MATRIX_PATH), "utf8"),
    readFile(join(projectRoot, ROLES_PATH), "utf8"),
  ]);
  const lock = parseJson(lockText, "aili-workflows lock");
  if (lock.schemaVersion !== 1) throw new Error(`unsupported aili-workflows lock schemaVersion: ${String(lock.schemaVersion)}`);
  const repository = string(lock.repository, "aili-workflows lock repository");
  if (repository !== EXPECTED_REPOSITORY) throw new Error(`unsupported aili-workflows repository: ${repository}`);
  const commit = string(lock.commit, "aili-workflows lock commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("aili-workflows lock commit must be a 40-character lowercase hash");

  const roleManifest = parseJson(rolesText, "roles manifest");
  const roleSource = record(roleManifest.source, "roles manifest source");
  const roleRepository = string(roleSource.repository, "roles manifest source repository");
  const roleCommit = string(roleSource.commit, "roles manifest source commit");
  if (roleRepository !== repository || roleCommit !== commit) {
    throw new Error(
      `roles manifest source identity mismatch: expected ${repository}@${commit}, received ${roleRepository}@${roleCommit}`,
    );
  }

  const release = record(lock.release, "aili-workflows lock release");
  const protocols = record(release.protocols, "aili-workflows lock protocols");
  const agentSelection = record(protocols.agentSelection, "aili-workflows agent-selection protocol");
  const protocol = string(agentSelection.protocol, "agent-selection protocol");
  if (protocol !== SUPPORTED_PROTOCOL) throw new Error(`unsupported agent-selection protocol: ${protocol}`);
  if (agentSelection.path !== UPSTREAM_MATRIX_PATH) {
    throw new Error(`unsupported agent-selection source path: ${String(agentSelection.path)}`);
  }
  const expectedSourceHash = string(agentSelection.sha256, "agent-selection source sha256");
  if (!/^[0-9a-f]{64}$/.test(expectedSourceHash)) throw new Error("agent-selection source sha256 is malformed");
  const actualSourceHash = sha256(matrix);
  if (actualSourceHash !== expectedSourceHash) {
    throw new Error(`agent-selection source hash drift: expected ${expectedSourceHash}, received ${actualSourceHash}`);
  }
  if (agentSelection.bytes !== Buffer.byteLength(matrix)) throw new Error("agent-selection source byte length drift");

  if (!Array.isArray(release.canonicalSpecialists)) {
    throw new Error("canonical specialist inventory must be an array");
  }
  const canonicalSpecialists = release.canonicalSpecialists.map((value, index) =>
    string(value, `canonical specialist ${index + 1}`));
  if (canonicalSpecialists.length === 0) {
    throw new Error("canonical specialist inventory must not be empty");
  }
  if (canonicalSpecialists.includes("general")) throw new Error("general is not a canonical specialist role");
  if (new Set(canonicalSpecialists).size !== canonicalSpecialists.length) {
    throw new Error("canonical specialist inventory contains duplicate role IDs");
  }

  if (!Array.isArray(roleManifest.records)) throw new Error("roles manifest records must be an array");
  const selectorsByRole = new Map<string, string>();
  const seenSelectors = new Set<string>();
  for (const [index, value] of roleManifest.records.entries()) {
    const role = record(value, `roles manifest record ${index + 1}`);
    const roleId = string(role.name, `roles manifest record ${index + 1} name`);
    const selector = string(role.selector, `${roleId} selector`);
    if (selectorsByRole.has(roleId)) throw new Error(`duplicate role ID in roles manifest: ${roleId}`);
    if (seenSelectors.has(selector)) throw new Error(`duplicate selector in roles manifest: ${selector}`);
    selectorsByRole.set(roleId, selector);
    seenSelectors.add(selector);
  }

  const matrixRows = parseMatrix(matrix);
  const matrixByRole = new Map(matrixRows.map((row) => [row.roleId, row]));
  for (const row of matrixRows) {
    if (!canonicalSpecialists.includes(row.roleId)) throw new Error(`unknown canonical specialist in selection matrix: ${row.roleId}`);
  }

  const roles = canonicalSpecialists.map((roleId): AgentRoutingRole => {
    const row = matrixByRole.get(roleId);
    if (!row) throw new Error(`missing canonical specialist in selection matrix: ${roleId}`);
    const selector = selectorsByRole.get(roleId);
    if (!selector) throw new Error(`missing canonical role in roles manifest: ${roleId}`);
    const expectedSelector = `aili.${roleId}`;
    if (selector !== expectedSelector) {
      throw new Error(`${roleId}: selector mismatch; expected ${expectedSelector}, received ${selector}`);
    }
    return { roleId, selector, positiveTriggers: row.positiveTriggers, nearMisses: row.nearMisses,
      expectedEvidence: row.expectedEvidence, phaseAffinity: row.phaseAffinity, executionGuidance: row.executionGuidance };
  });

  return {
    schemaVersion: 1,
    source: { repository, commit, protocol: SUPPORTED_PROTOCOL, sourceSha256: actualSourceHash },
    roles,
  };
}

export async function renderAgentRoutingManifest(root = DEFAULT_ROOT): Promise<string> {
  return `${JSON.stringify(await buildAgentRoutingManifest(root), null, 2)}\n`;
}

export async function syncAgentRouting(root = DEFAULT_ROOT, verify = false): Promise<void> {
  const projectRoot = resolve(root);
  const output = join(projectRoot, OUTPUT_PATH);
  const rendered = await renderAgentRoutingManifest(projectRoot);
  if (verify) {
    const current = await readFile(output, "utf8").catch(() => "");
    if (current !== rendered) throw new Error(`generated agent routing drift at ${OUTPUT_PATH}; run npm run sync:agent-routing`);
    console.log(`Agent routing verified: ${JSON.parse(rendered).roles.length} canonical specialists`);
    return;
  }
  await writeFile(output, rendered, "utf8");
  console.log(`Agent routing generated: ${JSON.parse(rendered).roles.length} canonical specialists`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--verify");
  if (unknown.length > 0) throw new Error(`Usage: sync-agent-routing.ts [--verify]`);
  await syncAgentRouting(DEFAULT_ROOT, args.includes("--verify"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
