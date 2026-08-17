## Why

The Web UI now ships the complete upstream `pi-web@0.8.8` application. Live verification confirmed all 27 AILI extension commands (including the four permission modes) already reach the web slash menu through the official SDK session loader, but they remain command-line-only: there is no one-click mode switch, no always-visible mode indicator next to the conversation, no visualization for the absorbed capabilities (BTW, Analytics, Stamp) or the persistent-Agent task hub, and no branded quick-start command (`npx @rosetears/aili-pi web`) matching the upstream `npx @agegr/pi-web` experience.

## What Changes

- Add a permission-mode chip in the web composer's left control cluster that shows the current mode (journal-seeded before the first extension status arrives, always visible including while streaming), opens the four shipped modes (plus `permission-mode.json` custom modes) as a menu, and switches modes by invoking the same `/perm` extension pathway — no permission logic is duplicated in the web layer. Add a mode-cycling shortcut (default `alt+m`, mirroring the TUI) active only outside text inputs that computes the next mode from the cycle order, updates the chip optimistically, and suppresses the self-issued `/perm` echo from the transcript so switching feels as direct as the TUI's `alt+m`.
- Add opencode-style configurable web keybinds: a `keybinds` mapping (action id → one or more keys, `"none"` disables) editable through a web settings dialog and a persisted config file under the Pi agent directory, with validation and per-entry fallback to defaults.
- Restyle the composer by copying the published aicss AI Agent Input code and adapting it (2026-08-15 user authorization; site publishes free copy-paste components) with the reference bottom-row layout — left cluster: image attach then the permission-mode chip; right cluster: tool preset, compact action, thinking level, model selector, and a circular arrow-up send — and restyle chat code blocks by copying the published aicss Code Block code (language header, copy confirmation, line-number gutter) while preserving upstream input internals, syntax highlighting, KaTeX, and Mermaid.
- Replace the overlay changes inspector with a dedicated VS Code-style `/changes` page opened in a new tab from the top bar (right of the system-prompt entry) and the changes keybind: repository-relative file paths, per-file +/− statistics from Git numstat (no file-content reads), on-demand per-file patch loading in both the working-tree and versus-upstream scopes (both returning real patch content, fixing the `+0 −0` regressions), row-capped diff rendering for large files, and a read-only local-versus-upstream comparison with truthful unavailable states. The F8 File Context extension remains the TUI owner of git provenance; the page reuses upstream Git routes and allowed-roots enforcement.
- Surface Stamp timing metadata inside the conversation: assistant messages render message timestamps, turn duration, and Pi-reported usage/cost from out-of-context Stamp entries; unavailable values render as placeholders, never fabricated.
- Add a BTW floating side-thread dialog (Codex-style popover opened from the composer): explicit model/thinking selection, isolated side Q&A, preview-then-confirm bring-to-main through the normal send path, and no implicit main-session mutation.
- Replace the composer's image attach button with a single Plus button opening one server-side file browser (aicss AI Agent Input reference): unified file access policy (session/project/`~/pi-cwd-*` roots plus `AILI_WEB_FILE_ROOTS` and WSL drvfs `/mnt/[a-z]` drive mounts, canonicalize/realpath containment everywhere, no per-entry exceptions), address bar with CWD/Home/Windows-drive quick entries, image files attaching through the existing flow while every other file inserts its absolute path at the cursor, and whole-paste WSL path normalization (`C:\…` → `/mnt/c/…`, same-distro `\\wsl$`/`\\wsl.localhost` UNC → Linux path).
- Add an `aili-pi` executable with a `web` subcommand that runs the same foreground web server as `pi-web` (loopback default, fail-closed non-loopback, packaged-build checks, signal-safe, no orphan processes) and prints its address; `npx @rosetears/aili-pi web` works on a clean install. The existing `pi-web` bin is retained as an alias. An optional `--open` flag opens the browser after readiness.
- All web changes are minimal recorded patches on top of the upstream application tree; the AILI BFF under `/api/runtime/v1` and the launcher process contract are unchanged.

## Capabilities

### New Capabilities

- `web-permission-mode-control`: Composer mode chip with journal-seeded display, menu switching through the `/perm` extension pathway, direct-feel mode-cycling shortcut (default `alt+m`, optimistic update, no transcript echo), and truthful mode/sandbox-degradation indication.
- `web-composer-restyle`: aicss-referenced composer and code-block visual restyle with the reference bottom-row layout, preserving upstream input internals and rendering pipelines.
- `web-custom-keybinds`: opencode-style configurable web shortcuts with validation, `"none"` disabling, and per-entry default fallback.
- `web-change-inspector`: Dedicated `/changes` page with relative paths, numstat statistics, on-demand patches, capped diff rendering, and read-only local-versus-remote comparison over the upstream Git routes.
- `web-absorbed-capability-panels`: In-conversation Stamp metadata, BTW floating side-thread dialog, Analytics floating dialog, and the persistent-Agent hub drawer, each consuming only the owning AILI runtime service.
- `web-file-interaction`: Single Plus file picker over the unified file access policy with WSL drive roots and paste normalization; images attach, other files insert absolute paths.
- `aili-pi-web-launch-command`: The `aili-pi web` foreground launch entry matching upstream's quick-start ergonomics without changing the existing launcher semantics.

### Modified Capabilities

- None in this repository's baseline; the prior change-local contracts for deferred Web parity (BTW/Stamp tasks 7.5/9.4) are satisfied by these new capabilities when accepted; the user dropped the Analytics dialog and hub drawer from scope on 2026-08-15.

## Impact

- **Web application:** targeted patches to the upstream composer toolbar, status/message rendering, and one dialog/drawer host; every patch is listed in the adaptation inventory.
- **Extension/runtime:** permission modes, BTW, and Stamp expose read/command surfaces the web layer consumes; their logic owners are unchanged.
- **Package:** `package.json` gains the `aili-pi` bin (plus retained `pi-web`), README quick-start section, and no new runtime dependencies.
- **Testing:** unit tests for chip/menu/shortcut state, dialog data mapping, and bin argument parsing; integration tests extending the existing foreground lifecycle suite for the new subcommand.
- **Non-goals:** no new permission logic in the web layer, no model-context injection of web assets, no second Agent runtime, no copied upstream UI rewrite beyond the recorded patches.
