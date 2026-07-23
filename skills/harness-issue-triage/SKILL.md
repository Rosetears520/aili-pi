---
name: harness-issue-triage
description: Diagnose user-reported AILI/ROSE harness or workflow behavior problems without editing files; use when the user says a command, skill trigger, subagent packet, memory flow, installer, docs, or agent prompt behavior is wrong and wants to know where the issue lives and how to fix it. Do not use for normal product-code bugs; return any approved modification need to ROSE.
---

# Harness Issue Triage

Use this skill to localize harness problems before proposing or applying harness changes.

The default output is a diagnosis and recommended fix path, not file edits.

## When to Use

- User says the workflow, ROSE behavior, slash command, skill routing, subagent packet/result, memory writeback, installer, OpenCode setup, or harness documentation is wrong.
- User asks “这个问题出在哪里”, “哪里不合适”, “为什么 agent 不按流程走”, or “应该改哪个文件”.
- Reviewing whether a proposed harness change targets the right component.

Do not use this for ordinary application bugs or product-code implementation issues.

## Workflow

1. Restate the observed behavior and expected behavior in one sentence.
2. Locate the likely component using `references/component-diagnosis.md`.
3. Collect only the smallest needed evidence anchors.
4. Classify the issue as command, skill, protocol, docs, installer, memory, subagent packet/result, tool policy, environment, or agent/system prompt.
5. Explain the narrowest fix and why broader prompt changes are or are not needed.
6. If a core harness edit is needed, stop with a triage report and return the exact approval/change need to ROSE; this skill does not invoke `harness-evolution`.

🛑 STOP / fallback table:

| Condition | Conservative fallback |
|---|---|
| Packaged `references/` are missing or unreadable | Do not guess; report `BLOCKED_CONTEXT_INSUFFICIENT` and name the missing reference. |
| Evidence is insufficient to localize a component | Return a partial triage with observed facts, unknowns, and the next read-only evidence request. |
| The issue is actually product-code, app behavior, or ordinary test failure | Stop triage and return the exact debugging/planning/implementation mismatch to ROSE; do not label it a harness defect. |
| Downstream repo lacks `docs/harness/**` | Use packaged references first; mark source-repo docs as unavailable, not required. |
| User asks to edit during triage | Refuse edits in this skill and return the exact approval/change need to ROSE. |

## Boundaries

- Read-only by default: do not edit, stage, commit, push, or rewrite harness files.
- Do not modify `agents/rose.md` during normal tasks.
- Agent prompt changes require an explicit harness maintenance task and user approval.
- Read `docs/harness/**` only for harness issues, harness maintenance, or review of a harness change.
- In downstream/global installs, do not assume `docs/harness/**` exists. Use this skill’s packaged `references/` first.
- Do not fabricate ownership from file names alone; every component call needs a reference, path, or quoted rule as evidence.

## Output

Use `references/triage-report-template.md`.

Minimum fields:

- observed behavior;
- expected behavior;
- primary component;
- evidence anchors;
- recommended fix;
- approval needed: yes/no;
- next skill or action.

## Handoff

- If the user only asked “where is the problem”, stop after the triage report.
- If the user approves a harness change, return the accepted scope to ROSE so it can separately select `harness-evolution`.
- If the issue is not harness-related, return the exact debugging, planning, review, or implementation mismatch to ROSE.

## Symlink Runtime Note

Selective OpenCode install links repository source `.agents/skills/*` into the shared `$HOME/.agents/skills/<name>` directory. This makes this skill and its `references/` available at runtime.

Source-repo docs such as `docs/harness/**` are maintenance documentation, not guaranteed runtime context in downstream projects. Keep any always-needed triage rules inside this skill’s `references/`.
