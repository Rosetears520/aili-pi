# Review and Repair Lane Adaptation

## Provenance

| Field | Value |
|---|---|
| Upstream source | `https://github.com/affaan-m/ECC` |
| Upstream HEAD | `49128b5763b7ac0b50acef35ac0bcca08d1576af` |
| Source paths | `agents/code-reviewer.md`, `agents/security-reviewer.md`, `agents/pr-test-analyzer.md`, `agents/build-error-resolver.md`, `commands/build-fix.md`, and ECC catalog entries for E2E, documentation lookup, TDD, verification loop, API/backend/frontend/language/domain skills |
| Source blobs explicitly inspected | `af791188ac87321f749a96f140a85c739303f453`, `568351bbc710009acba3e4c32282c436291a34c8` |
| License | MIT License, Copyright 2026 Affaan Mustafa |
| Copy/adapt scope | Adapted lane duties, repair-loop safety, build-fix loop, confidence gates, and trigger boundaries; no upstream agent is copied wholesale. |
| Rationale | ECC supplies useful specialist review/repair lane seeds, but AILI keeps review read-only and routes fixes through separate edit/test lanes. |

## OpenCode / AILI adaptation boundaries

- Review lanes remain read-only and must not repair their own findings.
- Repair work must be explicit, scoped, separately owned, verified, and re-reviewed.
- Do not activate Claude-only tools, ECC tool names, `.claude` artifact paths, `ccg-workflow`, or Codex/Gemini runtime dependencies.
- Do not add dependencies, lockfile changes, or remote mutation commands unless a separate user-approved task explicitly authorizes them.
- Use existing AILI skills where equivalent skills already exist instead of importing duplicate ECC skill bodies.

## Activated AILI behavior

### Review lanes

- `code-reviewer`: use confidence filtering, exact evidence anchors, proof requirements for Critical/Important findings, false-positive suppression, and zero-findings-is-valid behavior.
- `security-auditor`: trigger on auth, permissions, secrets, shell/installers, dependency changes, network, storage, user input, and data-loss surfaces; report exploit path and concrete mitigation without editing.
- `pr-test-analyzer`: map changed behavior to tests, quality of assertions, changed-test risk, coverage gaps, and focused verification commands.
- `test-engineer` / coverage lanes: verify behavior-first tests, regressions, skipped checks, and adequacy of the verification story.
- `ai-regression-scout` and `silent-failure-reviewer`: trigger on prompts, agents, skills, routing, static fixtures, false PASS risk, swallowed errors, stale evidence, or misleading reports.
- Browser/E2E lanes: only when UI/browser behavior changed and artifact placement is approved; no durable screenshots/traces without repository-local placement.

### Repair lanes

- Build/type repair follows ECC `build-fix` discipline: detect the build system, group errors, fix one error class at a time, rerun focused verification, and stop on repeated failure, deeper architecture need, dependency need, or more-errors-than-fixed regression.
- Documentation repair is allowed only when behavior/config/public workflow docs are made wrong by the task; otherwise report docs drift for a scoped follow-up.
- Refactor cleanup is advisory unless the current task explicitly includes cleanup or the finding blocks acceptance.
- E2E/browser repair requires explicit artifact placement and must avoid production data mutation.
- Domain/language review is conditional: activate TypeScript/Node, Python, shell, docs, packaging, API/backend/frontend, database, ML/CUDA, or mobile lanes only when the changed surface uses that domain.

## Deferred or rejected ECC lane candidates

- Loop operators and harness optimizers are not activated as autonomous agents; AILI keeps orchestration under ROSE and uses bounded package queues.
- Language/domain specialists are reference checklists, not new top-level commands or always-on personas.
- Documentation lookup remains source-driven research only when current user/task contract allows external lookup and no secrets are exposed.
