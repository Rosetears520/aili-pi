# Persistent Agents (`sub`)

> **Availability:** The AILI-owned local runtime is the public orchestration surface. The package registers `sub` for delegation and `hub` for background coordination; there is no `formal_task`, no `task` alias, and no legacy `subagent` alias. (Sessions recorded before these renames render history with the default tool renderer.) Deterministic tests and bounded local probes are recorded in `manifests/live-verification.json`; they do not establish preview publication, installed-package behavior, or real-provider behavior as PASS.

> **Release status:** Persistent Agents are part of `@rosetears/aili-pi@0.2.9`. Provider/model behavior still depends on the configured Pi environment.

## The one mental model

```text
sub()              → new Child Session + immediately run one turn
sub(task_id=...)   → reopen the same Child Session + run the next turn
```

There is no separate create/send/wait/manage step and no polling companion:

- **Foreground is the default.** The call waits for the child turn to settle and returns the final result plus `task_id`. A top-level call may set `background:true` to return immediately; nested background is forbidden.
- **Parallel work = several `sub` calls in one assistant message.** Official Pi executes same-message tool calls concurrently (`toolExecution: "parallel"` is the default) and waits for all of them before the turn continues, so two `sub` calls run as parallel children while the parent turn blocks on both.
- **The background mode is hidden in this build.** The public schema has no `background` field and sending one is rejected with a self-correcting error. The durable async delivery machinery stays inside the runtime (the formal lifecycle and `submitTrusted` still use it), so the field can be re-exposed later without migration.
- `task_id` is the continuable Child Session identity (it maps 1:1 to the stable Agent ID). It is not a job handle and not a wait ticket.
- A still-running `task_id` returns `SUB_BUSY`; there is no steer, queueing, or mailbox.

## Progress and optional task notes

Multi-step work keeps a `progress.txt` at the owning task or change root. The orchestrating model creates it when absent and appends concise free-form status, evidence, blockers, and the next action. It has no fixed grammar, event vocabulary, timestamp requirement, field order, or format-validation gate.

`formal-task-board.md` is optional human-readable task-notes Markdown. It is not a protocol, is not required by `sub`, and must not be parsed or validated on dispatch, settlement, or completion. Agent/job/turn state belongs to the runtime Journal; OpenSpec validates only its native planning artifacts. Workers return evidence to the orchestrator and do not write either continuity file themselves.

The former `formal_task` tool is removed. Legacy board validators remain compatibility code only and are not part of the public `sub` execution path.

## Agent selectors

The canonical catalog contains exactly 20 selectors:

- `general`
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

`subagent_type` is required when creating a new task and must be one of these. When continuing with `task_id` it can be omitted; if supplied it must equal the Child Session's original selector (`SUB_SELECTOR_MISMATCH` otherwise). `aili.general`, `task` as a selector, and unknown selectors are invalid. The 19 specialized profiles keep their own complete role prompt and cannot spawn children. `general` may synchronously spawn an allowed non-self specialized Agent below the configured depth ceiling; nested `sub` calls are always synchronous (`background: true` is rejected) and depth-bounded.

## Calling `sub`

```json
{
  "description": "Inspect the parser and report evidence",
  "prompt": "Inspect the parser and report concrete evidence with file anchors.",
  "subagent_type": "aili.code-scout"
}
```

Fields are exactly `description` (required, ≤500 chars, also the child display name), `prompt` (required, the full task text for this turn), `subagent_type`, `task_id`, `model`, `thinking` (`off|minimal|low|medium|high|xhigh|max`), and optional one-turn `cli`. Unknown fields fail validation; the old `task`/`context`/`name`/`async`/`tools`/`workspace`/`writeScope`/`cwd`/`tasks[]` orchestration surface — and, in this build, `background` — no longer exists on the public tool.

Continuation reuses the same Child Session and its conversation context:

```json
{
  "task_id": "ParserScout",
  "description": "Continue the parser inspection",
  "prompt": "Now inspect the compaction path the same way.",
  "model": "anthropic/claude-sonnet-5",
  "thinking": "max"
}
```

