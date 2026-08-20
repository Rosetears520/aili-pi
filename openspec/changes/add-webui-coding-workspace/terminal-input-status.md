# Terminal input — investigation status (suspended 2026-08-20)

The user suspended browser-terminal work after ROUND-20 with keyboard input
still dead in their browser. This file records exactly what is known, what was
fixed, what is suspected, and how to resume. Implementation itself
(`terminal-manager.ts`, `instrumentation.ts`, `/api/terminal`,
`TerminalPanel.tsx`) stays in the tree and behind the 终端 button.

## Verified working (evidence)

- Transport: the WebSocket rides the app's own port (upgrade-route takeover of
  Next's server). The shell PROMPT RENDERS in the user's browser — output path
  browser←ws←PTY is proven live (user: "现在有画面显示了").
- Server side: real-PTY integration tests 11/11, including CJK round-trip
  (`echo 你好世界` marker), lifecycle reaping (`kill(pid,0)` checks), clean
  reconnect, pre-handshake fail-closed 403/400, and Next-coexistence upgrade
  delegation. Full suite 662/662 at last run.
- Security contract: token + loopback-Origin + absolute-cwd admission before
  the handshake; loopback-host-gated issue route; no agent-runtime coupling
  (negative assertions).

## Broken (user browser, still)

Keystrokes never reach `terminal.onData`: DevTools showed NO outgoing WS
frames while typing (ROUND-18 diagnosis), and after ROUND-19/20 fixes BOTH the
Chinese-IME commit path AND direct-English typing still produce nothing.

## Root causes found and fixed along the way (all real, none final)

1. Separate ephemeral ws port unreachable from the Windows browser →
   same-origin transport (ROUND-16).
2. Next's own upgrade listener destroyed terminal upgrades; instrumentation
   listen-patch ran too late → listener takeover via `routeUpgrades` +
   retro-attach of the already-listening server (ROUND-17). This is what made
   the prompt appear.
3. `AiliKeybindSettings` capture-state leak: a window-level capture-phase
   keydown listener survived popover close and preventDefaulted EVERY key
   page-wide (external code review of 944e6c6). Fixed + regression-tested
   (ROUND-19). This matched all symptoms at the time.
4. Status overlays ate clicks (missing `pointerEvents:"none"`) and terminal
   z-index sat under other overlays → fixed (70→600) (ROUND-18/19).
5. IME commits not delivered by xterm's onData → direct `compositionend`
   forwarding with dedupe (ROUND-20).

## Suspected remaining causes (ranked)

1. **Focus never lands on xterm's hidden textarea in the user's browser.**
   Everything still failing — including the compositionend fallback, which
   itself requires the textarea to receive composition events, i.e. focus —
   is consistent with keystrokes (and composition) targeting something else
   or nothing. Why focus calls/clicks would fail silently is unexplained;
   candidates: xterm CSS chunk not applied in the production build (helpers
   textarea positioning), a browser-specific quirk of the user's
   Windows↔WSL setup, or focus being stolen by another surface right after
   the terminal gains it.
2. **Another page-level key listener still swallowing keys before the
   textarea.** The audited ones (keybinds, useKeyboardShortcuts, AppShell
   Escape) are input-safe; not every listener in the tree has been audited
   (PWA, mobile bridges, third-party components).
3. **xterm@5.5-specific input regression in this environment.** PiChamber
   avoided the class entirely by using ghostty-web (WASM terminal with native
   input) — a different dependency stack than our approved set.

## Ruled out

Server/PTY/ws (proven by tests and by the rendered prompt); the keybind leak
(fixed + tested); overlay/z-index interference (fixed); IME commit delivery
(fallback added); permission-mode/agent coupling (never existed).

## How to resume (diagnostic order)

1. On the broken page, DevTools console: `document.activeElement` — what has
   focus while the terminal is open, right after opening, and after clicking
   inside the terminal.
2. `document.querySelector('.xterm-helpers textarea')` — exists? After
   clicking the terminal, is it `=== document.activeElement`?
3. Check the xterm CSS actually applies: computed dimensions of `.xterm`
   rows/cells; verify the static `@xterm/xterm/css/xterm.css` chunk is in the
   served bundle.
4. Dispatch a synthetic keystroke to the textarea (`el.dispatchEvent(new
   KeyboardEvent('keydown', {key: 'a'}))`) and watch the WS Messages tab.
5. If all local paths look right, add the real browser E2E from the external
   review (full keypress→xterm→ws→PTY chain + the keybind-leak scenario).
