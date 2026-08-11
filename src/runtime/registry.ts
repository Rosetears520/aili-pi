import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSISTENT_LIVE_IMPLEMENTATION_PATHS } from "./persistent-agents/live-evidence-contract.ts";
import { loadRoleProfiles, validateRoleProfiles } from "./roles.ts";
import { resolvePermissionModesPackageRoot } from "./package-resolution.ts";

const ROOT = new URL("../../", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const SUPPORTED_PI_VERSION = "0.82.1";
const PACKAGE_NAME = "@rosetears/aili-pi";
const PACKAGE_LICENSE_SINCE_VERSION = "0.1.13";
const PACKAGE_LICENSE = "AGPL-3.0-or-later";
const PACKAGE_LICENSE_SHA256 = "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0";
const ACTIVE_PI_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;

export type CompatibilityStatus = "native" | "adapted" | "optional" | "blocked";

export interface CapabilityRecord {
  id: string;
  provider: string;
  adapterOwner: string;
  platforms: string[];
  class: "required" | "optional";
  risk: { secret: string; network: string; sideEffect: string };
  probe: { id: string; kind: string; timeoutMs: number };
  dependentSkills: { source: string; capability: string };
  optionalPack?: {
    id: string;
    missingBehavior: string;
    enableGuidance: string;
    sideEffects: string[];
    futureOwner: string;
  };
}

interface CapabilityManifest {
  schemaVersion: number;
  providers: string[];
  capabilities: CapabilityRecord[];
}

interface CompatibilityRecord {
  name: string;
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  status: CompatibilityStatus;
  reason: string;
  verification: string[];
  unverified: string[];
}

interface CompatibilityManifest {
  schemaVersion: number;
  allowedStatuses: string[];
  records: CompatibilityRecord[];
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8")) as T;
}

export async function loadRegistry(): Promise<{
  capabilities: CapabilityManifest;
  compatibility: CompatibilityManifest;
}> {
  return {
    capabilities: await json<CapabilityManifest>("manifests/capabilities.json"),
    compatibility: await json<CompatibilityManifest>("manifests/skill-compatibility.json"),
  };
}

export async function validateRegistry(): Promise<string[]> {
  const { capabilities, compatibility } = await loadRegistry();
  return validateRegistryData(capabilities, compatibility);
}

export function validateRegistryData(
  capabilities: CapabilityManifest,
  compatibility: CompatibilityManifest,
): string[] {
  const errors: string[] = [];
  const capabilityIds = new Set<string>();
  const skillNames = new Set<string>();
  const allowedStatuses = new Set(["native", "adapted", "optional", "blocked"]);

  if (capabilities.schemaVersion !== 1) errors.push("capabilities: unsupported schemaVersion");
  if (compatibility.schemaVersion !== 1) errors.push("compatibility: unsupported schemaVersion");
  if (JSON.stringify([...compatibility.allowedStatuses].sort()) !== JSON.stringify([...allowedStatuses].sort())) {
    errors.push("compatibility: allowedStatuses must be exactly native, adapted, optional, blocked");
  }

  for (const capability of capabilities.capabilities) {
    if (!capability.id || capabilityIds.has(capability.id)) errors.push(`capability: duplicate or missing id ${capability.id}`);
    capabilityIds.add(capability.id);
    if (!capabilities.providers.includes(capability.provider)) errors.push(`${capability.id}: unknown provider ${capability.provider}`);
    if (!capability.adapterOwner || capability.platforms.length === 0) errors.push(`${capability.id}: missing owner or platform`);
    if (!capability.probe?.id || !capability.probe.kind || capability.probe.timeoutMs <= 0) errors.push(`${capability.id}: missing or invalid probe`);
    if (capability.dependentSkills.capability !== capability.id) errors.push(`${capability.id}: dependent-skill selector mismatch`);
    if (capability.class === "optional" && !capability.optionalPack) errors.push(`${capability.id}: optional pack guidance is missing`);
  }

  for (const skill of compatibility.records) {
    if (!skill.name || skillNames.has(skill.name)) errors.push(`skill: duplicate or missing name ${skill.name}`);
    skillNames.add(skill.name);
    if (!allowedStatuses.has(skill.status)) errors.push(`${skill.name}: invalid status ${skill.status}`);
    if (!skill.reason || skill.verification.length === 0) errors.push(`${skill.name}: evidence or reason is missing`);
    for (const id of [...skill.requiredCapabilities, ...skill.optionalCapabilities]) {
      if (!capabilityIds.has(id)) errors.push(`${skill.name}: dangling capability ${id}`);
    }
  }

  for (const capability of capabilities.capabilities) {
    const hasDependent = compatibility.records.some((skill) =>
      [...skill.requiredCapabilities, ...skill.optionalCapabilities].includes(capability.id),
    );
    if (!hasDependent) errors.push(`${capability.id}: no dependent skills`);
  }
  return errors;
}

export async function validateStableRelease(): Promise<string[]> {
  const registryErrors = await validateRegistry();
  const { compatibility } = await loadRegistry();
  const errors = [
    ...registryErrors,
    ...(await validateProvenance()),
    ...(await validatePiHostInstallation()),
    ...(await validateLicenseDisposition()),
    ...compatibility.records
      .filter((record) => record.status === "blocked")
      .map((record) => `${record.name}: blocked (${record.reason})`),
  ];
  const packageJson = await json<{ pi?: { prompts?: string[] } }>("package.json");
  if (packageJson.pi?.prompts?.length !== 5) errors.push("lifecycle prompts: expected exactly five prompt resources");
  for (const prompt of packageJson.pi?.prompts ?? []) {
    try { await access(new URL(prompt, ROOT)); } catch { errors.push(`lifecycle prompt: missing ${prompt}`); }
  }
  try {
    const roles = (await readdir(new URL("roles/", ROOT))).filter((name) => name.endsWith(".md"));
    if (roles.length !== 20) errors.push(`roles: expected 20 bundled profiles, found ${roles.length}`);
    for (const error of await validateRoleProfiles()) errors.push(`roles: ${error}`);
    for (const role of await loadRoleProfiles()) {
      if (role.status === "blocked") errors.push(`role ${role.name}: blocked (${role.compatibilityReason})`);
    }
  } catch {
    errors.push("roles: required generated profiles are missing");
  }
  if (process.platform !== "linux") errors.push(`platform: unsupported ${process.platform}; stable scope is linux-only`);
  return errors;
}

export interface LicenseDispositionEvidence {
  packageManifest: { name?: string; version?: string; license?: string };
  packageLockRoot: { name?: string; version?: string; license?: string };
  licenseSha256: string;
  readme: string;
  notices: string;
  sbomRoot?: { name?: string; versionInfo?: string; licenseConcluded?: string; licenseDeclared?: string };
}

/** Pure validation for the package-wide AGPL disposition and its generated public metadata. */
export function validateLicenseDispositionData(evidence: LicenseDispositionEvidence): string[] {
  const errors: string[] = [];
  const candidateVersion = evidence.packageManifest.version;
  if (
    evidence.packageManifest.name !== PACKAGE_NAME ||
    !candidateVersion ||
    evidence.packageManifest.license !== PACKAGE_LICENSE
  ) errors.push(`license disposition: package manifest must declare the current ${PACKAGE_NAME} candidate as ${PACKAGE_LICENSE}`);
  if (
    evidence.packageLockRoot.name !== PACKAGE_NAME ||
    evidence.packageLockRoot.version !== candidateVersion ||
    evidence.packageLockRoot.license !== PACKAGE_LICENSE
  ) errors.push("license disposition: package-lock root identity or license is stale");
  if (evidence.licenseSha256 !== PACKAGE_LICENSE_SHA256) errors.push("license disposition: root AGPL-3.0 license text is missing or drifted");
  if (
    !evidence.readme.includes(`version ${PACKAGE_LICENSE_SINCE_VERSION} and later is licensed under \`${PACKAGE_LICENSE}\``) ||
    !evidence.readme.includes("Corresponding source is available from the repository declared in `package.json`")
  ) errors.push("license disposition: README declaration or corresponding-source notice is missing");
  if (
    !evidence.notices.includes(PACKAGE_LICENSE) ||
    evidence.notices.includes("This distribution is MIT-licensed") ||
    !evidence.notices.includes("retain their own license terms")
  ) errors.push("license disposition: third-party notice still misstates the package license or omits retained terms");
  if (
    evidence.sbomRoot?.name !== PACKAGE_NAME ||
    evidence.sbomRoot.versionInfo !== candidateVersion ||
    evidence.sbomRoot.licenseConcluded !== PACKAGE_LICENSE ||
    evidence.sbomRoot.licenseDeclared !== PACKAGE_LICENSE
  ) errors.push("license disposition: SPDX root package identity or license is stale");
  return errors;
}

export async function validateLicenseDisposition(): Promise<string[]> {
  try {
    const [packageManifest, packageLock, licenseText, readme, notices, sbom] = await Promise.all([
      json<{ name?: string; version?: string; license?: string }>("package.json"),
      json<{ packages?: Record<string, { name?: string; version?: string; license?: string }> }>("package-lock.json"),
      readFile(new URL("LICENSE", ROOT), "utf8"),
      readFile(new URL("README.md", ROOT), "utf8"),
      readFile(new URL("THIRD_PARTY_NOTICES.md", ROOT), "utf8"),
      json<{ packages?: Array<{ SPDXID?: string; name?: string; versionInfo?: string; licenseConcluded?: string; licenseDeclared?: string }> }>("manifests/sbom.json"),
    ]);
    return validateLicenseDispositionData({
      packageManifest,
      packageLockRoot: packageLock.packages?.[""] ?? {},
      licenseSha256: createHash("sha256").update(licenseText).digest("hex"),
      readme,
      notices,
      sbomRoot: sbom.packages?.find((item) => item.SPDXID === "SPDXRef-Package-aili-pi"),
    });
  } catch (error) {
    return [`license disposition: ${error instanceof Error ? error.message : String(error)}`];
  }
}

export async function validatePiHostInstallation(): Promise<string[]> {
  const errors: string[] = [];
  const codingAgentRoot = new URL("node_modules/@earendil-works/pi-coding-agent/", ROOT);
  for (const packageName of ACTIVE_PI_PACKAGES) {
    const relative = packageName.slice("@earendil-works/".length);
    const candidates = packageName === "@earendil-works/pi-coding-agent"
      ? [codingAgentRoot]
      : [new URL(`node_modules/@earendil-works/${relative}/`, codingAgentRoot), new URL(`node_modules/@earendil-works/${relative}/`, ROOT)];
    let installed: { name?: string; version?: string } | undefined;
    for (const candidate of candidates) {
      try {
        installed = JSON.parse(await readFile(new URL("package.json", candidate), "utf8")) as { name?: string; version?: string };
        break;
      } catch { /* npm may hoist or nest an active host package */ }
    }
    if (installed?.name !== packageName || installed.version !== SUPPORTED_PI_VERSION) {
      errors.push(`Pi host: active ${packageName} must be exact ${SUPPORTED_PI_VERSION}`);
    }
  }

  return errors;
}

const LIVE_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const LIVE_VERIFICATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const LIVE_VERIFICATION_ARTIFACT_DIR = "artifacts/test-results/persistent-agent-framework";
const LIVE_VERIFICATION_HARNESS = "tests/integration/aili-compact-live-release-gated.test.ts";
const REQUIRED_LIVE_IMPLEMENTATION = PERSISTENT_LIVE_IMPLEMENTATION_PATHS;
const REQUIRED_LIVE_PROBES = ["provider-turn", "child-sandbox", "external-workspace-lifecycle"] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactRecordKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function freshLiveTime(value: unknown, now: number): value is string {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time)
    && time <= now + LIVE_VERIFICATION_FUTURE_TOLERANCE_MS
    && now - time <= LIVE_VERIFICATION_MAX_AGE_MS;
}

