## ADDED Requirements

### Requirement: Exact locked upstream imports
Source absorption SHALL use exact immutable revisions of `@agegr/pi-web@0.8.8`, `pi-analytics`, `pi-btw`, `pi-stamp`, and `pi-worktree` only during separately authorized BUILD operations. Each import SHALL record source URL, package version, revision, archive identity, license, copyright, and adaptation scope.

#### Scenario: Imported revision differs
- **WHEN** imported source or archive identity differs from the accepted lock
- **THEN** synchronization and packaging validation fail before the source is treated as authoritative

### Requirement: AILI-owned adaptation boundary
Imported source SHALL be adapted into AILI-owned runtime and Web modules. The released package MUST NOT depend at runtime on the five absorbed upstream npm packages, and Codex, `pi-gui`, and OpenCode source, protocols, runtimes, or data models MUST NOT enter the implementation.

#### Scenario: Runtime dependency inspection
- **WHEN** the exact release tarball and installed dependency graph are inspected
- **THEN** none of the five absorbed upstream packages appears as a runtime dependency while their required adapted behavior is present

### Requirement: License notices and SBOM
The package SHALL preserve applicable MIT texts, copyright notices, source/revision attribution, adaptation notes, third-party notices, machine-readable locks, package provenance, and SPDX SBOM entries for included upstream material.

#### Scenario: Included source lacks attribution
- **WHEN** a copied or adapted upstream file has no traceable lock, notice, or SBOM disposition
- **THEN** package validation fails and release readiness is denied

### Requirement: Reviewed future updates
Future upstream changes SHALL be imported only through a new explicit reviewed update against the existing lock and adaptation inventory. The system MUST NOT automatically replace absorbed source at install or runtime.

#### Scenario: Upstream publishes a new version
- **WHEN** a later upstream package or revision becomes available
- **THEN** the installed AILI runtime remains on its locked source until a separately authorized reviewed import updates the contract and evidence

### Requirement: Packed-install provenance convergence
The exact npm tarball SHALL contain only the intended generated Web assets, adapted runtime source, licenses, notices, and public package files, and SHALL successfully start from a clean installation without relying on repository-only or user-local upstream source.

#### Scenario: Clean packed installation
- **WHEN** the exact tarball is installed into a disposable environment and `pi-web` is started in bounded foreground mode
- **THEN** it loads all required packaged assets and reports readiness without reading the source repository or downloading an absorbed upstream runtime package
