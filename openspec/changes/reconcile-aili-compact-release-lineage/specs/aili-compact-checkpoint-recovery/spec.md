## ADDED Requirements

### Requirement: P0 recovery inheritance is version-neutral
REC-001 through REC-008 and the later emergency-checkpoint corrections SHALL remain mandatory for the `0.2.0` candidate regardless of whether the P0 fix was independently published. Release validation SHALL exercise the inherited behavior against the merged candidate rather than depend on a fabricated P0-only package.

#### Scenario: The merged candidate runs P0 regression
- **WHEN** focused, full, fake-provider, or live release validation executes
- **THEN** deterministic-or-`undefined`, Pi final fallback/retry, no cancellation, append-only history, branch/epoch isolation, and storm prevention remain required

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
