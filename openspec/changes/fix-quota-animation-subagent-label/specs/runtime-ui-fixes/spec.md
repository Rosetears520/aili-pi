## ADDED Requirements

### Requirement: Codex quota wins the bounded footer status area
The Zentui footer SHALL display the active `pi-quota-status` value ahead of cache statistics. `pi-cache-stats` SHALL be off by default but remain explicitly user-configurable. When both are enabled and space is bounded, quota SHALL be retained first.

#### Scenario: Quota and cache statuses coexist
- **WHEN** `pi-quota-status` and `pi-cache-stats` both publish non-empty values
- **THEN** the footer presents quota first and does not replace it with cache statistics at narrow width

### Requirement: One canonical Codex weekly quota is shown
For `pi-quota-status` only, the display SHALL emit one Codex weekly segment as `codex <percent> <reset>`. It SHALL prefer explicit `weekly`/`Wk` data and SHALL use the dependency's legacy `5h`-labeled primary segment only when explicit weekly data is absent. It SHALL preserve the selected upstream percentage/reset text and SHALL NOT display duplicate `codex`/`7d` windows.

#### Scenario: Explicit weekly and legacy primary both exist
- **WHEN** upstream publishes `5h 80% 1:00PM · Wk 37% 9:49AM (29/07)`
- **THEN** Zentui displays only `codex 37% 9:49AM (29/07)`

#### Scenario: Only the legacy-mislabeled primary exists
- **WHEN** upstream publishes `5h 37% 9:49AM (29/07)` and no explicit weekly segment
- **THEN** Zentui displays only `codex 37% 9:49AM (29/07)` as the compatibility fallback

### Requirement: Working and reasoning visuals use the pinned Sakura animation palette
Matrix trail values and Zentui reasoning-gradient stops SHALL match `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589`, except for documented Pi 0.81.1 lifecycle/import compatibility adaptations. Other Rem UI surfaces SHALL remain Rem.

#### Scenario: Reasoning trail renders
- **WHEN** Pi renders a thinking block through the Zentui decorator
- **THEN** `✦ REASONING` and `◇` use the exact pinned Sakura gradient stops

### Requirement: Matrix remains responsive across terminal cell widths
At ordinary widths, Matrix track selection SHALL preserve the pinned Sakura sequence and intentional sparse waterfall gaps. When the active-track count exceeds the bounded rendering budget, selection SHALL cover the complete terminal width instead of truncating to a left prefix. Every rendered line SHALL have exactly the requested visible cell width.

#### Scenario: Ultra-wide Matrix renders
- **WHEN** the widget renders at 320 or more terminal cells and candidate tracks exceed the rendering budget
- **THEN** bounded deterministic tracks occur in both the first and final width deciles with no permanently empty right band caused by prefix truncation

#### Scenario: Ordinary Matrix renders
- **WHEN** the active-track count is within the existing 96-track budget
- **THEN** drop positions and sparse timing remain identical to the pinned Sakura algorithm

### Requirement: Subagent run calls identify requested Agents
The AILI subagent wrapper SHALL prepend a sanitized and bounded Agent label above the upstream run-call renderer. It SHALL show requested Agent names for single/parallel runs and `agentless` where no Agent was requested. Lifecycle-only actions SHALL not claim an Agent.

#### Scenario: Named parallel tasks render
- **WHEN** a parallel subagent call contains multiple task-level Agent names
- **THEN** the header lists a bounded summary of those requested names above the unchanged upstream call component

#### Scenario: Lifecycle action renders
- **WHEN** the tool call is `status`, `logs`, `wait`, `interrupt`, `mark-background`, or `reconcile`
- **THEN** no Agent header is added because no new Agent is being selected
