---
name: github-evidence-triage
description: Performs read-only GitHub issue or PR triage with evidence links. Use when analyzing public or repository GitHub issues/PRs without mutating labels, comments, branches, reviews, merges, or issue state.
---

# GitHub Evidence Triage

## Purpose

Use this skill to analyze a GitHub issue or pull request and produce a source-grounded triage report.

This skill is read-only. It does not comment, label, approve, reject, close, merge, push, or call write GitHub APIs.

## When to Use

Use when the user asks to:

- triage a GitHub issue or PR
- determine whether a bug report is reproducible or already fixed
- summarize PR risk before review
- connect an issue/PR to repository files, commits, tests, or docs
- produce evidence for a change package from GitHub context

## Zero-Action Policy

Never:

- comment on issues or PRs
- close or reopen issues
- edit labels, milestones, assignees, branches, or project boards
- approve, request changes, or submit PR reviews
- merge PRs
- push branches
- call write GitHub API methods

Allowed:

- read issue/PR metadata and comments
- inspect related code and tests
- inspect git history
- produce a triage report

## Evidence Rule

Every factual claim about repository code, commits, issues, or PRs should include a stable reference:

- issue or PR URL
- commit SHA
- file path and line range
- copied command output from a fresh read-only command

No evidence means no claim. Mark unsupported claims as `[UNVERIFIED]`.

🛑 Evidence availability fallbacks:

| Condition | Conservative fallback |
|---|---|
| Missing GitHub URL or repository/number | Ask for the URL or exact repo plus issue/PR number; do not infer from vague text. |
| Ambiguous issue vs PR reference | Resolve read-only if possible; otherwise ask before triage. |
| Private repo, permission denied, or auth unavailable | Report `BLOCKED` or `PARTIAL` with the inaccessible URL and continue only with user-provided/local evidence clearly marked. |
| Rate limit, network failure, deleted item, or unavailable API | Retry only if cheap and safe; otherwise report the failure and mark affected claims `[UNVERIFIED]`. |
| Evidence conflicts across comments, commits, or files | Separate claims by source and avoid a definitive conclusion until reconciled. |

## Output Placement

- If the triage belongs to an existing OpenSpec change, write inside that change directory only when the user or current workflow requests a file.
- For every non-OpenSpec source, including a single local source document, ask whether to write a source-adjacent file, create a sibling folder, append to an existing spec/design document, or keep the report chat-only.
- Chat-only output is allowed.

## Workflow

1. Identify the issue/PR URL, repository, and user question.
2. Fetch/read issue or PR metadata, description, comments, commits, and changed files as needed.
3. Inspect linked code, tests, docs, and git history only as needed for the claim.
4. Separate reporter claims, maintainer statements, observed repository facts, inferred risks, and unverified items.
5. Synthesize impact and next step from the evidence; do not paste a chronological comment list unless chronology is the finding.
6. Produce a triage report with no write actions.

Red flags: requests to comment, label, close, approve, request changes, merge, push, or mutate branch/issue state. Stop and confirm this skill is read-only instead of performing the action.

## Synthesis Over Listing

- Group evidence by claim: reproduction, scope, root-cause signal, affected files, test evidence, maintainer decision, and unresolved conflict.
- When comments disagree, identify the source/date/commit behind each side and avoid a single winner until evidence resolves it.
- Separate "what GitHub says" from "what local code shows" and from "what the triager infers".
- Keep recommendations read-only unless ROSE or the user explicitly opens an implementation package.

## Output Contract

```text
STATUS: TRIAGED | PARTIAL | BLOCKED

SUBJECT:
- URL:
- Type: issue | PR
- User question:

EVIDENCE:
- URL / commit / file:line - fact

FINDINGS:
- <finding with evidence>

RISK / IMPACT:
- <risk with evidence or [UNVERIFIED]>

RECOMMENDED NEXT STEP:
- <read-only recommendation or bounded implementation/review suggestion>

UNVERIFIED:
- <claim that lacks evidence or N/A>

NO-ACTION CONFIRMATION:
- No comments, labels, reviews, merges, pushes, or write API calls were performed.
```
