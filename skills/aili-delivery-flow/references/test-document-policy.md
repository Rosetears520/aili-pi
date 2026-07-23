# Test Document Policy

The test document turns requirements into verification evidence before implementation starts.

## Required Content

- requirement or scenario identifier;
- traceability matrix for formal changes, mapping requirement, decision, or risk to task/package, file or artifact, verification command or inspection, evidence, and coverage status;
- test case or manual check;
- expected result;
- command or evidence source;
- status: planned, passed, failed, skipped, or unverified.

## Gate

- Generate or materially revise a test document only on explicit test-plan/QA/acceptance-matrix intent or when one concrete missing testability decision blocks a formal change. Formal OpenSpec DEFINE writes its required `openspec/changes/<change-id>/test-plan.md` through `test-document-generator`; ordinary implementation does not manufacture a test-plan workflow.
- Formal changes must include a requirements/decisions/risks traceability matrix. Missing task/package, file/artifact, verification, or evidence links must be labeled `Open Question` when they need a decision, or `Unverified` when they need later evidence.
- BUILD may start only after applicable decision-shaping research is closed, the artifacts and traceability are coherent/validated, and the user explicitly accepts the final test plan. A waiver or accepted-`Unverified` label cannot substitute for either material research closure or final test-plan acceptance.
- Named non-material runtime residuals such as UV-006/UV-007 may remain explicitly `Unverified` only when their runtime/operation paths fail closed; they continue to block any claim or operation that needs the missing evidence.
- BUILD readiness is only `READY` or `BLOCKED`; `WAIVED` and accepted-`UNVERIFIED` are not readiness alternatives. Package savepoints and package boundaries add no test-plan or package approval.
- Test-document generation creates no scheme, packet, test-plan-draft, or research-summary approval. Final `test-plan.md` acceptance remains the one lifecycle-level pre-BUILD user gate for formal work.
- The artifact owner performs a direct consistency pass and stops. It must not invoke stress-test, research, TDD, review, or another process skill; it may return one concrete missing decision/evidence need to ROSE.
- BUILD ends after the canonical owner selects one minimal changed-scope completion check at `IMPLEMENTED_TARGETED_VERIFIED`. SHIP requires fresh explicit intent, reuses still-covering BUILD evidence, and refreshes only affected claim rows. A full traceability matrix or specialist capability is selected only for a concrete gap.
- Material DEFINE decisions, the one final test-plan acceptance, fresh SHIP intent, and exact commit/push/merge/release approvals remain distinct controls. CI failure returns to the user and never authorizes automatic repair, commit, push, merge, or release.

## Artifact Freshness

Disk wins for user-editable test artifacts such as `test-plan.md`; freshness is event-directed.

Before using, merging, validating, or overwriting a test document, ROSE must:

1. Re-read the artifact after ROSE writes it and after a user edit, hook, conflict, or resume checkpoint makes it relevant.
2. Inspect scoped status/diff only when needed to distinguish current edits or merge conflicts.
3. Treat on-disk content as source of truth and refresh only direct dependents.
4. Never claim “no changes detected” without current disk evidence.
