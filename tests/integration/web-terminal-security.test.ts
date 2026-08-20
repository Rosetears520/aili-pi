import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { TerminalManager } from "../../src/web/lib/terminal-manager.ts";

// Security contract (task 5.4, webui-user-terminal): the upgrade fails
// closed — bad token, non-loopback Origin, and invalid cwd are rejected with
// an HTTP error before the WebSocket handshake completes and no PTY is ever
// spawned.

process.env.AILI_TERMINAL_SHELL = "/bin/sh";

let manager: TerminalManager;
let server: Server;
let httpPort: number;
let cwd: string;
let token: string;

beforeAll(async () => {
	manager = new TerminalManager();
	cwd = await mkdtemp(join(tmpdir(), "aili-terminal-sec-"));
	token = manager.ensureToken().token;
	server = createServer((_request, response) => response.writeHead(404).end());
	manager.routeUpgrades(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	httpPort = (server.address() as { port: number }).port;
});

afterAll(async () => {
	manager.dispose();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	delete process.env.AILI_TERMINAL_SHELL;
});

function dial(overrides: { token?: string; origin?: string; cwd?: string }) {
	const url = `ws://127.0.0.1:${httpPort}/aili-terminal`
		+ `?token=${encodeURIComponent(overrides.token ?? token)}`
		+ `&cwd=${encodeURIComponent(overrides.cwd ?? cwd)}`;
	return overrides.origin
		? new WebSocket(url, { origin: overrides.origin })
		: new WebSocket(url);
}

// Rejection happens during the HTTP upgrade, so the ws client surfaces an
// error ("Unexpected server response: <code>") instead of a close code.
function expectUpgradeRejection(client: WebSocket, code: 400 | 403, timeoutMs = 6000): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("upgrade was not rejected in time")), timeoutMs);
		client.on("error", (error) => {
			clearTimeout(timer);
			try {
				expect((error as Error).message).toContain(String(code));
				resolve();
			} catch (assertion) {
				reject(assertion);
			}
		});
		client.on("open", () => {
			clearTimeout(timer);
			reject(new Error("upgrade unexpectedly accepted"));
		});
	});
}

describe("terminal upgrade fails closed", () => {
	it("rejects a wrong token before the handshake without spawning a session", async () => {
		await expectUpgradeRejection(dial({ token: "not-the-token" }), 403);
		expect(manager.sessionCount).toBe(0);
	});

	it("rejects a non-loopback browser Origin without spawning a session", async () => {
		await expectUpgradeRejection(dial({ origin: "http://evil.example" }), 403);
		expect(manager.sessionCount).toBe(0);
	});

	it("rejects a malformed Origin header", async () => {
		await expectUpgradeRejection(dial({ origin: "::not a url::" }), 403);
		expect(manager.sessionCount).toBe(0);
	});

	it("rejects a missing or relative cwd without spawning a session", async () => {
		await expectUpgradeRejection(dial({ cwd: "relative/path" }), 400);
		await expectUpgradeRejection(dial({ cwd: "" }), 400);
		expect(manager.sessionCount).toBe(0);
	});
});
