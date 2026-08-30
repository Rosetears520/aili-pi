## Purpose

Upgrade AILI to exact official Pi 0.84.4 and Pi Web 0.8.11 while selectively adopting compatible improvements and preserving AILI-owned runtime, security, memory, prompt and Agent behavior.

## ADDED Requirements

### Requirement: Exact Pi 0.84.4 baseline
The repository SHALL resolve `@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, and `pi-tui` to exact 0.84.4 for development and Web runtime compatibility. Runtime guards, generated manifests, package assertions and documentation MUST identify 0.84.4 consistently, while the Pi-host peer dependency remains the documented wildcard host exception.

#### Scenario: Dependency graph is upgraded
- **WHEN** dependencies are installed from the accepted package manifest
- **THEN** all direct and resolved official Pi packages use the 0.84.4 release line without a second 0.84.2/0.84.3 runtime copy

#### Scenario: Host version is incompatible
- **WHEN** an AILI Web runtime attempts mutable startup under an unsupported Pi host
- **THEN** it fails before session mutation and reports the expected and observed versions

### Requirement: Pi 0.84.4 behavior is integrated without replacing AILI owners
The system SHALL consume applicable Pi 0.84.4 public behavior for UI prompt events, RPC queue clearing, image MIME detection, resume safety, message ordering and compaction sequencing. It MUST preserve AILI's InteractionBroker, Prompt Middleware, Observational Memory, provider-route, retry, compaction and persistent-Agent ownership.

#### Scenario: Extension waits for user UI
- **WHEN** Prompt Middleware, questionnaire, permission or model selection opens `ctx.ui`
- **THEN** `ui_prompt_start`/`ui_prompt_end` observability distinguishes waiting from active Agent work without consuming or duplicating pending state

#### Scenario: RPC queue is cleared
- **WHEN** the Web Gateway invokes the supported queue-clear action
- **THEN** queued steering/follow-up messages are returned and removed through the official runtime owner, with private request identity and writer admission preserved

#### Scenario: Large tool result crosses compaction threshold
- **WHEN** Pi compacts between tool execution and the next assistant response
- **THEN** the existing side-effect-only memory checkpoint runs before compaction, raw tool output remains excluded, and no AILI compaction owner or result is changed

### Requirement: Exact Pi Web 0.8.11 source evidence
Pi Web adaptation SHALL be based on exact `@agegr/pi-web@0.8.11` evidence with npm gitHead, release-tag revision, npm integrity/tarball hash, Git archive hash, MIT notice and imported-tree inventory. The previous 0.8.9 snapshot SHALL remain historical evidence and MUST NOT be silently overwritten.

#### Scenario: Source snapshot is imported
- **WHEN** the 0.8.11 source baseline enters the repository
- **THEN** its path, file count, tree hash, exclusions, npm/git identity distinction and adaptation boundary are recorded before implementation uses it; 0.8.11 is marked active, 0.8.9 remains historical, and neither source snapshot is included in npm package contents

### Requirement: Existing AILI Web ownership is preserved
The Web application SHALL retain one AILI Runtime Gateway/BFF mutation owner, private request IDs, session writer lease, mutation dispositions, allowed-root/access policy and sealed legacy mutation routes. Existing AILI native dialogs, Git branch/Changes UI, footer/orb/questionnaire and Herdr/Prompt/Memory surfaces MUST remain present.

#### Scenario: Upstream mutation route conflicts
- **WHEN** Pi Web 0.8.11 or the current compatibility surface contains a direct settings, tool, skill, session, Git, Worktree, push or subagent mutation route
- **THEN** the route is excluded, rejects, or translates into an explicit Gateway capability and is never a second mutation owner; `/api/git/checkout` and `/api/worktrees` are covered and force Worktree removal is forbidden

#### Scenario: Upgrade runs in a dirty worktree
- **WHEN** implementation touches dependencies, generated output or shared Web files while unrelated modified/untracked files exist
- **THEN** a pre-operation byte snapshot and writable-path manifest are captured in ignored task scratch, each package modifies only its declared paths, and unrelated/pre-existing content compares byte-identical afterwards

#### Scenario: Large shared UI file differs
- **WHEN** upstream AppShell, ChatWindow, ChatInput, SessionSidebar, RPC manager or global CSS conflicts with AILI changes
- **THEN** only scoped symbols/styles are ported and the AILI-owned file is not wholesale replaced

### Requirement: Compatible Pi Web improvements are selectively adopted
The upgrade SHALL adopt presentation/read-side improvements that fit existing ownership: ANSI extension-widget rendering, local provider icons, Traditional Chinese, bounded long-session pagination, Project Info, scroll-safe extension dialogs, and opaque lazy tool-result images. Read-only settings/tool-definition presentation MAY be adopted only through existing projections.

#### Scenario: Lazy tool-result image is requested
- **WHEN** the UI opens a deferred historical image
- **THEN** it uses an opaque BFF media handle and preserves the existing PNG/JPEG/WebP/GIF, 48 KiB per-file, 96 KiB total, 8192px dimension and 40,000,000-pixel bounds while exposing no raw session or entry identity

#### Scenario: Session history is long
- **WHEN** a session exceeds the initial history bound
- **THEN** the first page returns at most 50 entries and subsequent pages at most 200 entries through session-bound opaque cursors; malformed, expired or cross-session cursors fail closed without a full-history response

### Requirement: Conflicting Pi Web subsystems remain excluded
Pi Web's built-in subagent runtime/profile APIs, browser-owned RPC/session mutation, conventional launcher/process owner, direct settings writes, direct media URLs, and automatic push-subscription mutation SHALL NOT be imported as runtime owners. Native Browser remains outside this change.

#### Scenario: Built-in subagent source exists upstream
- **WHEN** the source inventory encounters Pi Web built-in subagents
- **THEN** it records an explicit exclusion and continues using AILI Herdr/persistent-Agent projections only

### Requirement: Upgrade verification preserves local behavior
The upgrade SHALL verify package resolution, type compatibility, Prompt Middleware, InteractionBroker, memory pre-compaction ordering, persistent Agents, Web Gateway/lease/security, selected Pi Web features, build artifacts, provenance and full regressions. Browser/E2E execution MUST remain deferred until separately authorized.

#### Scenario: Non-browser verification passes
- **WHEN** the implementation is ready for acceptance
- **THEN** focused and full non-browser checks pass with no missing AILI mount, no direct mutation regression and no stale 0.84.2/0.8.9 active baseline claim
