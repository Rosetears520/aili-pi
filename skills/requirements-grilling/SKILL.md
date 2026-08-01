---
name: requirements-grilling
description: Clarify a concrete requirements decision, create one bounded static interview packet, or run an explicitly user-invoked frontier batch over a plan, decision, or idea; trigger on explicit grill/interview/refinement intent or a named material ambiguity, not on ordinary planning, implementation, research, test-plan, report-style review, or BUILD work.
---

# Requirements Grilling

## Purpose

Use this skill to resolve the smallest set of material requirements decisions needed by the canonical DEFINE or ordinary clarification loop, including an explicitly user-invoked frontier batch when the user wants every currently dependency-ready decision in one round.

The input can be an OpenSpec change directory, a custom plan, a user-pasted paragraph, an issue, a ticket, or one or more custom files. The output should preserve the user's intent, clarify unknowns through interview questions, and persist refined content only to the agreed target files.

`requirements-grilling` is the canonical capability name. Old terms such as `change-interviewer`, “interview packet”, and “change interview”, plus upstream phrases such as `grill-me` and `batch-grill-me`, are compatibility trigger phrases only; they route to this same flow and must not create a second user-facing skill, command, or artifact contract.

## Provenance

This skill is the AILI adaptation of upstream Matt Pocock skills `grill-me`, `grilling`, `batch-grill-me`, and `domain-modeling`, copied/adapted under the upstream MIT License. It combines their questioning, decision-frontier, and domain-modeling disciplines with AILI/OpenSpec artifact placement, `interview.md` compatibility, `context.md` Language handling, `adr.md` gating, answer ingestion, and readiness states. Upstream `batch-grill-me` is pinned as in-progress provenance; its user-invoked boundary is retained, while its direct subagent-dispatch instruction is replaced by ROSE-owned proactive trigger-gated evidence routing.

Upstream-originated reference formats are preserved by name in this skill's `references/` directory:

- `references/CONTEXT-FORMAT.md`
- `references/ADR-FORMAT.md`
- `references/INTERVIEW-PACKET-FORMAT.md`
- `references/MIT-LICENSE-MATT-POCOCK.md`
- `references/upstream/mattpocock-skills/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/grill-me/SKILL.upstream.md`
- `references/upstream/mattpocock-skills/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/grilling/SKILL.upstream.md`
- `references/upstream/mattpocock-skills/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/batch-grill-me/SKILL.upstream.md`

## Interview Packet Language

Interview packets are user-facing thinking artifacts. In chat, write them in Simplified Chinese by default for readability and decision traceability.

Keep these items in English or original form:

- file paths
- command names
- code symbols
- API names
- config keys
- OpenSpec requirement headers
- exact source terms

Before persisting an interview packet to the repository, follow the repository's document language convention or ask the user. If no English-only convention exists, persisting the Chinese packet is allowed.

## Decision-state contract

Record each material decision as exactly one of `proposed`, `direction-recorded`, `conditional`, `awaiting-confirmation`, `accepted`, `rejected`, or `superseded`.

- A user preference or direction without exact acceptance is `direction-recorded`.
- Acceptance that depends on an explanation, evidence result, or future condition is `conditional`.
- After the Agent supplies the requested rationale or believes a condition is met, use `awaiting-confirmation`; only a later explicit user confirmation can make it `accepted`.
- Explicit rejection is `rejected`. A later explicit decision replacing an earlier one makes the earlier decision `superseded` and gives the new decision its own state and evidence.
- A filled answer slot, checked item, copied user text, document-authored state, or Agent judgment cannot create acceptance.

Keep decision state separate from `implementation_authorization: absent | granted | expired | revoked`. Requirements artifacts may record either state but cannot create it. Decision acceptance and final test-plan acceptance do not grant implementation authorization. A same-turn accept-and-implement message may record two separate events only when the user explicitly accepts the exact final artifact and explicitly requests immediate implementation of the same exact scope; this skill then returns the implementation-intent evidence to the lifecycle owner and never starts BUILD itself.

## When to Use

Use this skill when the user explicitly asks to refine, grill, interview, batch-grill, or write back requirements; when the user wants their decisions about a plan, decision, or idea elicited interactively; or when one named ambiguity can change scope, design, tasks, acceptance, verification, risk, terminology, or implementation safety.

This skill owns clarification and `interview.md` only. Local facts are inspected directly from the relevant repository owners. If one official-source, prior-art, test-plan, or other process need remains, return that named need to ROSE; do not invoke another skill.

### Canonical loop contract

