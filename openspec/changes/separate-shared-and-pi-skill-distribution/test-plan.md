# 测试文档：separate-shared-and-pi-skill-distribution

## 0. 文档元信息

- [工具结果] 来源：`proposal.md`、`design.md`、`context.md`、`interview.md`、`tasks.md`、capability spec、当前 package/postinstall/bootstrap/doctor/tests，以及 Pi `0.82.1` npm artifact 的 `docs/skills.md` 与 `docs/packages.md`。
- [工具结果] 生成日期：2026-07-30。
- [工具结果] 适用 change：`separate-shared-and-pi-skill-distribution`。
- [已知|用户] 状态：`ACCEPTED_BUILD_BLOCKED`；用户已显式接受 final test plan，并选择在 upstream prerequisite 满足前保持 BUILD 阻塞。
- [工具结果] material research gap：`0`；已知 external dependency blocker：`B-UPSTREAM-FORMAL-001`。

## 1. Scope Under Test

- [框架内] `rose-aili` sole shared-skill installer ownership and two explicit independent `@latest` commands。
- [框架内] `aili-pi` zero-write boundary for `~/.agents/skills` and zero implicit npm/npx/network invocation。
- [框架内] repository-only pinned snapshot versus npm runtime/tarball exclusion。
- [框架内] package-local future `pi-skills/**` + explicit `pi.skills` ownership without placeholder content。
- [框架内] read-only doctor visibility for shared workflow compatibility。
- [框架内] upstream generic formal-contract prerequisite and Pi-specific adapter non-leakage。

### Explicitly out of scope

- [框架内] No `aili-workflows` source edit, npm publish, actual `rose-aili install/update`, real HOME write, dependency add/remove/version update, Pi fork, Git operation or release action。
- [框架内] No concrete Pi-specific Skill is created without a later accepted workflow requirement。
- [框架内] No claim that arbitrary future `rose-aili@latest` is pre-verified。

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

[框架内] Run the smallest focused checks first; broaden only when package/generated integration claims still lack evidence. `npm test` is not automatic, but MAY be selected if affected integration cannot be supported by focused checks.

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

- [x] [已知|用户] 用户已显式接受本 final `test-plan.md`，并要求保持 BUILD 阻塞。
- [ ] 用户在接受后提供 fresh BUILD intent；接受本身不执行任何 package/install change。
- [ ] `B-UPSTREAM-FORMAL-001` 由 exact candidate evidence 关闭后，受影响 implementation package 才可开始。
- [ ] `package-lock.json` mutation 与删除旧 sync owner 分别获得精确批准。
- [框架内] 即使 test plan 被接受，real HOME、external repository write、npm/npx install、Git、publish、release 仍保持未授权。

当前 readiness：`DEFINE_ACCEPTED_BUILD_BLOCKED_ON_UPSTREAM_PREREQUISITE`。
