# Upstream Review Provenance

## Scope

[COMPUTED from Package 5 upstream scout evidence] This reference records the active and deferred upstream candidates for adapting local-review behavior, without copying full upstream prompts, commands, agents, or documentation text in this package.

[COMPUTED from Package 5A implementation evidence] Tasks 5A.2-5A.8 are now activated through focused AILI reference files, core reviewer updates, orchestration contract updates, and static fixture checks rather than public ECC command imports or wholesale upstream prompt dumps.

## Active source selection

[COMPUTED from Package 5 upstream scout evidence] `affaan-m/ECC` and `addyosmani/agent-skills` are the active derivative-reference sources for future `/local-review` adaptation work.

[COMPUTED from Package 5 upstream scout evidence] Official Codex review documentation is behavior-only guidance for review/fix-loop compatibility and must not be copied as prompt or documentation text.

[INFERRED from Package 5 upstream scout evidence] `sifxprime/kodelyth-ecc`, `elainesmithburkel-code/everything-claude-code`, and `cminn10/ecc2cursor` are not primary sources for this change and remain deferred or non-primary unless later provenance, trigger-fit, and OpenCode compatibility checks justify activation.

## Candidate inventory

| Source URL | License | Source path(s) | Confidence | Intended use | Status | Adaptation notes |
|---|---|---|---|---|---|---|
| `https://github.com/affaan-m/ECC` | MIT | `commands/code-review.md` at SHA `2382c599...`, size `8179` | HIGH from upstream scout packet | Primary review-command reference for target selection, full-file/context reading, validation, verdict/report, PR-mode lessons, and repair/re-review workflow ideas | active-reference | Preserve source URL/path/SHA and MIT notice for copied/adapted material; adapt into AILI `/local-review` references rather than adding an ECC-named command; replace Claude/ECC paths, tool calls, agent names, and runtime assumptions with OpenCode/AILI-safe equivalents; avoid broad prompt copying in this package. |
| `https://github.com/affaan-m/ECC` | MIT | `commands/orch-review.md` at SHA `5216c7d...`; `commands/build-fix.md` at SHA `568351b...`; `commands/multi-plan.md` at SHA `b50912b...`; `commands/multi-execute.md` at SHA `167a9b5...`; `commands/multi-backend.md` at SHA `95cc95d...`; `commands/multi-frontend.md` at SHA `fc1c402d...`; `commands/multi-workflow.md` at SHA `5458945...` | HIGH from current task evidence and focused fetch | Evidence reconciliation, blocking/advisory split, adversarial finding checks, and bounded repair concepts; upstream fan-out/phase machinery is reference-only | active-reference | Activated only through proactive trigger-gated ROSE rules; public `multi-*` commands, untriggered automatic swarms, external workflow runtimes, and remote mutation behavior are rejected. |
| `https://github.com/affaan-m/ECC` | MIT | `agents/code-reviewer.md` at SHA `af79118...`; `agents/security-reviewer.md`; `agents/pr-test-analyzer.md`; `agents/build-error-resolver.md`; related ECC catalog skills under `.agents/skills/*` | HIGH for explicit seeds; MED for catalog-wide categories | Review/repair lane seeds: confidence/proof gates, security, test coverage analysis, build-error repair, E2E, docs lookup, TDD, verification loop, API/backend/frontend/domain/language review checklists | active-reference with conditional triggers | Activated as lane/checklist behavior only; no wholesale agent copy, no reviewer self-repair, no dependency changes, and no `.claude`/Claude-only tool assumptions. |
| `https://github.com/addyosmani/agent-skills` | MIT | `agents/code-reviewer.md` at SHA `96cac1d...`, size `3801` | HIGH from upstream scout packet | Active rubric reference for five-axis review, Critical/Important/Suggestion classification, spec/task-first reading, concrete fix guidance, and uncertainty discipline | active-reference | Preserve source URL/path/SHA and MIT notice for copied/adapted material; adapt the review discipline into local review lane rules rather than pasting the complete upstream agent; reconcile severity vocabulary with local-review verdicts and existing AILI report tables. |
| `https://github.com/addyosmani/agent-skills` | MIT | `skills/code-review-and-quality/SKILL.md` at SHA `5efda7a...`; `references/orchestration-patterns.md` at SHA `09cddd3...` | HIGH from current task evidence and focused fetch | Five-axis review evidence, change sizing, verification story, severity, direct invocation, single-persona command, optional evidence joins, and research isolation | active-reference | Activated under proactive trigger-gated AILI review rules; untriggered automatic fan-out and Claude-specific platform sections are not active. |
| Official OpenAI Codex review docs | Official docs; do not copy text | GitHub review docs covering `@codex review`, automatic PR review, nearest `AGENTS.md` review guidelines, focus instructions, and high-priority findings | HIGH for behavior guidance from upstream scout packet | Compatibility guidance for local PR-style review, focus text, high-priority finding mapping, and local review/fix parity | active-reference, behavior-only | Do not copy docs text; use only behavior patterns. Keep `/local-review --pr` read-only unless separate approval authorizes remote mutation outside review mode. |
| `https://github.com/sifxprime/kodelyth-ecc` | MIT | `commands/code-review.md` at SHA `8189f951...` | MED from upstream scout packet | Separate or fork-like comparison candidate if primary ECC leaves ambiguity | deferred | Treat as non-primary. Use only for later comparison after provenance and divergence checks; do not mix with primary ECC-derived material without recording source-specific scope. |
| `https://github.com/elainesmithburkel-code/everything-claude-code` | MIT per upstream scout packet | mirror/candidate paths not activated in this package | LOW from upstream scout packet | Possible mirror/candidate for broad Claude-code review patterns | deferred | Lower confidence; do not activate without fresh provenance and copied-scope evidence. |
| `https://github.com/cminn10/ecc2cursor` | MIT | candidate paths not activated in this package | LOW from upstream scout packet | Possible cursor-port reference, not a primary review source | rejected for primary review source; deferred for compatibility comparison | Do not use as the authoritative review source for `/local-review`; revisit only if later Cursor/OpenCode compatibility comparison is explicitly scoped. |