- **Primary owner:** ROSE/`aili-delivery-flow` owns mode, approvals, progress, and verification; this skill is one bounded clarification adapter.
- **Near miss:** a clear spec, a test-plan request, implementation, general research, plan review, or completion check does not trigger this skill merely because requirements exist.
- **Question budget:** ask one decision-changing question by default; use one bounded static Packet Mode artifact only when several known independent blockers are cheaper to answer together; use Frontier Batch Mode only when the user explicitly asks for batch grilling or the complete current frontier, never merely because blocker count is high.
- **Stop:** persist and reread the accepted answer/packet once, then return `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified` to ROSE.
- **Precedence:** lifecycle approval and verification rules win. This skill creates no scheme, packet, research-summary, or proposal approval and never auto-chains stress-test, test-plan, planning, TDD, review, or security work.

Realistic trigger prompts:

- "Interview me and turn this rough idea into tasks/design/acceptance criteria."
- "Use this custom plan as input and ask what is missing before writing it back."
- "Refine `docs/change.md` with questions first; do not guess requirements."
- "Complete this OpenSpec change package after interviewing me."
- "Grill this requirement / interview packet before write-back or BUILD readiness."
- "Batch-grill this plan; ask every material decision whose prerequisites are already settled, then recompute the next round from my answers."
- "I filled `interview.md`; check whether the answers are clear enough to write back."
- Any old `change-interviewer` or interview-packet request; these are compatibility phrases for this same bounded loop.

## When Not to Use

Do not use this skill for:

- implementing the change after requirements are clear
- broad product brainstorming with no intent to produce a change package
- report-style plan, design, spec, review, or completion-claim stress-testing that asks the agent to inspect and report loopholes without interviewing the user's decisions; return that separate intent to ROSE
- initializing project-level agent rules or OpenCode setup docs
- rewriting a document without grilling, interviewing, or preserving author intent
- OpenSpec validation only, with no requirements refinement needed

Non-trigger prompt:

- "Implement task 3 from the accepted plan." Return to the canonical ordinary/BUILD implementation owner; do not add TDD unless its narrow trigger is present.

## Inputs and Target

First identify the source and persistence target.

Possible sources:

- OpenSpec: `openspec/changes/<change-id>/`
- custom plan or task file
- issue, ticket, PR description, pasted user text, or meeting notes
- custom files named by the user

Possible targets:

- the same source files
- a new or existing change document such as `proposal.md`, `design.md`, `tasks.md`, or `acceptance.md`
- OpenSpec files under `openspec/changes/<change-id>/`
- temporary chat preview, only when the user explicitly asks for it; it is not a readiness source until persisted to an agreed file

Only OpenSpec change directories have deterministic no-question file output. For every non-OpenSpec source, including a single source document with an obvious sibling path, ask one concise placement question before writing.

## Output Placement Contract

When Packet Mode is selected, it defaults to persistent artifact output; a focused unresolved-answer follow-up defaults to chat-first interaction with AI write-back.

### Quick Reference Flow

```text
targeted evidence -> one question, explicit frontier round, or bounded static packet -> direct consistency check -> persist -> reread once -> return outcome to ROSE
```

When a packet is warranted, generate it, run the direct consistency checklist in this skill, persist it, reread it once, then summarize the path. Do not print the full packet in chat unless the user requests a preview or persistence is blocked. A chat preview is not a readiness artifact.

After the initial packet exists, do not require the user to manually edit `interview.md` by default. When unresolved OpenSpec readiness questions remain, ask one decision-changing blocking question in chat, offer evidence-backed short options plus custom input, write the user's accepted answer, accepted default, explicit waiver, or named `UNVERIFIED` state into `interview.md`, then re-read the file from disk before classifying answers or claiming readiness. A waiver or accepted `UNVERIFIED` state records the answer but cannot clear decision-shaping research or replace final test-plan acceptance. Direct user edits to `interview.md` remain a supported fallback, but disk content must be re-read and reconciled before use.

Frontier Batch Mode is different from a static interview packet. It asks the complete current dependency-ready frontier in one interactive round, accepts partial answers, persists and re-reads the round, then recomputes the next frontier. It never turns a static generic questionnaire into a batch and never groups permission or approval questions.

OpenSpec change output is the only deterministic no-question placement. For every non-OpenSpec source, ask where to place the output before writing; chat preview is an explicit temporary fallback only, and the gate remains `BLOCKED_FOR_CLARIFICATION` until the packet or follow-up round is persisted to an agreed file or explicitly waived.

🔴 STOP before writing when placement is not deterministic: for any non-OpenSpec source, missing workspace access, ambiguous target, existing target ownership conflict, or user-pasted text with no path, ask the placement question and wait. Do not choose a path silently.

