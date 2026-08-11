## ADDED Requirements

### Requirement: Release lineage distinguishes behavior from publication history
The release contract SHALL preserve `fix-aili-compact-recovery-deadlock` as the mandatory P0 behavioral predecessor without claiming that a `v0.1.14` package, tag, commit, or P0-only candidate existed. The merged P0, lifecycle-redesign, and emergency-checkpoint implementation SHALL target exact package version `0.2.0`.

#### Scenario: A historical contract names an unpublished version
- **WHEN** an active release gate encounters the old `v0.1.14` predecessor claim
- **THEN** it resolves inherited behavior from the P0 contract and obtains rollback identity from verified publication evidence instead of fabricating the version

### Requirement: The rollback predecessor is externally verified and fail-closed
Before version-sensitive migration or publication, the release process SHALL compare fresh Git-remote tag evidence and npm-registry package evidence for the latest real published `0.1.x` predecessor. The expected predecessor is `0.1.16`. A missing version, package/tag mismatch, integrity failure, or different latest predecessor SHALL stop affected work and require contract reconciliation.

#### Scenario: Local history and registry agree on 0.1.16
- **WHEN** approved fresh lookups identify the same `@rosetears/aili-pi@0.1.16` release and corresponding Git tag
- **THEN** rollback evidence may bind exact `0.1.16` identity and integrity

#### Scenario: Registry evidence disagrees
- **WHEN** npm or Git identifies a different predecessor or cannot verify identity
- **THEN** no migration row, release artifact, or publication claim is marked PASS

### Requirement: Candidate identity and license history have separate owners
The current candidate version SHALL be sourced consistently across package, lock root, SBOM, runtime metadata, package checks, and release evidence. The AGPL disposition start SHALL remain independently fixed at `0.1.13`; changing the candidate to `0.2.0` MUST NOT rewrite that historical boundary.

#### Scenario: Candidate version is updated
- **WHEN** the approved version mutation sets the package candidate to `0.2.0`
- **THEN** every current identity consumer resolves `0.2.0` while license history still reports `0.1.13`

### Requirement: Rollback rehearsal uses the real predecessor package
The migration gate SHALL install the verified predecessor and exercise a sanitized copied-session forward/rollback sequence in disposable HOME/package roots. It SHALL prove byte-prefix preservation, no raw sidecar, expected v1/v2 replay, bounded v3 old-binary limitations, documented native-checkpoint recovery, and continued work. A synthetic binary, renamed current tree, direct hook, or source-only simulation MUST NOT satisfy the row.

#### Scenario: The old binary cannot interpret v3 state
- **WHEN** rollback opens a copied session containing candidate-era v3 entries
- **THEN** evidence records the documented limitation and safe native/no-new-v3 procedure without claiming semantic compatibility

### Requirement: Stable-release evidence is fresh and candidate-bound
Every required compatibility, Persistent Agent, AILI Compact, package, provenance, sanitizer, migration, performance, provider-boundary, controlled-production, and human-acceptance row SHALL bind the exact `0.2.0` candidate and current implementation hash. Missing, stale, manually relabeled, wrong-provider, unsanitized, or wrong-evidence-class evidence SHALL remain `NON_PASS`.

#### Scenario: Only an implementation hash changes
- **WHEN** source covered by a live claim changes
- **THEN** the affected live claim is rerun and cannot be restored by replacing its recorded hash alone

#### Scenario: A blocked skill record is manually changed
- **WHEN** compatibility JSON is edited without an executable Pi-owned adapter and behavior test
- **THEN** generated validation or review rejects the candidate

### Requirement: Release gates bind the current contract and reviewed evidence
The active release validator SHALL bind the current `reconcile-aili-compact-release-lineage` contract. A missing retired OpenSpec directory SHALL produce a bounded `NON_PASS` diagnostic and SHALL NOT suppress candidate validation. Required human review SHALL use a current reviewed-artifact schema independently bound to a validated sanitized live capture, exact candidate identity, and human verdict. It SHALL reject tier/restill candidate fields, forged/foreign capture bindings, stale verdicts, and wrapper shapes that cannot validate; it SHALL NOT require provider-authored tier transactions.

#### Scenario: A retired change directory is absent
- **WHEN** release validation runs for the current candidate and a retired redesign change directory does not exist
- **THEN** the validator reports the current-contract gate as `NON_PASS` rather than returning an empty error list

