## Context

Current prompts combine static runtime/role/resources and user task. File Context demonstrates per-session pending UI, while child policy already computes monotonic tool intersections.

## Goals / Non-Goals

**Goals:** deterministic trusted modifiers, stable-prefix preservation, enforceable narrowing, one-shot TUI UX, main/child scope and provenance.

**Non-Goals:** arbitrary system prompt replacement, permission widening, backend/model selection, copied pi-config source, or persistent role mutation.

## Decisions

1. Definitions are Markdown plus validated metadata and content hash; duplicate IDs fail closed rather than override.
2. Resolve scope/requires/conflicts/role allowlist before assembly, then sort placement/order/ID.
3. Keep stable prefix separate; modifiers live only in the dynamic turn block.
4. Convert runtime patches to intersections with existing permission and child tool policy. forceReadOnly uses the current permission/sandbox command classification; unknown bash is denied.
5. Consume one-shot selection only after successful prompt admission.
6. Store provenance as IDs/hashes/restrictions, never full private bodies.

## Risks / Trade-offs

- Prompt-only false security → runtime patch is mandatory for restriction-bearing modifiers.
- Cache churn → stable prefix never changes from one-shot selection.
- Untrusted project instructions → trust gate before discovery.
- Conflicting definitions → fail closed with explicit diagnostic.

## Migration Plan

Implement pure loader/resolver/assembler tests, then policy integration, TUI state, sub schema/role allowlists and provenance. Rollback unregisters UI and ignores modifier files.
