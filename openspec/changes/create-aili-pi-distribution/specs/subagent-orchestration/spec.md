## ADDED Requirements

### Requirement: All 19 AILI roles have Pi-owned profiles
[框架内] The runtime SHALL expose exactly the accepted 19 subagent roles through generated Pi role profiles containing role prompt, allowed tools/capabilities, output contract, and provenance. OpenCode-only frontmatter MUST NOT be interpreted as Pi enforcement.

#### Scenario: Role inventory matches the accepted manifest
- **WHEN** [框架内] role generation and validation run
- **THEN** [框架内] every accepted role has exactly one Pi profile and no unexpected role is exposed

#### Scenario: Role profile loses a permission or output rule
- **WHEN** [框架内] generated profile validation finds missing or unsupported semantics
- **THEN** [框架内] compatibility status is `blocked` and the role cannot be claimed operational

### Requirement: Every task invocation is fresh, single-use, and terminal
[框架内] `aili_task` SHALL create a new UUID and new `pi --mode json --no-session` child process for every task. The public tool contract MUST NOT expose resume, forked-session continuation, background continuation, chain reuse, or automatic redispatch.

#### Scenario: Same role is invoked twice
- **WHEN** [框架内] the parent invokes the same role for two tasks
- **THEN** [框架内] the tasks receive different IDs and processes and cannot access a resumable AILI task context from each other

#### Scenario: Caller supplies a previous task ID
- **WHEN** [框架内] a request attempts to resume or reuse an old AILI task ID
- **THEN** [框架内] the runtime rejects the request and does not spawn a resumed child

### Requirement: Concurrency is bounded to two
[框架内] One `aili_task` call SHALL accept at most two tasks, and the runtime SHALL allow at most two active AILI child processes for the session. Excess work SHALL remain queued or be rejected explicitly; it MUST NOT exceed the limit silently.

#### Scenario: Two tasks run concurrently
- **WHEN** [框架内] two valid independent tasks are submitted and capacity is available
- **THEN** [框架内] both may run and status reports active count `2/2`

#### Scenario: A third task is requested
- **WHEN** [框架内] two child processes are active and another task is submitted
- **THEN** [框架内] the third task is queued/rejected according to the documented result and active concurrency remains two

### Requirement: Recursive delegation is structurally unavailable
[框架内] A child process SHALL not register or receive `aili_task`/orchestrator capability. Environment/resource configuration SHALL identify child mode and deny recursive task dispatch.

#### Scenario: Child prompt asks to delegate
- **WHEN** [框架内] a child attempts to invoke an AILI subagent
- **THEN** [框架内] no recursive task tool is available and the child returns the limitation to the parent

#### Scenario: Parent tool list is broader than role policy
- **WHEN** [框架内] the parent can use a tool that the selected role may not use
- **THEN** [框架内] the child does not receive that tool

### Requirement: Child authority never exceeds parent and role policy
[框架内] Effective child authority SHALL be the intersection of parent-active permissions, role policy, current mode policy, project root, and explicit task packet. Missing or unclassifiable authority SHALL fail closed.

#### Scenario: Role requests a denied write
- **WHEN** [框架内] a role/tool call exceeds parent or role write authority
- **THEN** [框架内] the call is blocked and the structured result records the rule/reason without exposing secret input

#### Scenario: Parent narrows a normally allowed role tool
- **WHEN** [框架内] the parent task packet removes a capability
- **THEN** [框架内] the child operates with the narrower capability set

### Requirement: Streaming and final results are bounded and explicit
[框架内] The runtime SHALL stream safe status/events to the parent, parse child JSONL incrementally, cap every retained channel, and return a structured result with status, summary, evidence, changed files, verification, blockers, risks, and confidence. The final model-visible result SHALL not exceed 50 KiB.

#### Scenario: Child completes within limits
- **WHEN** [框架内] a child emits valid bounded events and a complete result
- **THEN** [框架内] the parent receives streamed status and one validated structured final result

#### Scenario: Child output exceeds a limit
- **WHEN** [框架内] JSONL, stderr, details, artifacts, or final result exceeds its configured byte limit
- **THEN** [框架内] the runtime truncates or fails according to the documented channel policy, marks the event explicitly, and never reports unqualified success

