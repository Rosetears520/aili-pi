## ADDED Requirements

### Requirement: aili-pi web launch command
The package SHALL provide an `aili-pi` executable whose `web` subcommand runs the same foreground Web server as the packaged `pi-web` launcher: loopback by default, fail-closed non-loopback admission, explicit packaged-build checks, signal-safe ownership, and no detached survivor processes. On readiness it SHALL print the bound address to the terminal. `npx @rosetears/aili-pi web` MUST work on a clean install. The existing `pi-web` bin SHALL remain as an alias with identical behavior.

#### Scenario: Clean-install launch
- **WHEN** a user runs `npx @rosetears/aili-pi web` on a clean install
- **THEN** the packaged Web server starts in the foreground and prints its address

#### Scenario: Signal-safe shutdown
- **WHEN** the user interrupts `aili-pi web` with Ctrl+C
- **THEN** the server and its children stop and no orphan listener remains

### Requirement: Optional browser opening
`aili-pi web` SHALL accept an `--open` flag that opens the default browser at the bound address after readiness. Without the flag, no browser is opened and only the address is printed. Browser opening MUST remain an operator-facing startup action, never a background process.

#### Scenario: Default prints only
- **WHEN** a user runs `aili-pi web` without `--open`
- **THEN** the address is printed and no browser process is started

#### Scenario: Open flag launches the browser once
- **WHEN** the server becomes ready after `aili-pi web --open`
- **THEN** the default browser opens the bound address exactly once

### Requirement: Argument parity and safety
`aili-pi web` SHALL accept the same hostname/port options as `pi-web`, reject unsupported arguments with a bounded error, and MUST NOT place secrets, passwords, or bootstrap material in argv. Unknown subcommands or missing `web` SHALL print bounded usage help and exit non-zero without starting a server.

#### Scenario: Port override
- **WHEN** a user runs `aili-pi web --port 30150`
- **THEN** the server binds to the requested port and prints the matching address

#### Scenario: Unknown input fails closed
- **WHEN** a user runs `aili-pi frobnicate`
- **THEN** bounded usage help is printed, the exit code is non-zero, and no server starts
