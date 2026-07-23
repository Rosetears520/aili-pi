---
name: build-failure-repair
description: Repair one concrete reproducible build, typecheck, lint, test, packaging, or CI failure with a bounded root-cause-first loop; do not trigger for runtime bugs without a failing gate, broad test strategy, dependency/toolchain migration, or generic implementation.
---

# Build Failure Repair

Use this skill when an executable quality gate fails and the task is to get the gate passing without expanding scope.

## Trigger

- Build, typecheck, lint, unit test, integration test, fixture smoke, packaging, or CI command fails.
- A package is blocked on a reproducible failure and needs root-cause analysis followed by the smallest safe repair.
- Verification output suggests missing files, stale generated output, type errors, broken tests, changed fixtures, or environment-sensitive failures.

## Near Misses

- Runtime bug with no failing gate yet: establish the smallest reproducible loop before changing code.
- Broad test strategy, coverage adequacy, or PR test matrix: return the mismatch to ROSE, which may select the narrow test-analysis owner.
- Dependency upgrades, lockfile regeneration, toolchain migration, or CI redesign: stop for explicit approval before repair.
- Product behavior changes discovered during repair: return to the owner for scope clarification.

## Execution

ROSE reproduces and localizes the failure directly. Requested in-scope local diagnosis, repair, and focused rerun proceed without another approval. Return one concrete specialist/noisy-context need to ROSE rather than dispatching here. Keep the repair task-scoped and backed by the exact failing loop.

ROSE/`aili-delivery-flow` owns lifecycle state, material/risky approvals, and verification. This skill is one bounded failure-repair adapter; it does not invoke TDD, review, coverage, dependency, CI redesign, or another process skill. Stop `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Canonical approval and claim-matched verification rules win.

## Repair Workflow

1. Capture the exact command, exit status, failing output, environment clues, and recent changed files.
2. Reproduce the failure with the narrowest deterministic command available.
3. Localize the failure boundary: source, test, fixture, generated artifact, config, dependency/tooling, or environment.
4. State the top root-cause hypothesis and the proof expected after repair.
5. Apply the smallest code/test/config change inside the approved scope.
6. Re-run the exact failing command once. The canonical verification owner broadens only when the requested claim still lacks evidence.

## Boundaries

- Do not skip tests, loosen assertions, suppress type errors, ignore exit codes, lower quality gates, or mark failures as passing.
- Do not change dependencies, package managers, lockfiles, engine versions, generated-source policy, CI config, or public APIs without explicit approval.
- Do not hide unrelated failures; report them as pre-existing or out of scope with command evidence.
- After one targeted repair/recheck, return any remaining failure as `BLOCKED_VERIFICATION`; do not create a retry, review, or fresh-session chain.

## Verification

- Required evidence: original failing command, repair diff summary, rerun result, and any remaining skipped or unrelated failures.
- Passing means the exact failing gate passes without bypasses and the output supports the claimed scope.
- If the failure cannot be reproduced or the environment/tool is unavailable, report the closest probe and mark the repair readiness `Unverified` or blocked.
