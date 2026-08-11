# Test Plan: reconcile-aili-compact-release-lineage

**Target:** `@rosetears/aili-pi@0.2.0` on official Pi `0.82.1` for Linux
**Status:** `ACCEPTED_REVIEW_REMEDIATION` — local BUILD is explicitly authorized; external, installation, Git, and publication operations remain separately gated

## Scope

The user selected the entire current working tree as the `0.2.0` release candidate. This revision reconciles its release validators and evidence chain with the accepted MiMo dynamic-checkpoint and ACP-style active-block contract, then corrects review-found current-contract gating, mixed-schema semantic ordering, stale reviewed evidence, and redundant oracle coverage. It supersedes the prior targeted-only plan as the final release-candidate plan; it does not authorize any external, installation, Git, or publication operation.

## Acceptance checks

| ID | Behavior | Minimal proof |
|---|---|---|
| RC-1 | The candidate's adapter, generated-role, provenance, package, and archive surfaces agree with the full current tree. A drifted artifact is repaired through its owner rather than bypassed. | `npm run validate:compatibility`, `npm run validate:generated`, `npm run validate:provenance`, `npm run validate:package`, and `npm pack --dry-run --ignore-scripts --json`. |
| RC-2 | New writes are tierless source-backed active blocks; legacy T1/T2/T3/restill entries stay readable only for replay/rollback/source proof. The provider frontier has protected raw plus at most 32 descriptors in verified mixed-schema semantic-leaf order; unverified legacy sources remain ledger-readable but are not guessed into the default frontier. | Frontier unit tests covering mixed legacy/v3 ordering across the 32-descriptor boundary, `tests/integration/aili-compact-active-blocks.test.ts`, and a candidate-bound controlled-production replacement. |
| RC-3 | MiMo reserves, ladders, persisted source/session/branch/epoch binding, rebuild-first projection, one native fallback, and oversized-request failure behavior are current controlled-production evidence, not relabelled legacy tier evidence. | Recovery unit tests, `tests/integration/aili-compact-mimo-recovery.test.ts`, and a candidate-bound controlled-production replacement. |
| RC-4 | Release artifacts and validators no longer require the retired 50-transaction hierarchy, provider-authored tier lifecycle, or natural live overflow. The active current-contract validator cannot be disabled by a missing retired change directory; reviewed human evidence is a validated current capture/verdict binding, not a tier candidate wrapper. Real-provider evidence is limited to transport/protocol/order/parent-child; deterministic production entry owns active-block and recovery failure paths. | Release-evidence validator/unit tests for retired-directory absence and forged/tier-shaped reviewed evidence, live-harness contract tests, and current artifact validation. |
| RC-5 | Every generated release artifact is fresh, sanitized, exact-candidate-bound, and fails closed on absent, stale, wrong-hash, wrong-evidence-class, or timeout results. | Candidate artifact generation/verification plus `npm run validate:release` and `npm run test:live-release`. |
| RC-6 | The full candidate regression set, focused release checks, typecheck, diff check, package contents, and required human evidence-boundary review pass before publication is considered. | Commands below, release-gates checklist, and recorded human review. |
| RC-7 | The independent raw-gap oracle covers exact bounded-gap edges and all protocol classifications without correlated dimensions or repeated full replay loops; its 60 rows cross minimum/maximum child cardinalities (`2`, `16`) with six gap boundaries and five classifications, while focused active-block tests cover ordinary two-to-sixteen behavior. All five validation paths agree on each oracle row. | `tests/unit/aili-compact-promotion-gap-oracle.test.ts` 60-row boundary matrix plus `tests/integration/aili-compact-active-blocks.test.ts`. |

## Verification sequence

### Safe-local BUILD checks

```bash
openspec validate reconcile-aili-compact-release-lineage --strict
npm run validate:compatibility
npm run validate:package
npm run validate:generated
npm run validate:provenance
npx vitest run tests/unit/aili-compact-recovery.test.ts tests/unit/aili-compact-provider-frontier.test.ts tests/unit/aili-compact-promotion-gap-oracle.test.ts tests/unit/aili-compact-release-evidence.test.ts tests/integration/aili-compact-mimo-recovery.test.ts tests/integration/aili-compact-active-blocks.test.ts
npm run typecheck
npm test
npm run validate:release
npm run test:live-release
npm pack --dry-run --ignore-scripts --json
```

### Separately approved evidence operations

These are release blockers but are not authorized by accepting this plan or starting BUILD:

1. Fresh exact Git/npm/tarball predecessor verification for `0.1.16`.
2. Disposable installation and copied-session rollback rehearsal for the exact candidate.
3. One configured-provider official-Pi live boundary capture for transport, protocol, extension order, and parent-to-persistent-child lifecycle.
4. Human review of package contents, real-versus-controlled evidence, preserved live limitations, and remaining `Unverified` claims.

## Explicitly out of scope

- Dependency, lockfile, or candidate-version changes unless separately approved.
- Obtaining Anthropic or Google Gemini credentials or a complete provider-family live matrix.
- MiMoCode or ACP source, prompts, configuration, state, dependencies, or runtime reuse.
- Commit, push, tag, npm publish, GitHub release, deletion, or worktree cleanup.

## Acceptance record

- 2026-08-09: The user selected the complete current working tree as the `0.2.0` release candidate and requested release-gate remediation.
- Earlier targeted MiMo/ACP acceptance remains implementation evidence only; it does not accept this full-candidate release plan.
- 2026-08-09: The user explicitly accepted this full-candidate release plan. It clears the DEFINE test-plan gate only; BUILD still requires explicit implementation intent, and separately governed operations remain separately approved.
- 2026-08-10: The user requested a review-driven OpenSpec proposal covering current release-gate anchoring, mixed-schema frontier ordering, stale human-review evidence, and oracle-test rationalization. The prior acceptance remains baseline evidence only; it does not accept this draft remediation or authorize affected BUILD work.
- 2026-08-10: The user accepted the review-remediation direction and requested coherent design/task/test-plan write-back. This does not accept this final draft; affected BUILD remains paused until strict validation and one fresh explicit final acceptance.
- 2026-08-10: The user explicitly accepted this final review-remediation test plan and requested implementation. This clears the DEFINE gate and authorizes only local task-scoped BUILD; it does not authorize external/provider, installation, dependency/lockfile, Git, or publication operations.
- 2026-08-10: The user selected the recommended 60-row oracle boundary matrix rather than the inadvertent 450-row full-cardinality cross product and requested implementation. This updates the local verification strategy for task 2.15a while retaining current BUILD authorization.
