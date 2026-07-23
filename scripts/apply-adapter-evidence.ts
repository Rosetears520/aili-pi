import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const evidencePath = new URL("manifests/adapter-evidence.json", ROOT);
const compatibilityPath = new URL("manifests/skill-compatibility.json", ROOT);

interface EvidenceRecord {
  capability: string;
  status: "native" | "adapted" | "unverified";
  owner: string;
  verification: string[];
  sourceRevision: string;
  artifacts: Array<{ path: string; sha256: string }>;
}

const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as { schemaVersion: number; records: EvidenceRecord[] };
const compatibilityText = await readFile(compatibilityPath, "utf8");
const compatibility = JSON.parse(compatibilityText) as {
  records: Array<{
    name: string;
    requiredCapabilities: string[];
    adapterOwner: string;
    verification: string[];
    status: "native" | "adapted" | "optional" | "blocked";
    reason: string;
    unverified: string[];
  }>;
};

if (evidence.schemaVersion !== 1) throw new Error("adapter evidence schemaVersion must be 1");
const byCapability = new Map(evidence.records.map((record) => [record.capability, record]));
if (byCapability.size !== evidence.records.length) throw new Error("adapter evidence contains duplicate capabilities");
const lock = JSON.parse(await readFile(new URL("upstream/aili-workflows.lock.json", ROOT), "utf8")) as { commit: string };
for (const record of evidence.records) {
  if (record.sourceRevision !== lock.commit) throw new Error(`${record.capability}: adapter evidence revision does not match the skill lock`);
  if (!record.owner || record.verification.length === 0 || record.artifacts.length === 0) throw new Error(`${record.capability}: adapter evidence is incomplete`);
  for (const artifact of record.artifacts) {
    if (artifact.path.startsWith("/") || artifact.path.includes("..")) throw new Error(`${record.capability}: unsafe evidence path ${artifact.path}`);
    const content = await readFile(new URL(artifact.path, ROOT));
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== artifact.sha256) throw new Error(`${record.capability}: evidence hash drift at ${artifact.path}`);
  }
}
let updated = 0;
for (const skill of compatibility.records) {
  if (skill.requiredCapabilities.length === 0) continue;
  const records = skill.requiredCapabilities.map((capability) => byCapability.get(capability));
  if (records.some((record) => !record)) continue;
  const resolved = records as EvidenceRecord[];
  if (resolved.some((record) => record.status === "unverified")) {
    skill.status = "blocked";
    skill.adapterOwner = `planned:${resolved.map((record) => record.owner).join(",")}`;
    skill.verification = ["snapshot-hash:verified", ...resolved.flatMap((record) => record.verification.map((command) => `pending:${command}`))];
    skill.reason = `Required Pi adapter evidence remains unverified: ${skill.requiredCapabilities.join(", ")}.`;
    skill.unverified = ["Fresh revision-bound P8 execution evidence is required before compatibility promotion."];
    updated += 1;
    continue;
  }
  skill.status = resolved.every((record) => record.status === "native") ? "native" : "adapted";
  skill.adapterOwner = resolved.map((record) => record.owner).join(",");
  skill.verification = [...new Set(["snapshot-hash:verified", ...resolved.flatMap((record) => record.verification)])];
  skill.reason = `Required capabilities are covered by verified Pi adapter evidence: ${skill.requiredCapabilities.join(", ")}.`;
  skill.unverified = [];
  updated += 1;
}
const rendered = `${JSON.stringify(compatibility, null, 2)}\n`;
if (process.argv.includes("--verify")) {
  if (compatibilityText !== rendered) throw new Error("skill compatibility does not match bound adapter evidence; run npm run sync:adapters");
} else {
  await writeFile(compatibilityPath, rendered, "utf8");
}
console.log(`Adapter evidence ${process.argv.includes("--verify") ? "verified for" : "applied to"} ${updated} skill records`);
