# Persistent Agents (`task` and `hub`)

> **Availability:** The AILI-owned runtime is the public orchestration surface. The package registers `task` and `hub` and does not register a legacy `subagent` alias. Deterministic tests plus authorized Pi 0.82.1 provider, positive child-sandbox, disposable-HOME, and external-workspace lifecycle probes are bound in `manifests/live-verification.json`.

## Agent selectors

The canonical catalog contains exactly 20 selectors:

- `general` (the default when `agent` is omitted)
- `aili.agent-evaluator`
- `aili.ai-regression-scout`
- `aili.browser-qa-runner`
- `aili.code-reviewer`
- `aili.code-scout`
- `aili.convergence-reviewer`
- `aili.doc-researcher`
- `aili.e2e-artifact-runner`
- `aili.implementer`
- `aili.opensource-sanitizer`
- `aili.plan-auditor`
- `aili.pr-test-analyzer`
- `aili.security-auditor`
- `aili.silent-failure-reviewer`
- `aili.spec-miner`
- `aili.test-coverage-reviewer`
- `aili.test-engineer`
- `aili.web-performance-auditor`
- `aili.web-researcher`

`aili.general`, `task` as a selector, and unknown selectors are invalid. The 19 specialized profiles keep their own complete role prompt and cannot spawn children. `general` may synchronously spawn an allowed non-self specialized Agent below the configured depth ceiling.

## Creating Agents with `task`

A flat request creates one new stable Agent:

```json
{
  "task": "Inspect the parser and report evidence",
  "agent": "aili.code-scout",
  "name": "ParserScout",
  "async": false,
  "tools": ["read", "grep"],
  "workspace": "shared",
  "writeScope": { "paths": [], "resources": [] }
}
```

A batch validates every item before creating any Agent:

```json
{
  "context": "Use the accepted plan at plan/accepted.md",
  "tasks": [
    { "task": "Inspect storage", "agent": "aili.code-scout" },
    { "task": "Implement the accepted fix", "agent": "aili.implementer", "workspace": "auto", "writeScope": { "paths": ["src/storage"], "resources": [] } }
  ]
}
```

Per-item fields are `task`, `context`, `agent`, `name`, `model`, `async`, `tools`, `workspace`, `writeScope`, and `cwd`. Unknown fields fail validation. `blocking` is profile-only internal metadata, not a `task` field; callers must use `async:false` to wait synchronously.

Formal calls additionally use the public v1 `formalContext: { "changeId": "..." }` plus the exact sibling `continuationAudit`. A mutation-capable formal role must declare at least one normalized `writeScope.paths` or `writeScope.resources` entry; empty scope fails before allocation. Read-only roles may use an empty scope. The scope never authorizes either owning `formal-task-board.md` or `progress.txt`; those files remain hard-denied to children even when a broader parent directory is declared.

Every item creates a new Agent. Reusing `name: "Scout"` allocates `Scout`, `Scout-2`, and so on; it never resumes the first Agent. Follow-up work uses `hub send` with the allocated Agent ID. Nested IDs are parent-prefixed, such as `general.code-scout`.

Top-level non-blocking roles default to async. `async:false`, an internally blocking role profile, and all child-to-grandchild calls are synchronous. One parent allows at most 32 active turns; excess jobs remain in durable FIFO order. AILI sets no Agent-turn wall-clock or assistant-request budget (`0`/unlimited), but provider watchdogs, tool timeouts, permissions, the 32-turn semaphore, process shutdown, and manual cancellation still apply. Background work does not survive the Pi process.

## Managing Agents with `hub`

`hub` actions are:

- `list` — active Agents (and optionally released disk-backed identities)
- `send` — running safe-boundary steer, idle new turn, or parked revive/new turn
- `wait` — bounded wait over owned job/message IDs
- `inbox` — peek or drain failed-live-handoff mail
- `output` / `history` — bounded disk reads
- `jobs` — owned job state
- `cancel` — hard-cancel a job or release an idle/parked identity without deleting history
- `model` — query or request model override operations
- `formal-plan` — top-level parent/ROSE only; resolve and plan one exact ready formal package from explicit current operation-gate, ownership, async-safety when needed, and write-scope evidence
- `formal-reconcile` — top-level parent/ROSE only; explicitly inspect same-identity initial and continuation turns and apply only the bounded returned/blocked restart mapping

