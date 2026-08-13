## ADDED Requirements

### Requirement: Loopback default and fail-closed non-loopback startup
The Web server SHALL bind to loopback by default. A non-loopback bind MUST be rejected before listening unless password authentication, exact Host/Origin validation, and one or more canonical allowed roots are configured and valid.

#### Scenario: Default startup is local
- **WHEN** the operator supplies no bind override
- **THEN** the server listens only on a loopback address

#### Scenario: Incomplete remote policy is rejected
- **WHEN** the operator requests a non-loopback bind without any one of password authentication, exact Host/Origin policy, or allowed roots
- **THEN** startup fails before opening a listener and explains the missing control

### Requirement: Authenticated same-origin browser access
The Web runtime SHALL authenticate protected requests and SHALL reject untrusted Host, cross-site Origin, or cross-site browser API requests before executing route logic. Mutating requests SHALL additionally satisfy content-type, request-size, capability, and operation-specific checks.

#### Scenario: Cross-origin mutation is denied
- **WHEN** an authenticated browser submits a mutation from an Origin that does not match the configured exact policy
- **THEN** the request is rejected before lease or runtime mutation

#### Scenario: Trusted loopback read succeeds
- **WHEN** an authenticated or policy-exempt loopback client sends a same-origin read request with an allowed Host
- **THEN** the request proceeds to its route-specific authorization checks

### Requirement: Canonical filesystem boundary
All Web filesystem, Git, Worktree, skill, plugin, model, and media paths SHALL be constrained to explicit allowed roots using lexical containment and realpath revalidation where the target exists. Loopback and non-loopback modes SHALL enforce the same path boundary. Session-derived or operator-selected roots MAY seed the allowed-root set only after validation; an empty allowed-root set SHALL expose no general filesystem access. Mutation paths MUST be revalidated immediately before the operation.

#### Scenario: Symlink escape is denied
- **WHEN** a lexically allowed path resolves outside every allowed root
- **THEN** access is rejected without reading or mutating the escaped target

#### Scenario: Preflight changes before mutation
- **WHEN** an allowed target or repository state changes between initial selection and final mutation preflight
- **THEN** the mutation aborts visibly rather than using stale authorization

### Requirement: Secret and exposure boundary
Passwords, bootstrap identities, credentials, cookies, and provider secrets MUST NOT be placed in command arguments, package defaults, logs, Analytics, session content, or browser persistent storage. Protected secret files and local IPC endpoints SHALL use owner-only permissions, bootstrap identities SHALL expire after use or process termination, authenticated browser sessions SHALL rotate on login and expire on logout, timeout, server restart, or password change, and cleanup failure SHALL be visible without revealing the secret. The product SHALL NOT claim direct public-Internet or built-in TLS support.

#### Scenario: Diagnostic output is redacted
- **WHEN** startup or authentication fails
- **THEN** user-visible and structured diagnostic output identifies the failure category without printing the secret value

#### Scenario: Bootstrap identity is consumed
- **WHEN** a `/web` child successfully establishes its private runtime channel or the owning process exits
- **THEN** the bootstrap identity and temporary transport artifact expire and cannot authenticate a later process

#### Scenario: Browser session expires
- **WHEN** the operator logs out, changes the password, the session times out, or the Web server restarts
- **THEN** the previous browser session can no longer access protected routes
