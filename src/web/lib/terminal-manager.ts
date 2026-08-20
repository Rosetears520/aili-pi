// AILI-owned user terminal manager (webui-user-terminal, design decision 5).
//
// A browser terminal for the USER's own shell over a WebSocket + PTY. This is
// deliberately NOT the agent bash tool: it runs under the user's own
// privileges, outside agent tool authorization and permission modes, and is
// labeled "User controlled" in the UI.
//
// Architecture: the WebSocket rides the SAME origin and port as the web app —
// bin/pi-web.js spawns the stock Next server (no custom-server hook), so
// src/web/instrumentation.ts captures the server's 'upgrade' events (the
// proven next-ws emit-hook pattern) and routes /aili-terminal here. This
// keeps the transport reachable wherever the app itself is reachable (WSL2
// Windows→WSL forwarding included) instead of depending on a second,
// dynamically-allocated port. The API route validates cwd against
// allowed-roots and issues a per-boot token; the upgrade re-validates token +
// Origin + cwd and fails closed otherwise.
//
// Lifecycle: one PTY per connection; PTY killed on socket close, error, or
// manager dispose (server shutdown); reconnect starts a clean session with no
// stale replay. Output writes are dropped under backpressure instead of
// accumulating unbounded buffers.

import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "node-pty";
import type { IPty } from "node-pty";

export const TERMINAL_WS_PATH = "/aili-terminal";

/** Single-user workbench guard; the contract says one terminal first. */
const MAX_SESSIONS = 8;
/** Drop output while the socket has more than this pending (backpressure). */
const MAX_BUFFERED_OUTPUT = 256 * 1024;
/** Upper bounds for client-driven resize. */
const MIN_COLS = 2;
const MAX_COLS = 500;
const MIN_ROWS = 2;
const MAX_ROWS = 300;
/** Max bytes of terminal input accepted per control frame. */
const MAX_INPUT_FRAME = 16 * 1024;

export interface TerminalSessionInfo {
	path: string;
	token: string;
}

interface TerminalSession {
	pty: IPty;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLoopbackHostname(hostname: string): boolean {
	const bare = hostname.replace(/^\[|\]$/g, "");
	return LOOPBACK_HOSTNAMES.has(hostname) || LOOPBACK_HOSTNAMES.has(bare);
}

function resolveShell(): string {
	const override = process.env.AILI_TERMINAL_SHELL?.trim();
	if (override) return override;
	return process.env.SHELL?.trim() || "/bin/bash";
}

type UpgradeVerdict = 0 | 400 | 403;

export class TerminalManager {
	private wss: WebSocketServer | null = null;
	private token = "";
	private readonly attachedServers = new Set<HttpServer>();
	private readonly sessions = new Map<WebSocket, TerminalSession>();

