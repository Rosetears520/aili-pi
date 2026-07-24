import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(resolve(ROOT, path), "utf8")) as T;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const spdxId = (value: string): string => `SPDXRef-${value.replace(/[^A-Za-z0-9.-]+/g, "-")}-${hash(value).slice(0, 10)}`;

interface ProvenanceSource {
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

async function generate(): Promise<{ notices: string; sbom: object }> {
  const provenance = await readJson<{ schemaVersion: number; sources: ProvenanceSource[] }>("manifests/provenance.json");
  const lockText = await readFile(resolve(ROOT, "package-lock.json"), "utf8");
  const lock = JSON.parse(lockText) as { lockfileVersion: number; packages: Record<string, LockedPackage> };
  if (provenance.schemaVersion !== 1) throw new Error("provenance schemaVersion must be 1");
  if (lock.lockfileVersion !== 3) throw new Error("package-lock must use lockfileVersion 3");
  const seenSources = new Set<string>();
  for (const source of provenance.sources) {
    if (!source.name || seenSources.has(source.name)) throw new Error(`duplicate or missing provenance source: ${source.name}`);
    seenSources.add(source.name);
    if (!/^[0-9a-f]{40}$/.test(source.revision) && !/^npm:[0-9]+\.[0-9]+\.[0-9]+$/.test(source.revision)) throw new Error(`${source.name}: exact commit or npm version required`);
    if (!source.repository.startsWith("https://") || !source.license || source.verification.length === 0) throw new Error(`${source.name}: incomplete source identity`);
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
    name: "@rosetears/aili-pi-0.0.0-development",
    documentNamespace: `https://github.com/Rosetears520/aili-pi/sbom/${hash(lockText).slice(0, 32)}`,
    creationInfo: { creators: ["Tool: @rosetears/aili-pi scripts/generate-provenance.ts"] },
    packages: [{ SPDXID: rootId, name: "@rosetears/aili-pi", versionInfo: "0.0.0-development", downloadLocation: "NOASSERTION", filesAnalyzed: false, licenseConcluded: "MIT", licenseDeclared: "MIT", checksums: [], primaryPackagePurpose: "APPLICATION" }, ...sourcePackages, ...packages],
    relationships: [...sourcePackages, ...packages].map((item) => ({ spdxElementId: rootId, relationshipType: "DEPENDS_ON", relatedSpdxElement: item.SPDXID })),
  };

  const notices = [
    "# Third-Party Notices",
    "",
    "This distribution is MIT-licensed. The following adapted sources and locked development/runtime dependencies retain their own license terms.",
    "",
    ...provenance.sources.map((source) => [
      `## ${source.name}`,
      "",
      `- Status: ${source.status}`,
      `- Source: ${source.repository}`,
      `- Revision: ${source.revision}`,
      `- Version: ${source.version}`,
      `- License: ${source.license}`,
      `- Source files: ${source.sourceFiles.length ? source.sourceFiles.join(", ") : "none copied"}`,
      `- Reused symbols/patterns: ${source.symbols.length ? source.symbols.join(", ") : "none"}`,
      `- Local changes: ${source.localChanges.length ? source.localChanges.join("; ") : "none"}`,
      "",
    ].join("\n")),
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
  const { notices, sbom } = await generate();
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

await main();
