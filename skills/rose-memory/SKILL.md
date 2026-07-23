---
name: rose-memory
description: Use the legacy/pre-runtime ROSE project-local SQLite continuity backend through memory_cli.py for scoped user facts, checkpoints, candidates, and focused retrieval; never treat it as native/global memory or formal authority.
license: MIT
metadata:
  tool: references/memory_cli.py
  state: project-local memory/memory.db
---

# ROSE Memory

## Purpose

This skill provides the legacy/pre-runtime ROSE continuity protocol and bundled SQLite CLI. It is project-local compatibility infrastructure, not native backend memory, global state, or formal lifecycle authority.

The CLI implementation is distributed with this skill:

`references/memory_cli.py` from the active Skill root resolved by the current adapter.

The memory database is always the exact project-local path, resolved from the canonical project root:

`memory/memory.db`

Never store project memory inside a global backend configuration directory.

## When to Use

Use this skill when:

- starting or resuming a ROSE task
- checking current ROSE memory status
- recording a scoped task checkpoint or completion receipt
- default-writing an explicit user-stated requirement, preference, decision, correction, or acceptance criterion when identity, scope, metadata, permission, and content safety are clear
- recording evidence-backed model-derived material only as a candidate when the existing backend supports that exact operation
- retrieving focused project memory as one bounded input during explicit resume
- recovering from interrupted work

## Rules

- Never edit `memory/memory.db` manually.
- Never create `memory.md`, JSON sidecars, or alternate memory state files.
- Never store project state under a backend configuration home.
- Invoke only the existing `rose-memory` shim or the adapter-resolved bundled `references/memory_cli.py`, always with the literal project-relative argument `--db memory/memory.db` from the canonical project root. Reject an absolute, user-supplied, alternate, parent-relative, aliased, or manual database path. If `memory/memory.db` or a path component is presented as a symlink, stop without following it; do not substitute another path.
- Memory is additive, scoped continuity context. It is never the active OpenSpec contract, test-plan acceptance, permission, Git truth, review verdict, or completion proof.
- Default-write only explicit, reusable user requirements, preferences, corrections, decisions, and acceptance criteria when project/change/session identity, source reference/type, CLI timestamp, permission, and content safety are clear. Use only the existing `text`, `source`, `project`, session/task identity, timestamp, and receipt behavior. Do not ask a redundant per-fact write question in that safe case.
- If identity, scope, required metadata, or permission is ambiguous, ask one focused scope/identity question or keep the item in the active change artifact; do not create an unscoped record.
- Before invoking the CLI, reject or rewrite to a safely redacted existing-field value any text containing an embedded token, private key, credentialed URL, cookie, credential, private user data, or ambiguous sensitive content. Ambiguous permission blocks the write. Sensitive bytes must not appear in CLI arguments, memory, a receipt, or a new field; retain only a non-sensitive outcome/reference when useful.
- This policy does not add a command, field, schema, migration, storage path, or storage hardening. Existing backend file-mode enforcement, backend symlink handling, and retention behavior remain `Unverified`.
- Ordinary one-turn or report-only work that neither opens nor uses memory and has no formal long-running, resume, or context-loss need writes no session/task start or completion receipt by default. A missing receipt in that case is not a continuity failure.
- Active formal long-running, resume, or context-loss work, and any current task that actually opens or uses memory, records the applicable scoped checkpoint/completion receipt with current evidence references. The receipt remains navigation/evidence metadata and never establishes contract, permission, Git truth, verification, or completion.
- Model-derived repository facts, patterns, risks, review findings, history/log observations, and procedural rules are not user facts. Keep them as evidence-backed candidates or change-local `Unverified` items. If the existing CLI cannot represent the exact candidate lifecycle, keep the item in the appropriate change artifact instead of inventing a command, schema, or bridge.
- Memory does not depend on DCP, compression thresholds, stale chat, or old logs. None of those sources has active-task authority.
- If memory writeback fails, retry once when the fix is obvious. If it still fails, continue safe task progress, keep a pending TodoWrite item for memory writeback, retry before final handoff, and report any remaining failure.
- If the current directory is not inside a project, stop and report `SETUP_BLOCKED_NO_PROJECT_ROOT`.
- 🔴 CHECKPOINT: before any promotion, confirm the existing backend supports the exact candidate/promotion operation and that the item is scoped, reusable, evidence-backed, non-secret, and not contradicted by the active formal contract or current user instruction. Otherwise use `--no-durable-memory-promoted` and keep the item in change-local evidence or mark it `Unverified`.

## Memory Layers

Task checkpoint:
- Goal, scope, progress, files touched, and verification evidence.
- Use for deliberate checkpoint/resume continuity; `progress.txt` remains the current execution ledger for a formal change.

