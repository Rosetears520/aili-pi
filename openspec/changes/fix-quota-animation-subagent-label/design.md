# Design: Quota, Sakura Animation, and Subagent Agent Label

## 1. Quota source and footer priority

`pi-quota-status@0.3.0` remains the sole quota source. Its pinned source already polls OpenAI Codex OAuth usage, parses primary `5h` and available secondary `weekly` windows, and publishes `ctx.ui.setStatus("pi-quota-status", ...)`. The observed active state contains current real quota, so forking or reimplementing the poller would add risk without fixing the display regression.

The regression is in Zentui selection: `pi-cache-stats` sorts before `pi-quota-status`, and the width fitter retains earlier right-side statuses first. The fix has two layers:

1. default `pi-cache-stats` placement becomes `off` while remaining user-configurable;
2. status sorting assigns `pi-quota-status` higher priority than ordinary statuses, so explicit cache re-enablement cannot hide quota at narrow width.

The active state demonstrates an upstream label drift: the dependency names the current primary segment `5h`, while its reset is about 5.6 days after observation. The footer therefore normalizes one canonical weekly segment without changing polling/state:

1. split the compact upstream status into dimension segments;
2. prefer an explicit `weekly`/`Wk`/`7d` segment;
3. if none exists, accept the current legacy `5h` primary segment as a compatibility fallback;
4. emit only the selected segment with its leading dimension label replaced by `codex`.

Percentage and reset tokens remain byte-for-byte display content after sanitization. If both labels exist, only explicit weekly is shown. Unknown/unavailable status text remains unchanged, and no second quota dimension is fabricated.

## 2. Sakura working/reasoning visuals and responsive Matrix coverage

`extensions/matrix/index.ts` already matches the pinned upstream animation except the required Pi 0.81.1 `session_before_switch` adaptation. Keep that compatibility difference at ordinary terminal widths.

The perceived empty columns have two different causes:

1. intentional upstream rhythm: tracks are placed every two cells, activated at default density 0.65, and spend part of each cycle above/below the four-line widget;
2. a responsive defect: `selected.slice(0, 96)` keeps the first 96 active tracks, so sufficiently wide terminals acquire a permanently empty right band.

Do not remove the intentional gaps or silently change default density. Replace only the overflowing prefix truncation with a deterministic bounded selector that samples across the complete candidate width. Widths whose active-track count does not exceed the existing budget must retain the exact upstream sequence. Very wide widths must retain a finite work budget while placing tracks in both the first and final width deciles. Rendering must continue to return exactly the requested visible cell width, and resize may deterministically reseed the pattern as before.

Restore `SAKURA_MACARON_STOPS` and fallback RGB in `extensions/zentui/gradient.ts` to the pinned Sakura values so `✦ REASONING` and `◇` markers match the same visual source. Rem header/editor/theme surfaces remain unchanged. The selected local `rem-cyberdeck` theme supplies a dark background close to the Matrix trail target; Package installation does not mutate user theme.

## 3. Subagent Agent label

AILI already wraps the pinned upstream `subagent` tool to inject credential protection. Extend only that wrapper's `renderCall`:

- preserve the upstream rendered call component as the second row;
- prepend `Agent: <name>` for a single run;
- prepend a bounded `Agents: <names>` summary for parallel tasks;
- use `agentless` for a runnable task with no named Agent;
- omit the header for lifecycle-only actions (`status`, `logs`, `wait`, `interrupt`, `mark-background`, `reconcile`).

Requested names are presentation data, not proof of successful agent resolution. Normalize control characters/whitespace, cap individual and aggregate display lengths, and never include task text. Tool schema, execution, result, async lifecycle, permissions, and artifacts remain upstream-owned.

## 4. Evidence and provenance

Update focused tests for status coexistence/priority, exact Sakura stops, normal-width Matrix parity, ultra-wide coverage, visible-width correctness, and single/parallel/agentless/lifecycle renderer behavior. Update provenance/NOTICE to describe the display/responsive adaptations while retaining exact upstream versions. No dependency or lockfile change is expected.