Every continuation allocates a new job/turn on the same identity; `model`/`thinking` are re-resolved per turn and the previous turn's choices never leak into the next. Trusted-internal formal Agents cannot be continued through public `sub` (`SUB_FORMAL_CONTINUATION_REFUSED`). Aborted or released identities are terminal. At most 32 top-level turns run concurrently; excess turns remain in durable FIFO order. AILI sets no orchestration wall-clock or request budget (`0`/unlimited), but provider watchdogs, tool timeouts, permissions, the 32-turn semaphore, process shutdown, and cancellation still apply.

Cancelling an active turn is a user action: `/sub-cancel <task_id>` (or a UI cancel control). The model itself has no cancel/list/jobs tool.

## Results, output, and history

Foreground returns the settled result inline: status, `task_id`, job/turn IDs, model provenance, bounded output (≤500,000 bytes / 5,000 lines), and `agent://` / `history://` references. Background deliveries are injected by the runtime with a 5,000-character preview and the same references. Use `hub jobs`, `hub wait`, `hub output`, `hub history`, `hub send`, and `hub cancel` when the Parent needs active coordination before final response. A settled turn must carry non-empty terminal output; an empty result fails as `SUB_EMPTY_RESULT` with the child session history preserved for diagnosis instead of reporting a false success.

Complete raw output is stored at the parent-owned `<agent-id>.md`; the official Pi child conversation remains an independent Session JSONL. Child history reads sanitize per entry: private-key blocks become `<redacted-private-key>`, credential assignments keep the field name with a redacted value, protected credential paths become `<redacted-protected-path>`, and a `redactedSensitiveEntries` diagnostic counts the redactions. Child history cannot be deleted independently; it follows the parent session. Forks start with an empty Agent registry and never copy/control old child artifacts. Confirmed AILI parent deletion can cascade its owned sidecar; official Pi 0.84.4 built-in Ctrl+D/archive has no sidecar hook, so doctor keeps that host gap visible and orphaned sidecars are preserved for reconciliation.

## Models and thinking

Each field resolves independently in this order:

1. an exact model/thinking instruction authorized by the current user message (`explicit` or `delegated-choice`)
2. direct-user stable Agent instance override
3. trusted project role override
4. user-global role override
5. a model-proposed value freshly confirmed with **Allow once** (YOLO auto-approves)
6. direct Parent resolved model, thinking level, and speed tier
7. profile frontmatter fallback, only when no Parent identity exists
8. runtime fallback

Direct current-turn user authority is highest. A confirmed model proposal is one-shot but remains below persistent user-owned configuration; it fills only fields those higher layers omit.

A model/thinking value is direct-user authorized only when the **current Parent user message** explicitly names that exact value for subagents (or explicitly delegates model choice). If the message names a selector such as `aili.code-scout` / `code-scout`, the authority applies only to that selector; a tool call targeting another selector is denied. Generic “subagents/workers” wording applies to all subagents in that Parent turn. The authority is captured before model-generated tool calls, expires when the Parent turn settles, and is never written to Agent, role, project, or user configuration. Consequently, a `sub` tool argument cannot authorize itself and the next Parent message inherits normally unless the user repeats the instruction.

Managed and Herdr use this same preallocation decision and the same audited resolved loadout. Herdr does not add a model-override restriction or an independent authorization/fallback rule; only current-turn authority, catalog availability/authentication, and the selected model's thinking capability determine whether an explicit request runs.

Requests backed by explicit/delegated authority from the current user message are strict and never fall back:

- `SUB_MODEL_UNAVAILABLE` — the requested model is not in the catalog, unavailable, or unauthenticated
- `SUB_MODEL_AMBIGUOUS` — a bare or compact alias matches multiple candidates (the candidates are listed; pick the canonical form)
- `SUB_MODEL_DENIED` — the request is outside the user-authorized value or selector scope
- `SUB_THINKING_UNSUPPORTED` — the target model does not support the requested thinking level

Under inherit-only authority, a model-generated request is only a proposal. Malformed, unavailable, ambiguous, incompatible, denied/dismissed, or no-UI proposals are not applied and do not cancel an otherwise valid dispatch: configured/Parent resolution continues and the turn audit records `rejected-unauthorized` or `rejected-unsupported`. Only an accepted proposal contributes one-shot fields. Resolution accepts canonical `provider/model`, exact bare model ids, exact catalog aliases, and unique normalized compact aliases (`gpt5.6luna` → `gpt-5.6-luna`); ambiguous matches always fail with candidates.

