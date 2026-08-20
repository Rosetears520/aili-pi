import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { TerminalManager } from "../../src/web/lib/terminal-manager.ts";

// Real-PTY lifecycle contract (task 5.2, webui-user-terminal): spawn on
// connect, echo through, reap on disconnect, clean reconnect, dispose kills
// everything. The manager rides the SAME http server as the app (the
// instrumentation listen-patch does this in production); tests spin their own
// loopback http server and attach. A deterministic shell keeps assertions
// independent of the user's interactive rc files.

process.env.AILI_TERMINAL_SHELL = "/bin/sh";

let manager: TerminalManager;
let server: Server;
let httpPort: number;
let cwd: string;
let token: string;

beforeAll(async () => {
	manager = new TerminalManager();
	cwd = await mkdtemp(join(tmpdir(), "aili-terminal-"));
	token = manager.ensureToken().token;
	server = createServer((_request, response) => {
		response.writeHead(404).end();
	});
	manager.routeUpgrades(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	httpPort = (server.address() as { port: number }).port;
});

afterAll(async () => {
	manager.dispose();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	delete process.env.AILI_TERMINAL_SHELL;
});

function connect(overrides: { token?: string; origin?: string; cwd?: string; path?: string } = {}) {
	const url = `ws://127.0.0.1:${httpPort}${overrides.path ?? "/aili-terminal"}`
		+ `?token=${encodeURIComponent(overrides.token ?? token)}`
		+ `&cwd=${encodeURIComponent(overrides.cwd ?? cwd)}`;
	return overrides.origin ? new WebSocket(url, { origin: overrides.origin }) : new WebSocket(url);
}

async function openClient(): Promise<WebSocket> {
	const client = connect();
	await new Promise<void>((resolve, reject) => {
		client.once("open", () => resolve());
		client.once("error", reject);
	});
	return client;
}

function untilOutput(client: WebSocket, predicate: (accumulated: string) => boolean, timeoutMs = 8000): Promise<string> {
	return new Promise((resolve, reject) => {
		let accumulated = "";
		const timer = setTimeout(() => {
			client.removeAllListeners("message");
			reject(new Error(`timed out waiting for output; got: ${accumulated.slice(-400)}`));
		}, timeoutMs);
		client.on("message", (data) => {
			accumulated += typeof data === "string" ? data : data.toString("utf8");
			if (predicate(accumulated)) {
				clearTimeout(timer);
				client.removeAllListeners("message");
				resolve(accumulated);
			}
		});
	});
}

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("condition not met in time");
}

