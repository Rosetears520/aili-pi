import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AnalyticsStore, type AnalyticsEventInput } from "../../src/runtime/analytics/store.js";

const REPOSITORY_LOCAL_FIXTURE_PARENT = fileURLToPath(new URL("../", import.meta.url));
const SCOPE = "analytics-test-scope";
let fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureRoots.map((root) => rm(root, { recursive: true, force: true })));
  fixtureRoots = [];
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(REPOSITORY_LOCAL_FIXTURE_PARENT, ".analytics-store-"));
  fixtureRoots.push(root);
  return root;
}

function store(root: string): AnalyticsStore {
  let sequence = 0;
  return new AnalyticsStore({ root, createId: () => `segment-${String(++sequence).padStart(8, "0")}` });
}

function event(timestampMs: number, extra: Partial<AnalyticsEventInput> = {}): AnalyticsEventInput {
  return { timestampMs, scope: SCOPE, kind: "response", ...extra };
}

describe("AnalyticsStore", () => {
  it("appends content-free events and queries only the requested half-open range", async () => {
    const root = await fixtureRoot();
    const analytics = store(root);

    await analytics.append(event(100, { durationMs: 7, provider: "Provider", model: "Model", responseCount: 2, inputTokens: 3, outputTokens: 5, costMicros: 11 }));
    await analytics.append(event(200, { kind: "tool", tool: "read", outcome: "error" }));
    const result = await analytics.query({ fromMs: 100, toMs: 200 });

    expect(result.range).toEqual({ fromMs: 100, toMs: 200 });
    expect(result.summary).toMatchObject({
      records: 1,
      responseCount: 2,
      llmCallCount: 0,
      toolCount: 0,
      errorCount: 0,
      durationMs: 7,
      inputTokens: 3,
      outputTokens: 5,
      costMicros: 11,
      corruptRecords: 0,
      dimensions: { provider: 1, model: 1 },
    });
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("clears a range without deleting retained records, then clears every remaining segment", async () => {
    const root = await fixtureRoot();
    const analytics = store(root);
    await Promise.all([analytics.append(event(10)), analytics.append(event(20)), analytics.append(event(30))]);

    const range = await analytics.clearRange({ fromMs: 15, toMs: 30 });
    expect(range).toMatchObject({ kind: "range", deletedRecords: 1, retainedRecords: 2, corruptRecords: 0 });
    expect((await analytics.query({ fromMs: 0, toMs: 40 })).summary.records).toBe(2);

    const all = await analytics.clearAll();
    expect(all).toMatchObject({ kind: "all", deletedRecords: 2, retainedRecords: 0, corruptRecords: 0 });
    expect(await analytics.sizeBytes()).toBe(0);
  });

  it("quarantines a corrupt segment and includes quarantine data in complete cleanup", async () => {
    const root = await fixtureRoot();
    const analytics = store(root);
    await analytics.append(event(100));
    await mkdir(join(root, "segments"), { recursive: true });
    await writeFile(join(root, "segments", "corrupt01.json"), "not JSON", "utf8");

    const queried = await analytics.query({ fromMs: 0, toMs: 200 });
    expect(queried.summary).toMatchObject({ records: 1, corruptRecords: 1 });
    expect(await readdir(join(root, "segments"))).toEqual(["segment-00000001.json"]);
    expect(await readdir(join(root, "quarantine"))).toHaveLength(1);

    const cleanup = await analytics.clearAll();
    expect(cleanup).toMatchObject({ kind: "all", deletedRecords: 1, retainedRecords: 0, corruptRecords: 0 });
    expect(cleanup.deletedBytes).toBeGreaterThan(0);
    await expect(readdir(join(root, "quarantine"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("serializes concurrent appends and cleanup in call order", async () => {
    const root = await fixtureRoot();
    const analytics = store(root);

    const [, , cleanup] = await Promise.all([
      analytics.append(event(10)),
      analytics.append(event(20)),
      analytics.clearRange({ fromMs: 0, toMs: 30 }),
      analytics.append(event(40)),
    ]);

    expect(cleanup).toMatchObject({ kind: "range", deletedRecords: 2, retainedRecords: 0, corruptRecords: 0 });
    expect((await analytics.query({ fromMs: 0, toMs: 30 })).summary.records).toBe(0);
    expect((await analytics.query({ fromMs: 30, toMs: 50 })).summary.records).toBe(1);
  });
});
