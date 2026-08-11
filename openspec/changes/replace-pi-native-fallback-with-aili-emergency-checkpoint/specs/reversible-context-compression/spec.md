## MODIFIED Requirements

### Requirement: Adaptive guidance and custom prompts are bounded
User-authored immutable guidance SHALL remain bounded. Dynamic pressure/catalog/action guidance SHALL exist only in the transient provider suffix, never in the system prompt or Session history. The suffix SHALL bind current session/branch/epoch/pressure identity, advertise only actions executable in the current pressure/coordinator state, and remain non-authoritative. Stale or unverified identity SHALL produce status-only guidance or no suffix.

#### Scenario: Pressure or epoch changes
- **WHEN** dynamic lifecycle state changes or a new checkpoint epoch is adopted
- **THEN** static guidance remains byte-stable and stale suffix state cannot advertise a current executable action

## ADDED Requirements

### Requirement: Durable checkpoint status distinguishes custom and native origin
The component SHALL distinguish provider-time projection, deterministic candidate eligibility, public checkpoint invocation, persisted custom checkpoint, persisted native checkpoint, epoch rebuild and post-checkpoint usage. A planned candidate, callback, provider suffix or tool result MAY report its own bounded state but MUST NOT claim durable reduction before a matching persisted epoch exists. Unknown origin SHALL remain `Unverified`.

#### Scenario: Projection reduces provider messages without persistence
- **WHEN** a context hook projects a smaller message list but no CompactionEntry has been persisted
- **THEN** status reports projection or pending checkpoint rather than durable context reduction

#### Scenario: Native checkpoint is persisted
- **WHEN** Pi persists a native CompactionEntry after deterministic ineligibility
- **THEN** status records a successful native checkpoint and does not label it deterministic AILI output

### Requirement: Post-checkpoint usage is rebuilding until real usage arrives
After a new custom or native checkpoint epoch is persisted, context usage SHALL be represented as `rebuilding`/`unknown` until the first valid post-checkpoint assistant usage is observed. The old pre-checkpoint high-water value SHALL NOT be presented as the new context usage.

#### Scenario: No post-checkpoint assistant response exists
- **WHEN** the new epoch is persisted but no valid assistant usage has arrived
- **THEN** UI and provider-only status use rebuilding/unknown rather than stale usage