export async function validateLiveVerification(): Promise<string[]> {
  return validateLiveVerificationAtRoot(ROOT_PATH);
}

export async function validateLiveVerificationAtRoot(root: string, now = Date.now()): Promise<string[]> {
  const errors: string[] = [];
  try {
    const projectRoot = resolve(root);
    const packageManifest = plainRecord(JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")));
    const expectedPackageVersion = typeof packageManifest?.version === "string" ? packageManifest.version : "";
    const manifestBody = await readFile(join(projectRoot, "manifests/live-verification.json"), "utf8");
    const evidence = plainRecord(JSON.parse(manifestBody));
    if (!evidence) throw new Error("manifest root must be an object");
    const artifactBinding = plainRecord(evidence.artifact);
    const harness = plainRecord(evidence.harness);
    const packageBinding = plainRecord(evidence.package);
    const cleanup = plainRecord(evidence.cleanup);
    if (
      evidence.schemaVersion !== 4 ||
      evidence.platform !== "linux" ||
      evidence.piVersion !== SUPPORTED_PI_VERSION ||
      evidence.runtime !== "aili-persistent-agents-v1" ||
      packageBinding?.name !== PACKAGE_NAME ||
      !expectedPackageVersion ||
      packageBinding.version !== expectedPackageVersion ||
      packageBinding.source !== "current workspace package" ||
      !freshLiveTime(evidence.capturedAt, now)
    ) {
      errors.push("live verification: persistent Agent identity is incomplete or stale");
    }

    const artifactPath = typeof artifactBinding?.path === "string" ? artifactBinding.path : "";
    const expectedPrefix = `${LIVE_VERIFICATION_ARTIFACT_DIR}/`;
    const artifactPathSafe = artifactPath.startsWith(expectedPrefix)
      && !artifactPath.slice(expectedPrefix.length).includes("/")
      && !artifactPath.includes("..")
      && artifactPath.endsWith(".json");
    if (!artifactPathSafe) {
      errors.push("live verification: current artifact path is unsafe or stale");
    }

    let artifact: Record<string, unknown> | undefined;
    let artifactBody = "";
    try {
      if (!artifactPathSafe) throw new Error("unsafe artifact path");
      artifactBody = await readFile(join(projectRoot, artifactPath), "utf8");
      artifact = plainRecord(JSON.parse(artifactBody));
      if (!artifact || artifactBinding?.sha256 !== sha256(artifactBody)) {
        errors.push("live verification: current artifact hash is missing or stale");
      }
    } catch {
      errors.push("live verification: current artifact is missing or invalid");
    }

    const artifactPackage = plainRecord(artifact?.package);
    const artifactSanitization = plainRecord(artifact?.sanitization);
    if (!artifact || artifact.schemaVersion !== 1 || artifact.platform !== "linux"
      || artifact.piVersion !== SUPPORTED_PI_VERSION || artifact.capturedAt !== evidence.capturedAt
      || !freshLiveTime(artifact.capturedAt, now)
      || artifactPackage?.name !== PACKAGE_NAME || !expectedPackageVersion || artifactPackage.version !== expectedPackageVersion
      || artifactPackage.source !== "current workspace package"
      || artifactSanitization?.rawProviderTranscriptIncluded !== false
      || artifactSanitization.rawCredentialMaterialIncluded !== false
      || artifactSanitization.credentialMarkerFindings !== 0
      || artifactSanitization.localAbsolutePathsIncluded !== false) {
      errors.push("live verification: current artifact identity, freshness, package, or sanitization is invalid");
    }

    const manifestProbes = Array.isArray(evidence.probes) ? evidence.probes.map(plainRecord) : [];
    const artifactProbes = Array.isArray(artifact?.probes) ? artifact.probes.map(plainRecord) : [];
    const manifestIds = manifestProbes.map((probe) => probe?.id);
    const artifactIds = artifactProbes.map((probe) => probe?.id);
    if (JSON.stringify([...manifestIds].sort()) !== JSON.stringify([...REQUIRED_LIVE_PROBES].sort())
      || JSON.stringify([...artifactIds].sort()) !== JSON.stringify([...REQUIRED_LIVE_PROBES].sort())) {
      errors.push("live verification: probe inventory must be exact");
    }
    for (const id of REQUIRED_LIVE_PROBES) {
      const manifestProbe = manifestProbes.find((probe) => probe?.id === id);
      const artifactProbe = artifactProbes.find((probe) => probe?.id === id);
      if (!manifestProbe || !artifactProbe || manifestProbe.status !== artifactProbe.status
        || manifestProbe.changedFiles !== artifactProbe.changedFiles || manifestProbe.changedFiles !== 0
        || manifestProbe.evidence !== artifactPath || !["PASS", "NON_PASS"].includes(String(artifactProbe.status))) {
        errors.push(`live verification: ${id} probe does not bind the actual current result`);
      }
    }
    const allProbesPass = artifactProbes.length === REQUIRED_LIVE_PROBES.length
      && artifactProbes.every((probe) => probe?.status === "PASS" && probe.changedFiles === 0);
    const expectedStatus = allProbesPass && cleanup?.status === "PASS" ? "PASS" : "NON_PASS";
    if (evidence.status !== expectedStatus || artifact?.status !== expectedStatus) {
      errors.push("live verification: current verdict does not match actual probe statuses and cleanup");
    }
    if (evidence.status !== "PASS") errors.push("live verification: persistent Agent current verdict is NON_PASS");

    const harnessBody = await readFile(join(projectRoot, LIVE_VERIFICATION_HARNESS), "utf8");
    if (harness?.path !== LIVE_VERIFICATION_HARNESS || harness.sha256 !== sha256(harnessBody)) {
      errors.push("live verification: live harness binding is missing or stale");
    }

    const implementation = plainRecord(evidence.implementation) ?? {};
    if (!exactRecordKeys(implementation, REQUIRED_LIVE_IMPLEMENTATION)) {
      errors.push("live verification: implementation binding must contain the exact default-path files");
    }
    for (const filePath of REQUIRED_LIVE_IMPLEMENTATION) {
      const content = await readFile(join(projectRoot, filePath), "utf8");
      if (implementation[filePath] !== sha256(content)) errors.push(`live verification: implementation drift ${filePath}`);
    }

    const artifactDirectory = join(projectRoot, LIVE_VERIFICATION_ARTIFACT_DIR);
    const candidates: Array<{ path: string; capturedAt: number; status: unknown }> = [];
    for (const name of await readdir(artifactDirectory)) {
      if (!/^live-smoke-[A-Za-z0-9._-]+\.json$/.test(name)) continue;
      const path = `${LIVE_VERIFICATION_ARTIFACT_DIR}/${name}`;
      const candidate = plainRecord(JSON.parse(await readFile(join(projectRoot, path), "utf8")));
      const capturedAt = typeof candidate?.capturedAt === "string" ? Date.parse(candidate.capturedAt) : Number.NaN;
      if (!candidate || !Number.isFinite(capturedAt)) continue;
      candidates.push({ path, capturedAt, status: candidate.status });
    }
    candidates.sort((left, right) => right.capturedAt - left.capturedAt || left.path.localeCompare(right.path));
    if (candidates[0]?.path !== artifactPath) {
      errors.push("live verification: manifest does not bind the newest current artifact");
    }
  } catch (error) {
    errors.push(`live verification: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export async function validatePermissionModeAdaptation(): Promise<string[]> {
  const errors: string[] = [];
  try {
    const lock = await json<{
      schemaVersion?: number;
      package?: { name?: string; version?: string; revision?: string; license?: string };
      upstreamFiles?: Array<{ path?: string; sha256?: string }>;
      adaptedFiles?: Array<{ path?: string; sha256?: string }>;
      localChanges?: string[];
      generatedBy?: string;
      verification?: string[];
    }>("upstream/pi-permission-modes.lock.json");
    const expectedLocalChanges = [
      "Package-owned adapted entry redirects all unchanged sibling modules to the exact pi-permission-modes dependency while owning resolve.ts locally.",
      "matchPattern compiles its anchored glob RegExp with dotAll so * and ? include ECMAScript line terminators.",
      "The adapted local and sandboxed bash wrappers forward ExtensionContext so Pi 0.82.1 can derive current PI_* session environment values.",
      "The adapted sandbox BashOperations wrapper injects Pi's resolved five-variable session environment as a shell-safe prelude because pi-permission-modes@2.2.0 ignores BashOperations.options.env.",
      "The process-owned SandboxController exposes its ready, exact-profile BashOperations to persistent children without allowing children to initialize, reconfigure, or reset the process-global sandbox runtime.",
      "Formal persistent children compose their exact two owning-file denyWrite paths into each sandboxed command while preserving the active profile, network rules, and blocked-host diagnostics.",
    ];
    const expectedVerification = [
      "npm run verify:permission-modes",
      "tests/unit/permission-patterns.test.ts",
      "tests/integration/permission-modes.test.ts",
      "tests/unit/persistent-agent-child-sandbox.test.ts",
    ];
    if (
      lock.schemaVersion !== 1 ||
      lock.package?.name !== "pi-permission-modes" ||
      lock.package.version !== "2.2.0" ||
      lock.package.revision !== "23d65d10a53b67043cae42322acf9044d6edb196" ||
      lock.package.license !== "MIT" ||
      lock.upstreamFiles?.length !== 3 ||
      lock.adaptedFiles?.length !== 3 ||
      JSON.stringify(lock.localChanges) !== JSON.stringify(expectedLocalChanges) ||
      lock.generatedBy !== "scripts/sync-permission-modes.ts" ||
      JSON.stringify(lock.verification) !== JSON.stringify(expectedVerification)
    ) {
      errors.push("permission adaptation: lock identity or inventory is incomplete");
      return errors;
    }
    const expectedUpstream = {
      "src/index.ts": "fd4462a3b7ba986af734c2e17ba8ea7178df56c933e87ed444ba90ba24c2fd5b",
      "src/resolve.ts": "13f52a4a9c08d7a55f5f9d03f97302d864768838fb3e9fca2051cb7d94a0ae82",
      LICENSE: "d87cb99b43f6bf8771e57be83485db11b977b9dfa21b6bd201b8d3d370bdce43",
    };
    const upstreamIdentity = Object.fromEntries((lock.upstreamFiles ?? []).map((record) => [record.path, record.sha256]));
    if (JSON.stringify(upstreamIdentity) !== JSON.stringify(expectedUpstream)) {
      errors.push("permission adaptation: upstream baseline hashes do not match the accepted 2.2.0 revision");
    }
    const expectedAdapted = {
      "src/vendor/pi-permission-modes/index.ts": "dbf32a96e2d8273568996c5ed7726333a076d6f3148745e091626a06f08d037b",
      "src/vendor/pi-permission-modes/resolve.ts": "f71688f847495da5122724f75c5ebe3b41066b3d3cac74cbe99f66b9906404f6",
      "licenses/pi-permission-modes-MIT.txt": "d87cb99b43f6bf8771e57be83485db11b977b9dfa21b6bd201b8d3d370bdce43",
    };
    const adaptedIdentity = Object.fromEntries((lock.adaptedFiles ?? []).map((record) => [record.path, record.sha256]));
    if (JSON.stringify(adaptedIdentity) !== JSON.stringify(expectedAdapted)) {
      errors.push("permission adaptation: adapted hashes or file inventory do not match the accepted generated output");
    }
    const permissionPackageRoot = resolvePermissionModesPackageRoot();
    const installedPackage = JSON.parse(await readFile(new URL("package.json", permissionPackageRoot), "utf8")) as {
      name?: string;
      version?: string;
      license?: string;
    };
    if (installedPackage.name !== "pi-permission-modes" || installedPackage.version !== "2.2.0" || installedPackage.license !== "MIT") {
      errors.push("permission adaptation: resolved dependency identity is not exact pi-permission-modes@2.2.0 MIT");
    }
    for (const [kind, records, sourceRoot] of [
      ["upstream", lock.upstreamFiles, permissionPackageRoot],
      ["adapted", lock.adaptedFiles, ROOT],
    ] as const) {
      for (const record of records ?? []) {
        const path = record.path ?? "";
        if (!path || path.startsWith("/") || path.split("/").includes("..") || !/^[0-9a-f]{64}$/.test(record.sha256 ?? "")) {
          errors.push(`permission adaptation: unsafe or incomplete ${kind} record ${path || "(missing)"}`);
          continue;
        }
        const content = await readFile(new URL(path, sourceRoot), "utf8");
        const actual = createHash("sha256").update(content).digest("hex");
        if (actual !== record.sha256) errors.push(`permission adaptation: ${kind} drift ${path}`);
      }
    }
    const [nativeIntegration, adaptedResolve] = await Promise.all([
      readFile(new URL("src/runtime/native-integrations.ts", ROOT), "utf8"),
      readFile(new URL("src/vendor/pi-permission-modes/resolve.ts", ROOT), "utf8"),
    ]);
    const adaptedEntryCount = nativeIntegration.match(/"\.\.\/vendor\/pi-permission-modes\/index\.ts"/g)?.length ?? 0;
    if (adaptedEntryCount !== 1 || nativeIntegration.includes('"pi-permission-modes/src/index.ts"')) {
      errors.push("permission adaptation: native integration is not bound exactly once and exclusively to the adapted entry");
    }
    if (!adaptedResolve.includes('return new RegExp(re, "s").test(t);') || adaptedResolve.includes("return new RegExp(re).test(t);")) {
      errors.push("permission adaptation: line-terminator-safe matcher semantic is missing");
    }
  } catch (error) {
    errors.push(`permission adaptation: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export async function validateProvenance(): Promise<string[]> {
  const errors: string[] = [...await validatePermissionModeAdaptation()];
  try {
    const provenance = await json<{ schemaVersion: number; sources: Array<{ name: string; revision: string; version: string; license: string; status: string; repository: string; sourceFiles: string[]; symbols: string[]; localChanges: string[]; verification: string[]; attribution?: string }> }>("manifests/provenance.json");
    const sbom = await json<{ spdxVersion?: string; packages?: Array<{ SPDXID?: string; name?: string; licenseDeclared?: string }> }>("manifests/sbom.json");
    const notices = await readFile(new URL("THIRD_PARTY_NOTICES.md", ROOT), "utf8");
    const expectedSourceNames = [
      "aili-workflows",
      "pi-permission-modes",
      "pi-quota-status",
      "pi-web-access",
      "pi-cache-optimizer",
      "pi-sakura-cyberdeck",
      "Oh My Pi reference",
      "opencode-acp reference",
    ];
    if (provenance.schemaVersion !== 1
      || JSON.stringify(provenance.sources.map((source) => source.name)) !== JSON.stringify(expectedSourceNames)) {
      errors.push("provenance: expected the exact eight active schema-v1 source records");
    }
    const names = new Set<string>();
    for (const source of provenance.sources) {
      if (!source.name || names.has(source.name)) errors.push(`provenance: duplicate or missing source ${source.name}`);
      names.add(source.name);
      if ((!/^[0-9a-f]{40}$/.test(source.revision) && !/^npm:[0-9]+\.[0-9]+\.[0-9]+$/.test(source.revision)) || !source.repository.startsWith("https://") || !source.license || source.verification.length === 0) errors.push(`provenance: incomplete identity for ${source.name}`);
      if (source.status === "adapted" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) errors.push(`provenance: incomplete adapted source ${source.name}`);
      if (source.status === "reference-only" && (source.sourceFiles.length > 0 || source.symbols.length > 0 || source.localChanges.length > 0)) errors.push(`provenance: reference-only source claims reuse ${source.name}`);
      if (source.status === "dependency" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) errors.push(`provenance: incomplete dependency source ${source.name}`);
      if (!notices.includes(`## ${source.name}`) || !notices.includes(`Revision: ${source.revision}`)) errors.push(`provenance: notice missing ${source.name}`);
    }
    const compactReference = provenance.sources.find((source) => source.name === "opencode-acp reference");
    if (
      compactReference?.repository !== "https://github.com/ranxianglei/opencode-acp.git" ||
      compactReference.revision !== "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb" ||
      compactReference.version !== "1.14.3" ||
      compactReference.license !== PACKAGE_LICENSE ||
      compactReference.status !== "reference-only" ||
      !compactReference.attribution?.includes("opencode-dynamic-context-pruning by Tarquinen")
    ) errors.push("provenance: exact opencode-acp reference identity or attribution is missing");
    if (!notices.includes("## opencode-acp reference") || !notices.includes("Source files: none copied")) errors.push("provenance: opencode-acp no-copy notice is missing");
    if (sbom.spdxVersion !== "SPDX-2.3" || !Array.isArray(sbom.packages) || sbom.packages.length < 3) errors.push("provenance: invalid or empty SPDX SBOM");
    if (sbom.packages?.some((item) => !item.SPDXID || !item.name || !item.licenseDeclared)) errors.push("provenance: incomplete SPDX package record");
    const hasSupportedHost = (sbom.packages as Array<{ name?: string; versionInfo?: string }> | undefined)
      ?.some((item) => item.name === "@earendil-works/pi-coding-agent" && item.versionInfo === SUPPORTED_PI_VERSION);
    if (!hasSupportedHost) errors.push(`provenance: active Pi host must include exact ${SUPPORTED_PI_VERSION}`);
  } catch (error) {
    errors.push(`provenance: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export interface CapabilityDecision {
  status: "PASS" | "WARN" | "SKIP" | "ERROR";
  capability: string;
  message: string;
}

export async function assessCapability(
  capabilityId: string,
  enabledProviders: ReadonlySet<string>,
): Promise<CapabilityDecision> {
  const { capabilities } = await loadRegistry();
  const capability = capabilities.capabilities.find((item) => item.id === capabilityId);
  if (!capability) return { status: "ERROR", capability: capabilityId, message: "Unknown capability; no work ran." };
  if (enabledProviders.has(capability.provider)) {
    return { status: "PASS", capability: capabilityId, message: `Provider ${capability.provider} is enabled.` };
  }
  if (capability.class === "optional") {
    return {
      status: "SKIP",
      capability: capabilityId,
      message: `${capability.optionalPack?.missingBehavior ?? "Optional capability is unavailable."} Pack=${capability.optionalPack?.id ?? "unverified"}. No work ran.`,
    };
  }
  return { status: "WARN", capability: capabilityId, message: `Required provider ${capability.provider} is unavailable. No work ran.` };
}
