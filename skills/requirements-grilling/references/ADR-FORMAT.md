# ADR-FORMAT.md

Provenance: copied/adapted for AILI requirements-grilling from upstream Matt Pocock `domain-modeling/ADR-FORMAT.md` behavior under the upstream MIT License.

Use this reference when `requirements-grilling` offers or updates an ADR.

## Minimal ADR Shape

```markdown
# ADR: <short decision title>

Status: Proposed

## Decision

<What decision is being made?>

## Why

<Why is this decision needed, and why now?>

## Options Considered

- <Option A>: <trade-off>
- <Option B>: <trade-off>

## Consequences

- <Consequence or risk>
```

## Rules

- ADRs can be short.
- The value is recording the decision and why.
- Status, options, and consequences are optional when they are not useful.
- Offer an ADR only when all three are true:
  1. The decision is hard to reverse.
  2. The decision would be surprising without context.
  3. The decision is the result of a real trade-off.
- Keep `Status: Proposed` unless the user or accepted change authority explicitly confirms the decision as accepted.

## AILI Adaptation

- ADRs for an OpenSpec change live as `openspec/changes/<change-id>/adr.md` beside `interview.md` unless a future accepted change says otherwise.
- Use `context.md` Language only for tight term definitions; put the rationale and trade-off in `adr.md` when the ADR gate passes.
