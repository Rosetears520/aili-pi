# Agent Selection Matrix

- Protocol: `aili-agent-selection/v1`
- Role namespace: `canonical`
- Selector mapping: `adapter-owned`

This is the compatibility selection guide for canonical Agent role selection. The shared package/result/Board semantics are owned by `core/protocols/`; canonical role definitions are owned by `core/roles/roles.json`. This guide applies those sources to selection without becoming a runtime registry. Harness selectors, provider or model names, tool arguments, runtime paths, and complete role instructions belong to adapters, generated projections, or the canonical role source, not this file.

## Selection matrix

| Role ID | Use when | Do not use when | Expected evidence | Phase affinity | Execution guidance |
|---|---|---|---|---|---|
| `code-scout` | Files, symbols, call paths, tests, schemas, configuration, or impact are unclear and need broad but bounded repository discovery. | One known file only needs a simple read; implementation or final review is required. | Exact files, symbols, call paths, constraints, and owning tests. | IDEATE / DEFINE / BUILD | Independent discovery may be async; use sync when later edits depend on the result. |
| `doc-researcher` | Project-local rules, README, OpenSpec, design notes, or other repository documentation must be inspected. | Public web research, code implementation, or a final decision is required. | Document paths, sections, and the constraints they establish. | IDEATE / DEFINE | Usually sync; may run beside an independent code scout. |
| `web-researcher` | Current official documentation, versions, compatibility, deprecations, or other public evidence is required. | The answer is repository-local or stable knowledge needs no current web evidence. | URLs, versions, publication dates, conclusions, and limitations. | IDEATE / DEFINE | Independent research may be async; join before any dependent decision. |
| `spec-miner` | Candidate requirements and scenarios must be mined from existing code, tests, and documentation. | Accepting the final specification, implementing it, or making product decisions. | Candidate requirements, scenarios, and repository evidence anchors. | IDEATE / DEFINE | Usually sync. |
| `plan-auditor` | A plan, specification, task list, acceptance contract, or test plan needs a pre-implementation gap and conflict audit. | Implementation or accepting a plan on the user's behalf. | Blockers, risks, missing verification, and proposed dispositions. | DEFINE | Sync; join before the dependent BUILD gate. |
| `solution-architect` | A bounded repository-grounded technical proposal needs materially distinct options, trade-offs, boundaries/interfaces/data/call flow, impact analysis, candidate packages, and explicit unclear items. | Implementing, delegating, accepting architecture, making product decisions, approving ADRs, or issuing a final verdict. | Options and recommendation, impacts, risks, candidate packages, evidence anchors, and unclear items. | IDEATE / DEFINE | Read-only and usually sync; ROSE dispositions the proposal before any write-back. |
| `implementer` | One complete bounded implementation package is authorized inside accepted scope. | Architecture or product decisions, final verdicts, or unauthorized material changes. | Changed files, implementation summary, focused verification, and blockers. | BUILD | Dependency-bound packages are sync; independent non-overlapping packages may be async. |
| `test-engineer` | Tests must be designed, added, or executed for one exact claim. | General code review or replacing the verification owner. | Test files, coverage target, commands, and results. | BUILD | Usually sync; independent test implementation may run beside non-conflicting work. |
| `test-coverage-reviewer` | Coverage adequacy, untested branches, or verification evidence gaps need read-only analysis. | Writing production code or conducting a general quality review. | Uncovered paths, risks, and a coverage-adequacy assessment. | DEFINE / SHIP | Read-only and usually sync. |
| `pr-test-analyzer` | A PR or diff needs test-impact, CI-evidence, or focused-matrix analysis. | General architecture review or implementation. | Affected tests, CI evidence, and a recommended matrix. | SHIP | Read-only and usually sync. |
| `code-reviewer` | Correctness, readability, architecture, security, and performance need a bounded integrated review. | Implementation ownership or a security-only assignment. | Precise findings ordered by severity. | SHIP | Read-only and usually sync. |
| `security-auditor` | Authentication, authorization, permissions, secrets, untrusted inputs, or another concrete security risk needs specialist analysis. | Style-only review or a simple change with no security surface. | Threats, vulnerability paths, evidence, and required remediation. | DEFINE / SHIP | Read-only and usually sync. |
| `silent-failure-reviewer` | Swallowed errors, false success, skipped gates, stale evidence, or invalid status promotion needs focused review. | General code review or implementation. | Silent-failure paths and false-PASS evidence. | SHIP | Read-only and usually sync. |
| `convergence-reviewer` | Contract, tasks, implementation, verification, and residual risk need a final consistency comparison. | Initial discovery or replacing ROSE's verdict. | Missing, partial, conflicting, and stale links. | SHIP | Read-only; join before the dependent final verdict. |
| `browser-qa-runner` | A local browser flow, DOM, accessibility tree, console, network, or screenshot claim needs runtime verification. | Non-browser unit tests or production-data operations. | DOM, console, network, screenshot, and reproduction evidence. | BUILD / SHIP | Usually sync. |
| `e2e-artifact-runner` | E2E traces, video, screenshots, reports, or failure bundles need bounded collection. | General code review or unit tests with no artifact requirement. | Trace, video, screenshot, or report paths and results. | BUILD / SHIP | May be async; join before the dependent verdict. |
| `web-performance-auditor` | Web performance or Core Web Vitals needs measurement or bounded static analysis. | Functional-correctness review or work with no web surface. | Measurements, environment, limitations, and likely impact. | SHIP | Read-only and usually sync. |
| `ai-regression-scout` | Agent, prompt, Skill, routing, workflow, or generated-output changes need regression scenarios. | Ordinary business-feature implementation. | Regression scenarios, fixture targets, and risks. | DEFINE / SHIP | Read-only and usually sync. |
| `agent-evaluator` | Another Agent result needs task-fit, evidence-quality, claim-hygiene, or omission evaluation. | Re-performing the assignment or issuing the final verdict. | Task-fit, evidence-quality, overclaiming, and missed-item findings. | DEFINE / SHIP | Read-only and usually sync. |
| `opensource-sanitizer` | Public, npm, or release exposure, private data, secrets, package inventory, or provenance needs inspection. | General security architecture or ordinary code-quality review. | Redacted exposure findings and packaging evidence. | SHIP | Read-only and usually sync. |

Phase affinity is advisory. A matching role outside a phase shortlist remains valid when it is the narrowest match and the package records that role-fit reason. Execution guidance is also advisory: dependencies, scope overlap, permissions, and join requirements take precedence.

## Selection algorithm

1. Classify the assignment shape and required capability before choosing a role.
2. Filter to roles whose positive trigger covers the assignment and whose near-miss boundary does not exclude it.
3. When several roles match, select the narrowest responsibility with the most specific expected-evidence contract.
4. Do not dispatch or choose a broad role merely because work is complex, touches many files, or occurs in a particular phase.
5. Ordinary work dispatches the narrowest matching specialist when the package is clear, bounded, non-trivial, non-overlapping, and permitted by current effective capabilities and permissions. Direct work remains only for trivial work, contract clarification or splitting, no matching specialist, permission/capability failure, overlap, or concrete negative benefit.
6. A ready formal Agent-owned package fixes the exact canonical Role ID. Do not remap it through a later ordinary benefit judgment.
7. `general` is not a canonical specialist role and cannot own a formal package.

## Ownership boundary

This matrix owns role selection only. `core/roles/roles.json` owns each role's detailed behavior, constraints, and result discipline; generated `agents/*.md` files are compatibility projections. An adapter maps the selected canonical Role ID to its own runtime selector and records any runtime-private identity in adapter-owned state.
