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
- **Background is top-level only.** The public schema accepts `background:true` for a top-level call and returns an accepted task for hub coordination; nested background remains rejected. The durable async delivery machinery stays inside the runtime.
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
  "description": "Inspect model selection and report evidence",
  "prompt": "Inspect model selection and report concrete evidence with file anchors.",
  "subagent_type": "aili.code-scout",
  "selectionScope": "model-selection-repair"
}
```

Fields are exactly `description` (required, ≤500 chars, also the child display name), `prompt` (required, the full task text for this turn), `subagent_type`, `task_id`, `model`, `thinking` (`off|minimal|low|medium|high|xhigh|max`), optional one-turn `cli`, and optional `selectionScope` (one non-empty single-line name, ≤200 chars). Unknown fields fail validation; the old `task`/`context`/`name`/`async`/`tools`/`workspace`/`writeScope`/`cwd`/`tasks[]` orchestration surface no longer exists on the public tool.

Continuation reuses the same Child Session and its conversation context:

```json
{
  "task_id": "ModelScout",
  "description": "Continue the model inspection",
  "prompt": "Now inspect the compaction path the same way.",
  "model": "anthropic/claude-sonnet-5",
  "thinking": "max"
}
```

Every continuation allocates a new job/turn on the same identity; `model`/`thinking` are re-resolved per turn and the previous turn's choices never leak into the next. An external Agent must repeat its exact `cli`; omission or change is rejected rather than silently switching drivers. A confirmed `selectionScope` may suppress the candidate dialog only for the exact bound fields. Trusted-internal formal Agents cannot be continued through public `sub` (`SUB_FORMAL_CONTINUATION_REFUSED`). Aborted or released identities are terminal. At most 32 top-level turns run concurrently; excess turns remain in durable FIFO order. AILI sets no orchestration wall-clock or request budget (`0`/unlimited), but provider watchdogs, tool timeouts, permissions, the 32-turn semaphore, process shutdown, and cancellation still apply.

Cancelling an active turn is a user action: `/sub-cancel <task_id>` (or a UI cancel control). The model itself has no cancel/list/jobs tool.

## Results, output, and history

Foreground returns the settled result inline: status, `task_id`, job/turn IDs, model provenance, bounded output (≤500,000 bytes / 5,000 lines), and `agent://` / `history://` references. Background deliveries are injected by the runtime with a 5,000-character preview and the same references. Use `hub jobs`, `hub wait`, `hub output`, `hub history`, `hub send`, and `hub cancel` when the Parent needs active coordination before final response. A settled turn must carry non-empty terminal output; an empty result fails as `SUB_EMPTY_RESULT` with the child session history preserved for diagnosis instead of reporting a false success.

Complete raw output is stored at the parent-owned `<agent-id>.md`; the official Pi child conversation remains an independent Session JSONL. Child history reads sanitize per entry: private-key blocks become `<redacted-private-key>`, credential assignments keep the field name with a redacted value, protected credential paths become `<redacted-protected-path>`, and a `redactedSensitiveEntries` diagnostic counts the redactions. Child history cannot be deleted independently; it follows the parent session. Forks start with an empty Agent registry and never copy/control old child artifacts. Confirmed AILI parent deletion can cascade its owned sidecar; official Pi 0.84.4 built-in Ctrl+D/archive has no sidecar hook, so doctor keeps that host gap visible and orphaned sidecars are preserved for reconciliation.

## Models and thinking

Model and thinking are independent fields. A runtime-owned confirmed per-turn candidate is passed as `directUserTurn` and outranks persistent instance/project/user-role configuration for that dispatch; it changes no durable config. Without a confirmed candidate, strict resolution remains: instance, trusted project, user-global, confirmed one-shot compatibility, direct Parent identity, profile fallback, then runtime fallback. A requested model/thinking combination that is unavailable, ambiguous, unauthenticated, or unsupported fails explicitly.

The Parent interprets conversational shorthand and submits a structured candidate. Runtime code does not parse the Parent's natural-language authorization, does not run a second classifier, and does not treat a model/tool message, Worker output, `confirmed` field, generic answer, or old audit record as permission. When `model`, `thinking`, or `cli` is supplied, AILI displays the exact candidate (canonical Pi model when applicable), role, project, named task scope, and relevant vendor boundary through one runtime-owned questionnaire. Only that questionnaire's matching fixed **Confirm this selection** callback authorizes the candidate; the user does not retype identifiers. Denial, dismissal, headless mode, malformed/custom/extra answers, and unavailable capabilities fail before Agent/job/turn allocation.

An optional `selectionScope` is a non-empty, single-line name of at most 200 characters. One Parent keeps at most one confirmed binding in memory, bound to its session id, canonical project path, exact scope, and exact optional `cli`/`model`/`thinking` fields. The binding can cover new or continued implementation/review/repair roles in the same task. A changed scope or field set requires confirmation and replaces the old binding. Omitted scope never creates reusable authority. Session switching, reload, shutdown, and restart clear it; no Journal, metadata, or questionnaire text restores it.

