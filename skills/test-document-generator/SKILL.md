---
name: test-document-generator
description: Generate or materially revise a repository-local test plan, QA plan, acceptance matrix, or regression checklist on explicit request or when one concrete testability gap blocks formal DEFINE; do not trigger for ordinary implementation, test execution, TDD, review, or completion claims.
---

# Test Document Generator

## Purpose

Use this skill to generate a durable Markdown test document, test matrix, acceptance checklist, regression scope, or QA plan from existing product/change material.

This skill writes testing documentation. It does not replace `test-driven-development`, which writes or runs automated tests.

In the AILI lifecycle, `aili-delivery-flow` owns mode, approvals, progress, and verification. This skill owns only one bounded test-document artifact loop.

If a material product decision or exact source gap prevents testability, return that need to ROSE. Do not invoke requirements, source, prior-art, stress-test, TDD, review, or another process skill.

## Canonical loop contract

- **Positive trigger:** explicit test-plan/QA/acceptance-matrix/regression-checklist intent, or one named missing testability decision in formal DEFINE.
- **Near miss:** writing/running tests, fixing a bug, checking coverage, reviewing a diff, or implementing a feature does not trigger document generation by itself.
- **Owner/handoff:** produce the artifact under the current ordinary/DEFINE owner, then return its path, coverage, and exact gap to ROSE.
- **Bounded stop:** one source-grounding pass, one direct consistency pass, one write/re-read; stop `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`.
- **Precedence:** lifecycle approval and claim-matched verification rules win. The draft, research summary, or generated packet creates no extra approval or completion authority.

## When to Use

Use this skill when the user asks for:

- test document
- test plan
- QA plan
- acceptance test matrix
- regression checklist
- test cases derived from a spec, plan, issue, PR, or feature description
- a test plan derived from an evidence-backed方案, including official-doc constraints, prior-art risks, rejected patterns, assumptions, and `Unverified` items that need verification coverage

## Inputs

Possible sources:

- `openspec/changes/<change-id>/`
- `proposal.md`, `design.md`, `tasks.md`, `acceptance.md`
- issue, ticket, or PR description
- user-pasted spec, solution, or feature description
- existing code, tests, docs, README, or CI commands when needed for evidence grounding

Do not ask questions that can be answered from repository code, docs, specs, tests, configs, or official sources.

## Output Placement Contract

OpenSpec change output is the only deterministic no-question placement. For non-OpenSpec output without an approved project-local location, ask one placement decision. Generate the draft, run this skill's direct consistency pass, persist, reread once, then summarize the path.

🔴 STOP before writing when a non-OpenSpec placement is unresolved, existing target ownership/scope conflicts, or workspace permissions are uncertain. An existing owned target is updated by scoped merge; existence alone does not create another question.

Target path resolution:

1. If the source is an OpenSpec change directory, write `openspec/changes/<change-id>/test-plan.md` without asking.
2. If the source is non-OpenSpec, ask where to place the output before writing, even when the source is a single document:
   - A. create a sibling Markdown file beside the main source file;
   - B. create a sibling folder beside the source directory;
   - C. append a new section to the existing spec/design document;
   - D. print the result in chat only.
3. If the user pasted only free-form text and no source path exists, ask whether to:
   - A. create a new file in a user-specified location;
   - B. append to an existing spec/document;
   - C. print in chat only.
4. If the target already exists, update it by merging or appending a new revision section instead of blindly overwriting.
5. If the user explicitly says "print in chat", "do not create files", or "chat only", do not write files.

Target-exists merge fallbacks:

- If an existing `test-plan.md` has the same section structure, merge affected rows into matching sections and append a dated entry to its existing change-record section when present.
- If the existing target uses a different structure, add `## New Revision: <date/change>` and preserve the original content unchanged above it.
- If merging would contradict accepted scope, requirements, or prior test history, stop and ask whether to supersede, append a revision, or choose a different target.

Use this concise placement question for non-OpenSpec sources:

```text
这个非 OpenSpec 输出需要先确认落点，你选一个：
A. 生成在源文件同级：<path>
B. 在源目录同级新建文件夹：<path>
C. 追加到现有 spec / design 文档末尾
D. 只打印在对话框，不写文件
```

Chat response after persistence should include only:

- generated file path
- source files reviewed
- coverage summary
- unresolved `Open Questions` / `Unverified` count
- suggested next action

## Workflow

### Phase A: Source Grounding

1. Read the user-provided spec, plan, proposal, issue, PR description, or pasted description.
2. If the source is an OpenSpec change, read only the requirement/decision/task dependencies needed by this test-plan revision.
3. When needed, inspect only related code, existing tests, commands, contracts, or already-approved source evidence needed to ground testability.
4. Build an evidence table that separates observed facts, official/API facts, prior-art patterns, rejected patterns, inferences, assumptions, open questions, and unverified claims.
5. Do not ask the user for information that reliable source grounding can answer.

### Phase B: Clarification

Ask the user only when a missing decision materially affects the test document, such as:

- test scope or release boundary
- success criteria or acceptance threshold
- risk level and priority
- permission model or role matrix
- data lifecycle, retention, migration, or cleanup rules
- supported platforms, browsers, versions, or integrations

Small gaps can be recorded as `Open Question` without blocking document generation. Return one material testability decision to ROSE; use a bounded question table only when several known independent blockers are cheaper to answer together.

### Phase C: Generate Test Document

Generate a compact Markdown draft using `references/test-document-template.md`. Every selected check maps to a requirement, risk, decision, assumption, `Unverified` item, or evidence source. For formal changes, keep the affected requirements/decisions/risks traceability needed by the acceptance decision; omit empty test levels and unrelated generic dimensions. Keep facts, inferences, assumptions, and unverified items separate.

The document is a plan and may become the durable execution ledger. Include only applicable automation/manual checks; add run history, defect/fix/retest closure, or change history when entries exist or the user explicitly requests that ledger. Do not create empty ceremony.

### Phase D: Direct Consistency Check

Inspect directly whether the document misses material failure paths, permission boundaries, data problems, regression scope, acceptance standards, or executable checks. Do not invoke another process skill automatically.

🔴 STOP before persistence if this pass exposes an unhandled material gap, ungrounded assumption, missing acceptance threshold, or check that cannot be executed or labeled `Unverified`.

Repair the document in scope before persistence or return the exact blocker to ROSE.

### Phase E: Persist and Report

1. Resolve the target path using the Output Placement Contract.
2. Write or update the target Markdown file.
3. Inspect the written file and diff for accidental unrelated changes.
4. Return only the concise chat summary defined by the Output Placement Contract.

## Test Document Template

Use the single compact source at `references/test-document-template.md`; do not duplicate or expand it in this skill body.

## Validation

Before finishing:

- Confirm `name` matches the skill directory name.
- Confirm the document is source-grounded and unresolved items are labeled `Open Question` or `Unverified`.
- Confirm formal changes include a traceability matrix from requirement/decision/risk to task/package, file/artifact, verification command or inspection, evidence, and coverage status.
- Confirm the output location follows the placement contract.
- Confirm only applicable check, acceptance, execution, or defect sections exist; no empty matrix/ledger was emitted.
- Confirm the chat response contains only the generated path, coverage summary, unresolved count, and next action.
