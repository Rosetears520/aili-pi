import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));

describe("offline packaged runtime discovery", () => {
  it("loads the complete owned Extension surface without runtime source fetch", async () => {
    const result = await discoverAndLoadExtensions([entry], root, `${root}/.tmp/pi-integration-agent`);
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    const extension = result.extensions[0]!;
    const commands = [...extension.commands.keys()];
    const tools = [...extension.tools.keys()];
    const shortcuts = [...extension.shortcuts.keys()];
    expect(commands).toEqual(expect.arrayContaining([
      "aili-doctor", "aili-install-global-resources", "aili-agent-model", "perm", "quota",
      "cache-optimizer", "preview", "preview-browser", "preview-pdf", "preview-clear-cache", "lsp",
    ]));
    expect(commands).not.toContain("aili-mode");
    expect(tools).toEqual(expect.arrayContaining([
      "task", "hub", "web_search", "fetch_content", "get_search_content", "preview_export", "lsp_diagnostics", "lsp_fix",
    ]));
    expect(tools).not.toContain("subagent");
    expect(tools).not.toContain("aili_task");
    expect(shortcuts).toContain("alt+m");
    expect(shortcuts).not.toContain("ctrl+shift+alt+a");
    expect([...extension.handlers.keys()]).toEqual(expect.arrayContaining(["before_agent_start", "session_start", "tool_call"]));
  }, 30_000);

  it("loads the parent-only formal hub adapter and plans/reconciles one exact Board without automatic advancement", async () => {
    const scratchParent = join(root, ".tmp");
    await mkdir(scratchParent, { recursive: true });
    const project = await mkdtemp(join(scratchParent, "loaded-formal-hub-"));
    try {
      const changeRoot = join(project, "openspec", "changes", "loaded-change");
      await mkdir(changeRoot, { recursive: true });
      const board = [
        "# Task Board", "", "- Protocol: `aili-task-board/v1`", "- Task kind: `formal`", "- Task identity: `loaded-change`",
        "- Goal: Prove the loaded Extension reaches formal planning and explicit reconciliation.", "- Phase: `SHIP`", "- Board status: `active`",
        "- Accepted contract: `spec accepted`", "- Accepted verification: `test plan accepted`", "- Decision owner: `ROSE`", "- Verification owner: `ROSE`", "", "## Packages", "",
        "- [ ] P-01 — Loaded formal package", "  - Phase: `SHIP`", "  - Package kind: `task-execution`", "  - Source refs: `task:P-01`", "  - Accepted task IDs: `P-01`",
        "  - Status: `ready`", "  - Owner: `agent:aili.implementer`", "  - Dispatch: `required`", "  - Dispatch reason: `The exact implementation specialist owns this bounded package.`", "  - No-dispatch reason: `N/A`",
        "  - Execution: `sync`", "  - Join: `immediate`", "  - Depends on: `none`", "  - Decision gate: `accepted`", "  - Final test-plan gate: `accepted`", "  - Implementation authorization: `granted`", "  - Operation permissions: `granted`",
        "  - Scope: `Modify only src/loaded.ts.`", "  - Forbidden scope: `No board, dependency, Git, publish, or release mutation.`", "  - Expected result: `One bounded implementation result.`", "  - Expected evidence: `verification:loaded-formal-hub`", "  - Acceptance: `The loaded Extension plan retains exact identity and scope.`",
        "  - Dispatch evidence: `pending`", "  - Result evidence: `pending`", "  - Evidence: `pending`", "  - ROSE disposition: `pending`", "  - Blocker: `none`", "  - Next action: `ROSE may dispatch only the returned exact task request.`", "",
      ].join("\n");
      const progress = "[2026-08-01T00:00:00Z] BOARD BOARD_CREATED\nevidence=artifact:loaded-board\n\n[2026-08-01T00:00:01Z] P-01 READY\nevidence=artifact:loaded-ready\n";
      await writeFile(join(changeRoot, "formal-task-board.md"), board);
      await writeFile(join(changeRoot, "progress.txt"), progress);
      const parentFile = join(project, "parent.jsonl");
      await writeFile(parentFile, "parent\n");

      const loaded = await discoverAndLoadExtensions([entry], root, join(project, ".pi-agent"));
      expect(loaded.errors).toEqual([]);
      const hub = loaded.extensions[0]!.tools.get("hub")!.definition as unknown as {
        execute: (id: string, params: Record<string, unknown>, signal: AbortSignal, update: undefined, context: unknown) => Promise<{ details: any }>;
      };
      const context = {
        cwd: project,
        hasUI: false,
        signal: new AbortController().signal,
        sessionManager: { getSessionFile: () => parentFile, getSessionId: () => "loaded-parent", getEntries: () => [] },
        ui: { notify() {}, select: async () => undefined, confirm: async () => false },
        isProjectTrusted: () => true,
      } as never;
      const planned = await hub.execute("plan", {
        action: "formal-plan",
        changeId: "loaded-change",
        packageId: "P-01",
        writeScope: { paths: ["src"], resources: [] },
        operationGate: { state: "allowed", evidence: "The exact local write operation is approved." },
        ownership: { classification: "agent-execution", evidence: "The Board assigns the package to aili.implementer." },
      }, new AbortController().signal, undefined, context);
      expect(planned.details).toMatchObject({
        status: "task-request",
        taskRequest: {
          agent: "aili.implementer",
          writeScope: { paths: ["src"], resources: [] },
          formalContext: { changeId: "loaded-change" },
          continuationAudit: { packageId: "P-01", writeScope: { paths: ["src"], resources: [] } },
        },
      });
      expect(Object.keys(planned.details.taskRequest.formalContext)).toEqual(["changeId"]);

      const reconciled = await hub.execute("reconcile", {
        action: "formal-reconcile",
        changeId: "loaded-change",
        timestamp: "2026-08-01T00:00:02Z",
      }, new AbortController().signal, undefined, context);
      expect(reconciled.details).toMatchObject({ status: "preserved", updates: [] });
      expect(await readFile(join(changeRoot, "formal-task-board.md"), "utf8")).toBe(board);
      expect(await readFile(join(changeRoot, "progress.txt"), "utf8")).toBe(progress);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps the pinned repository snapshot without publishing or registering it as a Pi skill source", async () => {
    const [compatibility, workflowLock, roles, packageJson] = await Promise.all([
      readFile(new URL("../../manifests/skill-compatibility.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../manifests/roles.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    const skillDirectories = (await readdir(new URL("../../skills/", import.meta.url), { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => item.name).sort();
    expect(skillDirectories).toEqual(compatibility.records.map((item: { name: string }) => item.name).sort());
    expect(skillDirectories).toEqual(workflowLock.skills.map((item: { name: string }) => item.name).sort());
    expect(skillDirectories).toHaveLength(workflowLock.skillCount);
    expect(packageJson.files).not.toContain("skills/");
    expect(roles.schemaVersion).toBe(2);
    expect(roles.records).toHaveLength(20);
    expect(roles.bundledSelectors).toEqual(expect.arrayContaining(["general", "aili.code-scout", "aili.implementer"]));
    expect(packageJson.pi.prompts).toEqual([
      "./prompts/ideate.md", "./prompts/define.md", "./prompts/build.md", "./prompts/ship.md", "./prompts/local-review.md",
    ]);
    expect(packageJson.pi.skills).toEqual(["./node_modules/pi-web-access/skills"]);
    expect(await readFile(new URL("../../node_modules/pi-web-access/skills/librarian/SKILL.md", import.meta.url), "utf8")).toContain("Librarian");
    await Promise.all(skillDirectories.map((name) => readFile(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), "utf8")));
  });
});
