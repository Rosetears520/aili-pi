## ADDED Requirements

### Requirement: Standard is the initial session mode
[框架内] Every new AILI-enabled session SHALL start in `standard` mode unless a future accepted contract defines another explicit startup source. Mode changes in this change SHALL be session-only.

#### Scenario: New session starts
- **WHEN** [框架内] AILI initializes in a new Pi session
- **THEN** [框架内] active mode is `standard` and no previous session's YOLO toggle is restored

### Requirement: Bounded YOLO only automates classified project-local operations
[框架内] In `bounded-yolo`, classified ordinary reads/writes inside the canonical project root and classified non-destructive commands MAY execute without an additional prompt. External-directory, credential/auth, destructive, push, publish, and release classes SHALL retain exact ask/deny behavior.

#### Scenario: Ordinary project-local edit in bounded YOLO
- **WHEN** [框架内] a tool call targets a canonical non-secret path inside the project and policy classifies it as ordinary
- **THEN** [框架内] the call may execute without a mode-level prompt if parent and role policies also allow it

#### Scenario: High-risk operation in bounded YOLO
- **WHEN** [框架内] a tool call is external-directory, credential/auth, destructive, push, publish, or release class
- **THEN** [框架内] bounded YOLO does not auto-approve it and the exact ask/deny rule applies

### Requirement: Effective permission is an intersection
[框架内] A tool call SHALL be allowed only when parent-active policy, role policy, mode policy, project boundary, and operation-specific gates all allow it. A mode switch MUST NOT broaden a parent or role ceiling.

#### Scenario: Mode allows but role denies
- **WHEN** [框架内] bounded YOLO would allow an ordinary operation but the role policy denies the tool or path
- **THEN** [框架内] the operation is denied

#### Scenario: Parent narrows external access
- **WHEN** [框架内] the parent disallows an external directory that another policy could ask for
- **THEN** [框架内] the child cannot use the mode toggle to obtain that access

### Requirement: Unknown and noninteractive decisions fail closed
[框架内] If a path, symlink target, shell construct, command side effect, or tool input cannot be classified reliably, policy SHALL ask or deny. If no interactive UI is available, every ask SHALL become deny unless an exact accepted preauthorization contract exists.

#### Scenario: Complex command cannot be classified
- **WHEN** [框架内] policy cannot reliably determine a shell command's operations/targets
- **THEN** [框架内] it does not default allow and returns ask/deny with a rule reason

#### Scenario: Ask decision occurs in headless mode
- **WHEN** [框架内] a call requires user confirmation and `ctx.hasUI` is false
- **THEN** [框架内] the call is blocked with an approval-required reason

### Requirement: Secret and boundary checks use canonical targets
[框架内] Filesystem policy SHALL canonicalize paths, resolve existing parents, detect symlink escape, and deny configured secret/auth material. Project-root membership MUST NOT be decided from an unnormalized string prefix.

#### Scenario: Symlink points outside project root
- **WHEN** [框架内] a project-local path resolves through a symlink to an external target
- **THEN** [框架内] it is classified as external and bounded YOLO does not auto-approve it

#### Scenario: Tool targets credential material
- **WHEN** [框架内] a read/write target matches protected credentials, private keys, provider auth, or Pi auth storage
- **THEN** [框架内] the configured hard deny applies and audit output contains no secret content

### Requirement: Automatic mode has shortcut and command controls
[框架内] The Extension SHALL register `Ctrl+Shift+Alt+A` to toggle `standard ↔ bounded-yolo` for the current session and SHALL expose `/aili-mode standard|yolo` as a fallback. Current mode SHALL remain visibly available in minimal status/notification output.

#### Scenario: Shortcut is delivered
- **WHEN** [框架内] Pi receives the configured shortcut with no conflict
- **THEN** [框架内] mode toggles once, the new mode is visibly announced, and no risky operation is preapproved

#### Scenario: Terminal cannot deliver the shortcut
- **WHEN** [框架内] the key combination is unavailable or conflicts with another binding
- **THEN** [框架内] `/aili-mode` can perform the same session-only toggle and doctor reports shortcut availability/conflict when observable

### Requirement: Permission audit is redacted
[框架内] Permission diagnostics SHALL record timestamp, role, tool, rule ID, decision, redacted input summary, and user outcome where applicable. It MUST NOT record tokens, cookies, API keys, private keys, credential contents, or credential-bearing URLs.

#### Scenario: Protected read is denied
- **WHEN** [框架内] policy denies a credential-path read
- **THEN** [框架内] the audit identifies the rule and redacted target class without storing file contents

## Superseding Native Permission Requirements — 2026-07-23

[框架内] The preceding `standard`/`bounded-yolo`, `/aili-mode`, and `Ctrl+Shift+Alt+A` requirements are superseded. They are historical design evidence only and SHALL not remain as a competing AILI permission system.

### Requirement: AILI delegates modes to pi-permission-modes
[框架内] The single AILI Extension SHALL initialize the pinned `pi-permission-modes` dependency and expose its `Default`, `Plan`, `Build`, `YOLO`, `/perm`, and `Alt+M` interface without adding a conflicting AILI mode command or shortcut.

#### Scenario: Pi permission UI loads
- **WHEN** [框架内] the AILI package loads with a compatible pinned dependency
- **THEN** [框架内] exactly the delegated mode controls register and doctor identifies their provider/version

#### Scenario: Delegate cannot load
- **WHEN** [框架内] the dependency API, extension registration, or required resource is unavailable
- **THEN** [框架内] doctor returns non-pass and AILI does not silently reactivate its superseded permission runtime

### Requirement: Sandbox availability is explicit and non-absolute
[框架内] Sandbox-capable modes SHALL attempt Bubblewrap only when the vendor prerequisites and current topology support it. A missing prerequisite or incompatible topology SHALL be reported as a visible degrade/confirmation path; AILI MUST NOT claim OS isolation or universal containment.

#### Scenario: Bubblewrap is available
- **WHEN** [框架内] a Linux disposable fixture supplies the required sandbox prerequisites
- **THEN** [框架内] the delegated mode selects its sandbox-capable path and test evidence records that selection

#### Scenario: Bubblewrap is unavailable
- **WHEN** [框架内] a Linux fixture lacks Bubblewrap or the topology is incompatible
- **THEN** [框架内] the mode is not reported sandboxed and its fallback/confirmation behavior is explicit
