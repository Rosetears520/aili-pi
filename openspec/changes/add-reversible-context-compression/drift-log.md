# Drift Log — AILI Compact

## 2026-07-24 — Cache panel host-surface mismatch

- **Accepted contract:** a persistent, responsive, non-capturing side panel for AILI Compact cache telemetry.
- **Observed local host surface:** Pi 0.81.1 `ExtensionUIContext` exposes `setWidget()` only at `aboveEditor`/`belowEditor`; its public `custom()` surface is focus-capturing. Evidence: `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` (`setWidget`, `custom`).
- **Current bounded implementation:** an optional responsive, non-capturing below-editor widget controlled by `/aili-compact cache panel on|off`. It renders only numeric telemetry and hides on narrow terminals.
- **Why this is material:** a below-editor widget is not a right-side panel. Claiming it as exact side-panel parity would be false.
- **Options considered:**
  1. Accept the public-API widget fallback for Pi 0.81.1; or
  2. authorize a version-bound private TUI/prototype integration after a separate compatibility/risk review; or
  3. remove the persistent-panel requirement and retain footer + on-demand details only.
- **Decision:** **A accepted by the user in this session.** The responsive, non-capturing below-editor widget is now the accepted Pi 0.81.1 UI contract; no private TUI/prototype patch is authorized.
- **Effect:** core compression BUILD can continue. This decision does not change the separate public-release license blocker.

## 2026-07-25 — Pinned ACP source audit reopened incomplete parity work

- **Previously accepted claim:** the task ledger marked the base tools/commands/config, semantic projection, 100% GC, cache accounting and doctor integration as complete or substantially complete.
- **Observed exact source evidence:** `.worktrees/opencode-acp-v1.12.6/` was checked at tag `v1.12.6`, commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`, AGPL-3.0-or-later. Direct comparison found missing model-addressable references, recap projection, range/message modes, functional command/manual behavior, nested recompress/GC, adaptive policy/subagent gating and six-slot prompt semantics.
- **Current implementation evidence:** `src/runtime/aili-compact/index.ts` still accepts raw `entryIds`, the projector hides semantic source without inserting `block.summary`, several declared commands only display guidance, recap echoes caller text, config contains four booleans and prompt loading concatenates arbitrary Markdown files.
- **Upstream conflicts:** pinned ACP disables in-place tool output/input/error pruning due prefix-cache breakage; its `deep` search flag is not implemented by execute; several schema/default and batch-GC surfaces are stale. These are explicitly not parity targets.
- **Decision:** return the change from BUILD to DEFINE, preserve completed Pi-native base behavior, split/reopen every incomplete user-visible package, and require renewed acceptance of the revised final `test-plan.md` before BUILD resumes.
- **Custom prompt reconciliation:** retain default-off, bounded snapshot and no-write Pi safety boundaries, but change the target from arbitrary Markdown concatenation to six fixed semantic slots with project-over-global override and per-purpose system guidance.
- **Loophole-pass reconciliation:** read-only `aili.doc-researcher` and `aili.test-engineer` findings were integrated. The final draft rejects split-atom range boundaries, defines `v2`/`mNNNNNN`/`bNNNNNN`, command bounds, recap/decompression output limits, concrete config/protection/cache contracts, and starts a new epoch after every completed Pi compaction including AILI major GC.
- **License effect:** no AGPL source/prompt/schema/fixture/asset was copied. Public release remains blocked and direct adaptation still requires separate exact approval.

## 2026-07-25 — Public widget resize event unavailable

- **Accepted contract:** the Pi 0.81.1 below-editor widget should hide/reappear responsively without focus capture and rerender only for numeric state changes.
- **Observed host surface:** public `ExtensionUIContext.setWidget()` is non-capturing, but Pi 0.81.1 exposes no public terminal-resize Extension event. Width can be recomputed safely whenever AILI republishes status; exact immediate resize delivery cannot be proven without a private TUI/prototype hook.
- **Implemented evidence:** numeric-only presentation, narrow/visible/disabled width classification, stable numeric render keys, runtime same-key suppression and public below-editor `setWidget()` registration are covered locally.
- **Decision:** retain the public widget implementation and leave task 6.6/live resize explicitly Unverified. Do not add a private TUI/prototype patch or relabel helper-level evidence as real-host resize PASS.
- **Effect:** local private BUILD is otherwise complete. This one public-host evidence gap and the separate live/provider/license gates remain visible in `progress.txt` and the task ledger.

## 2026-07-25 — Public release route resolved as MIT/reference-only

- **Previous boundary:** private BUILD was complete, but public release remained blocked because ACP v1.12.6 is AGPL-3.0-or-later and the user had not selected a distribution route.
- **Decision:** the user approved retaining MIT, describing ACP only as the functional reference, and releasing the independently implemented Pi runtime as 0.1.11. Exact commit/license attribution is recorded in provenance/notices; no ACP source, prompt, schema, fixture or asset is distributed.
- **Release integration:** build from clean `origin/main@12af234`, preserve the already released persistent-Agent framework/live evidence, include only Compact runtime/tests/docs/provenance and required registration/version changes, then run fresh release gates before commit/push/publish/install.
- **Remaining evidence:** live provider quality/cache performance, unknown later context-handler ordering and Pi internal/resize delivery stay Unverified and are not converted to PASS by the license decision.
