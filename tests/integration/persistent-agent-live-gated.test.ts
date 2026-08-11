import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";
import { GitIsolationAdapter } from "../../src/runtime/persistent-agents/workspace.js";

const exec = promisify(execFile);
const liveIt = process.env.AILI_RUN_EXTERNAL_GIT_LIVE === "1" ? it : it.skip;
let scratch = "";

async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd, encoding: "utf8" })).stdout;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = "";
});

describe("authorized persistent-Agent live gates", () => {
  liveIt("proves external disposable Git isolation without mutating the parent workspace", async () => {
    scratch = await mkdtemp(join(tmpdir(), "aili-persistent-agent-live-"));
    const repo = join(scratch, "external-repo");
    await (await import("node:fs/promises")).mkdir(repo);
    await git(repo, ["init", "-q"]);
    await git(repo, ["config", "user.name", "AILI Live Fixture"]);
    await git(repo, ["config", "user.email", "live-fixture@example.invalid"]);
    await writeFile(join(repo, "tracked.txt"), "base\n");
    await git(repo, ["add", "tracked.txt"]);
    await git(repo, ["commit", "-qm", "base"]);

    await writeFile(join(repo, "tracked.txt"), "dirty baseline\n");
    await writeFile(join(repo, "untracked.txt"), "untracked baseline\n");
    const headBefore = (await git(repo, ["rev-parse", "HEAD"])).trim();
    const statusBefore = await git(repo, ["status", "--porcelain=v1", "-z"]);

    const parent = join(scratch, "external-parent.jsonl");
    await writeFile(parent, "external live fixture parent\n");
    const layout = await ensureSidecarLayout(parent);
    let sequence = 0;
    const journal = (await CoordinatorJournal.open(layout, "external-live-parent", {
      eventId: () => `external-live-${++sequence}`,
      clock: () => new Date(Date.UTC(2026, 6, 25, 11, 0, sequence)),
    })).journal;
    const now = "2026-07-25T11:00:00.000Z";
    const agent: AgentRecord = { id: "External-Live", name: "External-Live", selector: "general", state: "queued", createdAt: now, updatedAt: now };
    await journal.append({ kind: "agent.created", agentId: agent.id, payload: { record: agent } });

    const adapter = new GitIsolationAdapter(layout, journal, () => new Date(1_750_000_000_000));
    const isolated = await adapter.create(agent.id, repo);
    expect(isolated.root.startsWith(repo)).toBe(false);
    expect(await readFile(join(isolated.root, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    expect(await readFile(join(isolated.root, "untracked.txt"), "utf8")).toBe("untracked baseline\n");

    await writeFile(join(isolated.root, "tracked.txt"), "child result\n");
    await writeFile(join(isolated.root, "child-only.txt"), "child only\n");
    const finalized = await adapter.finalize(isolated);
    const patch = await readFile(finalized.patchPath!, "utf8");
    expect(patch).toContain("+child result");
    expect(patch).toContain("+child only");
    expect(patch).not.toContain("+dirty baseline");
    expect((await git(repo, ["rev-parse", "HEAD"])).trim()).toBe(headBefore);
    expect(await git(repo, ["status", "--porcelain=v1", "-z"])).toBe(statusBefore);
    expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    await expect(access(join(repo, "child-only.txt"))).rejects.toThrow();

    const cleaned = await adapter.cleanup(finalized);
    await expect(access(cleaned.root)).rejects.toThrow();
    expect(() => adapter.assertResumable(agent.id)).toThrow(/was cleaned.*cannot revive/);
    expect(journal.getState().workspaces[agent.id]?.status).toBe("cleaned");
  });
});
