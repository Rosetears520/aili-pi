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
