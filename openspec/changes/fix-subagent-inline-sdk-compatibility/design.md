## Context

`@rosetears/aili-pi@0.1.6` pins Pi 0.81.1 and `@agwab/pi-subagent@0.4.8`. Upstream backend resolution sends a normal model-backed run with omitted/`auto` backend to `inline`; `visible:true` selects `tmux`, and sandboxed runs select `headless`.

The pinned inline runner imports the Pi SDK root and calls `AuthStorage.create()` followed by `ModelRegistry.create()`. Pi 0.81.1 does not export `AuthStorage` from its root, its `ModelRegistry` has no static `create`, and current official SDK guidance uses `ModelRuntime.create()`. In session `019f8eff-9eb1-7c70-b18e-184006882500`, two independent fan-outs failed in 16–29 ms with empty output and `Cannot read properties of undefined (reading 'create')`; the result's generic `failureKind:model` therefore described an SDK bootstrap exception, not a provider response. Both results recorded `backend:inline` and `sandbox.enabled:false`.

AILI's own live probe explicitly passes `backend:"headless"`, so its passing release evidence does not cover the documented upstream default that most agents use. npm currently has no release newer than `@agwab/pi-subagent@0.4.8`.

## Goals / Non-Goals

**Goals:**

- Make ordinary omitted/`auto` subagent calls usable on the pinned Pi/package pair.
- Keep explicit supported backends, upstream schema/lifecycle/artifact behavior, permission-mode forwarding, credential protection, and recursion exclusion intact.
- Turn an explicit unsupported inline request into an actionable compatibility result rather than a false provider/model diagnosis.
- Make live/release evidence exercise the same default path users receive.

**Non-Goals:**

- Fork, copy, or reimplement the upstream subagent runtime.
- Hand-edit installed `node_modules`, change Pi, or change dependency/lockfile state without a separate approval.
- Change Agent role semantics, concurrency, worktree/sandbox policy, model/provider credentials, or YOLO behavior.
- Treat provider-backed probes, package publication, installation, commit, or push as authorized by this design.

## Decisions

### 1. Add a revision-bound AILI backend compatibility adapter

For the pinned `pi-subagent@0.4.8` / Pi 0.81.1 pair, the AILI wrapper will normalize only ordinary model-backed run parameters:

- omitted or `auto` backend with neither `visible:true` nor an enabled sandbox resolves to `headless` before the upstream renderer and executor receive the call;
- `visible:true` and sandboxed `auto` calls retain upstream `tmux`/`headless` resolution;
- explicit `headless` and `tmux` remain byte-for-byte execution choices;
- explicit `inline` fails before worker/model startup with a bounded diagnostic naming the incompatible versions and the `headless` remedy.

The same compatibility planner applies to single and parallel calls while upstream task merging remains untouched. For parallel auto calls it evaluates effective task-level selectors before setting a top-level backend: plain and sandboxed non-visible tasks may safely use headless; fully visible/sandbox-selected tasks keep upstream auto resolution; a fan-out mixing visible tasks with plain non-sandboxed tasks fails before startup because 0.4.8 cannot express a distinct backend per task. The diagnostic asks the caller to split the fan-out or choose one explicit compatible backend rather than silently dropping visible intent or allowing a plain sibling to enter inline. Lifecycle actions are never normalized because they do not start a worker.

**Why:** this is the smallest owned adapter that restores the documented default user path without copying an external runner or changing dependencies. It also makes the rendered backend agree with execution instead of silently displaying `auto` while running another backend.

**Alternatives rejected:**

- **Patch `node_modules` or vendor the inline runner:** creates an unowned fork and weakens reproducibility.
- **Wait for an upstream release:** leaves the shipped default broken; no newer npm release currently exists.
- **Only instruct the model to request headless:** prompt adherence is not a runtime compatibility guarantee.
- **Silently rewrite explicit inline:** violates caller intent; a deterministic unsupported result is safer.

### 2. Preserve child authority and ambient mode forwarding

The adapter changes backend selection only. It continues injecting the immutable credential guard and preserves inherited environment, including `PI_PERMISSION_MODE`. The headless child continues to exclude recursive `subagent` access and to honor named-Agent/call-level tool ceilings. No adapter branch may remove extensions, skills, sandbox, worktree, cwd, async, timeout, model, thinking, or lifecycle parameters.

### 3. Make evidence backend-explicit and default-path representative

Unit fixtures will cover the normalization matrix, task-level selector overrides, explicit-inline/mixed-auto diagnostics, both supported execute argument shapes, renderer parity, and lifecycle pass-through. Integration fixtures will invoke the tool without a backend and prove that the disposable Pi subprocess path is used. A separately approved live read-only probe will also omit backend, record the resolved backend, and fail release validation if it does not complete.

The release evidence manifest will distinguish default-path, explicit-headless, and explicit-inline-diagnostic coverage. A headless-only probe can prove headless behavior but cannot claim default compatibility unless the adapter's omitted-backend path was exercised.

### 4. Keep dependency change as a separate material gate

If a later upstream release implements Pi 0.81.1's `ModelRuntime` SDK correctly, adopting it and removing this compatibility adapter will be a separate dependency/lockfile decision with fresh default-inline evidence. This change must not opportunistically alter the pin.

## Risks / Trade-offs

- **[Risk] Headless startup is slower than inline.** → Limit the adaptation to the known incompatible default path; preserve explicit tmux/headless and document the temporary compatibility boundary.
- **[Risk] Headless workers have no interactive permission UI.** → Preserve `PI_PERMISSION_MODE` forwarding and fail-closed behavior; add mode-forwarding fixtures for a non-default mode and keep credential denial independently verified.
- **[Risk] Renderer and executor could resolve different backends.** → Use one pure normalization helper for both render and execute paths and test identical effective parameters.
- **[Risk] A mixed parallel auto call could preserve a visible tmux task only by leaving an ordinary sibling on broken inline.** → Detect the effective per-task selector matrix and reject only the unrepresentable visible+plain combination before any worker starts.
- **[Risk] A model-backed sandboxed child may lack provider egress/auth even though backend routing is correct.** → Preserve the caller's sandbox unchanged, keep the failure visible/fail-closed, and do not count sandbox routing as provider completion evidence.
- **[Risk] A future upstream fix could make the adapter stale.** → Bind the decision and evidence to exact Pi/subagent versions; remove only in a separately validated dependency change.
- **[Risk] Release evidence may again pass on a non-representative path.** → Require one live probe with backend omitted and record the resolved backend in revision-bound evidence.

## Migration Plan

1. Add the pure compatibility normalization/diagnostic layer around the existing upstream tool.
2. Add unit and disposable integration coverage before changing live evidence.
3. Run focused tests/typecheck; only after separate provider authorization run the default-path live probe.
4. Refresh revision-bound release evidence and documentation.
5. Rollback by reverting the adapter and its evidence/tests; there is no persisted data migration. A rollback restores the known broken inline default and therefore must be reported as a functional regression, not a safe operational fix.

## Open Questions

- **Unverified:** whether an unreleased upstream commit already supports Pi 0.81.1's `ModelRuntime` API. This does not block the no-dependency adapter, but must be checked before any later dependency update.
- **Unverified:** real provider-backed default-path completion after implementation; it requires a separate exact live-probe authorization and remains fail-closed until then.