function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("terminal manager lifecycle (real PTY over the app's own http server)", () => {
	it("issues a token and leaves foreign upgrades to Node's default", async () => {
		expect(token.length).toBeGreaterThan(20);
		// A foreign WebSocket path gets the default destroy when we are the
		// only upgrade listener.
		await expect(new Promise((_resolve, reject) => {
			const client = connect({ path: "/other-path" });
			client.once("error", (error) => reject(error));
			client.once("open", () => reject(new Error("foreign upgrade unexpectedly accepted")));
		})).rejects.toThrow();
		expect(manager.sessionCount).toBe(0);
	});

	it("delegates foreign upgrade paths to pre-existing listeners (Next coexistence)", async () => {
		let foreignSeen = false;
		const coexistServer = createServer((_request, response) => response.writeHead(404).end());
		coexistServer.on("upgrade", (_request, socket) => {
			foreignSeen = true;
			socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: dummy\r\n\r\n");
			socket.destroy();
		});
		manager.routeUpgrades(coexistServer);
		await new Promise<void>((resolve) => coexistServer.listen(0, "127.0.0.1", resolve));
		const port = (coexistServer.address() as { port: number }).port;
		await new Promise<void>((resolve) => {
			const client = new WebSocket(`ws://127.0.0.1:${port}/other-hmr-path`);
			client.once("error", () => resolve());
			client.once("open", () => resolve());
		});
		expect(foreignSeen).toBe(true);
		// The terminal path still works on the same server.
		const term = new WebSocket(`ws://127.0.0.1:${port}/aili-terminal?token=${encodeURIComponent(token)}&cwd=${encodeURIComponent(cwd)}`);
		await new Promise<void>((resolve, reject) => {
			term.once("open", () => resolve());
			term.once("error", reject);
		});
		expect(manager.sessionCount).toBe(1);
		term.close();
		await waitFor(() => manager.sessionCount === 0);
		await new Promise<void>((resolve) => coexistServer.close(() => resolve()));
	});

	it("spawns a working shell, echoes input, and reaps the PTY on disconnect", async () => {
		const client = await openClient();
		const marker = `tl-live-${Date.now()}`;
		const outputDone = untilOutput(client, (text) => text.includes(marker));
		client.send(JSON.stringify({ t: "d", data: `echo ${marker}\n` }));
		const output = await outputDone;
		expect(output).toContain(marker);

		expect(manager.sessionCount).toBe(1);
		const [pid] = manager.sessionPids;
		expect(pid).toBeGreaterThan(0);

		client.close();
		await waitFor(() => manager.sessionCount === 0);
		// The PTY process must actually be gone, not just deregistered.
		await waitFor(() => !processAlive(pid));
	});

	it("echoes CJK input end to end (IME commit payload reaches the shell)", async () => {
		const client = await openClient();
		const marker = `你好世界-${Date.now()}`;
		const outputDone = untilOutput(client, (text) => text.includes(marker));
		client.send(JSON.stringify({ t: "d", data: `echo ${marker}\n` }));
		const output = await outputDone;
		expect(output).toContain(marker);
		client.close();
		await waitFor(() => manager.sessionCount === 0);
	});

	it("reconnect starts a clean session with no stale replay", async () => {
		const first = await openClient();
		const staleMarker = `tl-stale-${Date.now()}`;
		const firstDone = untilOutput(first, (text) => text.includes(staleMarker));
		first.send(JSON.stringify({ t: "d", data: `echo ${staleMarker}\n` }));
		await firstDone;
		first.close();
		await waitFor(() => manager.sessionCount === 0);

		const second = await openClient();
		const freshMarker = `tl-fresh-${Date.now()}`;
		const secondDone = untilOutput(second, (text) => text.includes(freshMarker));
		second.send(JSON.stringify({ t: "d", data: `echo ${freshMarker}\n` }));
		const output = await secondDone;
		expect(output).toContain(freshMarker);
		expect(output).not.toContain(staleMarker);
		second.close();
		await waitFor(() => manager.sessionCount === 0);
	});

	it("resize frames are accepted and garbage frames are ignored harmlessly", async () => {
		const client = await openClient();
		const marker = `tl-resize-${Date.now()}`;
		const outputDone = untilOutput(client, (text) => text.includes(marker));
		client.send("this is not json");
		client.send(JSON.stringify({ t: "resize", cols: 120, rows: 40 }));
		client.send(JSON.stringify({ t: "resize", cols: 99999, rows: 0 })); // out of bounds — ignored
		client.send(JSON.stringify({ t: "d", data: `echo ${marker}\n` }));
		await outputDone;
		client.close();
		await waitFor(() => manager.sessionCount === 0);
	});

	it("dispose kills live sessions and a restart yields a fresh token", async () => {
		const client = await openClient();
		const [pid] = manager.sessionPids;
		manager.dispose();
		await waitFor(() => !processAlive(pid));

		const secondToken = manager.ensureToken().token;
		expect(secondToken).not.toBe(token);
		// Re-attach after dispose (a fresh server in production) and verify a
		// clean session with the new token.
		const server2 = createServer((_request, response) => response.writeHead(404).end());
		manager.routeUpgrades(server2);
		await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
		const port2 = (server2.address() as { port: number }).port;
		const reopened = new WebSocket(`ws://127.0.0.1:${port2}/aili-terminal?token=${encodeURIComponent(secondToken)}&cwd=${encodeURIComponent(cwd)}`);
		await new Promise<void>((resolve, reject) => {
			reopened.once("open", () => resolve());
			reopened.once("error", reject);
		});
		const marker = `tl-after-dispose-${Date.now()}`;
		const outputDone = untilOutput(reopened, (text) => text.includes(marker));
		reopened.send(JSON.stringify({ t: "d", data: `echo ${marker}\n` }));
		await outputDone;
		reopened.close();
		await waitFor(() => manager.sessionCount === 0);
		await new Promise<void>((resolve) => server2.close(() => resolve()));
	});
});