#### Scenario: Reviewed evidence carries retired tier fields
- **WHEN** a purported human-review artifact contains a tier/restill candidate wrapper or does not bind the validated capture and current candidate identity
- **THEN** candidate validation rejects it and the human-review row remains non-PASS

### Requirement: Real-provider and controlled-production evidence have separate owners
Stable `0.2.0` SHALL require one fresh sanitized representative live scenario through official Pi using any one currently available supported provider. That live evidence SHALL prove transport, provider protocol acceptance, controlled extension ordering, and a real parent-to-persistent-child lifecycle. It SHALL NOT be required to naturally induce a pressure-stage suffix, context-length failure, process-owned child sandbox marker, or four provider-authored semantic tiers.

Suffix/non-persistence, overflow/checkpoint/original-request retry/later-work, process-owned child sandbox work, active-block lifecycle, and dynamic checkpoint/rebuild SHALL instead pass deterministic controlled-provider tests through the official Pi production entry and `AgentSession`/Persistent Agent seams. Static inspection, direct event injection, source-only simulation, or relabeling a failed real-provider artifact MUST NOT satisfy those rows. The fresh 2026-08-04 OpenAI captures SHALL remain preserved as truthful evidence that those behaviors were not naturally observed in those attempts, but their absence SHALL NOT block release once the correct controlled-production rows pass and final human review accepts the limitation.

New controlled compression writes SHALL use source-backed active blocks and explicit two-to-sixteen block replacement, not a T1/T2/T3/restill hierarchy, fixed transaction count, tier age/source floor, or tier-specific immediate-child economics. Existing tiered v3 records SHALL remain readable for rollback and source proof only. Semantic summary defaults target 15,000 UTF-16 characters and share an 18,000-character runtime/configuration/parser/quality ceiling. A source/proof mismatch, stale replacement surface, fixed-tier dependency, watchdog failure, or total-budget overrun SHALL produce NON_PASS evidence.

Candidate release validation SHALL enforce the evidence-class boundary: the real-provider artifact may require only its transport/protocol/order/parent-child claims, while controlled-production artifacts own suffix, overflow, active-block lifecycle, and dynamic checkpoint/rebuild. A live suffix, overflow, or semantic-tier requirement remaining in a release validator or live harness SHALL be treated as a stale gate and block candidate PASS until its owner is reconciled.

The production entry SHALL accept official Pi `0.82.1`'s `parentId: null` representation only for the actual root Session entry during cold build or the first append to an empty branch index. Null or malformed parents elsewhere SHALL remain rejected. Controlled custom-tool evidence SHALL use a disposable exact permission configuration and the real extension lifecycle; it MUST NOT add a shipped Compact permission exemption, broad headless bypass, or approval injector.

Stable release SHALL NOT require a complete live matrix across provider families and SHALL NOT require Anthropic or Google Gemini credentials, authentication, transport availability, or live execution. OpenAI, Anthropic, and Google Gemini SHALL each retain deterministic offline serializer and protocol-compatibility coverage. Missing or unreconcilable provider cache telemetry SHALL produce no cache-hit claim, remain bounded `Unverified`, preserve conservative behavior, and SHALL NOT block stable release. This requirement supersedes inherited wording that requires every live row for all three provider families or natural failure induction on the representative provider.

#### Scenario: Only one supported provider is configured for live verification
- **WHEN** one available provider passes the official-Pi transport/order/parent-child boundary and all three provider families pass deterministic offline serializer/protocol compatibility
- **THEN** absent Anthropic or Google Gemini credentials and live rows do not block the stable candidate

#### Scenario: Real failure induction does not occur
- **WHEN** the fresh representative provider accepts requests but does not naturally produce pressure suffix, context overflow, child sandbox marker work, or semantic tier transactions
- **THEN** evidence retains those observations as bounded `Unverified` limitations and requires the corresponding deterministic production-entry rows instead of another real-provider attempt

#### Scenario: Official Pi supplies a null root parent
- **WHEN** a cold branch or empty-index first append receives the official Pi root entry with `parentId: null`
- **THEN** Compact normalizes only that root sentinel, builds a healthy index, and reaches provider-message alignment without weakening later ancestry checks

#### Scenario: A null parent appears after the root
- **WHEN** any later entry or non-empty-index append carries `parentId: null`
- **THEN** the index rejects the lineage and no controlled-production PASS artifact is generated

#### Scenario: Headless controlled tools need explicit authority
- **WHEN** a disposable controlled-production AgentSession calls `aili_compact_status` or `aili_compact`
- **THEN** the test binds the real extension lifecycle and uses exact test-only preauthorization for those names while shipped headless `ask → deny` behavior remains unchanged