Target path resolution:

1. If the source is an OpenSpec change directory, write `openspec/changes/<change-id>/interview.md` without asking.
2. If the source is non-OpenSpec, ask where to place the output before writing, even when the source is a single document:
   - A. create a sibling Markdown file beside the main source file;
   - B. create a sibling folder beside the source directory;
   - C. append a new section to the existing spec/design document;
   - D. preview in chat first, then choose a file target before readiness or write-back.
3. If the user pasted only free-form text and no source path exists, ask whether to:
   - A. create a new file in a user-specified location;
   - B. append to an existing spec/document;
   - C. preview in chat first, then choose a file target before readiness or write-back.
4. If the user explicitly says "print in chat", "do not create files", or "chat only", provide only a temporary preview marked `BLOCKED_FOR_CLARIFICATION` and `UNVERIFIED`. Do not call the packet `READY` from chat-only content. For formal work, do not create/reuse/update OpenSpec, satisfy readiness, record acceptance, or start BUILD until the user later explicitly permits writeback.

Use this concise placement question for non-OpenSpec sources:

```text
这个非 OpenSpec 输出需要先确认落点，你选一个：
A. 生成在源文件同级：<path>
B. 在源目录同级新建文件夹：<path>
C. 追加到现有 spec / design 文档末尾
D. 先在对话框预览；之后仍需选择 A/B/C 写回文件，才能进入 READY / BUILD
```

Chat response after persistence should include only:

- generated file path
- source files reviewed
- number of questions
- unresolved `Open Question` / `Unverified` count
- requirements-grilling readiness state: `READY`, `BLOCKED`, `WAIVED`, or `UNVERIFIED`
- suggested next action

## Interview Modes

Choose the mode from user invocation, interaction need, and known material blockers rather than change size:

- If current evidence resolves the material decisions, record the resolved decision and do not manufacture a question or packet.
- If one blocker remains or one answer determines the next question, use Interactive Mode and ask one question at a time.
- Use Frontier Batch Mode only when the user explicitly requests batch grilling, “批量拷问”, or every currently answerable decision together. Build a decision tree, ask the complete current frontier in one numbered round, wait for the user's answers, persist and re-read them, and recompute. Never infer this mode from blocker count.
- Use Packet Mode only when several already-known independent blockers are cheaper to answer as one static durable questionnaire, especially for asynchronous/direct-file completion. Include only those blockers in dependency order; do not instantiate a generic coverage form or call it a dynamic frontier.
- Persist accepted answers in `interview.md` for OpenSpec sources or the agreed non-OpenSpec target, then re-read once before classification, readiness, or write-back.
- Add a follow-up only when a supplied answer remains materially ambiguous, contradictory, incomplete, untestable, or evidence-conflicting. Default to one focused follow-up; use another bounded packet only when several newly exposed independent blockers are cheaper together.

Pinned Addy `interview-me` 内容是 `references/upstream/` 下的 inert reference data，不是第二个 interviewer。其 hypothesis-with-guess 和 confidence-update 纪律只薄适配到 Interactive Mode 与 unresolved follow-up：先给简短当前假设，对一个 material question 附 evidence-backed guess 或显式 uncertainty，等待回答，再更新未知项。置信度百分比只用于诊断，绝不等于 `READY`、approval、waiver、acceptance 或 BUILD authorization。接受的答案仍须写入并重读 `interview.md` 或约定目标后再分类。

Pinned Matt `grill-me`, `grilling`, and in-progress `batch-grill-me` content is also inert reference data, not additional runnable skills or commands. `grill-me` contributes the user-invoked wrapper boundary, `grilling` contributes the default one-question loop, and `batch-grill-me` contributes the explicit frontier-round model. Local AILI rules keep one canonical capability and one artifact contract.

Interactive chat answers must still be persisted. After a material answer is accepted, append or merge the question, answer, classification, and write-back target into `interview.md` for OpenSpec sources or the agreed non-OpenSpec target, then re-read that artifact from disk before claiming readiness. If persistence is blocked, report `BLOCKED_FOR_CLARIFICATION` and the exact file target still needed.

In Packet Mode, do not interrupt the packet with chat-style single-question turns unless a blocking target or persistence decision is missing.

## Grilling Discipline

The upstream `grilling` discipline contributes three active constraints: ask dependency-ordered questions one at a time in Interactive Mode, inspect available evidence instead of asking the user for discoverable facts, and do not act until the user confirms shared understanding. Its broad “every aspect” wording is provenance only; the material-question threshold in this skill controls current behavior.

AILI adaptations:

