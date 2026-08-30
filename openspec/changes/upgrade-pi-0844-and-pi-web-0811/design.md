## Context

The active Web implementation is materially customized from the locked Pi Web 0.8.9 baseline. Current source includes an AILI Runtime Gateway/BFF, writer leases, access/root policy, mutation dispositions, native dialog and Changes/Git surfaces, footer/orb/questionnaire, Herdr projections, Prompt Middleware and Observational Memory. Package development Pi dependencies remain 0.84.2 while the global CLI is 0.84.3. Official Pi 0.84.4 and Pi Web 0.8.11 are available.

Pi Web 0.8.11 is not a drop-in target: it develops against Pi 0.84.3 and adds direct mutation/subagent/settings paths that conflict with AILI ownership. The upgrade therefore treats upstream as exact source evidence and ports bounded changes onto AILI, rather than rebasing AILI wholesale.

## Goals / Non-Goals

**Goals:**
- Establish one exact Pi 0.84.4 dependency/runtime line and one exact Pi Web 0.8.11 source/functional baseline.
- Adopt the highest-value 0.84.4 and 0.8.11 fixes through current AILI owners.
- Preserve all task-scoped AILI Web, Herdr, Prompt and Memory work already present.
- Leave traceable source locks, adaptation dispositions, generated artifacts and verification evidence.

**Non-Goals:**
- Native Browser or browser/E2E execution without new authorization.
- Pi Web built-in subagents, direct Web RPC/session ownership, direct mutation routes, conventional launcher or automatic Web Push enrollment.
- Replacing AILI compaction, retry, Prompt Middleware, InteractionBroker, Observational Memory, Herdr or Gateway/BFF.
- Publishing, committing, pushing or releasing.

## Decisions

### 1. Pi 0.84.4 is the sole runtime baseline

Update all four direct official Pi dev packages to exact 0.84.4 in one package/lock operation. Let npm resolve Pi client/protocol/telemetry closure; do not hand-edit lockfile packages. All seven packages share revision `b79e4cc834970cca69daebffab7df1da7d1e52c4`; freeze these package-specific npm integrities in the upgrade evidence artifact:

| Package | Integrity |
|---|---|
| `pi-agent-core` | `sha512-HyUnjaOXj6oN/6SNcr8A1J/ElRQA50FtIE0XUTSKAQVqmdlb9qdojOyUQwF/jULE5+yOEtGuVgi/N1RnBiNG+g==` |
| `pi-ai` | `sha512-AClAZxf5+c4RRu44NJPS6wyQy+Nmq+Mzyyrdvm4ZVMNuixelO02RZX4G4Aq1F145Yzp43wnM5S+hLlSI7ypfVw==` |
| `pi-coding-agent` | `sha512-jmOlrqUmvhh/siNWFRXjYLJzhKFIHNsAQaysRwzQPQFnPAaV/vhqHsLH/MBsIISA1Rjj7WTUFR3nJrpXoLx39w==` |
| `pi-tui` | `sha512-nPUnwDkLtupPXnZQYrCwPFcuTydCDqTY6ZbFqhsL4S4kVq0AT418kPa/6uXwtaCD+MjBNBltb7ScTYX65yeE1w==` |
| `pi-client` | `sha512-q398WY/3ZQHTizk7IKxApzqFV0xt4yM9LkSkwyqeLK5Bj5RwRjOWxESt26z4LgNp4O+8hqhqFPf/8fj4H5rE4A==` |
| `pi-protocol` | `sha512-acyE9ozxkMiWiz/xyWpU0O9vwnYv0hyG889Vniv6Sg9c9zfsX+8MePnDNphBacY2Fvm1rxdsGmiVDSZl9yuDFA==` |
| `pi-telemetry` | `sha512-8e2CuxM+ht+hedQXTZmi5JVl6/xDK9RpSDL2+MbITevKYQhMZ/z6lJOTFgox3HQyGxO8mOZEtYGVeQNaD4OzqA==` |