Requirement memory:
- User-stated requirements, preferences, corrections, decisions, and acceptance criteria.
- This is the only default-write layer, and only under the scope/metadata/permission/security gates above.

Candidate:
- Model-derived facts or rules with explicit evidence links, never disguised as user facts.
- Candidate status does not make the item authoritative. Do not promote when support or evidence is uncertain.

Conflict rule:
- Current user instruction and the active formal contract govern the task; fresh filesystem/Git/review/verification evidence governs current state.
- Memory, handoff, chat summaries, old logs, and task checkboxes are navigation/context only.
- If memory suggests a conflict that changes the next action, surface it before acting.

Conflict next-action table:

| Conflict found | Next action |
|---|---|
| Current user instruction or active OpenSpec contract conflicts with memory | Follow the current authority; do not promote the stale memory. |
| Chat summary, old log, or task checkbox claims completion | Re-read the contract, progress, bounded drift, root/Git identity, and fresh verification; do not infer completion. |
| Memory claims lack evidence | Treat as context only; mark `[UNVERIFIED]` and avoid durable promotion. |
| Memory contains possible secret, raw log, or credential | Do not repeat or store it; report a redacted concern. |
| Conflict changes what you would do next | Stop and ask or state the conflict before acting. |

## Command

If a short shim exists, use it:

```bash
rose-memory --help
```

If the shim is unavailable and the active adapter resolves the Skill root, call the bundled tool directly:

```bash
python <skill-root>/references/memory_cli.py --help
```

For every example below, replace `rose-memory` with `python <skill-root>/references/memory_cli.py` when no shim exists.

## Standard Operations

Initialize project memory:

```bash
mkdir -p memory
rose-memory init --db memory/memory.db
```

Check health:

```bash
rose-memory doctor --db memory/memory.db --record
```

Start a session:

```bash
rose-memory session start --db memory/memory.db --session-key "<session-key>"
```

Start a task:

```bash
rose-memory task start --db memory/memory.db --session-key "<session-key>" --title "<task summary>"
```

Use session/task start and later checkpoint/completion operations only for the receipt-triggering cases above. Do not run them merely because an ordinary task started or ended.

Record an event checkpoint:

```bash
rose-memory event add --db memory/memory.db --event-type CHECKPOINT --state ACTIVE --summary "<summary>"
```

Record a structured task checkpoint:

```bash
rose-memory checkpoint \
  --db memory/memory.db \
  --goal "<goal>" \
  --scope "<scope>" \
  --progress "<progress>" \
  --file "<path>" \
  --evidence-ref "<file/command/result>"
```

Record requirement memory:

```bash
rose-memory remember-requirement \
  --db memory/memory.db \
  --text "<user requirement/preference/correction/decision>" \
  --source "user:conversation:<message-reference>" \
  --project "<canonical-project>" \
  --session-key "<session-key>" \
  --task-key "<change-or-task-key>"
```

The CLI records its timestamp. Run this only when the arguments above represent the required project/change/session scope; otherwise keep the item in the active change artifact and resolve scope first.

Retrieve memory context:

```bash
rose-memory pack --db memory/memory.db "<query>" --mode direct --budget 800
rose-memory search --db memory/memory.db "<query>" --limit 10
```

Retrieve the focused current-task pack:

```bash
rose-memory pack-current --db memory/memory.db --task-key "<task>" --budget 1200
```

During explicit resume, use `pack-current` only as one scoped hydration input after resolving the active project/change/task. Re-read the active OpenSpec contract, `progress.txt`, bounded `drift-log.md`, root/Git state, and fresh review/verification evidence before acting:

```bash
rose-memory pack \
  --db memory/memory.db \
  "current active task requirements decisions evidence" \
  --mode direct \
  --budget 1200
```

Complete a task with no durable memory promoted:

```bash
rose-memory complete --db memory/memory.db --summary "<completion summary>" --no-durable-memory-promoted
```

Most completions should include `--no-durable-memory-promoted`. Any model-derived architecture fact, project finding, or procedural rule must first remain an evidence-backed candidate and follow the existing explicit candidate/promotion workflow; never promote it directly as requirement memory or invent a promotion path.

## Success Signal

A memory write succeeds only when the CLI returns JSON containing:

- `ok: true`
- `receipt_id`
- `result` with the operation-specific payload

If the receipt is missing, treat the operation as failed and do not claim writeback completion.

A valid receipt proves only that the existing CLI reported that scoped operation. It grants no authority over the active contract, permissions, Git/filesystem state, verification, or task completion.

## References

- `references/memory_cli.py` - executable memory CLI
- `references/schema.sql` - current SQLite schema emitted by the CLI
- `references/README.md` - operator notes for global install and project-local state