	/** The noServer ws pool is recreated after a dispose so a restarted process graph keeps working. */
	private ensureWss(): WebSocketServer {
		if (!this.wss || this.wss.clients === undefined) {
			this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_INPUT_FRAME + 1024 });
		}
		return this.wss;
	}

	/** Issue (once per manager) the token the validated API route hands out. */
	ensureToken(): TerminalSessionInfo {
		if (!this.token) {
			this.token = randomUUID();
			// Best-effort reaping on server exit; children also die with the
			// parent process, this closes the gap for graceful shutdowns.
			process.once("exit", () => this.dispose());
		}
		return { path: TERMINAL_WS_PATH, token: this.token };
	}

	/**
	 * Take over an http server's upgrade routing (idempotent per server).
	 *
	 * Next's start-server installs its own 'upgrade' listener when the server
	 * is created — before listen and long before this manager exists — and it
	 * destroys upgrade requests it does not know. Attaching alongside it is
	 * therefore not enough: we capture the server's existing listeners,
	 * remove them, and install one dispatcher that routes TERMINAL_WS_PATH to
	 * the terminal and delegates every other path to the captured listeners
	 * unchanged (dev HMR included). With no other listener, foreign paths keep
	 * Node's default destroy behavior.
	 */
	routeUpgrades(server: HttpServer): void {
		if (this.attachedServers.has(server)) return;
		this.attachedServers.add(server);
		const existing = server.listeners("upgrade") as ((request: IncomingMessage, socket: Duplex, head: Buffer) => void)[];
		server.removeAllListeners("upgrade");
		server.on("upgrade", (request, socket, head) => {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			if (url.pathname === TERMINAL_WS_PATH) {
				this.handleUpgrade(request, socket, head);
				return;
			}
			if (existing.length === 0) {
				socket.destroy();
				return;
			}
			for (const listener of existing) listener.call(server, request, socket, head);
		});
	}

	/** Terminal upgrade entry: fail-closed admission then the ws handshake. */
	handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const verdict = this.admitUpgrade(url, request.headers.origin);
		if (verdict !== 0) {
			const reason = verdict === 403 ? "403 Unauthorized" : "400 Bad Request";
			socket.write(`HTTP/1.1 ${reason}\r\nConnection: close\r\n\r\n`);
			socket.destroy();
			return;
		}
		this.ensureWss().handleUpgrade(request, socket, head, (ws) => this.handleConnection(ws, request));
	}

	/**
	 * Fail-closed admission: token + loopback Origin (when present) + absolute
	 * cwd. 403 = identity failures (token/Origin), 400 = malformed target.
	 */
	private admitUpgrade(url: URL, origin: string | undefined): UpgradeVerdict {
		if (!this.token || url.searchParams.get("token") !== this.token) return 403;
		if (origin) {
			try {
				if (!isLoopbackHostname(new URL(origin).hostname)) return 403;
			} catch {
				return 403;
			}
		}
		const cwd = url.searchParams.get("cwd") ?? "";
		return cwd.startsWith("/") && !cwd.includes("\0") ? 0 : 400;
	}

	private handleConnection(ws: WebSocket, request: IncomingMessage): void {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (this.sessions.size >= MAX_SESSIONS) {
			ws.close(1013, "too many terminals");
			return;
		}
		const cwd = url.searchParams.get("cwd") ?? "";

		let pty: IPty;
		try {
			pty = spawn(resolveShell(), [], {
				name: "xterm-256color",
				cols: 80,
				rows: 24,
				cwd,
				env: process.env as unknown as { [key: string]: string },
			});
		} catch {
			ws.close(1011, "terminal spawn failed");
			return;
		}

		this.sessions.set(ws, { pty });

		pty.onExit(({ exitCode }) => {
			this.sessions.delete(ws);
			// The exit is visible in the terminal itself (why did my shell die)
			// and carried in the close reason for the client status line.
			if (ws.readyState === WebSocket.OPEN) {
				try {
					ws.send(`\r\n\x1b[31m[process exited: code ${exitCode}]\x1b[0m\r\n`);
				} catch {
					// send after close races are harmless
				}
				ws.close(1000, `exit ${exitCode}`);
			}
		});
		pty.onData((data) => {
			if (ws.readyState !== WebSocket.OPEN) return;
			// Bound memory: under backpressure drop output rather than queue it.
			if (ws.bufferedAmount > MAX_BUFFERED_OUTPUT) return;
			try {
				ws.send(data);
			} catch {
				// a malformed frame must not kill the session; the next one carries on
			}
		});

		ws.on("message", (raw) => {
			let frame: unknown;
			try {
				frame = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
			} catch {
				return;
			}
			if (typeof frame !== "object" || frame === null) return;
			const message = frame as Record<string, unknown>;
			if (message.t === "d" && typeof message.data === "string" && message.data.length <= MAX_INPUT_FRAME) {
				pty.write(message.data);
				return;
			}
			if (message.t === "resize") {
				const cols = Number(message.cols);
				const rows = Number(message.rows);
				if (Number.isInteger(cols) && Number.isInteger(rows) && cols >= MIN_COLS && cols <= MAX_COLS && rows >= MIN_ROWS && rows <= MAX_ROWS) {
					try {
						pty.resize(cols, rows);
					} catch {
						// resize before the pty is fully ready — the next fit retries
					}
				}
			}
		});

		const teardown = () => {
			this.sessions.delete(ws);
			try {
				pty.kill();
			} catch {
				// already exited
			}
		};
		ws.on("close", teardown);
		ws.on("error", teardown);
	}

	dispose(): void {
		for (const session of this.sessions.values()) {
			try {
				session.pty.kill();
			} catch {
				// already exited
			}
		}
		this.sessions.clear();
		this.attachedServers.clear();
		if (this.wss) {
			for (const client of this.wss.clients) client.terminate();
			this.wss.close();
			this.wss = null;
		}
		// Rotate: tokens from the disposed era must stop working.
		this.token = "";
	}

	get sessionCount(): number {
		return this.sessions.size;
	}

	/** Live PTY process ids — used by lifecycle tests to assert reaping. */
	get sessionPids(): number[] {
		return [...this.sessions.values()].map((session) => session.pty.pid);
	}
}

declare global {
	// eslint-disable-next-line no-var
	var __ailiTerminalManager: TerminalManager | undefined;
}

/** One manager per server process (dev hot-reload safe via globalThis). */
export function getTerminalManager(): TerminalManager {
	if (!globalThis.__ailiTerminalManager) globalThis.__ailiTerminalManager = new TerminalManager();
	return globalThis.__ailiTerminalManager;
}