Update constants, Web build/runtime guards, manifests and tests only after the resolved graph is confirmed.

**Alternative considered:** keep 0.84.2 and rely on the peer wildcard. Rejected because the user requested current compatibility and 0.84.4 changes session ordering, compaction sequencing, extension UI events and RPC behavior used by AILI.

### 2. Pi Web 0.8.11 becomes a new immutable snapshot

Import a new `upstream/pi-web-0.8.11/` exact tag source snapshot with explicit exclusions, rather than replacing `upstream/pi-web-0.8.9/`. Migrate the source-lock schema so one Pi Web record is `active` and older records are `historical`; validators require exactly one active baseline and verify both trees independently. Record both npm and Git identities: npm 0.8.11 gitHead `024be0b...` represents the functional pre-publish source; annotated tag commit `28bab3...` identifies the 0.8.11 release snapshot. Add `!upstream/pi-web-0.8.11/` to the npm package allowlist and assert neither snapshot appears in `npm pack`. The `.tmp` downloads are evidence only and are not the final source owner.

**Alternative considered:** add `@agegr/pi-web` as a runtime dependency. Rejected because AILI ships adapted source and must retain one Gateway/process owner.

### 3. Use a preservation-first three-way port

For every changed upstream symbol, compare 0.8.9 → 0.8.11 and current AILI. Classify it as already present, scoped port, Gateway adaptation, deferred or excluded. Never copy whole `AppShell`, `ChatWindow`, `ChatInput`, `SessionSidebar`, `rpc-manager`, `session-reader` or global CSS over current AILI source.

Before each package, tests lock these local invariants:
- sole Gateway/BFF browser mutation path and sealed compatibility routes;
- writer lease, private request IDs and access/root policy;
- AILI Changes/Git/native-dialog/footer/orb/questionnaire mounts;
- Herdr/persistent-Agent, Prompt Middleware and Observational Memory surfaces.

### 4. Adopt Pi 0.84.4 UI prompt events as observability only

Register/consume `ui_prompt_start` and `ui_prompt_end` to project “waiting for user” activity around existing `ctx.ui` interactions. Do not let these events replace InteractionBroker state, authorization, pending-interaction lifecycle or Prompt Middleware one-shot state. Add tests for Alt+S, questionnaire, permission and model selection.

### 5. Reconcile the existing RPC clear_queue path

AILI already has a Gateway-owned `pi.queue/clear_queue` path in foreground composition, RPC manager and session hooks. Do not add another owner. Compile it against 0.84.4, align its result shape with the official command, cap each returned queue to 100 messages and each projected message to 4,096 characters, and preserve private request IDs, writer lease and busy-state semantics. No direct browser RPC endpoint is added.

### 6. Preserve memory before Pi's new compaction point

Pi 0.84.4 may compact after a large tool result and before the next assistant response. Keep observational memory registered before context owners. Verify `tool_execution_end` synthetic verification receipt → awaited side-effect-only `session_before_compact` checkpoint → unchanged Pi compaction → resumed assistant ordering. Return no compaction result and never call `ctx.compact`.

### 7. Selective Pi Web presentation package

Port as isolated modules:
- shared `AnsiText` into extension widgets/status/bash rendering;
- provider icon sprite/component, replacing duplicate inline icons without adding `@lobehub/icons`;
- zh-TW locale merged with all AILI-specific keys;
- Project Info using existing project/Git/worktree projections;
- scroll-safe extension dialogs and iOS-safe modal spacing;
- pure read-only SettingsUi/ToolDefinitionsPanel pieces where current projections already supply data.

### 8. Bounded history and media use BFF contracts

Adapt upstream tail pagination into versioned Gateway history reads with opaque cursor/handle, page-size bounds and stable ordering. Adapt lazy tool-result image extraction into the existing BFF media route: the browser receives only an opaque media handle; server-side code validates byte-derived MIME, size, dimensions and allowed image types. Do not expose upstream session/entry URLs.

