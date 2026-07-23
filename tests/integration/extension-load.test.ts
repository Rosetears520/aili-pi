import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));

describe("official Pi extension loading", () => {
  it("loads exactly one owned AILI Extension with ROSE and delegated hooks", async () => {
    const result = await discoverAndLoadExtensions([entry], root, `${root}/.tmp/pi-agent`);
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0]?.resolvedPath).toBe(entry);
    expect(result.extensions[0]?.handlers.get("before_agent_start")?.length).toBeGreaterThanOrEqual(2);
  });
});
