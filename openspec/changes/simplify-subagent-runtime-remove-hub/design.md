## Context

AILI currently carries a strict Markdown protocol for `formal-task-board.md` and `progress.txt`, while the public `sub` tool already uses its own Journal for real Agent/job/turn state. The duplicate protocol adds model work and repeated parsing without improving ordinary execution correctness. The user requires `progress.txt` to remain present for continuity, but not as a machine-validated event stream.

## Goals / Non-Goals

**Goals:**

- Keep `progress.txt` creation for multi-step work.
- Make progress content free-form and non-blocking.
- Make `formal-task-board.md` optional and non-authoritative.
- Remove Board/progress reads from trusted formal dispatch preflight.
- Preserve safe change identity and worker write protection.
- Give the separately owned `aili-workflows` repository an exact follow-up handoff.

**Non-Goals:**

- Modify the separately owned `aili-workflows` repository in this change.
- Delete legacy parser/update modules or historical tests in this pass.
- Change OpenSpec 1.10 native validation of proposal, specs, design, or tasks.
- Change Journal persistence, tool-input validation, permissions, or credential guards.

## Decisions

1. `progress.txt` is a required continuity artifact for multi-step work, created by the orchestrator at the owning task/change root. It has no schema and no format validator.
2. `formal-task-board.md` is optional task-notes Markdown. Neither public `sub` nor trusted formal dispatch depends on its existence or contents.
3. Trusted formal dispatch validates only the bounded request envelope and a safe change-id grammar. Protected paths are derived deterministically; the runtime does not read Board/progress Markdown.
4. Existing explicit legacy reconciliation APIs remain compatibility-only in this pass. They are not invoked by public `sub` or trusted dispatch; their final source retirement is separate cleanup.
5. `rose-aili@0.4.8` retires `aili-task-board/v1` as a generated runtime protocol. The local lock records formal task notes as a hash-bound reference, while the runtime bundle loads only Agent-selection and package-envelope schemas.
6. OpenSpec validation remains targeted to OpenSpec-native artifacts only.

## Risks / Trade-offs

- [Risk] The installed `aili-workflows` rules may still instruct models to maintain the old Board protocol. → Mitigation: provide a repository-local handoff document for the follow-up Agent and clearly mark this local/runtime half complete.
- [Risk] Removing Board-content binding from trusted dispatch weakens duplicate Markdown identity checks. → Mitigation: retain trusted request-schema validation, safe change-id validation, exact protected paths, Journal identity, role-profile identity, and worker write denial; Markdown is no longer an authority.
- [Risk] Legacy validator code remains discoverable. → Mitigation: documentation labels it compatibility-only; remove it only in a separately scoped cleanup after the workflow owner is updated.

## Migration Plan

1. Update local `sub` guidance and docs.
2. Remove Board/progress reads from trusted formal dispatch protection resolution.
3. Keep existing `progress.txt` files unchanged and continue creating them for multi-step work.
4. Consume the released `rose-aili@0.4.8` source, npm tarball, generated Pi bundle, role profiles, routing, compatibility, and provenance through existing generators.
5. Preserve the released removal of `generated/pi/protocols/aili-task-board.v1.schema.json`; do not recreate a local replacement.