Defaults: both omitted → inherit the current parent model+thinking; `model` set and `thinking` omitted → the target model's isolated-child Pi default (`medium`, clamped to that target; non-reasoning targets become `off`), never Parent `xhigh` and never the highest supported level; `model` omitted and `thinking` set → parent model with the requested level (unsupported fails); both set → exactly that combination.

At each direct interactive/RPC Parent turn, AILI injects a bounded read-only **Subagent model catalog (discovery only; not authorization)** before the first `sub` call. It shows only locally available, configured-auth, in-scope canonical models with Pi thinking support/default and declared `text`/`image` input modalities. It refreshes on the next direct user turn, is capped at 64 models/16 KiB, and never runs credential commands or provider refresh. Catalog visibility never authorizes a request; the adjacent **Current-turn subagent model authority** summary remains the only model/thinking/CLI authority. `text,image` does not claim MP4/audio/ASR or filesystem/browser/network tool capability.

Nested children inherit their direct Persistent Parent, not the root Main. Fast is a separate `standard|priority` service tier, not a model alias: supported Codex payloads may receive `service_tier: "priority"`. Direct users enable it with `/codex-fast true` and disable it with `/codex-fast false`; they manage durable overrides with `/aili-agent-model <global|project|instance> <selector|agent-id> <provider/model|clear> [thinking]`. Project model configuration is ignored and cannot be written before project trust is active.

## External CLI turns

`sub` accepts optional `cli: "claude-code"|"codex-cli"|"opencode"|"grok-cli"|"agy-cli"`. The Parent model interprets the user's natural-language intent and selects one canonical `cli` value in the structured tool call; runtime code does not parse or authorize user wording with product-name regular expressions. Omit `cli` for ordinary Pi execution, and an earlier CLI selection never forces a continuation to reuse it. Consumer Gemini CLI is not registered: a request such as “用 Agy 启动 gemini-3.7-flash” maps to `cli: "agy-cli"`, while the Gemini name remains model/task detail.

A selected CLI turn runs directly as a Herdr-recognized CUI Agent (`claude`, `codex`, `opencode`, `grok`, or `agy`; `driver: external-cli`). It does **not** create a Pi child or ask a model to construct a Bash command. New CLI Agents derive Herdr atomically before allocation; a managed continuation is rejected and must create a new Herdr Agent.

Before surface allocation, the canonical registered CLI identity and Herdr availability are checked. At execution, AILI runs bounded no-shell `--version` then `--help` probes (5 seconds each, 64 KiB combined cap), builds fixed package-owned Agent argv, and starts the vendor in the ordinary Herdr pane allocator. A native YOLO flag is used only in AILI's active YOLO permission mode and only when frozen help contains the registry's exact allowlisted flag; otherwise audit/rendering reports `available` or `yolo-unavailable`. No model-supplied flags, installation, login, dependency operation, or shell runner is accepted.

The task enters through Herdr `agent.prompt`. Foreground completion requires that the same frozen Agent name and pane enter `working` after that prompt and later return to input-ready `idle` or `done`. Pre-existing idle, `blocked`, `unknown`, terminal text, focus, and visibility do not settle it. A blocked vendor confirmation is denied without a user dialog and returns `blocked/need-user`; cancellation or pane/process loss fails explicitly, and no prompt is replayed. Background calls retain the coordinator's ordinary accepted-then-settled behavior.

## Workspaces and permissions

Ordinary `sub` calls run in the shared parent workspace; isolation and formal workspace leases belong to the formal lifecycle. Effective tools are always an intersection of parent-active tools, child-loadable definitions, role ceilings, and hard guards. The child `sub` definition is an AILI-owned bridge, never a reused parent coordinator definition. In sandbox-required modes, an already-effective child `bash` is replaced by exact-profile operations from the one process-owned ready `pi-permission-modes` SandboxController; children cannot initialize, reconfigure, reset, or downgrade it. Missing/degraded/profile-mismatched sandboxes deny Bash, and incompatible Git-worktree `.git` files remain fail closed. Credential/auth/private-key material is denied before approval at the child tool boundary and excluded from messages/output/artifacts. Background asks suspend only that job and return to the parent UI; no UI, rejection, cancellation, shutdown, or bridge loss denies and settles the request.