- In Interactive Mode, ask one material question at a time and wait.
- In Packet Mode, include only the known independent blockers in `interview.md` and preserve dependency order. After the packet exists, ask a focused follow-up only under the unresolved-answer conditions above, write the accepted outcome to the artifact, and re-read it from disk.
- For each question, explain why it matters, name the affected artifact/test/risk/decision, provide an evidence-backed recommended answer when available (or explicit uncertainty), state the tradeoff, offer short selectable options plus a custom-answer option, include an answer slot, and name the write-back target.
- If the answer can be discovered from code, docs, specs, tests, configs, or official sources, inspect those sources instead of asking.
- If no evidence-backed default exists, use `Open Question` or `Unverified`; do not present a model guess as a recommendation.

## Frontier Batch Discipline

Frontier Batch Mode is an explicit user interaction mode, not an automatic optimization and not a second skill.

- Resolve change identity and non-OpenSpec placement first. Keep permission, approval, destructive, external-access, dependency, schema/auth/security, commit/push/merge/release, and exact-operation questions separate and single. A batch answer never grants or implies authority.
- Model only the accepted material scope as a decision tree. The frontier is the complete set of material user decisions whose prerequisite decisions and required evidence are settled. Ask that frontier in one numbered packet; if only one decision is ready, ask one question.
- A question whose answer depends on another question still open in this round belongs to a later round. Do not assume the prerequisite merely to enlarge the current packet.
- Every frontier question still passes the material-question threshold and includes why it matters, affected target, evidence-backed recommendation or explicit uncertainty, trade-off, concise options plus custom input, and write-back target. Do not add generic coverage questions.
- Finding facts remains the agent's job. ROSE inspects directly by default. This skill may return `need-evidence` with the blocked dependency but never dispatches; only downstream questions wait. If ROSE separately justifies a Task, it uses a fresh single-use context under existing limits and never resumes an old `task_id`.
- Accept partial answers. Persist confirmed answers and named dispositions in the same `interview.md` or agreed target, re-read disk, keep unanswered or invalid answers unresolved, and recompute the frontier before the next round.
- Finish only when the frontier is empty and the user explicitly confirms shared understanding. This does not itself establish `READY`, final test-plan acceptance, BUILD authorization, or operation approval.

## Domain-Modeling Discipline

Apply domain-modeling as an active discipline, not as passive glossary lookup.

For the current material decision only:

- challenge conflicts with existing glossary terms, artifact names, lifecycle terms, source-of-truth ownership, readiness states, or code/docs language
- sharpen fuzzy or overloaded terms into project-specific canonical language
- inspect the happy path, failure or boundary scenario that can change the answer; do not enumerate every generic scenario class
- cross-reference current code, docs, specs, tests, configs, and approved source evidence before accepting domain claims
- update the change-local `context.md` `## Language` section only when project-specific terms or conflicts are discovered and resolved
- keep `context.md` Language glossary-like: tight definitions, `_Avoid_` alternatives, and project-specific terms only
- keep implementation decisions, trade-offs, scratchpad notes, generic programming terms, and architecture rationale out of Language; use `design.md`, `adr.md`, tasks, specs, or `drift-log.md` as appropriate

Use `references/CONTEXT-FORMAT.md` for Language structure. For OpenSpec changes, `context.md` remains beside `interview.md` unless a future accepted change says otherwise.

## ADR Handling

Offer an ADR sparingly and only when all three are true:

1. The decision is hard to reverse.
2. The decision would be surprising without context.
3. The decision is the result of a real trade-off.

Use `references/ADR-FORMAT.md` for structure. ADRs for an OpenSpec change live as `openspec/changes/<change-id>/adr.md` beside `interview.md` unless a future accepted change says otherwise.

Keep ADRs short. The value is recording the decision and why; status, options, and consequences are optional when useful. Use `Status: Proposed` unless the user or accepted change authority explicitly confirms the decision as accepted.

## Non-Negotiables

- Do not fill in requirements, design, or acceptance criteria by guessing.
- Ask or include questions according to the selected interview mode; record unresolved items as `Open Question:`.
- Treat files as the source of truth: chat questions and answers are temporary until written to `interview.md` or the agreed target and re-read from disk.
- Preserve existing author content and structure whenever possible.
- If restructuring is necessary, keep original text under `## Appendix: Original Draft` in the same file.
- Never record unconfirmed information as fact. Use `Assumption:` only when the user has accepted it as a working assumption.
- Keep source-specific formats intact, especially OpenSpec requirement headers and scenarios.
- Keep `/ideate`, `/define`, `/build`, and `/ship` as the only public top-level delivery commands; do not add `/grill`, `/grill-me`, or `/interview`.
- Do not register `batch-grill-me` as a second skill or add `/batch-grill-me`; explicit batch phrases route to Frontier Batch Mode in this canonical skill.
- Keep the artifact name `interview.md`; do not create `grill.md`, `grilling.md`, or `requirements-grilling.md` for the same OpenSpec clarification flow.

