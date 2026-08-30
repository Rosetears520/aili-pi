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
- **WHEN** an explicitly requested port is already unavailable
- **THEN** startup reports non-success and does not persist or display a ready address

#### Scenario: Busy default port falls back for the Pi-owned child
- **WHEN** `/web` or `/changes` launches its child on the default port and that port is already held by a foreign process (for example a leftover standalone server)
- **THEN** the child moves to a kernel-assigned free loopback port, readiness is reported with the actual address and a note about the switch, and no error is surfaced

#### Scenario: Pi parent dies
- **WHEN** a `/web` child detects that its owning Pi process has died
- **THEN** it shuts down, releases its own lease, and removes task-owned bootstrap or address artifacts

### Requirement: Standalone changes-viewer launcher
The package SHALL ship a `pi-changes` executable that starts the same packaged, version-locked Web build on a loopback listener and lands the browser directly on the changes page, without a Pi session, the `/web` command, or the workbench UI. It SHALL reuse the shared launcher core (runtime checks, packaged-build verification, pre-listen access control, readiness plumbing, and clean shutdown), bind a free port by default so it never clashes with a running `pi-web`, seed the startup allowed roots from its optional directory argument, and introduce no new dependency or build pipeline. The package SHALL additionally register an inert Pi `/changes` command that starts or reuses the same one web child as `/web` and reports the changes-viewer entry URL for the session directory instead of the workbench root.

#### Scenario: Launching the viewer directly
- **WHEN** a user runs `pi-changes <repository path>`
- **THEN** the packaged Web server starts on a loopback free port, the browser opens on `/changes` for that path, and the path is admitted as an allowed root

#### Scenario: Launching without a path
- **WHEN** a user runs `pi-changes` without a directory argument
- **THEN** the changes page opens bare and restores or asks for the working directory itself

#### Scenario: Opening from Pi without the workbench
- **WHEN** the user invokes `/changes` in a Pi session
- **THEN** the Pi-owned web child starts (or its live instance is reused) and the user is given the changes-viewer URL for the session directory, without needing to open the workbench UI

#### Scenario: Launcher termination
- **WHEN** a `pi-changes` process receives a normal termination signal
- **THEN** it stops its server child and exits without leaving a detached singleton, exactly like standalone `pi-web`

### Requirement: Version-locked packaged runtime
The packaged Web application SHALL be adapted from active exact `@agegr/pi-web@0.8.11` tag revision `28bab3c25f5f6770c9b0b745ebbfec1c27f7b948` (npm gitHead `024be0b1154ba8a2650237a2db8bfa89124e167e`) and SHALL declare compatibility with official Pi `0.84.4` and Node.js `>=22.19.0`; 0.8.9 remains historical evidence only. Runtime compatibility mismatch MUST fail before session mutation.

#### Scenario: Incompatible runtime is rejected
- **WHEN** the packaged Web contract or Pi runtime version does not match the supported compatibility manifest
- **THEN** startup or mutation admission fails with an actionable error before changing session state
