# Persistent Agents (`task` and `hub`)

> **Availability:** The AILI-owned local runtime is the public orchestration surface. The package registers `task` and `hub` and does not register a legacy `subagent` alias. Deterministic tests and bounded local probes are recorded in `manifests/live-verification.json`; they do not establish preview publication, installed-package behavior, or real-provider behavior as PASS.

> **Release status:** Persistent Agents are part of `@rosetears/aili-pi@0.2.6`. Provider/model behavior still depends on the configured Pi environment.

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

Only failed live handoff enters the durable mailbox. Each Agent keeps at most 100 messages; the 101st is rejected while the existing 100 remain. Successful messages have durable receipts for de-duplication.

Running, idle, parked, and aborted Agents never run two concurrent turns under one identity. An aborted Agent cannot revive. Process loss records a running turn as `interrupted`, a queued job as `unexecuted`, and never automatically replays either.

## Output, history, and retention

Complete raw output is stored at the parent-owned `<agent-id>.md`; the official Pi child conversation remains an independent Session JSONL. Tool results return at most 500,000 bytes and 5,000 lines, while parent completion previews are capped at 5,000 characters with explicit truncation metadata.

Use `agent://<agent-id>` and `history://<agent-id>` as stable references. `hub output/history` resolves them with `offset` and `limit`, including after an Agent is released.

Child history cannot be deleted independently. It follows the parent session. Forks start with an empty Agent registry and never copy/control old child artifacts. Confirmed AILI parent deletion can cascade its owned sidecar; official Pi 0.84.1 built-in Ctrl+D/archive has no sidecar hook, so doctor keeps that host gap visible and orphaned sidecars are preserved for reconciliation.

## Models

Each turn resolves in this order:

1. direct-user stable Agent instance override
2. trusted project role override
3. user-global role override
4. user-confirmed one-shot `task.model` request
5. direct Parent resolved model, thinking level, and speed tier
6. profile frontmatter fallback, only when no Parent identity exists
7. runtime fallback

A model-facing `task.model` is never user authorization: a different requested model must show the direct Parent from/to choice and receive fresh **Allow once** confirmation before any Agent/job/turn allocation. No UI, dismissal, expiry, rejection, a matching request, or no Parent identity does not apply that request. Direct-user config remains higher priority than an accepted one-shot. Nested children inherit their direct Persistent Parent, not the root Main. The effective record exposes a source such as `confirmed-one-shot`, `instance-override`, `project-role-override`, `user-role-override`, `inherited-parent`, `profile-fallback`, or `runtime-fallback`.

Thinking is inherited and passed to the actual child session; an incompatible level fails rather than silently switching model or level. Fast is a separate `standard|priority` service tier, not a model alias: supported Codex payloads may receive `service_tier: "priority"`; unsupported models remain unchanged. Real provider payload proof remains separately operation-gated. Direct users can run `/aili-agent-model <global|project|instance> <selector|agent-id> <provider/model|clear> [thinking]`; model-facing persistent requests through `hub model` require a fresh interactive confirmation every time. Project model configuration is ignored and cannot be written before project trust is active.

## Workspaces and permissions

`workspace:auto` keeps disjoint known scopes shared and isolates known path overlap. Shared resources such as ports/databases cannot be isolated by a Git worktree and therefore conflict visibly. An undeclared scope defaults to shared with a best-effort diagnostic; observable second conflicting writes are blocked with isolated-retry guidance.

Isolation projects the current dirty tracked/untracked baseline into a disposable worktree, returns child-only patch/branch evidence, never auto-merges, and checks that the main workspace stayed unchanged. After cleanup, history/output remain readable but that Agent cannot revive.

Effective tools are always an intersection of parent-active tools, child-loadable definitions, role/capability ceilings, hard guards, and per-call narrowing. Child `task`/`hub` definitions are AILI-owned bridges, never reused parent coordinator definitions. In sandbox-required modes, an already-effective child `bash` is replaced by exact-profile operations from the one process-owned ready `pi-permission-modes` SandboxController; children cannot initialize, reconfigure, reset, or downgrade it. Missing/degraded/profile-mismatched sandboxes deny Bash, and incompatible Git-worktree `.git` files remain fail closed. Credential/auth/private-key material is denied before approval and excluded from messages/output/artifacts. Background asks suspend only that job and return to the parent UI; no UI, rejection, cancellation, shutdown, or bridge loss denies and settles the request.

## Legacy data

Legacy `.pi/agent/runs/`, existing Pi sessions, user configuration, and unrelated Agent sidecars are not migrated, reinterpreted, or deleted by the replacement runtime. Rollback preserves both legacy runs and new sidecars.
