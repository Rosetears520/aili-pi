import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const evidencePath = new URL("manifests/adapter-evidence.json", ROOT);
const compatibilityPath = new URL("manifests/skill-compatibility.json", ROOT);

interface EvidenceRecord {
  capability?: string;
  skill?: string;
  sourceHash?: string;
  status: "native" | "adapted" | "unverified";
  owner: string;
  verification: string[];
  sourceRevision: string;
  artifacts: Array<{ path: string; sha256: string }>;
  behavior?: {
    kind: "pi-native-skill-discovery";
    host: string;
    discoveryRoot: "~/.agents/skills";
    entrypoint: "SKILL.md";
    loading: "on-demand";
  };
}

const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as { schemaVersion: number; records: EvidenceRecord[] };
const compatibilityText = await readFile(compatibilityPath, "utf8");
const compatibility = JSON.parse(compatibilityText) as {
  source: { commit: string };
  records: Array<{
    name: string;
    sourceHash: string;
    requiredCapabilities: string[];
    adapterOwner: string;
    verification: string[];
    status: "native" | "adapted" | "optional" | "blocked";
    reason: string;
    unverified: string[];
  }>;
};

if (evidence.schemaVersion !== 1) throw new Error("adapter evidence schemaVersion must be 1");
const lock = JSON.parse(await readFile(new URL("upstream/aili-workflows.lock.json", ROOT), "utf8")) as { commit: string };
if (compatibility.source.commit !== lock.commit) throw new Error("skill compatibility revision does not match the skill lock");
const byCapability = new Map<string, EvidenceRecord>();
const bySkill = new Map<string, EvidenceRecord>();
for (const record of evidence.records) {
  const hasCapability = typeof record.capability === "string" && record.capability.length > 0;
  const hasSkill = typeof record.skill === "string" && record.skill.length > 0;
  if (hasCapability === hasSkill) throw new Error("adapter evidence must target exactly one capability or skill");
  const target = hasCapability ? `capability:${record.capability}` : `skill:${record.skill}`;
  const targetMap = hasCapability ? byCapability : bySkill;
  const targetId = hasCapability ? record.capability! : record.skill!;
  if (targetMap.has(targetId)) throw new Error(`adapter evidence contains duplicate target ${target}`);
  targetMap.set(targetId, record);
  if (!new Set(["native", "adapted", "unverified"]).has(record.status)) throw new Error(`${target}: invalid evidence status`);
  const staleRevision = record.sourceRevision !== lock.commit;
  if (staleRevision) {
    // Stale evidence remains evidence, not authority. Leave affected skills
    // blocked until fresh revision-bound artifacts are recorded.
    record.status = "unverified";
  }
  if (!record.owner || record.verification.length === 0 || record.artifacts.length === 0) throw new Error(`${target}: adapter evidence is incomplete`);
  if (hasSkill) {
    if (record.status === "adapted") throw new Error(`${target}: skill-scoped evidence must be native or unverified`);
    const skill = compatibility.records.find((candidate) => candidate.name === record.skill);
    if (!skill) {
      if (record.status === "unverified") continue;
      throw new Error(`${target}: compatibility target is missing`);
    }
    if (skill.requiredCapabilities.length !== 0) throw new Error(`${target}: skill-scoped evidence is only valid without required capabilities`);
    if (!record.sourceHash || record.sourceHash !== skill.sourceHash) throw new Error(`${target}: evidence source hash does not match the skill snapshot`);
    if (record.status === "native") {
      const behavior = record.behavior;
      if (!behavior || behavior.kind !== "pi-native-skill-discovery"
        || behavior.host !== record.owner
        || behavior.discoveryRoot !== "~/.agents/skills"
        || behavior.entrypoint !== "SKILL.md"
        || behavior.loading !== "on-demand") {
        throw new Error(`${target}: Pi native discovery behavior evidence is incomplete`);
      }
    }
  }
  if (record.status !== "unverified") {
    for (const artifact of record.artifacts) {
      if (artifact.path.startsWith("/") || artifact.path.includes("..")) throw new Error(`${target}: unsafe evidence path ${artifact.path}`);
      const content = await readFile(new URL(artifact.path, ROOT));
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== artifact.sha256) throw new Error(`${target}: evidence hash drift at ${artifact.path} (actual ${actual})`);
    }
  }
}
let updated = 0;
for (const skill of compatibility.records) {
  if (skill.requiredCapabilities.length === 0) {
    const record = bySkill.get(skill.name);
    if (!record) {
      skill.status = "blocked";
      skill.adapterOwner = "planned:skill-scoped-pi-evidence";
      skill.verification = ["snapshot-hash:verified", "pi-discovery:pending", "pi-behavior:pending"];
      skill.reason = "Skill-scoped Pi native discovery and behavior evidence is required.";
      skill.unverified = ["Revision-bound Pi discovery and on-demand behavior evidence is missing."];
    } else if (record.status === "unverified") {
      skill.status = "blocked";
      skill.adapterOwner = `planned:${record.owner}`;
      skill.verification = ["snapshot-hash:verified", ...record.verification.map((command) => `pending:${command.replace(/^stale:/, "")}`)];
      skill.reason = "Skill-scoped Pi native discovery and behavior evidence remains unverified.";
      skill.unverified = ["Fresh revision-bound behavior evidence is required before compatibility promotion."];
    } else {
      skill.status = record.status;
      skill.adapterOwner = record.owner;
      skill.verification = [...new Set(["snapshot-hash:verified", ...record.verification])];
      skill.reason = "The exact skill snapshot is covered by verified Pi native discovery and on-demand behavior evidence.";
      skill.unverified = [];
    }
    updated += 1;
    continue;
  }
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
