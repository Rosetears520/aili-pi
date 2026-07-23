## ADDED Requirements

### Requirement: Official Pi remains the runtime and user CLI
[框架内] The distribution SHALL install as `@rosetears/aili-pi` on official Pi and SHALL keep `pi` as the daily agent command. It MUST NOT install a replacement agent executable named `pi`, `aili`, or `omp`.

#### Scenario: User starts AILI after installation
- **WHEN** [框架内] the AILI Package has been installed successfully
- **THEN** [框架内] the documented startup command is `pi`, and AILI resources load through Pi Package discovery

#### Scenario: Package metadata is inspected
- **WHEN** [框架内] the npm tarball and `package.json` are inspected
- **THEN** [框架内] they identify `@rosetears/aili-pi` as a Pi Package and do not replace the official Pi agent CLI

### Requirement: Unix bootstrap is thin and delegates package ownership
[框架内] The Linux bootstrap SHALL only ensure official Pi is present, run AILI compatibility preflight, and delegate Package installation to `pi install`. It MUST NOT duplicate Pi update/remove logic or take ownership of Pi settings.

#### Scenario: Clean Unix machine has no Pi
- **WHEN** [框架内] the bootstrap runs on supported Linux and `pi` is absent
- **THEN** [框架内] it invokes the official Pi installer, verifies the resulting executable, runs AILI preflight, and then invokes `pi install` for the AILI source

#### Scenario: Existing Pi is present
- **WHEN** [框架内] the bootstrap finds an existing Pi and `--update-pi` was not supplied
- **THEN** [框架内] it leaves that Pi installation unchanged and proceeds to compatibility preflight

#### Scenario: Explicit Pi update is requested
- **WHEN** [框架内] the user supplies `--update-pi`
- **THEN** [框架内] the bootstrap uses Pi's official update/install path before preflight and reports the resulting Pi version

### Requirement: Latest policy fails closed before AILI mutation
[框架内] A clean installation SHALL use the official Pi latest available at execution time. The setup SHALL check Pi version/API/resource compatibility before registering or modifying the AILI Package and SHALL stop with actionable diagnostics when the check fails.

#### Scenario: Latest Pi passes compatibility smoke
- **WHEN** [框架内] official latest Pi is installed and all required preflight probes pass
- **THEN** [框架内] setup proceeds to `pi install` and records the observed Pi version in its result

#### Scenario: Pi fails compatibility smoke
- **WHEN** [框架内] a required version, Extension API, package-resource, or headless-load probe fails
- **THEN** [框架内] setup exits non-zero before AILI Package mutation and identifies the failed probe without exposing credentials

### Requirement: Bootstrap preserves user-owned Pi state
[框架内] Core setup SHALL NOT overwrite Pi settings, authentication, sessions, other packages, or user project files. A failure after official Pi installation SHALL NOT automatically remove Pi.

#### Scenario: AILI package installation fails after Pi was installed
- **WHEN** [框架内] official Pi installation succeeds but AILI installation fails
- **THEN** [框架内] setup leaves official Pi installed, reports Pi and AILI states separately, and returns a repair command

#### Scenario: Existing user configuration is present
- **WHEN** [框架内] setup runs with existing Pi settings, credentials, sessions, and packages
- **THEN** [框架内] byte-for-byte unrelated user state remains unchanged

### Requirement: Package lifecycle uses Pi management
[框架内] Install, update, list, and remove operations for core AILI Package files SHALL use Pi package-management commands. Core AILI SHALL NOT create a parallel ownership database or receipt for files already owned by the Pi Package.

#### Scenario: User removes the core package
- **WHEN** [框架内] the user runs the documented Pi remove command for `@rosetears/aili-pi`
- **THEN** [框架内] Pi removes the Package registration/resources without AILI deleting Pi, credentials, sessions, other packages, or project files

