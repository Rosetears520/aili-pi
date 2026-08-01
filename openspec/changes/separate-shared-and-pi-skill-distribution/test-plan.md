# 测试文档：separate-shared-and-pi-skill-distribution

> **Historical/superseded status (2026-08-01):** This test plan is retained as capability and verification-source material only. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This plan cannot independently authorize dispatch, advancement, acceptance, closure, publication, or release. Any completion, test-count, snapshot, runtime, acceptance, or external-state claim below is historical and was not independently reverified during this reconciliation.

## 0. 文档元信息

- 来源：`proposal.md`、`design.md`、`context.md`、`interview.md`、`tasks.md`、capability spec、当时的 package/postinstall/bootstrap/doctor/tests，以及 Pi `0.82.1` npm artifact 的 `docs/skills.md` 与 `docs/packages.md`。
- 生成日期：2026-07-30。
- 适用 change：`separate-shared-and-pi-skill-distribution` 的历史能力与验证来源；不得作为新的 BUILD target。
- 状态：`HISTORICAL_SUPERSEDED`。本文保留先前记录的 acceptance，但本次 reconciliation 未独立重新验证该 acceptance。
- 当时记录的 material research gap 为 `0`，external dependency blocker 为 `B-UPSTREAM-FORMAL-001`；这些状态未在本次 reconciliation 中重新验证，也不授予当前执行权。

## 1. Scope Under Test

- `rose-aili` sole shared-skill installer ownership and two explicit independent `@latest` commands。
- `aili-pi` zero-write boundary for `~/.agents/skills` and zero implicit npm/npx/network invocation。
- repository-only pinned snapshot versus npm runtime/tarball exclusion。
- package-local future `pi-skills/**` + explicit `pi.skills` ownership without placeholder content。
- read-only doctor visibility for shared workflow compatibility。
- upstream generic formal-contract prerequisite and Pi-specific adapter non-leakage。

### Explicitly out of scope

- No `aili-workflows` source edit, npm publish, actual `rose-aili install/update`, real HOME write, dependency add/remove/version update, Pi fork, Git operation or release action。
- No concrete Pi-specific Skill is created without a later accepted workflow requirement。
- No claim that arbitrary future `rose-aili@latest` is pre-verified。

## 2. Requirements / Decision / Risk Traceability

| ID | Source | Planned owner | Verification | Expected state |
|---|---|---|---|---|
| DIST-01 sole shared installer | spec Req 1; D-001/002 | package/docs/bootstrap | manifest/source inspection; no-call fixtures | planned |
| DIST-02 no generic runtime snapshot | spec Req 2 | package files/provenance | pack inventory + source verify | planned |
| DIST-03 no shared postinstall | spec Req 3; D-003 | package/lock/scripts | lifecycle inspection + disposable HOME | planned; exact lock/delete approval required |
| DIST-04 Pi-specific placement | spec Req 4; D-004 | package manifest/tests | positive synthetic fixture + no-placeholder negative | planned |
| DIST-05 doctor visibility | spec Req 5 | doctor/registry | compatible/missing/incompatible/unreadable fixtures | planned |
| DIST-06 upstream formal precondition | spec Req 6 | upstream evidence gate | exact candidate anchor check | blocked on `B-UPSTREAM-FORMAL-001` |
| RISK-01 moving latest | design Risks | docs/doctor | version/anchor mismatch fixture | planned |
| RISK-02 hidden HOME mutation | design Risks | package/bootstrap | seeded `.agents` before/after hash | planned |
| RISK-03 duplicate skill owner | design Risks | manifest/package | collision/no-generic-registration assertions | planned |
| RISK-04 lock drift | design Risks | package lock | exact root metadata/dependency graph diff | planned |

## 3. Selected Verification

| Claim | Command / check | Why |
|---|---|---|
| Local snapshot remains exact build evidence | `npm run verify:skills` | proves source-tree baseline without installing it |
| Package metadata/resources | `npm run validate:package` | checks scripts/files/pi.skills owners |
| Zero implicit shared install | focused package/bootstrap tests | detects npm/npx/rose-aili call and `.agents` mutation |
| Doctor fail-visible states | `npm run test:doctor` or focused Vitest file | compatible/missing/incompatible/unreadable outcomes |
| Broad type/integration consistency | `npm run typecheck`; selected affected unit/integration tests | catches package/runtime type and owner drift |
| Generated/provenance consistency | `npm run validate:generated`; `npm run validate:compatibility`; `npm run validate:provenance` | reconciles retained build-time snapshot evidence |
| Tarball excludes generic runtime snapshot | `npm pack --dry-run --json` | inspects exact publication surface without publishing |
| OpenSpec coherence | `openspec validate separate-shared-and-pi-skill-distribution --strict --no-interactive` | validates capability requirements/scenarios |
| Scope hygiene | `git diff --check`; scoped diff/read inspection | confirms task-only changes and no unrelated cleanup |