## Anti-Patterns / Blacklist

- Do not treat chat-only questioning, dry-run output, or a preview as the final requirements artifact.
- Do not mark `READY` until material chat answers have been persisted to `interview.md` or the agreed target and re-read from disk.
- Do not confirm broad-label requirements such as “security”, “idempotency”, “quota”, or “audit” without concrete behavior, boundaries, source-of-truth, and testable acceptance.
- Do not create parallel artifacts such as `grill.md`, `grilling.md`, or `requirements-grilling.md` for an OpenSpec clarification flow.
- Do not write back to unagreed files, and do not overwrite existing user-authored material when a merge is possible.
- Do not invent requirements or recommended defaults when repo/docs/official evidence can answer the question.
- Do not infer Frontier Batch Mode from blocker count, label a static packet as a dynamic frontier, mix approval/permission questions into a frontier round, or treat batch answers as authorization.
- Do not copy upstream `batch-grill-me`'s direct subagent instruction into this skill. Return `need-evidence`; ROSE alone decides whether direct inspection or a fresh Task is justified.

## Phase A: Source Grounding

Before generating questions:

1. Read the user-provided source text or files.
2. If the source is an OpenSpec change directory, read the current target plus only the proposal, design, task, context, ADR, or spec sections that own or directly constrain the candidate decision. Do not inventory every artifact by default.
3. If the source is a plan, issue, ticket, PR description, or custom file, identify existing sections, task markers, requirements, acceptance criteria, and unresolved assumptions.
4. Inspect only the local code/docs/specs/tests/config needed to answer the candidate question. If one missing source class can change the decision, return that exact evidence need and its downstream question dependencies to ROSE; do not dispatch or start another research workflow here. In Frontier Batch Mode, unrelated dependency-ready questions remain eligible for the current round.
5. Record only evidence used by the candidate decision, separating Observed Fact, External Source, Inference, Assumption, Open Question, and Unverified.
6. Refine only domain terms, boundaries, owners, or contradictions that can change that decision.

Do not ask the user for information that can be reliably discovered from current code, docs, specs, tests, configs, or official sources.

Use only the one source class needed for a material question. If that evidence remains missing, return `need-evidence` and keep dependent readiness blocked. A completed packet is not BUILD authority; explicit final `test-plan.md` acceptance remains the sole lifecycle-level pre-BUILD user approval for formal work.

Potential gaps when the current source or request makes them material; this is not a mandatory checklist:

- unclear goal, user, or success criteria
- missing in-scope and out-of-scope boundary
- incomplete happy path, failure path, retry, rollback, or migration flow
- undefined interfaces, API shapes, events, auth, errors, or versioning
- unclear data model, ownership, lifecycle, validation, or constraints
- fuzzy, conflicting, or overloaded domain terms
- missing architecture decisions, trade-offs, dependencies, or alternatives
- missing security, privacy, reliability, performance, or observability requirements
- acceptance criteria that are not executable or verifiable

Do not write a material answer as accepted content until the selected question, frontier round, or bounded static packet is resolved. If the user explicitly says to write with current information, unresolved items may be recorded as `Open Question`, explicitly `WAIVED`, or named `UNVERIFIED`, but unresolved decision-shaping research remains blocking and cannot be presented for coherent final acceptance or BUILD readiness. Never mark the requirements-grilling gate `READY` from unresolved material ambiguity.

## Readiness States

Report the requirements-grilling gate with exactly one state whenever a packet or frontier round is persisted, chat or direct-file answers are ingested, a focused follow-up is appended, or write-back / BUILD readiness is discussed:

- `READY`: material questions are answered, answers are coherent with evidence, domain language is not contradictory, every material policy has concrete behavior/boundaries, and acceptance/testability is sufficient for implementation.
- `BLOCKED`: material ambiguity, contradiction, incomplete answer, evidence conflict, unsupported default, out-of-scope answer, fuzzy domain term, source-of-truth conflict, or untestable acceptance remains. Use `BLOCKED_FOR_CLARIFICATION` as the detailed reason when the next action is another grilling round.
- `WAIVED`: the user explicitly waived a named question despite the missing information; this records disposition only and cannot clear decision-shaping research or final test-plan acceptance.
- `UNVERIFIED`: the user explicitly accepted named unresolved or unverifiable items as `UNVERIFIED`; do not describe those items as confirmed or use the state to clear a material research/readiness gate.

