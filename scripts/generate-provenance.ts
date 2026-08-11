import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const spdxId = (value: string): string => `SPDXRef-${value.replace(/[^A-Za-z0-9.-]+/g, "-")}-${hash(value).slice(0, 10)}`;

export interface ProvenanceSource {
  name: string;
  repository: string;
  revision: string;
  version: string;
  license: string;
  status: "adapted" | "reference-only" | "dependency";
  sourceFiles: string[];
  symbols: string[];
  localChanges: string[];
  verification: string[];
  attribution?: string;
}

interface LockedPackage {
  version?: string;
  resolved?: string;
  integrity?: string;
  license?: string;
  dev?: boolean;
  optional?: boolean;
}

function packageName(path: string): string {
  const marker = "node_modules/";
  const tail = path.slice(path.lastIndexOf(marker) + marker.length);
  const parts = tail.split("/");
  return parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!;
}

export function renderSourceNotice(source: ProvenanceSource): string {
  return [
    `## ${source.name}`,
    "",
    `- Status: ${source.status}`,
    `- Source: ${source.repository}`,
    `- Revision: ${source.revision}`,
    `- Version: ${source.version}`,
    `- License: ${source.license}`,
    ...(source.attribution ? [`- Upstream notice: ${source.attribution}`] : []),
    `- Source files: ${source.sourceFiles.length ? source.sourceFiles.join(", ") : "none copied"}`,
    `- Reused symbols/patterns: ${source.symbols.length ? source.symbols.join(", ") : "none"}`,
    `- Local changes: ${source.localChanges.length ? source.localChanges.join("; ") : "none"}`,
    "",
  ].join("\n");
}

async function generate(created: string): Promise<{ notices: string; sbom: object }> {
  const provenanceText = await readFile(resolve(ROOT, "manifests/provenance.json"), "utf8");
  const provenance = JSON.parse(provenanceText) as { schemaVersion: number; sources: ProvenanceSource[] };
  const packageManifest = await readJson<{ name: string; version: string; license: string }>("package.json");
  const lockText = await readFile(resolve(ROOT, "package-lock.json"), "utf8");
  const lock = JSON.parse(lockText) as { lockfileVersion: number; packages: Record<string, LockedPackage> };
  if (provenance.schemaVersion !== 1) throw new Error("provenance schemaVersion must be 1");
  if (!packageManifest.name || !packageManifest.version || !packageManifest.license) throw new Error("package identity is incomplete");
  if (lock.lockfileVersion !== 3) throw new Error("package-lock must use lockfileVersion 3");
  const piHost = lock.packages["node_modules/@earendil-works/pi-coding-agent"];
  if (piHost?.version !== "0.82.1") throw new Error("active Pi host must be exact @earendil-works/pi-coding-agent@0.82.1");
  const seenSources = new Set<string>();
  for (const source of provenance.sources) {
    if (!source.name || seenSources.has(source.name)) throw new Error(`duplicate or missing provenance source: ${source.name}`);
    seenSources.add(source.name);
    if (!/^[0-9a-f]{40}$/.test(source.revision) && !/^npm:[0-9]+\.[0-9]+\.[0-9]+$/.test(source.revision)) throw new Error(`${source.name}: exact commit or npm version required`);
    if (!source.repository.startsWith("https://") || !source.version || !source.license || source.verification.length === 0) throw new Error(`${source.name}: incomplete source identity`);
    if (source.attribution !== undefined && source.attribution.trim().length === 0) throw new Error(`${source.name}: attribution must not be empty`);
    if (source.status === "adapted" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) throw new Error(`${source.name}: adapted source detail is incomplete`);
    if (source.status === "reference-only" && (source.sourceFiles.length > 0 || source.symbols.length > 0 || source.localChanges.length > 0)) throw new Error(`${source.name}: reference-only source must not claim reused code`);
    if (source.status === "dependency" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) throw new Error(`${source.name}: dependency source detail is incomplete`);
  }

  const packages = Object.entries(lock.packages)
    .filter(([path, value]) => path !== "" && path.includes("node_modules/") && value.version)
    .map(([path, value]) => ({
      SPDXID: spdxId(path),
      name: packageName(path),
      versionInfo: value.version!,
      downloadLocation: value.resolved ?? "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: value.license ?? "NOASSERTION",
      licenseDeclared: value.license ?? "NOASSERTION",
      checksums: value.integrity ? [{ algorithm: "SHA512", checksumValue: value.integrity.replace(/^sha512-/, "") }] : [],
      primaryPackagePurpose: "LIBRARY",
      comment: `npm lock path=${path}; development=${Boolean(value.dev)}; optional=${Boolean(value.optional)}`,
    }))
    .sort((a, b) => a.SPDXID.localeCompare(b.SPDXID));

  const sourcePackages = provenance.sources.filter((source) => source.status !== "reference-only").map((source) => ({
    SPDXID: spdxId(`source:${source.name}`),
    name: source.name,
    versionInfo: source.version,
    downloadLocation: /^[0-9a-f]{40}$/.test(source.revision) ? `${source.repository.replace(/\.git$/, "")}/commit/${source.revision}` : source.repository,
    filesAnalyzed: false,
    licenseConcluded: source.license,
    licenseDeclared: source.license,
    checksums: [],
    primaryPackagePurpose: "SOURCE",
    comment: `revision=${source.revision}; files=${source.sourceFiles.join(", ")}; symbols=${source.symbols.join(", ")}; local changes=${source.localChanges.join(" | ")}`,
  }));
  const rootId = "SPDXRef-Package-aili-pi";
  const sbom = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${packageManifest.name}-${packageManifest.version}`,
    documentNamespace: `https://github.com/Rosetears520/aili-pi/sbom/${hash(`${JSON.stringify(packageManifest)}\n${lockText}\n${provenanceText}`).slice(0, 32)}`,
    creationInfo: { created, creators: ["Tool: @rosetears/aili-pi scripts/generate-provenance.ts"] },
    packages: [{ SPDXID: rootId, name: packageManifest.name, versionInfo: packageManifest.version, downloadLocation: "NOASSERTION", filesAnalyzed: false, licenseConcluded: packageManifest.license, licenseDeclared: packageManifest.license, checksums: [], primaryPackagePurpose: "APPLICATION" }, ...sourcePackages, ...packages],
    relationships: [...sourcePackages, ...packages].map((item) => ({ spdxElementId: rootId, relationshipType: "DEPENDS_ON", relatedSpdxElement: item.SPDXID })),
  };

  const notices = [
    "# Third-Party Notices",
    "",
    `This distribution is licensed under ${packageManifest.license}. The following adapted sources, behavioral references, and locked development/runtime dependencies retain their own license terms.`,
    "",
    ...provenance.sources.map(renderSourceNotice),
    "## npm dependency inventory",
    "",
    `The exact ${packages.length}-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in \`manifests/sbom.json\`.`,
    "",
    "Runtime dependencies are initialized through the single AILI Extension entry. Package-owned third-party adaptations are copied only where their provenance sourceFiles explicitly name repository paths.",
    "",
  ].join("\n");
  return { notices, sbom };
}

