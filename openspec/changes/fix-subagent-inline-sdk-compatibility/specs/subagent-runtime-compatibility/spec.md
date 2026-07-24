## ADDED Requirements

### Requirement: Default subagent runs use a compatible backend
For the pinned Pi 0.81.1 and `@agwab/pi-subagent@0.4.8` runtime, AILI SHALL resolve a normal model-backed `subagent` run with omitted or `auto` backend to a supported process-backed backend before invoking upstream execution. It MUST NOT enter the known incompatible inline SDK bootstrap path.

#### Scenario: Single run omits backend
- **WHEN** a single runnable subagent request supplies an Agent or task and omits `backend`, without `visible:true` or an enabled sandbox
- **THEN** AILI invokes the upstream run through `headless`, and the result records `backend:headless`

#### Scenario: Parallel run omits backend
- **WHEN** a parallel request contains multiple runnable tasks and omits `backend`, without any effective `visible:true` task
- **THEN** every plain or sandboxed task uses the compatible headless backend while upstream concurrency, fail-fast, per-task sandbox configuration, and per-run artifact behavior remain unchanged

#### Scenario: Parallel auto mixes visible and plain tasks
- **WHEN** a parallel omitted/`auto` request contains at least one effective visible task and at least one non-visible, non-sandboxed task
- **THEN** AILI fails before worker startup with an actionable split-or-explicit-backend diagnostic, rather than dropping visible intent or allowing the plain task to enter inline

### Requirement: Explicit backend intent is preserved or rejected clearly
AILI SHALL preserve explicit supported backend choices and upstream auto-selection conditions that are already compatible. An explicit incompatible `inline` request MUST fail before worker/model startup with a bounded compatibility diagnostic and MUST NOT be reported as a provider/model execution failure.

#### Scenario: Explicit headless run
- **WHEN** the caller sets `backend:headless`
- **THEN** AILI forwards the request without changing the selected backend or other run parameters

#### Scenario: Visible auto run
- **WHEN** the caller uses omitted/`auto` backend with `visible:true`
- **THEN** upstream resolution remains `tmux`

#### Scenario: Sandboxed auto run
- **WHEN** the caller uses omitted/`auto` backend with an enabled sandbox
- **THEN** upstream resolution remains `headless` with the caller's sandbox configuration intact; provider/auth/network failure inside that sandbox remains visible and MUST NOT be recategorized as inline SDK success

#### Scenario: Explicit inline run on the incompatible pin
- **WHEN** the caller explicitly sets `backend:inline` under Pi 0.81.1 and `pi-subagent@0.4.8`
- **THEN** the call stops before model startup with an actionable compatibility message naming `headless` as the supported remedy and no raw `reading 'create'` exception

### Requirement: Compatibility routing preserves subagent authority boundaries
Backend compatibility routing SHALL NOT broaden child authority. AILI MUST preserve the immutable credential-path guard, effective Agent/call tool ceiling, inherited `PI_PERMISSION_MODE`, recursive subagent exclusion, and caller-supplied cwd/workspace/worktree/sandbox/async/model/thinking/timeout options.

#### Scenario: YOLO mode is forwarded to a headless child
- **WHEN** the parent explicitly runs in YOLO and a default subagent call is normalized to headless
- **THEN** the child receives the explicit parent mode through `PI_PERMISSION_MODE` while the independent AILI credential guard remains active

#### Scenario: Credential path is requested in a compatible child
- **WHEN** a headless child attempts standard file-tool or parsed-bash access to a protected credential/auth/private-key path
- **THEN** AILI blocks that access without exposing credential contents, regardless of the forwarded permission mode

#### Scenario: Lifecycle action is invoked
- **WHEN** the caller uses `status`, `logs`, `wait`, `interrupt`, `mark-background`, or `reconcile`
- **THEN** AILI forwards the lifecycle request unchanged and does not perform backend compatibility normalization

### Requirement: Verification represents the shipped default path
AILI release evidence SHALL distinguish backend-specific probes and MUST include a default-path live probe that omits `backend`. A probe that explicitly selects headless MUST NOT by itself establish that the shipped omitted/`auto` path works.

#### Scenario: Default-path live probe passes
- **WHEN** the separately authorized read-only live probe invokes `subagent` without a backend
- **THEN** it completes through the resolved compatible backend, records that backend and revision-bound implementation/test hashes, and changes no business files

#### Scenario: Default-path live probe fails
- **WHEN** the omitted-backend live probe fails, resolves to the known incompatible inline path, or lacks backend evidence
- **THEN** stable release validation fails and AILI does not claim generic subagent readiness

### Requirement: Dependency changes remain separately gated
This compatibility change SHALL NOT modify the `@agwab/pi-subagent` version or lockfile without a separate exact dependency/lockfile approval.

#### Scenario: A newer upstream release is considered
- **WHEN** implementation or later maintenance identifies a candidate upstream release that may fix inline SDK compatibility
- **THEN** adoption stops for a separate dependency decision and requires fresh default-inline compatibility evidence before the adapter can be removed
