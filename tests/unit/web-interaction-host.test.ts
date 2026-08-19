import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	ASSIGNMENTS,
	BLOCKING_INTERACTION_METHODS,
	UNKNOWN_METHOD_FALLBACK,
	isBlockingInteractionMethod,
	isPermissionApprovalRequest,
	resolveInteractionPresentation,
} from "../../src/web/lib/interaction-host.ts";

describe("interaction host presentation mapping (add-webui-coding-workspace)", () => {
	it("docks every first-batch method in the composer shelf", () => {
		for (const method of ["questionnaire", "select", "confirm", "input"] as const) {
			const assignment = resolveInteractionPresentation(method);
			expect(assignment.presentation).toBe("composer-shelf");
			expect(assignment.reason.length).toBeGreaterThan(0);
		}
	});

	it("keeps editor and custom as explicit modal exceptions with reasons", () => {
		for (const method of ["editor", "custom"] as const) {
			const assignment = resolveInteractionPresentation(method);
			expect(assignment.presentation).toBe("modal");
			expect(assignment.reason).toContain("explicit modal exception");
		}
	});

	it("recognizes every permission-mode approval ask shape", () => {
		// askWithSession without onForever
		expect(isPermissionApprovalRequest({ options: ["Allow once", "Allow for session", "Deny"] })).toBe(true);
		// askWithSession with onForever
		expect(
			isPermissionApprovalRequest({ options: ["Allow once", "Allow for session", "Allow forever", "Deny"] }),
		).toBe(true);
		// blocked-host ask
		expect(isPermissionApprovalRequest({ options: ["Allow for session", "Allow forever", "Deny"] })).toBe(true);
	});

	it("does not mislabel ordinary selects as permission approvals", () => {
		expect(isPermissionApprovalRequest({ options: ["red", "green"], title: "Pick a color" })).toBe(false);
		expect(isPermissionApprovalRequest({})).toBe(false);
		expect(isPermissionApprovalRequest({ options: ["Deny"] })).toBe(false);
	});

	it("assigns permission approval selects to the shelf with the approval reason", () => {
		const assignment = resolveInteractionPresentation("select", {
			title: "bash wants to run rm — allow?",
			options: ["Allow once", "Allow for session", "Deny"],
		});
		expect(assignment.presentation).toBe("composer-shelf");
		expect(assignment.reason).toContain("permission-mode approval ask");
	});

	it("resolves unknown and non-blocking methods to the safe modal fallback without throwing", () => {
		expect(resolveInteractionPresentation("totally-new-method").presentation).toBe("modal");
		expect(resolveInteractionPresentation("notify").presentation).toBe("modal");
		expect(resolveInteractionPresentation("setStatus")).toEqual(UNKNOWN_METHOD_FALLBACK);
	});

	it("keeps the blocking method list and assignment table in lockstep", () => {
		expect(Object.keys(ASSIGNMENTS).sort()).toEqual([...BLOCKING_INTERACTION_METHODS].sort());
		for (const assignment of Object.values(ASSIGNMENTS)) {
			expect(assignment.reason.length).toBeGreaterThan(0);
		}
	});

	it("covers every method in the BlockingExtensionUiRequest union from types.ts", async () => {
		const typesPath = fileURLToPath(new URL("../../src/web/lib/types.ts", import.meta.url));
		const source = await readFile(typesPath, "utf8");
		const unionMatch = source.match(/BlockingExtensionUiRequest = Extract<[\s\S]*?\{ method: ([^}]+)\}/);
		expect(unionMatch).not.toBeNull();
		const unionMethods = [...unionMatch![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
		expect(unionMethods.length).toBeGreaterThan(0);
		for (const method of unionMethods) {
			expect(isBlockingInteractionMethod(method)).toBe(true);
			expect(() => resolveInteractionPresentation(method)).not.toThrow();
		}
	});
});
