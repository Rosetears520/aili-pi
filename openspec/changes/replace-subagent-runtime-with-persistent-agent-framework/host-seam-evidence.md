# PKG-01 Host Seam Evidence — official Pi 0.81.1

## Scope and authority

This evidence resolves the accepted offline/disposable HOST-1–HOST-6 prototype gates only. It does not authorize dependency/lockfile changes, OMP source copying, real provider/auth/network/HOME/external-workspace operations, Git changes in the real repository, or a release claim.

Two requested read-only subagent lanes were dispatched first and both timed out after 300 seconds with zero result/output bytes (`run_mrzv7bsy_db7f73`, `run_mrzv7bsz_8ae7d2`). They were not retried. ROSE completed the bounded seam work directly.

## HOST-1 — Persistent child SessionManager

**Disposition:** resolved for the exact 0.81.1 prototype baseline.

- `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts` exposes `NewSessionOptions.id`, `parentSession`, `SessionManager.create(cwd, sessionDir, options)`, and `SessionManager.open(path, sessionDir, cwdOverride)`.
- `tests/integration/persistent-agent-host-seams.test.ts` creates a parent session, explicitly creates the nested sidecar directory, creates a child with stable ID and parentSession, flushes an assistant message, reopens the exact child file, and checks header plus entries without a provider call.
- Pi 0.81.1 intentionally defers physical JSONL creation until an assistant message exists (`dist/core/session-manager.js` `_persist`), so production code must create sidecar directories and must not report a persistent child file as durable before the child session has actually flushed.

**Residual implementation work:** coordinator journal/snapshot and crash reconciliation remain PKG-03 behavior, not a host API gap.

## HOST-2 — Trusted resource/tool reconstruction

**Disposition:** resolved with the contract's explicit “currently loadable capability” boundary.

- `ExtensionAPI.getActiveTools()` and `getAllTools()` are public in `dist/core/extensions/types.d.ts`; `ToolInfo` intentionally omits executable closures.
- `DefaultResourceLoaderOptions.extensionsOverride` and `extensionFactories` are public in `dist/core/resource-loader.d.ts`.
- `dist/core/resource-loader.js` applies `extensionsOverride` to the loaded extension set before `AgentSession` binds/runs that set.
- `AgentSession.getActiveToolNames()`, `getAllTools()`, and `getToolDefinition()` are public in `dist/core/agent-session.d.ts`.
- The focused fixture filters a named top-level coordinator extension, retains a child bridge extension, creates an AgentSession with only the child custom tool active, and proves the filtered tool has no child definition.

**Boundary:** Parent `ToolInfo` alone cannot recreate an arbitrary in-memory/temporary custom tool because it has no `execute`. Production must combine trusted loader reconstruction, child-safe AILI registration, and the accepted fail-closed removal/reporting of definitions that are not publicly reconstructable. It must not claim inheritance for an unavailable closure.

## HOST-3 — Parent UI approval bridge

**Disposition:** resolved as a feasible in-process bridge; policy wiring remains PKG-04/PKG-08.

- Child extensions can register async `tool_call` handlers through public `ExtensionAPI.on` and can await arbitrary promises.
- Parent `task` tool execution receives an `ExtensionContext` containing `hasUI`, `ui`, project trust, session state, and an AbortSignal (`dist/core/extensions/types.d.ts`).
- The existing generated permission integration already separates pure resolution/config/approval helpers (`src/vendor/pi-permission-modes/resolve.ts`; dependency modules `pi-permission-modes/src/approvals.ts`, `schema.ts`, `bash-parse.ts`, `paths.ts`).
- The focused fixture proves a child-only `tool_call` handler remains suspended until an external parent decision resolves and returns a fail-closed block on denial.

**Boundary:** The full parent bridge must bind every request to parent session/job AbortSignals and must exclude the ambient interactive permission extension from double adjudication. No-UI/shutdown/bridge loss deny; protected credential paths remain pre-approval hard denials. No unattended-yolo mode is needed or allowed.

## HOST-4 — Parent fork/delete/archive sidecar lifecycle

**Disposition:** fork resolved; built-in delete/archive gap confirmed and remains an accepted visible host gap.

- `dist/core/agent-session-runtime.js` implements fork by creating/branching a new SessionManager file and emits `session_start` reason `fork`; it does not copy a sibling sidecar directory.
- The focused fixture creates a marker under the original parent sidecar, calls `createBranchedSession`, and proves the fork sidecar is absent.
- `dist/modes/interactive/components/session-selector.js` `deleteSessionFile()` trashes/unlinks only the selected `.jsonl`; it exposes no extension callback for deleting a sibling sidecar.
- No official 0.81.1 session archive lifecycle/API was found in the installed host.

**Required product behavior:** New forks start empty as accepted. AILI must provide its own confirmed parent deletion/reconciliation path and doctor must report that built-in Ctrl+D cannot guarantee immediate sidecar cascade on 0.81.1. The implementation must not monkey patch Pi or claim native archive/delete parity.

## HOST-5 — Minimal Git isolation

**Disposition:** resolved for a dependency-free local Git adapter prototype.

- The focused fixture creates a disposable repository under ignored `.tmp/`, records a clean commit, captures a tracked dirty baseline with `git diff --binary`, creates a detached worktree, applies the baseline patch, captures child changes, verifies the main workspace remains unchanged, and removes the worktree.
- No package dependency, network access, external repository, real project worktree, OMP source, or user HOME is used.

**Boundary:** Untracked-file projection, resource leases, merge confirmation, nested worktree topology, non-Git failure, and cleanup-failure evidence remain PKG-09 implementation/tests. Isolation unavailable must fail rather than fall back to a known conflicting shared write.

## HOST-6 — Exact Pi version binding

**Disposition:** current BUILD prototype/implementation baseline selected as official Pi 0.81.1.

- `package.json` pins devDependency `@earendil-works/pi-coding-agent` to `0.81.1`.
- Installed `node_modules/@earendil-works/pi-coding-agent/package.json` is `0.81.1`.
- The focused fixture asserts declared and installed versions match exactly.
- `openspec/changes/support-pi-0-82-1/` remains a separate unfinished change whose old `@agwab/pi-subagent` assumptions were invalidated by this change. Production code must use only APIs verified on 0.81.1 now; the dependent change must complete its persistent-Agent realignment before any Pi 0.82.1 migration claim.

## Fresh verification

- `npx vitest run tests/integration/persistent-agent-host-seams.test.ts` — PASS, 6 tests.
- `npm run typecheck` — PASS.
- `openspec validate replace-subagent-runtime-with-persistent-agent-framework --strict --no-interactive` — PASS after acceptance persistence.

## PKG-01 decision

No host seam forces a change to the accepted public contract or architecture. HOST-4 is a known, already specified degradation: AILI-owned deletion/reconciliation plus explicit doctor evidence, not built-in Ctrl+D parity. PKG-02/PKG-03 may proceed on exact Pi 0.81.1; dependency, OMP code-copy, live/global/external and Git/release gates remain closed.