#### Scenario: A provider reports no cache usage
- **WHEN** live usage has zero, absent, or ambiguous cache telemetry
- **THEN** evidence makes no cache-hit claim, retains conservative bounds, and does not fail compression or publication

### Requirement: Controlled evidence proves bounded active blocks and MiMo recovery
The controlled-production Compact evidence SHALL prove an AILI-owned active provider frontier distinct from the complete source-proof ledger. The current model continues to author source-backed active-block summaries through the existing Compact tools; no separate summarizer model, upstream ACP/MiMoCode code, hook, prompt, configuration, or persistence implementation is introduced. The frontier SHALL retain protected recent raw content, expose no more than 32 active block descriptors by default, and add full summaries only for 1–16 explicit recap/decompression selections that fit the active model request budget. It SHALL not automatically project all historical raw messages, all active full summaries, recursive ancestor expansions, or protected historical tool output.

The controlled matrix SHALL grow the active-block ledger beyond the default frontier, prove selected two-to-sixteen block recap retrieval before ordinary atomic replacement mutations, exact search/decompression of omitted ledger source, and fail-closed no-expansion on unknown context, stale selection, source/proof mismatch, or over-budget selected recaps. It SHALL also prove MiMo's exact window-dependent checkpoint ladders after Pi's reserves and 13K ceiling, checkpoint rebuild first at safe-budget/overflow, one bounded native fallback only when needed, and no full-history restoration. A fallback that silently restores unbounded history, a missing frontier/recovery counter, source/proof leakage, or a budget/watchdog failure SHALL be NON_PASS.

#### Scenario: The ledger outlives the frontier
- **WHEN** an older active block is absent from the default provider frontier
- **THEN** its status reference, source proof, promotion eligibility, and exact search/decompression remain available from the current source-proof ledger

#### Scenario: Checkpoint recovery preserves the active-block view
- **WHEN** a current checkpoint is available at the safe budget or provider overflow
- **THEN** the next provider projection rebuilds from that checkpoint, protected tail, and active descriptors before considering native compaction or raw-history restoration

### Requirement: The default 0.2.0 distribution excludes retired optional integrations
The `0.2.0` candidate SHALL NOT register, depend on, bundle, advertise, or generate active provenance/capability evidence for `@narumitw/pi-lsp` or `pi-markdown-preview`. The package, lockfile, native-integration inventory, doctor/capability output, documentation, provenance/SBOM, package archive, and focused tests SHALL agree that `lsp_diagnostics`, `lsp_fix`, `/lsp`, `/preview*`, and `preview_export` are absent. `pi-cache-optimizer` SHALL remain selected. No AILI-owned replacement or compatibility alias SHALL be introduced.

#### Scenario: The candidate package is generated after removal
- **WHEN** package, generated evidence, runtime registration, and dry-run inventory are checked for exact `0.2.0`
- **THEN** neither retired package nor its public tools/commands or unreachable bundled dependency closure is present, while the remaining selected integrations still load

#### Scenario: A user wants one retired feature later
- **WHEN** a user independently installs the upstream Pi extension
- **THEN** that opt-in remains outside the default AILI package contract and does not cause AILI to ship a hidden fallback or duplicate implementation

### Requirement: Publication operations remain separately authorized
Network lookup, provider credentials and billable calls, version/lockfile mutation, package installation, commit, push, tag, npm publish, and GitHub release SHALL each use their applicable exact approval. Acceptance of this contract or its test plan MUST NOT imply authority for any of those operations.

#### Scenario: Local candidate gates pass
- **WHEN** all safe-local checks pass but publish approval is absent
- **THEN** the process stops at a verified local candidate and performs no publication mutation

### Requirement: Release evidence reconciles the complete selected candidate
The complete current working tree selected by the user SHALL be treated as one `0.2.0` candidate for release validation. Its release-evidence validators and artifacts SHALL require current controlled tierless active-block and MiMo recovery evidence, rather than the retired 50-transaction tier hierarchy. A stale compatibility artifact, release artifact, or live binding SHALL remain `NON_PASS` until regenerated or rerun through its owning evidence path; editing a stored hash or relabeling historical evidence SHALL NOT satisfy the gate.

#### Scenario: A retired hierarchy artifact is present
- **WHEN** the current candidate's release validator encounters a 50-transaction or tier-specific controlled-production requirement
- **THEN** the validator is reconciled to current active-block/MiMo controlled evidence before it may report a passing candidate