Omitting all overrides for an ordinary Pi child keeps the existing default resolution and does not open a choice dialog. A model may propose an informal name such as `gpt-5.6luna-max`, but it must submit the accurate canonical model and separate `thinking=max` candidate for confirmation; the runtime does not silently correct a candidate or infer thinking from a model suffix. Catalog visibility is discovery only and never authorizes a request. The bounded catalog lists only available/configured-auth/in-scope Pi models, supported thinking levels/default, and `text`/`image` input modalities; those modalities do not imply audio/ASR/filesystem/browser/network tools.

Nested children inherit their direct Persistent Parent, not the root Main. Fast is a separate `standard|priority` service tier, not a model alias: supported Codex payloads may receive `service_tier: "priority"`. Direct users enable it with `/codex-fast true` and disable it with `/codex-fast false`; they manage durable overrides with `/aili-agent-model <global|project|instance> <selector|agent-id> <provider/model|clear> [thinking]`. Project model configuration is ignored and cannot be written before project trust is active.

## External CLI turns

`sub` accepts optional `cli: "claude-code"|"codex-cli"|"opencode"|"grok-cli"|"agy-cli"`. The Parent interprets the conversation and submits one registered structured candidate; runtime code never parses product names or authorization phrases. Omit `cli` for ordinary Pi execution. A continuation of an external Agent must repeat its frozen CLI; omitting it or changing it fails explicitly instead of silently becoming a Pi child or changing driver.

A candidate with `cli`, external `model`, or external `thinking` is shown in the same runtime-owned questionnaire as the task scope and project. Only the matching fixed questionnaire callback authorizes it. Generic `answer` commands, model/tool text, Worker output, self-reported `confirmed` fields, and prior metadata cannot authorize it. A selected CLI runs as a Herdr-recognized direct CUI Agent (`claude`, `codex`, `opencode`, `grok`, or `agy`; `driver: external-cli`), never as a Pi child or model-built Bash command. No confirmation means no durable Agent/job/turn or surface allocation.

External model and thinking are independent vendor-native values and bypass the Pi catalog. The Parent should use the selected installed CLI's read-only model list/help when available and pass one exact listed model ID byte-for-byte; it must not fix spelling, invent a base model, strip suffixes, or infer thinking. Omitted values preserve vendor defaults. AILI parses only bounded frozen `--version`/`--help` evidence (5 seconds per probe, 64 KiB combined), requires unique semantic option evidence when a requested field is present, and obeys the displayed separate/equals syntax and enumerated thinking values. Invalid, ambiguous, unavailable, or unsupported evidence fails without fallback or arbitrary flags. Agy additionally requires read-only `herdr integration status` to report exact `antigravity-cli: current`; installation is manual and never automatic.

The current Parent permission-mode snapshot is passed into Herdr preflight. A native YOLO flag is added only when that snapshot is YOLO and frozen help contains the registry's exact allowlisted flag; otherwise the evidence is `available` or `yolo-unavailable`. Direct vendor execution is trusted-local: it uses the vendor's own local permissions and is **not** a Pi-child per-tool hard-denial boundary or an AILI OS sandbox. The actual Herdr executable binding is **Unverified** because the API accepts kind/args rather than a probe path; no basename/process-info gate pretends otherwise. Blocked without a bounded operation packet fails closed as `blocked/need-user` without a user approval dialog.

Startup freezes the live Agent name and pane ID. Pane- and name-targeted readiness must agree on the same pair and report `idle|done` plus `interactive_ready=true` when present before a prompt. Only pre-acceptance `agent_not_ready` is retried. The first successful `agent.prompt` is authoritative acceptance and is never replayed. After acceptance, the runtime must observe `working` within the existing startup timeout. Once working is observed, it adds no arbitrary total task deadline; settlement requires the current status to be `idle|done`, current readiness, advanced sequence when supplied, frozen identity, and then a bounded correlated result file. Historical idle, text-only output, `unknown`, and `blocked` do not settle a run. Diagnostic `agent.read` text is never transport output.

Each direct external run creates a short runtime-owned `external-result.json` before prompt delivery. The final prompt instruction requires exact run/turn identity, schema version 1, `completed|partial|blocked`, and non-empty Markdown for completed/partial. Valid completed/partial content is the sole transport output; missing/pending, malformed/mismatched, empty, and blocked documents remain explicit failures. Partial remains partial. Cancellation, shutdown, process loss, and background execution retain the shared coordinator lifecycle and never replay an accepted prompt.

## Workspaces and permissions

Ordinary `sub` calls run in the shared parent workspace; isolation and formal workspace leases belong to the formal lifecycle. Effective tools are always an intersection of parent-active tools, child-loadable definitions, role ceilings, and hard guards. The child `sub` definition is an AILI-owned bridge, never a reused parent coordinator definition. In sandbox-required modes, an already-effective child `bash` is replaced by exact-profile operations from the one process-owned ready `pi-permission-modes` SandboxController; children cannot initialize, reconfigure, reset, or downgrade it. Missing/degraded/profile-mismatched sandboxes deny Bash, and incompatible Git-worktree `.git` files remain fail closed. Credential/auth/private-key material is denied before approval at the child tool boundary and excluded from messages/output/artifacts. Background asks suspend only that job and return to the parent UI; no UI, rejection, cancellation, shutdown, or bridge loss denies and settles the request.

