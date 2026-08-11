## ADDED Requirements

### Requirement: P0 recovery inheritance is version-neutral
REC-001 through REC-008 and the later emergency-checkpoint corrections SHALL remain mandatory for the `0.2.0` candidate regardless of whether the P0 fix was independently published. Release validation SHALL exercise the inherited behavior against the merged candidate rather than depend on a fabricated P0-only package.

#### Scenario: The merged candidate runs P0 regression
- **WHEN** focused, full, fake-provider, or live release validation executes
- **THEN** deterministic-or-`undefined`, Pi final fallback/retry, no cancellation, append-only history, branch/epoch isolation, and storm prevention remain required

### Requirement: Recovery uses MiMo-style dynamic checkpoints before native compaction
AILI SHALL derive a safe working budget from the observed Pi context window. Because Pi provides a combined `contextWindow` rather than a distinct provider input ceiling, it SHALL reserve `min(model.maxTokens, 20_000)` for output and the same bounded amount for recovery. Unknown, zero, invalid, or reserve-exhausted context disables automatic recovery. This change SHALL expose no new user configuration surface for working-budget or threshold overrides.

Against the safe working budget, checkpoint writers SHALL use these defaults: no checkpoint under 25K; 20/40/60/80 percent from 25K through 200K; 10 through 90 percent in ten-percent increments above 200K through 500K; and 5 through 90 percent in five-percent increments above 500K. Thresholds SHALL be sorted, deduplicated, and capped once at `safeBudget - 13_000`; later thresholds over that ceiling are omitted. A session permits no more than one active writer. A checkpoint is usable only after its persisted state and exact session/branch/epoch/source boundary commit together; a failure leaves the last usable checkpoint intact.

At the safe budget or on a provider context overflow, AILI SHALL first rebuild the provider projection through Pi's `context` hook from a current checkpoint, the bounded protected tail, and the active-block descriptor index. It SHALL invoke Pi-native `ctx.compact()` only when the checkpoint is missing, stale, or failed. A verified rebuild resets the crossed-threshold state. A final-threshold writer retries only after a settled transient failure and one normal threshold step of further context growth; deterministic, unclassified, and still-in-flight failures do not arm a retry. Failed rebuild and fallback SHALL block the oversized ordinary request with a bounded diagnostic; neither path may restore unlimited raw history or every full summary.

#### Scenario: Default checkpoint ladders vary by safe window
- **WHEN** safe working budgets are 24K, 128K, 256K, and 600K
- **THEN** their resolved checkpoint thresholds are respectively none; 20/40/60/80 percent; 10 through 90 percent by ten; and 5 through 90 percent by five, after the 13K ceiling is applied

#### Scenario: A long-window session reaches 90 percent
- **WHEN** a session above 200K crosses its resolved 90-percent threshold
- **THEN** it starts or confirms checkpoint preparation only and does not issue direct semantic compaction before the safe-budget or overflow condition

#### Scenario: A current checkpoint can rebuild
- **WHEN** context reaches the safe budget and a checkpoint binds the current session, branch, epoch, source revision, and valid bounded tail
- **THEN** the next provider projection uses that checkpoint and active-block descriptors without native compaction or full-history replay

#### Scenario: A checkpoint cannot rebuild
- **WHEN** no checkpoint is current, its writer failed, or its source binding is stale
- **THEN** Pi-native bounded compaction may run once as fallback; a second ordinary oversized request is blocked if that fallback fails

## MODIFIED Requirements

### Requirement: Release evidence covers fake, production-entry, and live recovery
Stable `v0.2.0` SHALL require exhaustive fake-provider evidence, official-Pi production-entry `AgentSession` context-error overflow/checkpoint/original-request retry/later-work evidence, copied-session repair/reload/tree/fork evidence, and deterministic batching/atomic reject/concurrency evidence. A separately authorized representative live Pi 0.82.1 path using one already available configured provider SHALL prove transport, protocol acceptance, extension order, and parent-to-persistent-child lifecycle, but SHALL NOT be required to naturally induce recovery failure conditions. The inherited P0 behavior SHALL be exercised on the merged candidate and MUST NOT require a separately published `v0.1.14` package, Anthropic or Google Gemini credentials, or duplicate complete live matrices for every provider family. Static inspection and direct event injection MUST NOT substitute for production-entry controlled recovery evidence.

#### Scenario: Sequential merged-spec validation is absent
- **WHEN** the complete five-stage sequence through release-lineage reconciliation has not been validated in release order
- **THEN** DEFINE/release validation remains non-pass

#### Scenario: The representative provider does not naturally overflow
- **WHEN** the fresh real-provider boundary passes but no provider context-length failure is induced
- **THEN** the live observation remains a documented `Unverified` limitation and stable release depends on exact controlled-provider production `AgentSession` overflow/checkpoint/retry/later-work evidence

#### Scenario: Controlled production recovery evidence is absent
- **WHEN** the production-entry controlled-provider overflow/checkpoint/retry/later-work row is missing, direct-injected, stale, or NON_PASS
- **THEN** stable release remains blocked even if real-provider transport passes