## Copy/adapt rules for future packages

[COMPUTED from accepted Package 5 task contract] Preserve MIT license/provenance whenever ECC or addyosmani material is copied or adapted.

[COMPUTED from accepted Package 5 task contract] Record source URL, source path, commit/SHA when known, copied scope, adapted scope, and adaptation rationale in the affected reference or implementation file.

[COMPUTED from accepted Package 5 task contract] Replace Claude/ECC-specific tool names, file paths, command names, agent names, permissions, and runtime assumptions with OpenCode/AILI-safe equivalents before activating imported behavior.

[COMPUTED from accepted Package 5 task contract] Avoid over-triggering by adding precise trigger and near-miss boundaries for every adapted agent, lane, skill, or reference.

[COMPUTED from accepted Package 5 task contract] Keep long copied/adapted material in reference files rather than always-loaded prompts whenever possible.

[COMPUTED from accepted Package 5 task contract] Do not copy Codex documentation text; use official Codex review docs only for behavior-compatible local workflow guidance.

[COMPUTED from accepted Package 5 task contract] Do not copy/adapt ECC agents, ECC skills, orchestration commands, or addyosmani rubrics wholesale in this provenance package; later packages must perform scoped adaptation and verification separately.

## Package 5A activated reference files

| Task | Activated artifact(s) | Evidence status |
|---|---|---|
| 5A.2 | `references/ecc-code-review-adaptation.md`; `/local-review` skill pointers | active/completed after static checks |
| 5A.3 | `references/review-repair-lane-adaptation.md`; `agents/code-reviewer.md`; review-pipeline lane notes | active/completed after static checks |
| 5A.4 | `references/review-repair-lane-adaptation.md`; conditional ECC skill catalog mapping | active/completed after static checks |
| 5A.5 | `references/orchestration-adaptation.md`; `review-pipeline`; `parallel-subagent-dispatch`; `subagent-task-packet.md` | active/completed after static checks |
| 5A.6 | `references/addyosmani-code-review-rubric.md`; `agents/code-reviewer.md` | active/completed after static checks |
| 5A.7 | `references/codex-github-compatibility.md`; `/local-review` skill and command boundaries | active/completed after static checks |
| 5A.8 | `scripts/harness_fixture_check.py`; `docs/harness/fixtures/command-routing-fixtures.yaml` | active/completed after static checks |

## Limits

[UNVERIFIED] This reference is not legal advice and does not analyze license compatibility beyond recording the upstream license/provenance evidence. Re-check source URLs, license files, and exact copied scope before any future bulk copy/adaptation.