## Phase B: Ask or Draft

Choose exactly one current question shape:

- Interactive Mode: ask the single next dependency-ordered material question and persist its answer.
- Frontier Batch Mode: after explicit user invocation, ask the complete current dependency-ready frontier in one numbered round, persist and re-read supplied answers, then recompute before another round.
- Packet Mode: generate a static Markdown interview packet only when several already-known independent material blockers meet the Packet Mode threshold.

Do not silently convert one mode into another. A static packet is not a frontier round, and a high blocker count does not activate Frontier Batch Mode.

Default behavior:

- For OpenSpec sources, write `openspec/changes/<change-id>/interview.md` without asking.
- For every non-OpenSpec source, including a single source document, ask for placement before writing.
- Use chat-only output only when the user explicitly asks for it or selects chat-only in the placement question.

Packet Mode produces a draft artifact. Frontier Batch Mode produces one draft numbered round. Do not present or persist either before Phase C. Use `references/INTERVIEW-PACKET-FORMAT.md` only for the static Packet Mode artifact and omit sections that have no selected material decision.

The static packet contains one row per selected blocker, not a full requirements-coverage matrix. A frontier round contains one numbered question per currently dependency-ready material decision and withholds downstream decisions until a later round. Each shape records the decision, material impact, exact evidence, status, question or disposition, and write-back target. Goal/scope, permissions, failure behavior, data/state/API contracts, compatibility, terminology, security, performance, observability, and testability are candidate topics only when the current source or request makes one material.

For every selected blocker, choose one status only:

- `Confirmed by evidence`: current repo/docs/specs/tests/configs/official docs answer it with exact behavior, boundary, a source-of-truth anchor such as code/test/config/docs or an explicit owner, and a testable acceptance/verification signal; cite the evidence. A term, heading, checklist label, or broad phrase alone is not evidence that the dimension is confirmed.
- `Not applicable`: the selected candidate does not apply; give a short reason.
- `Needs question`: a decision-changing user answer is required; add or link a question.
- `Open Question`: still unresolved and must not be written as fact.
- `Unverified`: retained only as a named unverified item, preferably after user acceptance.

Material question threshold:

- Ask only if the answer can change scope, design, tasks, acceptance criteria, tests, risk handling, rollout, terminology, domain model, or implementation safety.
- Each question must include why asked, affected artifact/decision, evidence-backed recommended default when available, consequences/trade-offs, answer slot, and write-back target.
- Each question must offer concise selectable options and a custom answer. Never force a listed option when user-provided text can resolve the decision.
- If a candidate question is generic or would not change implementation readiness, omit it or convert it to a non-blocking note.
- If the answer is discoverable from current repository files, tests, configs, specs, docs, or official sources, gather and cite evidence instead of asking.
- If no evidence-backed default exists, mark the default as `Open Question` or `Unverified`; do not present a guess as a recommendation.
- If a source only names a material topic but does not define behavior, boundary, failure handling, owner/source-of-truth, or acceptance criteria, treat it as `Needs question` or `Open Question`, not `Confirmed by evidence`.
- Slogan-level phrases such as “安全策略”, “违规内容”, “重复处理”, “幂等”, “回滚”, “失败处理”, “权限”, “quota”, “view 策略”, “清理策略”, “日志”, or “audit” require follow-up when they affect implementation or tests and no concrete policy is cited.

In Packet Mode, treat these as material-question candidates when mentioned. Include a question immediately only when the topic is material and the cited source does not already define the concrete behavior, boundary, source-of-truth anchor, and acceptance signal:

- multi-tenancy: isolation model, tenant identifiers, cross-tenant controls, migrations
- offline/background sync: conflict resolution, retry/backoff, reconciliation
- security/privacy/compliance: data retention, audit logs, encryption, PII handling
- backend/product semantics: duplicate writes, overwrite versus reject versus versioning, retry counting, quota counting, deletion access, scrub/cleanup failure visibility, snapshot/view isolation, response headers, and log/audit redaction
- UI/UX: empty/loading/error states, permission-denied copy, accessibility, i18n
- agent workflow changes: primary/subagent boundaries, skill routing, verification, memory, and no nested orchestration
- terminology or artifact-name changes: old/new names, compatibility aliases, user-visible vs invisible routing, and artifact contract boundaries

If the user says `先这样`, `按目前信息写回`, or equivalent, stop asking only after classifying unresolved material items. Proceed with write-back only when unresolved items are recorded as `Open Question`, explicitly `WAIVED`, or accepted as named `UNVERIFIED`; do not write unresolved material answers as facts or report `READY` until clarified.

