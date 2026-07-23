## ADDED Requirements

### Requirement: Capability registry is complete and machine readable
[框架内] The Package SHALL include a validated registry for every core/optional capability with ID, provider/adapter owner, platform, required/optional class, secret/network/side-effect class, probe, and dependent skills.

#### Scenario: Registry is validated
- **WHEN** [框架内] build/prepack validation runs
- **THEN** [框架内] duplicate IDs, unknown providers, missing probes, invalid status values, and dangling skill references fail the check

### Requirement: Skill compatibility uses four exclusive states
[框架内] Every embedded skill SHALL have exactly one of `native`, `adapted`, `optional`, or `blocked`, with evidence and reason. Discovery alone MUST NOT qualify as `native` or `adapted`.

#### Scenario: Native skill behavior is proven
- **WHEN** [框架内] Pi supplies all required capabilities and focused behavior tests pass
- **THEN** [框架内] the skill may be marked `native` with linked evidence

#### Scenario: Adapter supplies behavior
- **WHEN** [框架内] an AILI adapter implements required capabilities and focused behavior tests pass
- **THEN** [框架内] the skill may be marked `adapted` with adapter/test references

#### Scenario: Evidence is missing
- **WHEN** [框架内] a skill is packaged but its behavior or required capability has not been established
- **THEN** [框架内] it is `blocked` or named `optional`, never silently `native`

### Requirement: Optional packs are explicit and fail visibly
[框架内] Optional capabilities SHALL not be installed by core setup. Each optional pack SHALL declare its missing behavior, install/enable guidance, side effects, and future ownership contract.

#### Scenario: Optional pack is absent
- **WHEN** [框架内] a skill requires an optional capability that is not enabled
- **THEN** [框架内] doctor and runtime return `SKIP/WARN` with the capability/pack ID and do not claim the work ran

#### Scenario: Optional pack would create external state
- **WHEN** [框架内] enabling a pack requires download, dependency, settings, external directory, credential, browser, or service writes
- **THEN** [框架内] core setup does not perform it without the pack's separate accepted contract and exact operation approval

### Requirement: Doctor reports human and JSON evidence
[框架内] AILI doctor SHALL provide human-readable and machine-readable results for Pi/version/API, Package resources, skill snapshot/hash, ROSE/prompts, roles/subagent runtime, permission mode/shortcut, registry/packs, conflicts, platform, and provenance.

#### Scenario: Healthy core installation
- **WHEN** [框架内] all required probes pass and no unexplained blocked item exists
- **THEN** [框架内] doctor reports core PASS, includes observed versions/hashes, and distinguishes optional SKIP from failure

#### Scenario: Required component fails
- **WHEN** [框架内] a required resource, hash, role, policy, API, or probe fails
- **THEN** [框架内] doctor returns a non-pass exit/status and identifies the exact failed component without exposing secrets

### Requirement: Stable release forbids unexplained blocked work
[框架内] A stable release SHALL fail validation if any embedded skill, required role, lifecycle prompt, core capability, required platform check, or provenance item is missing, unclassified, or `blocked` without an accepted non-release disposition.

#### Scenario: Compatibility report contains blocked item
- **WHEN** [框架内] release validation finds an unexplained `blocked` record
- **THEN** [框架内] stable release validation fails and lists the record/evidence gap

#### Scenario: Optional item is intentionally unavailable
- **WHEN** [框架内] an item is classified `optional` with complete guidance and core behavior remains valid
- **THEN** [框架内] stable validation may pass while doctor reports that item as optional SKIP

### Requirement: Provenance gates third-party reuse
[框架内] Any copied/adapted community code or production dependency SHALL record exact source/revision/version, license, files/symbols used, local changes, and verification in notices/SBOM. Missing or conflicting provenance SHALL block adoption.

#### Scenario: Audited MIT pattern is adapted
- **WHEN** [框架内] a community implementation passes license/provenance/API/maintenance review and code is adapted
- **THEN** [框架内] required notice/SBOM records and focused tests are present before release validation passes

#### Scenario: Source license cannot be established
- **WHEN** [框架内] repository/package metadata and license artifacts do not establish copying rights
- **THEN** [框架内] source code is not copied and remains reference-only

### Requirement: Doctor never converts missing work into success
[框架内] Probe errors, timeouts, malformed output, skipped checks, unavailable tools, and unsupported platforms SHALL remain distinguishable. Doctor MUST NOT swallow them or aggregate them into an unconditional success.

#### Scenario: Probe throws or times out
- **WHEN** [框架内] a doctor probe fails to return valid evidence within its bound
- **THEN** [框架内] the component is ERROR/UNVERIFIED with bounded diagnostics, not PASS

## Superseding Native-Integration Registry Requirements — 2026-07-23

### Requirement: Native dependency integrations have exact provenance
[框架内] The registry and provenance artifacts SHALL record the exact package version, source revision/license evidence, integration boundary, external-state class, and focused verification for `pi-web-access`, `pi-quota-status`, `pi-permission-modes`, and `@agwab/pi-subagent`.

### Requirement: Web-access side effects are visible
[框架内] Doctor and documentation SHALL identify `pi-web-access` provider fallback, config/credential locations, bundled skill/commands, and possible clone/PDF/video/browser-cookie side effects. They SHALL not claim a provider, filesystem boundary, browser behavior, or network result that lacks fresh evidence.

#### Scenario: One pinned integration drifts
- **WHEN** [框架内] the dependency/lock/provenance record differs from the accepted exact integration evidence
- **THEN** [框架内] validation fails with the specific package and AILI does not label the integration healthy

### Requirement: Doctor distinguishes global-resource and sandbox state
[框架内] Doctor SHALL separately report global ROSE block state, global role-profile state, delegated permission/sandbox availability, quota-state location, and native-search provider support. Missing resources, unapproved real-global probes, or unavailable sandbox prerequisites SHALL remain non-pass/unverified/degraded as applicable.

#### Scenario: No global resources are installed
- **WHEN** [框架内] a disposable or actual Pi home lacks the AILI marker block or global profiles
- **THEN** [框架内] doctor reports the exact missing target and does not claim package installation created it
