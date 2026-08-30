import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateActiveHistoricalSchema } from "../../scripts/validate-web-source-locks.js";

type Locks = Parameters<typeof validateActiveHistoricalSchema>[0];
const lockPath = resolve(process.cwd(), "upstream/web-source-locks.json");

async function locks(): Promise<Locks> {
  return JSON.parse(await readFile(lockPath, "utf8")) as Locks;
}

describe("Pi Web active/historical source locks", () => {
  it("has exactly one active 0.8.11 and one historical 0.8.9 record", async () => {
    const value = await locks();
    expect(() => validateActiveHistoricalSchema(value)).not.toThrow();
    expect(value.sources.filter((source) => source.package === "@agegr/pi-web").map((source) => [source.version, source.status]))
      .toEqual([["0.8.9", "historical"], ["0.8.11", "active"]]);
  });

  it("rejects independently duplicated active and missing historical states", async () => {
    const duplicateActive = structuredClone(await locks());
    const historical = duplicateActive.sources.find((source) => source.version === "0.8.9")!;
    historical.status = "active";
    expect(() => validateActiveHistoricalSchema(duplicateActive)).toThrow("exactly one active");

    const missingHistorical = structuredClone(await locks());
    missingHistorical.sources = missingHistorical.sources.filter((source) => source.version !== "0.8.9");
    expect(() => validateActiveHistoricalSchema(missingHistorical)).toThrow("exactly 0.8.9 and 0.8.11");
  });

  it("freezes distinct npm, tag and archive identities", async () => {
    const active = (await locks()).sources.find((source) => source.status === "active")!;
    expect(active).toMatchObject({
      version: "0.8.11",
      npmGitHead: "024be0b1154ba8a2650237a2db8bfa89124e167e",
      gitRevision: "28bab3c25f5f6770c9b0b745ebbfec1c27f7b948",
      npmTarballSha256: "69baa3d4dc9328924a8ae03d431ff3ea5e0a707e1c9aeb4708cf31dbb07cb834",
      gitSourceArchiveSha256: "329ac758a3bd70916988f507f71938a9dc28e44bbcb772b5ef34c06dc1bc36a6",
    });
    expect(active.npmGitHead).not.toBe(active.gitRevision);
    expect(active.npmTarballSha256).not.toBe(active.gitSourceArchiveSha256);
  });
});
