# ECC Code Review Command Adaptation

## Provenance

| Field | Value |
|---|---|
| Upstream source | `https://github.com/affaan-m/ECC` |
| Upstream HEAD | `49128b5763b7ac0b50acef35ac0bcca08d1576af` |
| Source path | `commands/code-review.md` |
| Source blob | `2382c59968231c205f9cf9cffa9013f480899a9c` |
| License | MIT License, Copyright 2026 Affaan Mustafa |
| Copy/adapt scope | Adapted workflow structure and checklist concepts; no wholesale command copy is active. |
| Rationale | ECC's command contains the closest local/PR review target model for `/local-review`. |

## OpenCode / AILI adaptation boundaries

- Do not add an ECC-named top-level command.
- Do not override OpenCode's built-in `/review`.
- Do not activate `.claude` paths, Claude-only tool names, `gh api`, GitHub review/comment/merge commands, or ECC artifact locations.
- Do not activate remote mutation defaults; `/local-review --pr` remains read-only.
- Codex/GitHub official docs remain behavior-only references and are not copied here.

## Activated AILI behavior

- Select mode from explicit target syntax: default local changes, `--base <branch>`, `--commit <sha>`, `--pr <url|number>`, `--change <id|path>`, `--focus <text>`, or `--repair`.
- Gather a target inventory before findings: changed files, untracked files, base/ref/commit/PR/change metadata, unavailable metadata, and skipped target lanes.
- Read changed files in full before making high-confidence correctness, security, data-loss, compatibility, or test findings; this is the active full-file review rule.
- Inspect relevant tests, config, docs, AGENTS rules, manifests, source artifacts, and callers/consumers when a finding depends on integration behavior.
- Classify findings with severity, category, evidence anchor, required fix, owner, status, and re-review requirement.
- Run available validation appropriate to the repository; skipped or unavailable checks must include reason and risk.
- Write a persistent categorized report for non-trivial targets before repair begins.
- Map ECC `APPROVE`/`REQUEST CHANGES`/`BLOCK` into local-review verdicts: `PASS`, `PASS_WITH_UNVERIFIED`, `NEEDS_FIXES`, `NEEDS_REVIEW`, `BLOCKED`, `REPAIRING`, and `REREVIEW_REQUIRED`.
- Treat zero findings as valid only when target scope, full-context inspection, and verification/skipped-check evidence are recorded.

## Rejected upstream behavior

- Publishing GitHub reviews, approving PRs, requesting changes on GitHub, posting comments, or using GitHub API comment endpoints.
- Falling back from PR mode to unsafe shell parsing or raw user-provided PR arguments.
- Storing reports in `.claude` directories or any ECC-specific artifact tree.
- Treating validation pass alone as review approval without source/context inspection.