## Phase C: Direct Consistency Check

After generating the selected question, frontier round, or static packet, inspect it once directly. Do not invoke an independent stress-test or review lane merely because a question artifact exists.

🔴 STOP before presentation or persistence if direct inspection finds an omitted dependency-ready material question, a prematurely included dependent question, unsupported default, non-executable acceptance criterion, fuzzy domain term, ADR misuse, or unmarked `Open Question` / `Unverified` item. Repair in scope or report the blocker.

Check:

- Does every included question pass the material-question threshold, and is any known material blocker omitted?
- Which question asks the user for information that should be discovered from code/docs instead?
- Which recommended default lacks evidence?
- Which user answer would lead to a completely different design?
- Which acceptance criteria affected by these decisions are not executable?
- Which rows were marked `Confirmed by evidence` from keyword presence, broad headings, or checklist labels instead of exact requirements?
- Which named risk, behavior, term, boundary, or ADR condition directly affected by these decisions remains unspecified or conflicting?
- Which assumptions must be marked `Open Question` or `Unverified`?
- In Frontier Batch Mode, which question depends on another open question or missing fact and therefore belongs to a later round?
- Which identity, placement, permission, approval, or exact-operation question was incorrectly batched and must be asked separately?

Apply fixes to the selected question shape before sending it to the user.

After Phase C, persist the final static packet according to the Output Placement Contract. For an interactive or frontier round, ask the approved question shape, then persist accepted question/answer/classification trails before reporting readiness or computing another frontier. Only then present a concise chat summary.

## Phase D: Ingest User Answers

After the user answers in chat or directly edits the interview packet:

1. Re-read the artifact from disk first; compatibility marker: Re-read the filled packet from disk. Conversation summaries and chat-only answers are stale until confirmed against the saved artifact. If answers were collected in chat, write them to the agreed artifact first, then re-read from disk before classification or readiness. If the user edited the file directly, treat the on-disk content as the fallback source of truth after re-reading and reconciling material changes.
2. Classify every material answer as one of: `confirmed`, `ambiguous`, `contradictory`, `incomplete`, `untestable`, `evidence-conflicting`, `out-of-scope`, or `Unverified`.
   - Answers that repeat broad labels such as “做安全策略”, “按幂等处理”, “正常回滚”, “走 quota”, “写 audit”, or “按现有逻辑” without concrete behavior, boundary, source-of-truth, and testable acceptance remain `incomplete` or `untestable`. A named waiver or `UNVERIFIED` disposition may preserve the gap but cannot turn it into concrete accepted behavior.
3. Convert only `confirmed` answers into factual requirements, design notes, tasks, acceptance criteria, verification commands, Language updates, or ADR proposals. Assign the decision state from the explicit user event under the Decision-state contract; a confirmed answer may still be `direction-recorded`, `conditional`, or `awaiting-confirmation` rather than `accepted`. Record explicit waivers and user-accepted `Unverified` items only as named limitations; they cannot clear decision-shaping research or supply missing acceptance behavior.
4. Keep unanswered, ambiguous, contradictory, incomplete, untestable, evidence-conflicting, out-of-scope, or terminology-conflicting answers out of factual write-back.
5. Choose the next interaction from the active mode. Interactive Mode and static Packet Mode default to one focused follow-up for the next dependency-ordered material blocker; use another bounded static packet only when several newly exposed independent blockers are cheaper together. Frontier Batch Mode instead recomputes and asks the complete next dependency-ready frontier; an ambiguous answer remains an unresolved frontier item and does not unlock its dependents. Every follow-up still includes why it blocks, affected artifact/decision, recommended default if evidence supports one, consequences/trade-offs, answer slot, and write-back target.
6. Persist the follow-up in the same `interview.md` artifact for OpenSpec sources; do not create `grill.md`, `requirements-grilling.md`, or a parallel artifact.
7. Keep unverifiable external claims as `Unverified` only when named and explicitly accepted by the user; otherwise classify them as blocking or `Open Question`. If the claim could change scope, architecture, dependency, public contract, permissions, acceptance, or verification strategy, it remains blocking even when named and accepted as `Unverified`.
8. Do not silently resolve conflicts or treat a filled answer slot as confirmation when the answer remains unclear.
9. Record only the affected answer classification, evidence, write-back target, and readiness state; add domain-language or ADR fields only when that decision touches them.
10. Run the Phase C direct consistency check after answer classification; do not auto-chain another process skill.
11. In Frontier Batch Mode, accept partial answers, preserve every unanswered or invalid frontier item as unresolved, and recompute the next frontier only from persisted/re-read confirmed answers and current evidence. Do not ask a downstream question whose prerequisite remains unresolved.
12. When the frontier becomes empty, restate the shared understanding and require explicit user confirmation before acting. Keep readiness, final test-plan acceptance, and every permission/operation approval separate.

