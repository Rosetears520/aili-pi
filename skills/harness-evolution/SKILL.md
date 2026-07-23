---
name: harness-evolution
description: Produce or apply an approved report-first proposal for workflow, ROSE, skill, command, subagent, memory, install, or harness-doc changes; use after harness-issue-triage localizes a harness problem or when the user explicitly requests harness maintenance, and do not edit core harness files without explicit human approval.
---

# Harness Evolution

Use this skill when the harness itself may need to change. The default output is a structured report or proposal, not file edits.

If the user only asks where incorrect behavior lives, return that diagnosis-only intent to ROSE so it can select `harness-issue-triage`; do not invoke another skill here.

## Triggers

- User asks to change workflow, ROSE, a skill, command, subagent, memory policy, install/setup path, or harness documentation.
- Repeated workflow failures or user corrections indicate process drift.
- Subagent dispatch/result boundaries fail.
- Verification claims lack fresh evidence or bypass required gates.
- Memory retrieval/writeback/provenance fails.
- Command lifecycle is bypassed or internal stages appear as top-level commands.
- Tool policy, middleware/hook, environment, or workflow-pattern defects appear.

## Workflow

1. Start from an existing `harness-issue-triage` report when available; otherwise classify the signal directly with `references/component-taxonomy.md`.
2. Decide required gates from `references/activation-matrix.md`.
3. Produce a report using `references/change-report-template.md`.
4. Ask for explicit approval before applying any core harness edit.
5. If approved, apply only the approved change and run the named verification trigger.
6. Record the verdict using `references/verdict-policy.md`.

🔴 CHECKPOINTS:

- Missing triage evidence: do not edit; produce a report that names the missing evidence and next read-only step.
- Approval denied or absent: do not edit protected harness files; return `BLOCKED_APPROVAL_REQUIRED` with the proposed change and verification plan.
- Verification fails after an approved edit: stop, report the failing command/output, and propose rollback or a smaller follow-up patch instead of widening scope.

Fallback table:

| Condition | Conservative fallback |
|---|---|
| No `harness-issue-triage` report and component is unclear | Classify with packaged references only; if still unclear, ask for triage first. |
| User asks for direct core harness edit without approval record | Convert to report-first proposal and request explicit approval. |
| Approved change requires extra files, new deps, schema changes, or broader refactor | Stop as out of approved scope and request a new approval. |
| Named verification cannot run | Mark `NEEDS_REVIEW`, explain why, and provide the strongest manual/static evidence. |

## Boundaries

- Report/proposal artifacts are allowed by default.
- Core harness edits require explicit human approval in conversation, PR review, or approved OpenSpec record.
- Core harness includes ROSE/runtime rules, commands, skill routing, subagent contracts, memory policy, install scripts, OpenCode hooks, and harness docs.
- Do not write SQLite manually, change memory schema, add dependencies, commit, push, or silently edit protected harness files.
- Do not modify `agents/rose.md` during normal tasks. Agent prompt edits require an explicit harness maintenance task and human approval.
- Do not treat an OpenSpec mention as edit approval unless it explicitly approves the exact harness files and change direction.

## Verification

- Every proposal names a verification trigger and rollback plan.
- Applied changes must record result, verdict, remaining risks, and evidence pointer.
- Missing approval returns a blocked report, not an edit.
