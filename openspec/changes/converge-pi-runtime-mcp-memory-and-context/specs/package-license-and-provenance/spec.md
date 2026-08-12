## ADDED Requirements

### Requirement: The project primary license is MIT
The root project license, package metadata and public README SHALL consistently identify MIT as the primary `@rosetears/aili-pi` license after repository-owner authorization. Retained source whose copyright or license cannot be relicensed MUST remain separately identified or leave the project.

#### Scenario: License metadata is validated
- **WHEN** package, lock root, root LICENSE and README are inspected
- **THEN** they agree on MIT and no stale AGPL primary-license claim remains

#### Scenario: Retained source has incompatible ownership evidence
- **WHEN** provenance cannot establish that a file may be distributed under the intended project license
- **THEN** license validation fails until the file is separately licensed, replaced or removed

### Requirement: Third-party licenses remain intact
AILI SHALL preserve each dependency's and copied/adapted source's own license, copyright and required notice. The MIT project license MUST NOT rewrite Apache-2.0 or other third-party obligations.

#### Scenario: Playwright MCP enters the inventory
- **WHEN** its package is installed or configured as an external component
- **THEN** Apache-2.0 identity and required notice/license evidence remain distinct from the MIT project license

### Requirement: Provenance, notices and SBOM derive from canonical inputs
Every dependency, bundled package, copied source and reference-only source SHALL have the correct provenance disposition, immutable identity, license, local boundary and verification. Generated `THIRD_PARTY_NOTICES.md` and SPDX SBOM SHALL be byte-verified against those inputs and the lockfile.

#### Scenario: Dependency or lockfile changes
- **WHEN** MCP/context packages are added, removed or repinned
- **THEN** provenance input, notices and SBOM regenerate consistently or validation fails

#### Scenario: Reference-only source is listed
- **WHEN** no source was copied or adapted
- **THEN** it remains reference-only and is not represented as a bundled source package

### Requirement: Real package inventory proves inclusion and exclusion
Release validation SHALL inspect a real npm tarball/clean install. It SHALL prove required Workflow, MCP adapter, complete upstream context runtime and license evidence are present, while retired Matrix/theme/Zentui/AILI Compact/duplicate Workflow resources are absent.

#### Scenario: Manifest exclusions and tarball differ
- **WHEN** a retired file is accidentally packed or a required bundled dependency is missing
- **THEN** package validation fails even if source-level manifest tests pass

### Requirement: Installation and release operations remain separate
License change, dependency installation, lockfile mutation, external tool installation, configuration writes, publication and release SHALL require their own exact authorization and evidence. A passing license or package check MUST NOT publish or mutate external state.

#### Scenario: DEFINE becomes complete
- **WHEN** specs, design, tasks, test plan and validation are accepted
- **THEN** no package, user configuration or registry is changed until the applicable BUILD/operation authorization is granted