After answer ingestion, classify every confirmed correction, new requirement, artifact/design/task/test change, accepted finding, or implementation feedback into exactly one exhaustive delta class:

- `covered`: the current accepted artifacts and tests already cover it; link the evidence and do not duplicate writeback.
- `material-question`: one unresolved decision can change scope, contract, tasks, acceptance, risk handling, or implemented behavior; ask one focused question and do not guess.
- `material-delta`: confirmed material change; write and re-read only the owning artifacts and direct dependents, read OpenSpec status/instructions when those dependencies require it, run lifecycle-selected strict validation, and stale prior test-plan acceptance when acceptance or required verification changes.
- `ordinary-steering`: presentation/process guidance that changes no material dimension; apply without reopening acceptance.
- `Unverified`: evidence is missing or cannot currently establish the class; name the gap and block any dependent claim/action.

Do not ask whether to save a material delta. Do not guess change identity, expand permission, bypass high-risk/operation approval, continue BUILD, or use old acceptance after acceptance/verification changed. If material writeback leaves the acceptance contract unchanged, preserve acceptance only with explicit comparison evidence.

If the direct consistency check finds material ambiguity, contradiction, incompleteness, untestable acceptance, evidence conflict, terminology conflict, out-of-scope expansion, or unresolved decision-shaping research, report readiness as `BLOCKED` / `BLOCKED_FOR_CLARIFICATION`, persist or present the focused follow-up according to the placement contract, and do not write affected content as accepted fact. Waiver or accepted-`UNVERIFIED` may record a named non-material limitation but cannot clear a material research/readiness blocker.

If the user explicitly says to proceed despite named unresolved items, record whether the gate is `WAIVED` or `UNVERIFIED`, list the accepted items, and keep the risk visible in write-back and completion reports. Do not call it `READY`.

## Phase E: Write Back

Write only to the agreed target files.

🔴 STOP before write-back when the target file is not explicitly agreed, the requirements-grilling gate is `BLOCKED`, answers conflict, existing content would need replacement instead of merge, a confirmed answer would change scope/design/tasks beyond the agreed package, Language would absorb an implementation decision, or an ADR would be created without passing the ADR gate. Ask or report the conflict instead of overwriting.

BUILD readiness rule: applicable answers must be coherent, with no unresolved material decision or decision-shaping evidence gap. Overall formal readiness is owned by `aili-delivery-flow` and additionally requires its applicable artifacts/validation and explicit final `test-plan.md` acceptance. This skill neither grants nor duplicates that gate.

General write-back rules:

- Merge rather than overwrite.
- Preserve headings, IDs, task markers, and existing conventions.
- Put details closest to the file that owns them: proposal for why/scope, design for decisions/trade-offs, tasks for execution, specs or acceptance docs for testable behavior, `context.md` Language for resolved project-specific terms, and `adr.md` for gated hard-to-reverse trade-offs.
- Add traceability where useful: requirement -> design decision -> task -> verification.

For OpenSpec targets:

- Preserve required delta headers when present: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`.
- Preserve `### Requirement:` and `#### Scenario:` structure.
- Keep at least one scenario per requirement when adding requirements.
- Keep `interview.md`, `context.md`, and `adr.md` beside the change artifacts unless a future accepted change changes placement.

For custom plans or documents:

- Preserve the user's plan sections and task ordering.
- Add missing acceptance criteria and verification commands near the tasks they prove.
- Keep unconfirmed details in `Open Questions` instead of turning them into commitments.

## Validation

After write-back:

1. Inspect the diff to confirm the target files changed as intended and unrelated files were not modified.
2. Run only the claim-matched validation selected by the lifecycle/ordinary-task owner; OpenSpec material writeback normally requires strict change validation.
3. If no executable check is selected, validate by reading the edited files and checking that unresolved items are labeled.
4. Report what was verified and what remains unverified.

For OpenSpec material writeback, read current status/instructions only for affected dependencies, reread each changed artifact once, and run the validation selected by the lifecycle owner. File presence or transient chat/UI state is not readiness evidence.

## Completion Report

Report:

- Source reviewed
- Interview mode used and Frontier Batch rounds completed, when applicable
- Questions asked and key answers incorporated
- Files changed
- Requirements-grilling readiness state: `READY`, `BLOCKED`, `WAIVED`, or `UNVERIFIED`
- Open questions left unresolved
- Validation command or inspection result
