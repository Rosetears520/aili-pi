## MODIFIED Requirements

### Requirement: Consumed tool results cool safely and in bounded groups
Consumed tool results SHALL cool only under the exact result-body profile, successful-later-request observation identity, unresolved-error resolution, durable-reference protection, and fail-safe registry rules in `aili-compact-branch-index`. Existing decisions replay unchanged; new decisions are versioned and never remove protocol metadata.

#### Scenario: Result has only aged
- **WHEN** no successful later request observed its exact identity
- **THEN** its body remains raw

### Requirement: Adaptive guidance and custom prompts are bounded
User-authored immutable guidance remains bounded. Dynamic pressure/catalog/action guidance SHALL exist only in the transient provider suffix, never in the system prompt or Session history, and SHALL obey the exact suffix/cache contract in `aili-compact-safe-planning`.

#### Scenario: Pressure changes
- **WHEN** dynamic lifecycle state changes
- **THEN** static guidance remains byte-stable and only the transient suffix may change

### Requirement: Cache identity and telemetry are truthful
Cache telemetry SHALL distinguish static surface, AILI logical pre-suffix provider prefix, suffix fingerprint, and full provider input. Logical identity is not a provider implementation claim; only provider-reported usage proves a hit.

#### Scenario: No usage is reported
- **WHEN** logical/full identities match but provider usage is absent
- **THEN** telemetry does not report an actual cache hit

## ADDED Requirements

### Requirement: Configuration defaults and validation are explicit
Legacy recent-user, character-gain, dynamic-nudge, cooling, and purge keys SHALL remain parseable only through explicit deprecation mapping. Effective v0.2.0 behavior SHALL use atom/token protection, production-projected token economics, provider suffix, exact cooling profiles, and no age-only semantic purge. `planning.enabled` defaults true with its narrow disable semantics; unsafe values fail closed.

#### Scenario: Planning is disabled
- **WHEN** `planning.enabled=false`
- **THEN** automatic planning stops but manual mutation, protection, quality, checkpoint/native/rescue/overflow remain enabled

### Requirement: Compression benefit uses bounded character gain
Character count MAY be diagnostic only and MUST NOT authorize mutation. Eligibility SHALL use the exact production projector/serializer token bounds and complete replacement/one-time-cost accounting defined by `aili-compact-safe-planning`.

#### Scenario: Characters save but tokens do not
- **WHEN** character gain is positive but guaranteed token savings fail
- **THEN** mutation is ineligible

### Requirement: Semantic blocks purge safely
Age, size, cooling, or a legacy purge timer MUST NOT deactivate top-level semantic coverage. Only explicit tagged lineage, decompression/recompression, control, or epoch transitions using the existing reason set may change active state; ambiguous legacy purge state fails closed.

#### Scenario: Legacy purge timer expires
- **WHEN** a maximal semantic leaf exceeds its old age/size threshold
- **THEN** it remains active absent an explicit accepted transition

### Requirement: Existing range and message modes remain compatible beside block mode
The accepted bounded `range` and `message` interfaces SHALL remain available and SHALL adopt complete-atom protection, exact safe-range, token-benefit, and quality gates. `mode:"blocks"` SHALL be additive and SHALL not change valid caller syntax for existing modes.

#### Scenario: Existing message-mode caller upgrades
- **WHEN** it supplies valid current refs and summary under v0.2.0
- **THEN** the call remains valid if the exact scope, token, protection, and quality gates pass

### Requirement: Pure replay and projection remain the correctness oracle
BranchIndex SHALL optimize current-branch replay, references, and alignment without weakening append-only source-of-truth, branch/epoch isolation, atomic mutation, source digests, or exact fail-open projection. Index uncertainty SHALL use the pure path or exact input rather than approximate output.

#### Scenario: Indexed and pure state disagree
- **WHEN** canonical digests differ
- **THEN** AILI marks index unhealthy, exposes bounded diagnostics, and uses pure/fail-open behavior

### Requirement: Explicit user restoration outranks automatic lifecycle work
One-level/raw decompression, restore-all, and valid explicit state SHALL not be undone by age, cooling, index rebuild, calibration, quality migration, or automatic tier promotion. Only exact user-requested recompression with unchanged provenance may restore a prior parent.

#### Scenario: Session reloads after raw restoration
- **WHEN** automatic lifecycle/index initialization runs
- **THEN** raw restoration remains authoritative and no ancestor is silently reactivated
