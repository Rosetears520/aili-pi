import { createReadStream, readSync, writeSync } from "node:fs";
import { redactedWebDiagnostic } from "../runtime/web/access-policy.js";
import { createProductionForegroundComposition, type ForegroundRuntimeComposition } from "./server/foreground-composition.js";
import { installAiliWebBffBridge } from "./server/private-bff-bridge.js";

const REGISTER_SYMBOL = Symbol.for("@rosetears/aili-pi/foreground-runtime-register/v1");
type RegisterGlobal = Record<symbol, Promise<InstalledForegroundRuntime> | undefined>;

interface InstalledForegroundRuntime {
  readonly composition: ForegroundRuntimeComposition;
  dispose(): Promise<void>;
}

/** Next's supported process-root hook. Exactly one bridge is installed per Next process. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { configureHttpDispatcher } = await import("./lib/http-dispatcher.js");
  configureHttpDispatcher();
  // Attachment cache GC: one light pass per server boot, never blocking readiness.
  const { collectGarbage, setSessionProbe } = await import("./lib/attachment-store.js");
  const { resolveSessionPath } = await import("./lib/session-reader.js");
  setSessionProbe((session) => resolveSessionPath(session).then((found) => found !== null).catch(() => false));
  void collectGarbage().catch((error) => {
    process.stderr.write(`pi-web attachment GC failed: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  const target = globalThis as unknown as RegisterGlobal;
  target[REGISTER_SYMBOL] ??= installFromInheritedChannels();
  await target[REGISTER_SYMBOL];
  await installTerminalUpgradeHook();
}

/**
 * User terminal transport (webui-user-terminal): the WebSocket rides the
 * stock Next server's own port — patch http.Server.prototype.listen once and
 * attach the terminal manager's upgrade handler to every http server that
 * starts listening after this point. Next awaits register() before the
 * server listens, so the patch is installed in time; the handler is
 * path-guarded (/aili-terminal) and token/Origin/cwd fail-closed inside the
 * terminal manager, and foreign upgrade paths keep Node's default behavior
 * unless another listener (e.g. dev HMR) claims them.
 */
async function installTerminalUpgradeHook(): Promise<void> {
  const [{ getTerminalManager }, { Server }] = await Promise.all([
    import("./lib/terminal-manager"),
    import("node:http"),
  ]);
  const manager = getTerminalManager();

  // Next's start-server has ALREADY created and listened its http server by
  // the time instrumentation register runs, so a listen-patch alone would
  // never see it. Retro-actively take over every already-listening http
  // server's upgrade routing...
  for (const handle of (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? []) {
    if (handle instanceof Server && handle.listening) {
      try {
        manager.routeUpgrades(handle);
      } catch {
        // one unaffected server must not block the others
      }
    }
  }

  // ...and keep the listen patch for any http server created later (dev).
  type PatchedServer = import("node:http").Server & { __ailiTerminalUpgradePatched?: boolean };
  const proto = Server.prototype as PatchedServer;
  if (proto.__ailiTerminalUpgradePatched) return;
  proto.__ailiTerminalUpgradePatched = true;
  const originalListen = proto.listen.bind(proto);
  proto.listen = function patchedListen(this: PatchedServer, ...args: Parameters<import("node:http").Server["listen"]>) {
    const result = Reflect.apply(originalListen, this, args) as ReturnType<import("node:http").Server["listen"]>;
    try {
      getTerminalManager().routeUpgrades(this);
    } catch {
      // terminal transport stays unavailable; the app server is unaffected
    }
    return result;
  } as import("node:http").Server["listen"];
}

async function installFromInheritedChannels(): Promise<InstalledForegroundRuntime> {
  const identity = readOneUseIdentity(3);
  let composition: ForegroundRuntimeComposition | undefined;
  try {
    composition = await createProductionForegroundComposition(identity);
  } finally {
    identity.fill(0);
  }
  let uninstallBridge: () => void;
  try { uninstallBridge = installAiliWebBffBridge(composition); }
  catch (error) { await composition.dispose().catch(() => undefined); throw error; }
  let disposePromise: Promise<void> | undefined;
  // Node child "pipes" are socketpairs on Linux; /proc/self/fd cannot reopen
  // them, so the parent-liveness channel must read the inherited fd directly.
  const parentMonitor = createReadStream("/proc/self/fd/5", { fd: 5, autoClose: true });
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  const dispose = (): Promise<void> => {
    if (disposePromise) return disposePromise;
    disposePromise = (async () => {
      parentMonitor.destroy();
      for (const [signal, handler] of signalHandlers) process.off(signal, handler);
      uninstallBridge();
      await composition.dispose();
    })();
    return disposePromise;
  };
  const shutdown = (code: number) => {
    void dispose().then(() => process.exit(code), (error) => {
      process.stderr.write(`pi-web Runtime cleanup: ${redactedWebDiagnostic(error)}\n`);
      process.exit(1);
    });
  };
  parentMonitor.once("error", (error) => {
    process.stderr.write(`pi-web Runtime: parent channel error: ${redactedWebDiagnostic(error)}\n`);
    shutdown(1);
  });
  parentMonitor.once("end", () => {
    process.stderr.write("pi-web Runtime: parent channel closed; stopping\n");
    shutdown(1);
  });
  parentMonitor.resume();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const handler = () => shutdown(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  process.once("uncaughtExceptionMonitor", () => { void dispose().catch((error) => process.stderr.write(`pi-web Runtime cleanup: ${redactedWebDiagnostic(error)}\n`)); });
  process.once("unhandledRejection", () => { void dispose().catch((error) => process.stderr.write(`pi-web Runtime cleanup: ${redactedWebDiagnostic(error)}\n`)); });
  try {
    writeSync(4, `${JSON.stringify({ schemaVersion: 1, status: "runtime-ready" })}\n`);
  } catch (error) {
    await dispose();
    throw new Error(`private Runtime readiness channel failed: ${redactedWebDiagnostic(error)}`);
  }
  return Object.freeze({ composition, dispose });
}

function readOneUseIdentity(fd: number): Buffer {
  const identity = Buffer.alloc(32);
  let offset = 0;
  try {
    while (offset < identity.byteLength) {
      const count = readSync(fd, identity, offset, identity.byteLength - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const trailing = Buffer.alloc(1);
    try {
      if (offset !== identity.byteLength || identity.every((byte) => byte === 0)
        || readSync(fd, trailing, 0, 1, null) !== 0) throw new Error("foreground Runtime identity was rejected");
    } finally { trailing.fill(0); }
    return identity;
  } catch (error) {
    identity.fill(0);
    try { writeSync(4, `${JSON.stringify({ schemaVersion: 1, status: "failed", reason: redactedWebDiagnostic(error) })}\n`); } catch { /* launcher reports the bounded startup failure */ }
    throw error;
  }
}