async function main(): Promise<void> {
  const actualSbomText = await readFile(resolve(ROOT, "manifests/sbom.json"), "utf8").catch(() => "");
  let actualSbom: Record<string, unknown> | undefined;
  try {
    actualSbom = JSON.parse(actualSbomText) as Record<string, unknown>;
  } catch {
    actualSbom = undefined;
  }
  const actualCreationInfo = actualSbom?.creationInfo && typeof actualSbom.creationInfo === "object"
    ? actualSbom.creationInfo as Record<string, unknown>
    : undefined;
  const existingCreated = typeof actualCreationInfo?.created === "string" && Number.isFinite(Date.parse(actualCreationInfo.created))
    ? actualCreationInfo.created
    : undefined;
  const generatedAt = new Date().toISOString();
  let generated = await generate(existingCreated ?? generatedAt);
  const generatedSbom = generated.sbom as Record<string, unknown>;
  if (actualSbom?.name !== generatedSbom.name || actualSbom?.documentNamespace !== generatedSbom.documentNamespace) {
    generated = await generate(generatedAt);
  }
  const { notices, sbom } = generated;
  const expectedSbom = `${JSON.stringify(sbom, null, 2)}\n`;
  if (process.argv.includes("--verify")) {
    const [actualNotices, actualSbom] = await Promise.all([
      readFile(resolve(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8").catch(() => ""),
      readFile(resolve(ROOT, "manifests/sbom.json"), "utf8").catch(() => ""),
    ]);
    if (actualNotices !== notices || actualSbom !== expectedSbom) throw new Error("provenance artifacts are missing or drifted; run npm run generate:provenance");
  } else {
    await Promise.all([
      writeFile(resolve(ROOT, "THIRD_PARTY_NOTICES.md"), notices, "utf8"),
      writeFile(resolve(ROOT, "manifests/sbom.json"), expectedSbom, "utf8"),
    ]);
  }
  await Promise.all(["THIRD_PARTY_NOTICES.md", "manifests/sbom.json", "manifests/provenance.json"].map((path) => access(resolve(ROOT, path))));
  console.log("Provenance verified: deterministic source records and SPDX SBOM");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
