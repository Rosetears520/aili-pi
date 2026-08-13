import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface NotifyEnvironment {
  TERM_PROGRAM?: string;
  TERM?: string;
  TMUX?: string;
  WT_SESSION?: string;
}

export interface NotifyEffects {
  write(value: string): void;
  spawn(command: string, args: readonly string[]): { on?(event: "error", listener: () => void): unknown } | void;
}

const defaultEffects: NotifyEffects = {
  write(value) { process.stdout.write(value); },
  spawn(command, args) {
    // Import lazily so loading the extension never requires a desktop runtime.
    void import("node:child_process").then(({ spawn }) => {
      try { spawn(command, [...args], { detached: true, stdio: "ignore" }).unref(); } catch { /* notification is advisory */ }
    }).catch(() => undefined);
  },
};

function text(value: string): string {
  // OSC fields are terminal control data, not a transcript channel.
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/;/g, ",").trim().slice(0, 240) || "Pi";
}

export function osc777(title: string, message: string): string {
  return `\x1b]777;notify;${text(title)};${text(message)}\x07`;
}

export function osc9(message: string): string {
  return `\x1b]9;${text(message)}\x07`;
}

export function osc99(title: string, message: string): string {
  return `\x1b]99;i=1:d=0:p=body;${text(title)}: ${text(message)}\x07`;
}

export function tmuxPassthrough(sequence: string): string {
  return `\x1bPtmux;\x1b${sequence}\x1b\\`;
}

function powershellToast(title: string, message: string): string {
  const escape = (value: string) => value.replace(/'/g, "''");
  // Keep this self-contained: no module install, profile loading, or user config.
  return `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${escape(text(title))}</text><text>${escape(text(message))}</text></binding></visual></toast>'); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pi').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
}

/**
 * Deliver one best-effort terminal notification. Every effect is independently
 * guarded because completion notification must never affect a Pi turn.
 */
export function notifyParentCompletion(
  title = "Pi",
  message = "Agent finished",
  environment: NotifyEnvironment = process.env,
  effects: NotifyEffects = defaultEffects,
): void {
  const safeWrite = (value: string) => { try { effects.write(value); } catch { /* advisory */ } };
  const safeSpawn = () => {
    try {
      const child = effects.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", powershellToast(title, message)]);
      child?.on?.("error", () => undefined);
    } catch { /* advisory */ }
  };

  if (environment.WT_SESSION) safeSpawn();
  const sequence = environment.TERM === "xterm-kitty"
    ? osc99(title, message)
    : environment.TERM_PROGRAM === "iTerm.app"
      ? osc9(message)
      : osc777(title, message);
  safeWrite(environment.TMUX ? tmuxPassthrough(sequence) : sequence);
  // BEL is the upstream sound fallback and is harmless when a terminal disables it.
  safeWrite("\x07");
}

/** Parent-only registration: child Persistent sessions load an explicit inline
 * extension set and never include this top-level integration, preventing storms. */
export function registerPiNotify(pi: ExtensionAPI): void {
  pi.on("agent_end", () => {
    try { notifyParentCompletion(); } catch { /* a notification cannot fail Pi */ }
  });
}
