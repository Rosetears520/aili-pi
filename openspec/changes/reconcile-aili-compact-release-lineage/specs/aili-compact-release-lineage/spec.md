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

### Requirement: Real-provider and controlled-production evidence have separate owners
Stable `0.2.0` SHALL require one fresh sanitized representative live scenario through official Pi using any one currently available supported provider. That live evidence SHALL prove transport, provider protocol acceptance, controlled extension ordering, and a real parent-to-persistent-child lifecycle. It SHALL NOT be required to naturally induce a pressure-stage suffix, context-length failure, process-owned child sandbox marker, or four provider-authored semantic tiers.

Suffix/non-persistence, overflow/checkpoint/original-request retry/later-work, process-owned child sandbox work, and lifecycle/tiering SHALL instead pass deterministic controlled-provider tests through the official Pi production entry and `AgentSession`/Persistent Agent seams. Static inspection, direct event injection, source-only simulation, or relabeling a failed real-provider artifact MUST NOT satisfy those rows. The fresh 2026-08-04 OpenAI captures SHALL remain preserved as truthful evidence that those behaviors were not naturally observed in those attempts, but their absence SHALL NOT block release once the correct controlled-production rows pass and final human review accepts the limitation.

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
