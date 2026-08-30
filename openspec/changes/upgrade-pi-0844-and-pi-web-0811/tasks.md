## 1. Freeze Baselines and Preservation Guardrails

- [x] 1.1 Before any mutation, record `git status --porcelain=v2`, exact package write scopes and byte copies of task-overlapping pre-existing modified/untracked files under ignored `.tmp/upgrade-pi-0844-pi-web-0811-baseline/`; verify unrelated/pre-existing files compare with `cmp` after every package and never stage/reset/stash/checkout/clean/delete them.
- [x] 1.2 Record all seven Pi 0.84.4 package-specific npm integrities plus shared revision and Pi Web 0.8.11 npm/git/tag/archive identities in source locks; verify official registry values, MIT notices and npm/git manifest distinctions.
- [x] 1.3 Migrate `web-source-locks.json` and its validator to an explicit active/historical Pi Web schema with exactly one active record; verify both 0.8.9 historical and 0.8.11 active identities/trees drift independently.
- [x] 1.4 Import a separate exact `upstream/pi-web-0.8.11/` source snapshot through a deterministic importer with documented exclusions, file count and tree hash; verify the historical 0.8.9 snapshot remains unchanged and both directories are excluded from `npm pack`.
- [x] 1.5 Produce a symbol/file disposition inventory for 0.8.9→0.8.11 versus current AILI as already-present, scoped-port, Gateway-adapt, deferred or excluded; verify every selected source maps to a task and every built-in subagent/direct mutation owner is excluded.
- [x] 1.6 Add preservation tests for Gateway/BFF-only browser mutation, writer lease, private request IDs, access/root policy, sealed legacy routes, native dialogs, Git branches/Changes, footer/orb/questionnaire and Herdr/Prompt/Memory mounts before changing shared Web files.

## 2. Upgrade Official Pi to 0.84.4

- [x] 2.1 Update exact direct Pi dev dependencies to 0.84.4 and run the authorized `npm install --ignore-scripts`; verify `npm ls` contains one compatible 0.84.4 Pi line and inspect the task-scoped lockfile diff.
- [x] 2.2 Update runtime/Web/build version guards, constants, package tests and documentation from 0.84.2 to 0.84.4 while preserving the host peer wildcard exception; verify mismatch fixtures fail before mutation.
- [x] 2.3 Refresh model metadata fixtures against the installed 0.84.4 registry without hardcoding stale values; verify Parent/managed/Herdr model resolution and current-turn model authority tests.
- [x] 2.4 Rebuild version-bound Web artifacts and regenerate provenance/SBOM through their owners after source convergence; verify no stale 0.84.2 active manifest remains.

## 3. Integrate Pi 0.84.4 Public Behavior

- [x] 3.1 Add `ui_prompt_start`/`ui_prompt_end` activity projection around Prompt Middleware selection, questionnaire, permission and model-override UI while retaining InteractionBroker as the sole decision owner; verify pending/one-shot state is neither consumed nor duplicated.
- [x] 3.2 Reconcile the existing Gateway-owned `pi.queue/clear_queue` implementation with official 0.84.4 instead of adding another owner; cap each returned queue at 100 messages and each message at 4,096 characters, and verify removal occurs only after writer admission with no direct browser RPC route.
- [x] 3.3 Adopt official image MIME detection at media boundaries while retaining byte-derived MIME, type/size/dimension/base64 bounds and BFF opaque handles; verify malformed or mismatched images fail closed.
- [x] 3.4 Add resume/no-trailing-newline and `triggerTurn:false` ordering regressions; preserve AILI's explicit next-turn background delivery and child JSONL partial-line safeguards.
- [x] 3.5 Verify large-tool-output ordering under 0.84.4: verification receipt, memory pre-compaction checkpoint, unchanged compaction owner/result and resumed assistant progress; verify no raw tool result enters memory.
- [x] 3.6 Verify native/routed compaction and branch summaries do not force `toolChoice:none`, retaining AILI's route freeze and Pi-owned retry budget.

## 4. Selectively Port Pi Web 0.8.11 Presentation

- [x] 4.1 Port shared ANSI rendering into extension widgets/status and applicable tool output without replacing AILI ChatWindow/AppShell; verify ANSI, plain text and bounded rendering tests.
- [x] 4.2 Port the local provider-icon sprite/component and remove duplicate inline icon logic without adding `@lobehub/icons`; verify supported/fallback provider rendering and package inventory.
- [x] 4.3 Add zh-TW locale and merge all AILI-specific messages; verify registry completeness and fallback behavior.
- [x] 4.4 Add Project Info using existing read projections for project directory label, Git branch and worktree; verify copy actions expose no unauthorized absolute/private identity outside accepted UI context.
- [x] 4.5 Port scroll-bounded extension dialogs and iOS-safe modal spacing as scoped styles/components; verify current AILI footer/orb/questionnaire and mobile toolbar mounts remain intact.
- [x] 4.6 Add read-only SettingsUi/ToolDefinitionsPanel pieces only where current Gateway projections already supply data; verify no direct settings/tool/skill mutation route is introduced.

## 5. Add Bounded Read-side Improvements

- [x] 5.1 Adapt long-session pagination into a versioned BFF history contract: first page max 50, continuation max 200, session/auth-bound opaque cursor with malformed/expired/cross-session rejection, stable ordering and no full-history fallback; verify initial load avoids full scans.
- [x] 5.2 Adapt lazy historical tool-result image retrieval to opaque BFF media handles while preserving PNG/JPEG/WebP/GIF, 48 KiB per-file, 96 KiB total, 8,192px and 40,000,000-pixel bounds; verify no raw session/entry IDs reach browser URLs.
- [x] 5.3 Inventory every mutating `src/web/app/api/**` method; make `/api/git/checkout` and `/api/worktrees` POST/DELETE reject or translate through Gateway, remove force Worktree removal, and verify dirty/untracked fixtures preserve byte content with no stash/discard/checkout overwrite.
- [x] 5.4 Keep chat-only persistence, PowerShell preference, skill/tool toggles and Web Push absent unless separate Gateway/privacy contracts are accepted; add negative tests proving upstream direct routes are not active.

## 6. Convergence and Verification

- [x] 6.1 Run Pi 0.84.4 focused extension, Prompt Middleware, InteractionBroker, memory, persistent-Agent, RPC, media and version tests; repair only upgrade-caused regressions.
- [x] 6.2 Run selected Pi Web ANSI/icon/i18n/project-info/dialog/settings/pagination/media tests plus Gateway/lease/access/private-ID preservation tests.
- [x] 6.3 Run typecheck, Web build, package/generated/provenance/SBOM/compatibility/doctor checks and full non-browser suite; record Browser/E2E as deferred and unexecuted without separate authorization.
- [x] 6.4 Inspect final task-scoped diff and source-lock inventory, confirm no Native Browser, built-in Pi Web subagent, second mutation owner, dependency residue, Git/publish/release operation or lost AILI customization, then update progress/test evidence.
