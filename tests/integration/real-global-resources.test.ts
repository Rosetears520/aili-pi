import { describe, expect, it } from "vitest";
import { inspectGlobalResources } from "../../src/runtime/global-resources.js";

const approved = process.env.AILI_APPROVED_GLOBAL_RESOURCE_PROBE === "1";

describe("approved real legacy global-resource inspection", () => {
  it.skipIf(!approved)("reports legacy resources without mutating current-user files", async () => {
    const result = await inspectGlobalResources();
    expect(result.ownership).toBe("retired");
    expect(result.roles).toEqual(expect.objectContaining({ expected: 0, installed: 0, missing: [] }));
  });
});