## Execution backends (managed / herdr)

Persistent agents run on one of two execution backends. `managed` (default) executes children in-process through the official Pi SDK, exactly as before. `herdr` executes each child as an external, visible Pi CLI process inside a Herdr terminal surface (one workspace per parent session, one tab per agent).

Backend selection is user-only. The model-facing `sub` schema has no backend field, and a request carrying one is rejected. Use `/aili-agent-backend s` for status, `/aili-agent-backend h` for Herdr, and `/aili-agent-backend m` for the in-process manage/`managed` backend; the full `status|herdr|manage|managed` words remain compatible. These are session-only overrides. To set a durable user-global preference, use `/aili-agent-backend global herdr` or `/aili-agent-backend global managed`; use `/aili-agent-backend global clear` to remove only the global backend preference and this session's override. The global update is lock-protected and atomically replaces `~/.pi/agent/aili/agent-backend.json`, retaining valid `herdr` settings such as `maxLiveSurfaces`; failed writes leave the existing preference and session override unchanged. Resolution order: session override > project settings (`.pi/aili/agent-backend.json`) > global settings (`~/.pi/agent/aili/agent-backend.json`) > default `managed`. A successful global set becomes this session's override immediately, so it affects only later newly created Agents even when a trusted project setting exists; clear restores ordinary project/global/default resolution. Switching never migrates or interrupts an existing Agent: every existing agent keeps its creation-time backend for continuation and resume.

There is never a silent fallback: if the herdr daemon is unreachable, the protocol is incompatible, or the required components are missing, the `sub` call fails explicitly. Setup detects the Herdr binary, the official Herdr–Pi integration, and the Pi-side herdr skill; missing components are installed via the official chain (`curl -fsSL https://herdr.dev/install.sh | sh`, `herdr integration install pi`, `npx skills add herdrdev/herdr --skill herdr -g -a pi`), skipping anything already present.

Herdr surfaces keep one AILI tab in the workspace: parallel Pi or external CUI Agents are split into one active pane each inside it (the delegating call may hint direction with `split: right|down`; the model can adjust layout further via the herdr skill), and sequential children recycle the settled-idle pane — a recycled child's session stays continuable through `task_id`. Live herdr child surfaces are capped (`herdr.maxLiveSurfaces` in the backend config, default 8); a saturated backend serializes onto recycled panes instead of growing. `/aili-agents` lists agents with backend/state/surface, and `/aili-agents focus <task_id>` brings a live herdr pane to the foreground (managed agents report no surface). A herdr agent's role profile is frozen in a per-agent loadout snapshot at creation; a continuation whose role profile drifted fails closed and asks for a new agent.

Current herdr scope (phased rollout): **static read-only roles only** (`aili.code-reviewer`, `aili.spec-miner`, `aili.doc-researcher`, …) and no formal task-board packages. Write/bash roles stay on `managed` until security equivalence is accepted. A herdr child's turn settles only on structured evidence from the AILI child bridge (`turn.completed` with result text, usage, and output identity) — Herdr's idle/done display is never treated as completion. Herdr children can outlive the parent: after a parent restart, surviving surfaces are re-adopted (continuable by `task_id`) and surfaces whose process is gone are recorded as lost; nothing auto-replays.

## Context ownership and delegation

The AILI-owned billion-context composition permanently disables its `acp_delegate`, `acp_delegate_wait`, and `acp_delegate_cancel` surface, delegation prompt, and widget. Global/project `acp.json` cannot re-enable this factory lock. `compress`, `decompress`, `search_context`, `acp_status`, context transforms, and compaction remain available. Separately installed third-party delegation extensions are outside this package-owned guarantee.

## Legacy data

Legacy `.pi/agent/runs/`, existing Pi sessions, user configuration, and unrelated Agent sidecars are not migrated, reinterpreted, or deleted by the replacement runtime. Old journals that contain hub-era events remain replayable as history; settled idle children from before this change stay continuable through `task_id`. Rollback preserves both legacy runs and new sidecars. Old running jobs record as `interrupted` after process loss and never auto-replay.
