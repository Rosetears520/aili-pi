import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  DefaultResourceLoader,
  formatSkillsForPrompt,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const sourceSkill = new URL("../../node_modules/@earendil-works/pi-coding-agent/examples/extensions/dynamic-resources/SKILL.md", import.meta.url);
const generator = new URL("../../scripts/apply-adapter-evidence.ts", import.meta.url);
const piPackageRoot = new URL("../../node_modules/@earendil-works/pi-coding-agent/", import.meta.url);

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("i-have-adhd Pi compatibility", () => {
  it("matches the repository compatibility owner result", async () => {
    await expect(execFileAsync(process.execPath, [
      "--experimental-strip-types",
      fileURLToPath(generator),
      "--verify",
    ], { cwd: fileURLToPath(new URL("../..", import.meta.url)) })).resolves.toEqual(expect.objectContaining({
      stdout: expect.stringContaining("Adapter evidence verified for"),
    }));
  });

  it("binds the official local Pi 0.84.2 skill docs and native discovery API", async () => {
    const [packageText, distributionText, docs, api] = await Promise.all([
      readFile(new URL("package.json", piPackageRoot), "utf8"),
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
      readFile(new URL("docs/skills.md", piPackageRoot)),
      readFile(new URL("dist/core/package-manager.js", piPackageRoot)),
    ]);
    expect(JSON.parse(packageText).version).toBe("0.84.2");
    const distribution = JSON.parse(distributionText);
    expect(distribution.files).not.toContain("skills/");
    expect(distribution.pi.skills).not.toContain("skills/i-have-adhd");
    expect({ docs: sha256(docs), api: sha256(api) }).toEqual({
      docs: expect.stringMatching(/^[0-9a-f]{64}$/),
      api: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("uses Pi 0.84.2 native ~/.agents/skills discovery and progressive disclosure", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-pi-adhd-discovery-"));
    roots.push(root);
    const home = join(root, "home");
    const cwd = join(root, "project");
    const agentDir = join(home, ".pi", "agent");
    const installedSkill = join(home, ".agents", "skills", "dynamic-resources", "SKILL.md");
    await mkdir(dirname(installedSkill), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await cp(sourceSkill, installedSkill);

    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager: SettingsManager.inMemory({}, { projectTrusted: false }),
        noExtensions: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();
      const result = loader.getSkills();
      const skill = result.skills.find((candidate) => candidate.name === "dynamic-resources");

      expect(result.diagnostics).toEqual([]);
      expect(skill).toEqual(expect.objectContaining({
        name: "dynamic-resources",
        filePath: installedSkill,
        baseDir: dirname(installedSkill),
        disableModelInvocation: false,
        sourceInfo: expect.objectContaining({ scope: "user" }),
      }));
      const prompt = formatSkillsForPrompt([skill!]);
      expect(prompt).toContain("<name>dynamic-resources</name>");
      expect(prompt).toContain(installedSkill);
      expect(prompt).toContain("Use the read tool to load a skill's file when the task matches");
      expect(prompt).not.toContain("## Response shape");
      expect(await readFile(skill!.filePath, "utf8")).toContain("name:");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  it("rejects a manual compatibility promotion without matching skill-scoped evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-pi-adhd-evidence-"));
    roots.push(root);
    await mkdir(join(root, "scripts"), { recursive: true });
    await mkdir(join(root, "manifests"), { recursive: true });
    await mkdir(join(root, "upstream"), { recursive: true });
    await mkdir(join(root, "evidence"), { recursive: true });
    await cp(generator, join(root, "scripts", "apply-adapter-evidence.ts"));
    const revision = "a".repeat(40);
    const sourceHash = "b".repeat(64);
    const artifact = "revision-bound native discovery behavior";
    await writeFile(join(root, "evidence", "behavior.txt"), artifact);
    await writeFile(join(root, "upstream", "aili-workflows.lock.json"), `${JSON.stringify({ commit: revision })}\n`);
    await writeFile(join(root, "manifests", "adapter-evidence.json"), `${JSON.stringify({
      schemaVersion: 1,
      records: [],
    }, null, 2)}\n`);
    const compatibilityPath = join(root, "manifests", "skill-compatibility.json");
    const compatibility = {
      schemaVersion: 1,
      source: { commit: revision },
      records: [{
        name: "i-have-adhd",
        sourceHash,
        requiredCapabilities: [],
        adapterOwner: "@earendil-works/pi-coding-agent@0.82.1",
        verification: ["manual:claimed"],
        status: "native",
        reason: "Manually promoted.",
        unverified: [],
      }],
    };
    await writeFile(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`);

    await expect(execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "scripts/apply-adapter-evidence.ts",
      "--verify",
    ], { cwd: root })).rejects.toThrow(/skill compatibility does not match bound adapter evidence/);

    const evidence = {
      schemaVersion: 1,
      records: [{
        skill: "i-have-adhd",
        sourceHash,
        status: "native",
        owner: "@earendil-works/pi-coding-agent@0.82.1",
        sourceRevision: revision,
        verification: ["vitest run tests/integration/i-have-adhd-compatibility.test.ts"],
        behavior: {
          kind: "pi-native-skill-discovery",
          host: "@earendil-works/pi-coding-agent@0.82.1",
          discoveryRoot: "~/.agents/skills",
          entrypoint: "SKILL.md",
          loading: "on-demand",
        },
        artifacts: [{ path: "evidence/behavior.txt", sha256: sha256(artifact) }],
      }],
    };
    await writeFile(join(root, "manifests", "adapter-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    await execFileAsync(process.execPath, ["--experimental-strip-types", "scripts/apply-adapter-evidence.ts"], { cwd: root });
    await expect(execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "scripts/apply-adapter-evidence.ts",
      "--verify",
    ], { cwd: root })).resolves.toEqual(expect.objectContaining({ stdout: expect.stringContaining("verified for 1 skill records") }));

    const generated = JSON.parse(await readFile(compatibilityPath, "utf8"));
    expect(generated.records[0]).toEqual(expect.objectContaining({
      status: "native",
      adapterOwner: "@earendil-works/pi-coding-agent@0.82.1",
      unverified: [],
    }));
  });
});
