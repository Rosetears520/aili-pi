import { describe, expect, it } from "vitest";
import { inspectGlobalResources, installGlobalResources } from "../../src/runtime/global-resources.js";

const approved = process.env.AILI_APPROVED_GLOBAL_RESOURCE_PROBE === "1";

describe("approved real global AILI resource probe", () => {
  it.skipIf(!approved)("installs only marker-owned AILI global resources", async () => {
    const result = await installGlobalResources();
    expect(result.appendSystem).toBe("installed");
    expect(result.roles).toEqual(expect.objectContaining({ expected: 19, installed: 19, missing: [] }));
    const inspected = await inspectGlobalResources();
    expect(inspected).toEqual(expect.objectContaining({ appendSystem: "installed", roles: expect.objectContaining({ installed: 19, missing: [] }) }));
  });
});
