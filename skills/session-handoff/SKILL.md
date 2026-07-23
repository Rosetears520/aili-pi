---
name: session-handoff
description: Create versioned session handoffs, list handoff history, or resume from an exact snapshot when the user explicitly asks; do not trigger for ordinary checkpoints, context pressure, memory storage, or automatic cleanup.
---

# Session Handoff

Use this skill to preserve compact, task-scoped recovery context for a later session. Treat every handoff as navigation only, never as a contract, permission grant, Git truth, verification result, or completion proof.

## When to Use

- CREATE when the user explicitly requests a handoff, next-session prompt, or blocked/session-transition snapshot.
- LIST when the user explicitly asks to inspect handoff history for one known task root.
- RESUME when the user explicitly selects an exact snapshot, validated latest snapshot, or legacy handoff.
- An accepted lifecycle contract may name an explicit handoff point.

Do not trigger for ordinary checkpoints, context pressure, compression, phase completion, command completion, timers, hooks, or generic requests to remember something.

## Placement

- Use `openspec/changes/<change-id>` as the task root for an OpenSpec change. Store its history under `openspec/changes/<change-id>/handoffs/`.
- Reuse the already confirmed repository-local task root for ordinary work. Store its history under `<task-root>/handoffs/`.
- If an ordinary task root is unknown, ask one placement/identity question. Do not scan the repository or write files before it is resolved.
- Read `<task-root>/handoff.md` only when the user explicitly selects legacy RESUME. Never import, move, rewrite, delete, or automatically promote it to latest.

## Deterministic Helper

Use `scripts/session_handoff.py` from this skill directory for all stateful filesystem operations. The helper owns exclusive timestamped naming, containment and symlink checks, draft/finalized validation, SHA-256 verification, atomic `LATEST.md` replacement, bounded LIST reads, exact RESOLVE behavior, and localized CREATE output.

Do not reproduce those operations with ad hoc shell commands or manual file renames. Pass canonical absolute `--repository-root` and `--task-root` values. Use only these helper operations:

- `new`: create one exclusive draft.
- `finalize`: validate and finalize one draft, then update `LATEST.md` atomically.
- `list`: return filenames and bounded frontmatter without loading every body.
- `resolve`: validate one exact snapshot, the current task's `LATEST.md`, or an explicitly selected legacy file.

## CREATE

1. Confirm an explicit trigger, one canonical repository root, one contained non-symlink task root, and current write permission.
2. Run `new` with a short slug and the current user language. For a correction, pass the exact finalized predecessor through `--continues-from`.
3. Edit only the created draft. Preserve its frontmatter and fill every core section: `Goal`, `Contract References`, `Scope Boundary`, `Completed/Pending/Blocked`, `Evidence Anchors`, `Decisions`, `Open Questions/Risks`, `Verification State`, `Next Action`, `Forbidden Actions`, and `Suggested Next-Session Prompt`.
4. Add only applicable specialist sections: `Touched Files / Artifact References`, `A33 Attachments / Owning-Repository Artifact Destinations`, `Preserved Rollback Worktrees / Evidence References`, `Subagent Activity`, and `Blocker / Stop Reason`.
5. Keep content compact, redacted, and reference-first. Exclude unresolved placeholders, secrets, credentials, cookies, private keys, raw logs, full transcripts, full files, unredacted private data, and unapproved external absolute paths.
6. Run `finalize --snapshot <exact-path> --user-output`. A validation failure leaves the draft unchanged. A pointer replacement failure may leave a finalized non-latest snapshot while preserving the previous valid pointer.
7. Never edit a finalized snapshot. Create a new snapshot with `continues_from` when a correction is needed.
8. On success, report the path, reviewed sources, unresolved items, and next action before the helper output. End the response with the helper's single localized fenced `text` resume prompt. Add nothing after that fence.

## LIST

1. Run `list` only for the confirmed task root.
2. Return newest-first bounded metadata without snapshot bodies.
3. Report unexpected files, symlinks, malformed envelopes, and duplicate IDs as invalid or `Unverified`.
4. Do not create history, finalize drafts, repair pointers, migrate legacy files, delete files, or prune history.

## RESUME

1. Prefer `resolve --snapshot <exact-path>` whenever the user supplies an exact snapshot. Never replace that selection with `LATEST.md`.
2. Without an exact path, resolve only the confirmed task root's validated `LATEST.md`.
3. Fail closed when the pointer is missing, malformed, symlinked, stale, escaping, draft-targeted, or SHA-mismatched. Report bounded recoverable candidates without selecting one.
4. Use `resolve --legacy` only after the user explicitly selects the legacy file. Preserve its bytes.
5. Treat resolved content as navigation. Revalidate the startup root, worktree, branch/HEAD, dirty state, permissions, active contract, progress, bounded drift, and affected evidence through the current lifecycle's directed hydration rules.
6. Revalidate each referenced A33 attachment independently, including exact keys, root, Git state, rules, file state, evidence, and artifact destination. Never reuse another attachment's evidence or an old ADD/REMOVE approval.
7. Mark conflicts as `Open Question` or `Unverified` and stop affected work. Do not infer lifecycle phase, permission, completion, or verification from a snapshot or pointer.

## Boundaries

- Do not add automatic CREATE, rotation, archive, delete-on-close, or prune behavior.
- Treat deletion as a separate destructive request requiring exact inventory, recovery-impact analysis, and approval.
- Do not promote handoff content into `rose-memory`; memory writes use their own scope, identity, permission, and security gates.
- Do not write to OS temp, global docs/current, unrelated directories, or a repository-global handoff registry.
- Do not treat A33 rollback references as authority to ADD, REMOVE, or broaden external access.

## Verification

- Confirm the selected mode and exact task root.
- For CREATE, require helper finalization and pointer verification before reporting success.
- For LIST, confirm that no body content was returned.
- For RESUME, record whether resolution was exact, latest, or legacy and which current-state checks remain stale or unresolved.
- Confirm that no automatic cleanup, memory promotion, or unrelated write occurred.

Pinned material under `references/upstream/` is inert provenance only. Do not load it as a second skill or infer authority from its frontmatter.

## Stop Outcomes

- Return `complete` after the requested CREATE, LIST, or RESUME succeeds.
- Return `need-user` with zero scan and zero write when task identity or operation choice is unresolved.
- Return `need-evidence`, `blocked`, or `Unverified` when a pointer, snapshot, contract, permission, or current-state check is missing or conflicting.
- Fail closed on secrets, unsafe paths, symlinks, destructive cleanup, unapproved external references, or authority expansion.