Child Agents cannot invoke either formal action. Planning returns an exact `taskRequest` but does not submit it. Reconciliation is never automatic and never replays or redispatches work, accepts evidence, closes a join, marks a package done, or advances phase. A queued/running same-identity follow-up preserves the running package; failed, aborted, or interrupted follow-ups block it. A completed follow-up without fresh immutable canonical result evidence cannot reuse the initial result.

Only failed live handoff enters the durable mailbox. Each Agent keeps at most 100 messages; the 101st is rejected while the existing 100 remain. Successful messages have durable receipts for de-duplication.

Running, idle, parked, and aborted Agents never run two concurrent turns under one identity. An aborted Agent cannot revive. Process loss records a running turn as `interrupted`, a queued job as `unexecuted`, and never automatically replays either.

## Output, history, and retention

Complete raw output is stored at the parent-owned `<agent-id>.md`; the official Pi child conversation remains an independent Session JSONL. Tool results return at most 500,000 bytes and 5,000 lines, while parent completion previews are capped at 5,000 characters with explicit truncation metadata.

Generated roles request the ordinary JSON result object for ordinary assignments. A formal Runtime assignment includes `FORMAL ASSIGNMENT OUTPUT OVERRIDE:` followed by the exact line-oriented `CANONICAL RESULT:` envelope and field order; that assignment-level contract supersedes ordinary JSON. Missing, extra, reordered, multiline, wrong-package, or wrong-role fields fail canonical parsing.

Use `agent://<agent-id>` and `history://<agent-id>` as stable references. `hub output/history` resolves them with `offset` and `limit`, including after an Agent is released.

Child history cannot be deleted independently. It follows the parent session. Forks start with an empty Agent registry and never copy/control old child artifacts. Confirmed AILI parent deletion can cascade its owned sidecar; official Pi 0.82.1 built-in Ctrl+D/archive has no sidecar hook, so doctor keeps that host gap visible and orphaned sidecars are preserved for reconciliation.

## Models

Each turn resolves in this order:

1. one-shot `task.model`
2. stable Agent instance override
3. trusted project role override
4. user-global role override
5. profile frontmatter model
6. official parent fallback

An explicit unknown, unavailable, unauthenticated, or incompatible model fails at its source layer and does not fall through. One-shot values never change configuration. Direct users can run `/aili-agent-model <global|project|instance> <selector|agent-id> <provider/model|clear> [thinking]`; model-facing persistent requests through `hub model` require a fresh interactive confirmation every time. Project model configuration is ignored and cannot be written before project trust is active.

## Workspaces and permissions

`workspace:auto` keeps disjoint known scopes shared and isolates known path overlap. Shared resources such as ports/databases cannot be isolated by a Git worktree and therefore conflict visibly. An undeclared scope defaults to shared with a best-effort diagnostic; observable second conflicting writes are blocked with isolated-retry guidance.

Isolation projects the current dirty tracked/untracked baseline into a disposable worktree, returns child-only patch/branch evidence, never auto-merges, and checks that the main workspace stayed unchanged. After cleanup, history/output remain readable but that Agent cannot revive.

Effective tools are always an intersection of parent-active tools, child-loadable definitions, role/capability ceilings, hard guards, and per-call narrowing. Child `task`/`hub` definitions are AILI-owned bridges, never reused parent coordinator definitions. In sandbox-required modes, an already-effective child `bash` is replaced by exact-profile operations from the one process-owned ready `pi-permission-modes` SandboxController; children cannot initialize, reconfigure, reset, or downgrade it. Missing/degraded/profile-mismatched sandboxes deny Bash, and incompatible Git-worktree `.git` files remain fail closed. Credential/auth/private-key material is denied before approval and excluded from messages/output/artifacts. Background asks suspend only that job and return to the parent UI; no UI, rejection, cancellation, shutdown, or bridge loss denies and settles the request.

## Legacy data

Legacy `.pi/agent/runs/`, existing Pi sessions, user configuration, and unrelated Agent sidecars are not migrated, reinterpreted, or deleted by the replacement runtime. Rollback preserves both legacy runs and new sidecars.