### 9. Existing and upstream mutations converge before new features

First inventory all mutating `src/web/app/api/**` methods. Translate `/api/git/checkout` and `/api/worktrees` POST/DELETE to the existing Gateway action model or make the compatibility route reject; remove `force` Worktree removal and prove dirty/untracked files are preserved. Chat-only persistence, tool selection, PowerShell preference, skills toggles, push subscription and other settings writes require explicit Gateway action contracts before inclusion. Built-in subagents are always excluded because AILI Herdr is the owner. Upstream running-session-list SSE remains excluded; retain current visible-page polling and per-session stream approach unless AILI's own event contract requires otherwise.

### 10. Prompt Middleware is retained and regression-tested

Prompt Middleware already exists: trusted loader, deterministic resolver/assembler, Alt+S and `/snippets`, one-shot consumption, managed/Herdr subagent scope, provenance and monotonic tool narrowing. The upgrade changes no prompt contract unless installed 0.84.4 types/tests reveal a required compatibility fix. New UI prompt events only improve waiting-state observability.

### 11. Dirty-tree preservation uses byte comparison, not Git assumptions

Before any dependency install, source import, generation or shared-file port, capture `git status --porcelain=v2` and task-overlapping pre-existing files into ignored `.tmp/upgrade-pi-0844-pi-web-0811-baseline/`. Record each package's exact writable paths. After each package, compare unrelated/pre-existing snapshots with `cmp` and stop on drift. Do not stage, reset, stash, checkout, clean or delete the user's files; scratch removal is not part of this change.

**Alternative considered:** rely only on final `git diff`. Rejected because the tree is already dirty and final diff cannot distinguish pre-existing bytes from upgrade edits.

### 12. Keep Pi's native compaction threshold unchanged

The user considered an 80% trigger and chose not to modify it in this change. Pi 0.84.4 remains authoritative with `contextTokens > contextWindow - reserveTokens`, default `reserveTokens=16,384` and `keepRecentTokens=20,000`. For a 272,000-token model this triggers near 255,616 tokens (about 94%). No AILI ratio trigger or settings rewrite is introduced; the memory hook remains a pre-compaction side effect only.

## Risks / Trade-offs

- **Large upstream delta overwrites AILI work** → symbol-level three-way dispositions and preservation tests before edits.
- **Pi Web 0.8.11 targets Pi 0.84.3** → compile/run adapted code against 0.84.4 and use only public compatible APIs.
- **Generated artifacts become stale** → rebuild Web output and regenerate provenance/SBOM only after source/dependency convergence.
- **New Pi compaction order loses memory** → focused large-tool sequence regression with exact cutoff and unchanged owner assertions.
- **UI prompt events duplicate InteractionBroker state** → consume as activity projection only.
- **Pagination/media adds bypass routes** → all reads through opaque BFF handles; all mutations remain Gateway-owned.
- **Push/settings broaden privacy or mutation scope** → defer until separately accepted.
- **Dirty worktree contains unrelated changes** → package-specific write scopes, pre/post file lists, no broad formatter/copy operation.

## Migration Plan

1. Freeze exact 0.84.4/0.8.11 metadata, import a separate 0.8.11 snapshot and produce a source→AILI disposition inventory.
2. Update Pi dependencies/lockfile, version guards and focused compatibility fixtures; repair only evidenced API drift.
3. Integrate Pi 0.84.4 UI-prompt/RPC/image/ordering adaptations and verify Prompt/Interaction/Memory/Agent invariants.
4. Port presentation-only Pi Web improvements.
5. Add bounded BFF history pagination and opaque lazy media.
6. Reconcile any accepted Gateway-owned settings capability; leave deferred features absent.
7. Rebuild Web artifacts, regenerate provenance/SBOM and run non-browser verification. Browser execution waits for separate authorization.
8. Rollback reverts this change's source/dependency packages while leaving the 0.8.9 snapshot and existing AILI functionality intact.
