## ADDED Requirements

### Requirement: Preview release remains separate from stable release
The project SHALL treat `@rosetears/aili-pi@0.2.0-preview.0` as a pre-release candidate and SHALL reserve the non-`latest` `preview` dist-tag for a separately approved publication. Preview evidence SHALL NOT mark a stable release-gate row complete, imply `latest` installation, or establish stable readiness.

#### Scenario: Preview evidence is complete but stable evidence is not
- **WHEN** the preview's deterministic proof and user trial have passed while the stable-track contract retains unchecked gates
- **THEN** the project may request exact preview-publication approval only and SHALL continue to report stable release readiness as non-PASS

#### Scenario: Stable publication is considered
- **WHEN** a user requests `latest` or a stable release
- **THEN** the project SHALL require the independent stable-track evidence and exact stable publication authority rather than reusing preview evidence

### Requirement: Preview candidate has bounded deterministic Pi proof
Before a user trial, the exact preview candidate SHALL pass a quality-enabled official-Pi extension vertical slice and a separately approved, isolated local package/CLI discovery smoke. The vertical slice SHALL prove one source-backed accepted Compact mutation, one rejected incomplete quality input without append, next-request projection, and session reopen. The package/CLI smoke SHALL use a disposable HOME and SHALL not issue a Provider request, use a registry package, or modify a real HOME.

#### Scenario: One quality-enabled Compact mutation succeeds
- **WHEN** a deterministic non-network Provider drives the official Pi extension entry with default quality enabled and submits one exact eligible source range
- **THEN** the runtime appends one source-backed active block and the next request plus reopened session retain that validated state

#### Scenario: Incomplete quality input is submitted
- **WHEN** the same vertical slice submits an intentionally incomplete summary for the exact source range
- **THEN** the quality gate rejects it without appending a transaction or claiming semantic success

#### Scenario: Local CLI discovery is checked
- **WHEN** the exact locally packed candidate is installed into the approved disposable HOME through the local Pi CLI
- **THEN** Pi discovers the package and `/aili-compact doctor` responds without a Provider request or a claim about real compaction quality

### Requirement: User trial and known limitation are explicit
The project SHALL provide the user an exact candidate identity, a bounded manual-trial charter, installation/removal guidance, Provider/cost/privacy boundary, and the current controlled quality limitation. User acceptance or rejection SHALL be redacted and bound to that candidate. The project SHALL NOT claim that the known second active-block `quality-rejected` observation establishes a Pi API incompatibility or a proven root cause.

#### Scenario: User accepts the manual trial
- **WHEN** the user explicitly accepts the exact candidate after the bounded trial
- **THEN** the project may request one exact preview npm-publication approval and SHALL preserve all stable-track limitations

#### Scenario: User rejects the manual trial or reports a blocking symptom
- **WHEN** the user rejects the candidate or reports a reproducible blocking symptom
- **THEN** publication stops and the result becomes evidence for a new bounded repair or scope decision
