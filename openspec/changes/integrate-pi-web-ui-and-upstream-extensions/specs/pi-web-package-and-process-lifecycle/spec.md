## ADDED Requirements

### Requirement: Single-package Web delivery
The system SHALL ship the AILI Web application, its runtime assets, and its `pi-web` executable inside the existing `@rosetears/aili-pi` package while retaining one Pi Extension entry. Installing or loading the package MUST NOT start the Web server or include Web source or assets in model context merely because they are installed.

#### Scenario: Ordinary package load is inert
- **WHEN** a user installs the package or starts Pi without invoking a Web entry point
- **THEN** no Web listener or detached Web process starts and no Web application source or asset is added to the model context

#### Scenario: Packed package exposes one Web executable
- **WHEN** the exact npm tarball is inspected after build
- **THEN** it contains the declared `pi-web` executable and required runtime assets while preserving the single Pi Extension entry

### Requirement: On-demand foreground startup
The system SHALL provide standalone `pi-web` and Pi `/web` entry points that start or report the packaged Web server on demand. A standalone server SHALL be owned by its foreground shell process, and a `/web` server SHALL be a non-detached child owned by the invoking Pi process. Startup SHALL report readiness only after the listener and private runtime channel are usable. Port collision, child startup failure, repeated `/web`, parent crash, stale recorded address, and shutdown cleanup SHALL have explicit non-success or recovery behavior and MUST NOT leave a falsely reported ready server.

#### Scenario: Pi-owned Web child stops
- **WHEN** `/web` starts a Web server and the owning Pi process exits cleanly
- **THEN** the child server stops and no hidden daemon remains

#### Scenario: Standalone process stops
- **WHEN** a standalone `pi-web` process receives a normal termination signal
- **THEN** it closes its server, settles owned cleanup, and exits without leaving a detached singleton

#### Scenario: Repeated web command reuses live child
- **WHEN** `/web` is invoked again while its Pi-owned child is healthy
- **THEN** Pi reports the current address and does not start a second server

#### Scenario: Stale address is not reused
- **WHEN** `/web` finds recorded child state whose process or private channel is dead
- **THEN** it clears the stale state and either starts one new child or reports a concrete startup failure

#### Scenario: Port collision blocks readiness
- **WHEN** the requested port is already unavailable
- **THEN** startup reports non-success and does not persist or display a ready address

#### Scenario: Pi parent dies
- **WHEN** a `/web` child detects that its owning Pi process has died
- **THEN** it shuts down, releases its own lease, and removes task-owned bootstrap or address artifacts

### Requirement: Version-locked packaged runtime
The packaged Web application SHALL be adapted from the exact accepted Pi Web source revision and SHALL declare compatibility with official Pi `0.84.1` and Node.js `>=22.19.0`. Runtime compatibility mismatch MUST fail before session mutation.

#### Scenario: Incompatible runtime is rejected
- **WHEN** the packaged Web contract or Pi runtime version does not match the supported compatibility manifest
- **THEN** startup or mutation admission fails with an actionable error before changing session state
