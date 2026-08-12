## ADDED Requirements

### Requirement: Official Pi 0.84.1 is the exact supported baseline
Development/runtime-resolved identities for `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` and `@earendil-works/pi-tui` SHALL be exactly `0.84.1`. Host-provided `peerDependencies` MAY remain `*` where Pi package rules require host compatibility, but runtime resolution, dev dependencies, lockfile inventory, compatibility tests and provenance SHALL bind the tested baseline to `0.84.1`. Documentation and doctor MUST NOT retain `0.82.1` as current.

#### Scenario: Package metadata is validated
- **WHEN** runtime and development Pi packages are inspected
- **THEN** every official Pi baseline identity is `0.84.1` and generated evidence agrees

#### Scenario: Stale or duplicate baseline remains
- **WHEN** current package/docs/tests claim `0.82.1`, the dependency tree contains a nested conflicting Pi core version, or runtime imports resolve a non-0.84.1 host package during verification
- **THEN** compatibility validation fails

### Requirement: Upstream integrations are adopted without unsupported peer-range claims
`pi-codex-compact`, `billion-context-pi`, `pi-retry` and other embedded or dependent Pi integrations SHALL be typechecked and seam-tested against Pi `0.84.1`. A stale or wildcard peer declaration MUST NOT be treated as behavior evidence without source/API inspection and focused seam tests.

#### Scenario: Upstream symbol changed in Pi 0.84.1
- **WHEN** compile or seam tests find an API mismatch
- **THEN** a documented compatibility patch preserves behavior or the affected integration blocks as material discovery

#### Scenario: Upstream loads without declared compatibility evidence
- **WHEN** only a package manifest edit widens the range
- **THEN** validation remains non-pass until runtime seams are tested

### Requirement: Pi 0.84.1 lifecycle and UI APIs remain authoritative
Session, compaction, provider, message, retry and UI integration SHALL use public Pi `0.84.1` APIs. Prototype patches and reliance on obsolete private component contracts are forbidden.

#### Scenario: Integration initializes
- **WHEN** the full package loads on Pi `0.84.1`
- **THEN** extensions register without duplicate providers/tools/handlers and all cleanup hooks use supported lifecycle events