Run the smallest focused checks first; broaden only when package/generated integration claims still lack evidence. `npm test` is not automatic, but MAY be selected if affected integration cannot be supported by focused checks.

## 4. Conditional Scenarios and Negative Cases

| ID | Condition | Expected result |
|---|---|---|
| INST-01 | `pi install/update @rosetears/aili-pi` in disposable HOME | no `rose-aili` child; `.agents` byte-identical |
| INST-02 | source tree contains `skills/**` | local verify may pass; tarball excludes the tree |
| INST-03 | `package.json` has any install lifecycle invoking shared sync | validation fails |
| INST-04 | lock keeps stale `hasInstallScript:true` | validation fails exact root metadata |
| INST-05 | user runs the documented `rose-aili@latest` command | operation is external to aili-pi; docs do not claim aili-pi performed it |
| PI-01 | no accepted Pi-specific Skill exists | no placeholder `pi-skills` resource registered |
| PI-02 | synthetic future Pi-specific Skill fixture | only package-local `pi-skills` + explicit `pi.skills` is valid |
| PI-03 | generic snapshot or shared Skill appears in `pi.skills` | validation fails |
| PI-04 | Pi Package attempts copy to `.pi/skills` or `~/.pi/agent/skills` | validation/test fails |
| DOC-01 | compatible shared formal anchors present | `present-compatible` with exact observed evidence |
| DOC-02 | shared skill missing | non-pass `missing`; exact explicit install command; no mutation |
| DOC-03 | shared skill lacks formal protocol | non-pass `incompatible`; no embedded fallback |
| DOC-04 | shared path unreadable/conflicting | `unverified`; no PASS/fetch/rewrite |
| UP-01 | candidate is current observed `rose-aili@0.4.0` | package 1.2 remains blocked because formal-board contract is absent |
| UP-02 | exact future candidate includes generic formal contract | source-owner verification may unblock local migration; Pi details remain absent upstream |
| NEG-01 | code/search finds `formalContext`, Pi task/hub, sandbox or Journal in shared skill delta | upstream boundary fails |
| NEG-02 | code/search finds npm/npx invocation in aili-pi install/update lifecycle | no-implicit-coupling requirement fails |

## 5. Fault Injection / Silent-Failure Checks

| Fault | Injection | Must observe |
|---|---|---|
| Hidden network call | fake npm/npx/rose-aili binaries that record invocation | zero invocation during aili-pi install/update |
| Shared HOME mutation | seed matching and unrelated `.agents/skills` trees | all hashes and entries unchanged |
| Tarball allowlist drift | re-add `skills/` or global-sync script | package validator/pack inventory fails |
| Doctor false PASS | remove formal protocol anchor but retain skill directory | incompatible, not present-compatible |
| Moving latest drift | version exists but required anchors differ | exact observed mismatch remains non-pass |
| Lockfile pseudo-success | remove postinstall without lock reconciliation | generated/package validation fails |
| Pi skill collision | synthetic `pi-skills` name equals shared generic name | visible collision failure; no first-found reliance |

## 6. Open Questions / Unverified

| Type | Item | Effect | Treatment |
|---|---|---|---|
| Blocked dependency | exact `rose-aili` candidate with generic formal-board semantics | blocks package 1.2 and all fallback-removal dependent work | upstream owner publishes/provides exact candidate; this change verifies only |
| Unverified future | arbitrary future `@latest` compatibility | prevents evergreen compatibility claim | doctor checks observed anchors/version every time |
| Unverified operation | real HOME install/update composition | prevents real-environment claim | separate exact approval; disposable HOME is default evidence |
| Deferred scope | concrete Pi-specific Skill | no artifact required now | later accepted change adds package-local skill and tests |

## 7. Final Acceptance Gate

- [x] 历史记录称用户已接受本 final `test-plan.md` 并要求保持 BUILD 阻塞；该 acceptance 未在本次 reconciliation 中独立重新验证，且不授予当前执行权。
- [ ] 用户在接受后提供 fresh BUILD intent；接受本身不执行任何 package/install change。
- [ ] `B-UPSTREAM-FORMAL-001` 由 exact candidate evidence 关闭后，受影响 implementation package 才可开始。
- [ ] `package-lock.json` mutation 与删除旧 sync owner 分别获得精确批准。
- 即使 test plan 曾被接受，real HOME、external repository write、npm/npx install、Git、publish、release 仍保持未授权。

当前 readiness：`NOT ACTIVE / SUPERSEDED`。先前的 accepted/blocked 状态仅作历史参考；重叠工作的未来 BUILD 与 release 只由 `integrate-upstream-formal-agent-protocols` 管理。