#### Scenario: Child emits malformed protocol data
- **WHEN** [框架内] a JSONL line or final result fails schema validation
- **THEN** [框架内] the invocation returns a protocol error with bounded diagnostics

### Requirement: Cancellation terminates the Unix process tree
[框架内] Parent cancellation SHALL propagate to the child process group, wait a bounded grace period, escalate termination if needed, and settle the task exactly once.

#### Scenario: User presses Ctrl+C during a task
- **WHEN** [框架内] the parent AbortSignal fires while the child or descendant process is running
- **THEN** [框架内] the process group is terminated, no orphan remains in the test fixture, and the result is `cancelled`

#### Scenario: Child exits with stderr
- **WHEN** [框架内] the child exits non-zero and writes diagnostic output
- **THEN** [框架内] the parent returns a bounded failure result including a redacted stderr tail and does not auto-retry the task

### Requirement: Child authentication does not duplicate or expose credentials
[框架内] Child execution SHALL use a Pi-supported authentication path without copying credential material into task prompts, result payloads, logs, artifacts, or a second AILI credential store. AILI MUST NOT modify Pi authentication data.

#### Scenario: API-key provider task runs
- **WHEN** [框架内] Pi is authenticated through an ambient or Pi-supported API-key configuration and a child task starts
- **THEN** [框架内] the child can use the configured provider while all AILI-visible logs/results remain free of the key value

#### Scenario: Pi-supported login task runs
- **WHEN** [框架内] Pi is authenticated through a supported login store and a child task starts
- **THEN** [框架内] AILI does not copy or rewrite the credential store and a seeded-secret scan finds no credential in child evidence

#### Scenario: Safe authentication inheritance cannot be established
- **WHEN** [框架内] the implementation cannot satisfy the no-copy/no-log contract for a supported path
- **THEN** [框架内] that path remains `blocked` and implementation stops for DEFINE material-delta rather than weakening the contract

## Superseding Pi-subagent Requirements — 2026-07-23

[框架内] The preceding requirements retain their observable AILI safety outcomes, but the owned process-group, JSONL, and artifact lifecycle implementation is superseded by a pinned `@agwab/pi-subagent/api` integration.

### Requirement: Pi-subagent owns child lifecycle
[框架内] AILI SHALL invoke the pinned API for child spawn, active-run lifecycle, cancellation, and artifact collection. AILI SHALL not retain parallel process-group, parser, or artifact implementations after API compatibility is proven.

#### Scenario: Adapter starts a task
- **WHEN** [框架内] a valid AILI task has an accepted role and policy packet
- **THEN** [框架内] the adapter calls the Pi-subagent API and returns its normalized bounded result without exposing Pi-subagent resume/background controls

#### Scenario: API behavior cannot support the contract
- **WHEN** [框架内] an API/load/integration test cannot prove the required fresh, cancellation, artifact, or structured-result behavior
- **THEN** [框架内] the integration is non-pass and implementation stops for DEFINE rather than restoring an unreviewed duplicate lifecycle

### Requirement: AILI keeps a narrow policy adapter
[框架内] The adapter SHALL enforce exactly 19 AILI role profiles, role/parent tool ceilings, explicit task path boundaries for mutation-capable roles, headless fail-closed behavior, structured result normalization, and maximum active concurrency two. It SHALL not expose worktree, background, resume, automatic redispatch, or recursive delegation.

#### Scenario: Caller requests an excluded feature
- **WHEN** [框架内] a request asks for resume, worktree, background execution, automatic retry, or recursive delegation
- **THEN** [框架内] the AILI adapter rejects it before starting the Pi-subagent run

#### Scenario: Child crosses the policy boundary
- **WHEN** [框架内] a child attempts a tool or path outside its projected AILI policy
- **THEN** [框架内] the AILI child guard blocks it with a non-secret reason and the task cannot report unqualified success

### Requirement: AILI roles are globally discoverable without unowned overwrite
[框架内] Generated role profiles SHALL be packaged as inputs for an explicit global installation into `~/.pi/agent/agents/aili/`. The normal package load SHALL not write that directory.

#### Scenario: Profiles are absent
- **WHEN** [框架内] the global AILI profile directory is not installed
- **THEN** [框架内] doctor identifies the missing external resource and the subagent surface is non-pass rather than fabricating a package-level agent registry