## Execution backends (managed / herdr)

Persistent agents run on one of two execution backends. `managed` (default) executes children in-process through the official Pi SDK, exactly as before. `herdr` executes each child as an external, visible Pi CLI process inside a Herdr terminal surface (one workspace and one AILI tab per parent session, with one pane per live Agent).

Backend selection is user-only. The model-facing `sub` schema has no backend field, and a request carrying one is rejected. Use `/aili-agent-backend s` for status, `/aili-agent-backend h` for Herdr, and `/aili-agent-backend m` for the in-process manage/`managed` backend; the full `status|herdr|manage|managed` words remain compatible. These are session-only overrides. To set a durable user-global preference, use `/aili-agent-backend global herdr` or `/aili-agent-backend global managed`; use `/aili-agent-backend global clear` to remove only the global backend preference and this session's override. The global update is lock-protected and atomically replaces `~/.pi/agent/aili/agent-backend.json`, retaining valid `herdr` settings such as `maxLiveSurfaces`; failed writes leave the existing preference and session override unchanged. Resolution order: session override > project settings (`.pi/aili/agent-backend.json`) > global settings (`~/.pi/agent/aili/agent-backend.json`) > default `managed`. A successful global set becomes this session's override immediately, so it affects only later newly created Agents even when a trusted project setting exists; clear restores ordinary project/global/default resolution. Switching never migrates or interrupts an existing Agent: every existing agent keeps its creation-time backend for continuation and resume.

There is never a silent fallback: if the herdr daemon is unreachable, the protocol is incompatible, or the required components are missing, the `sub` call fails explicitly. Ordinary Pi-child setup detects the Herdr binary, the official Herdr–Pi integration, and the Pi-side herdr skill; missing baseline components are installed via the official chain (`curl -fsSL https://herdr.dev/install.sh | sh`, `herdr integration install pi`, `npx skills add herdrdev/herdr --skill herdr -g -a pi`), skipping anything already present. This baseline setup does not auto-install external-vendor integrations: the Agy `antigravity-cli` prerequisite is manual as described above.

Herdr surfaces keep one AILI tab in the workspace: parallel Pi or external CUI Agents are split into one active pane each inside it (the delegating call may hint direction with `split: right|down`; the model can adjust layout further via the herdr skill), and sequential children recycle the settled-idle pane — a recycled child's session stays continuable through `task_id`. For Herdr/external-CLI diagnosis, especially `external-output-*`, the Parent should use the installed Herdr skill for bounded read-only `agent get/read`, `pane read`, status, and visible-surface inspection before deciding. It must never use the skill to start/stop/close sub-owned surfaces, resend the same task, or replace structured result evidence; skill inspection is diagnostic guidance, not an automatic completion gate. Live herdr child surfaces are capped (`herdr.maxLiveSurfaces` in the backend config, default 8); a saturated backend serializes onto recycled panes instead of growing. `/aili-agents` lists agents with backend/state/surface, and `/aili-agents focus <task_id>` brings a live herdr pane to the foreground (managed agents report no surface). A herdr agent's role profile is frozen in a per-agent loadout snapshot at creation; a continuation whose role profile drifted fails closed and asks for a new agent.

Current herdr scope (phased rollout): **static read-only roles only** (`aili.code-reviewer`, `aili.spec-miner`, `aili.doc-researcher`, …) and no formal task-board packages. Write/bash roles stay on `managed` until security equivalence is accepted. A herdr child's turn settles only on structured evidence from the AILI child bridge (`turn.completed` with result text, usage, and output identity) — Herdr's idle/done display is never treated as completion. Herdr children can outlive the parent: after a parent restart, surviving surfaces are re-adopted (continuable by `task_id`) and surfaces whose process is gone are recorded as lost; nothing auto-replays.

## Context ownership and delegation

The AILI-owned billion-context composition permanently disables its `acp_delegate`, `acp_delegate_wait`, and `acp_delegate_cancel` surface, delegation prompt, and widget. Global/project `acp.json` cannot re-enable this factory lock. `compress`, `decompress`, `search_context`, `acp_status`, context transforms, and compaction remain available. Separately installed third-party delegation extensions are outside this package-owned guarantee.

## Legacy data

Legacy `.pi/agent/runs/`, existing Pi sessions, user configuration, and unrelated Agent sidecars are not migrated, reinterpreted, or deleted by the replacement runtime. Old journals that contain hub-era events remain replayable as history; settled idle children from before this change stay continuable through `task_id`. Rollback preserves both legacy runs and new sidecars. Old running jobs record as `interrupted` after process loss and never auto-replay.