#### Scenario: Setup is repeated
- **WHEN** [框架内] setup is run again against the same installed source
- **THEN** [框架内] it delegates reconciliation to Pi, does not duplicate resources, and reports an idempotent or updated state

### Requirement: Initial platform scope is explicit
[框架内] The stable scope of this change SHALL cover Linux only. macOS and native Windows support SHALL be reported as unsupported rather than silently treated as verified.

#### Scenario: Supported Unix platform
- **WHEN** [框架内] setup runs on a supported Linux test fixture
- **THEN** [框架内] platform preflight proceeds and reports the detected OS/architecture

#### Scenario: Native Windows invocation
- **WHEN** [框架内] the Unix-first bootstrap is invoked on native Windows
- **THEN** [框架内] it stops with an explicit unsupported-platform result and does not claim installation success

#### Scenario: macOS invocation

- **WHEN** [框架内] the Linux-only bootstrap is invoked on macOS
- **THEN** [框架内] it stops before mutation with an explicit unsupported-platform result and does not claim installation success

## Superseding Global Resource Installation Requirements — 2026-07-23

### Requirement: Global AILI resources require an explicit installation action
[框架内] Normal `pi install` Package registration SHALL not write `~/.pi/agent/APPEND_SYSTEM.md` or `~/.pi/agent/agents/aili/`. A separate documented bootstrap action SHALL name both targets and only create/update marker-owned AILI content.

#### Scenario: Explicit global-resource action runs in an empty Pi home
- **WHEN** [框架内] the user invokes the documented global-resource action with a fresh disposable Pi home
- **THEN** [框架内] it creates the AILI global prompt block and namespaced profile directory, records only safe version/hash state, and reports each target separately

#### Scenario: Existing unrelated global content is present
- **WHEN** [框架内] either target contains unowned content/file names
- **THEN** [框架内] the action preserves that content, fails on ownership/marker conflict, and never silently replaces it

#### Scenario: A stale AILI profile exists
- **WHEN** [框架内] a previously managed profile is no longer in the current manifest
- **THEN** [框架内] the action leaves it in place, reports it as stale, and does not delete it automatically

## Superseding Embedded Skill Discovery Requirements — 2026-07-23

### Requirement: Pi-managed package installation refreshes only matching global skills
[已知|用户] The npm package lifecycle SHALL use its embedded pinned snapshot to replace only existing same-name real directories beneath `~/.agents/skills/`. It SHALL not create package-only skill directories, alter differently named user skills, retain a backup after a successful replacement, fetch a moving upstream source, or run outside Pi-managed npm package roots.

#### Scenario: Matching global AILI skill exists
- **WHEN** [框架内] Pi installs or updates the npm package and `~/.agents/skills/<name>/` already exists as a real directory matching an embedded snapshot skill name
- **THEN** [框架内] the existing directory is replaced with the fixed embedded snapshot contents

#### Scenario: Global user skill has no embedded same-name skill
- **WHEN** [框架内] a directory exists only in `~/.agents/skills/`
- **THEN** [框架内] package installation leaves it unchanged

#### Scenario: Embedded skill has no existing global directory
- **WHEN** [框架内] a snapshot skill name is absent from `~/.agents/skills/`
- **THEN** [框架内] package installation does not create it

#### Scenario: Package is installed outside Pi-managed npm ownership
- **WHEN** [框架内] a contributor runs an ordinary repository `npm install` or the package root is otherwise outside Pi-managed npm directories
- **THEN** [框架内] the lifecycle synchronizer performs no global skill mutation

### Requirement: Embedded AILI snapshot is not a second Pi discovery source
[已知|用户] The published package SHALL retain its exact embedded skill snapshot for reproducible release and global synchronization, but `package.json#pi.skills` SHALL register only non-conflicting bundled skills.

#### Scenario: Pi discovers package skills after installation
- **WHEN** [框架内] Pi loads `@rosetears/aili-pi`
- **THEN** [框架内] it discovers the bundled `librarian` skill without registering the embedded AILI snapshot as a duplicate source
