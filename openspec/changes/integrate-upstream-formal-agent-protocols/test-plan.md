# 测试计划：integrate-upstream-formal-agent-protocols

## 0. 状态

- 来源：`proposal.md`、`design.md`、`context.md`、`tasks.md`、capability spec、移动后的 source brief，以及 coordinated changes 的现有 contracts。
- 生成日期：2026-08-01。
- 状态：`ACCEPTED`——用户于 2026-08-01 明确接受本 final test plan 并要求直接进入 BUILD。
- Material contract reconciliation：`ACCEPTED`——用户于 2026-08-01 明确选择 `formal-task-board.md` + `progress.txt` 作为唯一 Runtime owning pair；`tasks.md` 保持任务定义制品且不自动迁移。
- BUILD readiness：`COMPLETE`——accepted implementation remains closed; SHIP reconstruction targets `0.1.16`, while commit/push/merge/publish/release/install remain separate pending ROSE operations.
- 本计划不授权 dependency/lockfile mutation、文件删除、external repository write、真实 HOME 操作、Git、publish、release 或真实 WSL install。

## 1. Scope Under Test

- PR/OpenSpec public status reconciliation and source hygiene.
- Exact `rose-aili` release identity, two protocol references and canonical role inventory.
- Deterministic generated Pi routing projection and single description authority.
- Ordinary/formal routing, active-tool catalog and persistent continuation boundaries.
- Formal board root/parser/update/protection/reconciliation and ordinary regressions.
- Shared/Pi Skill distribution decoupling, doctor compatibility, tarball and disposable HOME invariants.
- Independent proposal and release-operation boundaries.

### Explicitly out of scope

- Canonical shared-protocol authoring inside `aili-workflows`.
- TUI/image-paste implementation and emergency checkpoint implementation.
- Removal of ordinary `general.spawns` or addition of `packageId` to `formalContext` v1.
- Real provider/model/auth/transport/retry behavior, arbitrary-process sandbox claims or future moving-tag compatibility.
- Unapproved real HOME, network install, dependency, Git, publish or release operations.

## 2. Requirements / Decisions / Risks Traceability

| Requirement / decision / risk | Source | Task packages | File / artifact | Verification command / inspection | Expected evidence | Coverage status |
|---|---|---|---|---|---|---|
| INT-01 public evidence/status | Public artifacts status evidence; design Decision 2 | 1.1 | coordinated OpenSpec artifacts; PR diff | scoped artifact/revision audit; forbidden-source search | accessible revision/diff anchors; unsupported claims downgraded without deleting uncertainty | complete: historical PR boundary verified; overlapping boards reconciled; independent status preserved; forbidden claim-tag/session-authority scans clean |
| INT-02 sole BUILD/release owner | Umbrella sole-owner requirement; interview Round 1; design Decision 2 | 1.1, 7.1 | umbrella and two historical source changes | exact active-board selection and cross-change status inspection | only umbrella dispatches/advances overlapping packages; old markers remain historical | complete: overlapping boards are historical/capability sources and both independent proposals retain non-inheriting status |
| INT-03 exact upstream release | Exact upstream protocol release; design Decision 1 | 1.2, 2.1 | source brief; downloaded exact tarball; upstream lock/snapshot/compatibility/provenance manifests | exact npm metadata, tarball, revision, protocol-hash and role-inventory comparison | one internally consistent immutable release tuple | complete: exact release and repository snapshot/lock/provenance synchronized and verified |
| INT-04 generated routing | Deterministic Pi routing projection; design Decision 3 | 2.2-2.3 | sync script; generated routing and role manifests | focused generator tests; `npm run validate:roles`; `npm run validate:generated` | deterministic specialist mapping; drift and duplicate-authority negatives | complete: exact role/routing/source identity reconciled; focused positives and fail-closed negatives pass |
| INT-05 ordinary/formal routing | Ordinary/formal model-facing routing; design Decision 4 | 3.1-3.3 | rose-context; APPEND_SYSTEM; task metadata | focused prompt/schema/runtime tests | ordinary compatibility plus formal explicit-selector/async failures | complete: governance, active-task catalog metadata, ordinary compatibility and formal pre-allocation selector/async enforcement pass focused tests |
| INT-06 persistent continuation | Package-identity-preserving continuation; design Decision 5 | 3.4 | persistent task/runtime/storage audit fields | focused continuation unit/integration tests | same-package positive and scope/role/write/claim change negatives | complete: bounded durable identity, unchanged positive, field/profile/workspace drift negatives, pre-steer audit, strict formal dedupe and restart revalidation pass focused tests |
| INT-07 safe formal board identity | Safe formal-board identity; design Decision 6 | 4.1-4.2 | formal board parser and root resolver | parser/root fixtures; strict OpenSpec validation | valid exact root plus traversal/symlink/collision/legacy zero-write failures | complete: canonical parser plus exact root/path/topology/identity positives and zero-write negatives pass focused tests |
| INT-08 change-scoped formalContext | Change-scoped `formalContext`; design Decision 6 | 4.2, 4.4 | task schema; formal orchestration/root adapter | schema/allocation fixtures | exact change identity; no natural-language package inference | complete: exact `{ changeId }` resolution plus durable Agent/job/turn/workspace binding and revived current-Board revalidation pass; no package inference from prose |
| INT-09 owning-board protection | Formal owning-board protection; design Decision 7 | 4.4-4.5 | workspace/production/child-sandbox seams | write/edit byte checks; exact-deny/no-bash; YOLO and ordinary regressions | formal deny before mutation; ordinary behavior unchanged | complete: durable protection/revive identity, write/edit byte-preserving pre-mutation denial, exact process-owned sandbox deny-or-no-bash, YOLO hard-deny and ordinary regressions pass focused tests |
| INT-10 restart reconciliation | No-false-completion reconciliation; design Decision 7 | 4.6 | formal update/reconciliation; Agent Journal adapters | terminal-state/output/history integration matrix | append-only `RECONCILED`; returned/blocked mapping; zero replay | complete: strict canonical result classification, immutable job/turn evidence, cross-change binding, returned/blocked matrix, guarded race rollback, async-open join, idempotency and zero replay/fallback/auto-done pass focused tests |
| INT-11 shared distribution boundary | No shared-Skill installation ownership; design Decision 8 | 5.1-5.3 | package/lock/sync owner; README/bootstrap | package validation; tarball inspection; disposable HOME lifecycle | no generic runtime Skills, implicit child or shared-HOME mutation | complete: owner removed, snapshot excluded from tarball, exact repository verification retained, separate owners documented, and offline disposable install/update/remove preserves the seeded shared tree byte-for-byte |
| INT-12 doctor compatibility | Read-only doctor compatibility; design Decision 9 | 5.4 | doctor and compatibility manifest | focused doctor fixtures; `npm run test:doctor` | four states, source-match detail, zero network/mutation | complete: exact/hash-drift/missing/incompatible/unverified fixtures and bounded no-repair guidance pass 18 focused tests |
| INT-13 independent/release gates | Independent proposal status; separate release authority; design Decision 10 | 7.1-7.3 | coordinated proposals; release-state artifacts | artifact/status and exact-approval inspection | independent proposal states and absent operation authority remain explicit | complete: independent states, local candidate/exposure evidence, conditional full-suite status and absent commit/push/publish/release/real-install authority are recorded separately |

## 3. Selected Verification

| Condition / claim | Command or direct inspection | Why it is sufficient | Conclusions it does not support |
|---|---|---|---|
| OpenSpec structure is coherent | `openspec validate integrate-upstream-formal-agent-protocols --strict --no-interactive` | parses every requirement/scenario and validates the change shape | implementation correctness, user acceptance or BUILD authorization |
| Public status is portable | scoped artifact/revision inspection and forbidden-source search | directly checks source and status claims against accessible evidence | correctness of code not included in the inspected revision |
| Routing/role projection is exact | focused generator tests; `npm run validate:roles`; `npm run validate:generated`; `npm run validate:compatibility`; `npm run validate:provenance` | covers source identity, role inventory, deterministic output and single-authority drift | live model dispatch rate or quality |
| Formal/ordinary Runtime contract holds | focused catalog/task/continuation/board/protection/reconciliation unit tests plus affected persistent-Agent/formal-orchestration integration tests | exercises each changed Runtime seam and ordinary negative controls | arbitrary process isolation or live provider behavior |
| Distribution and doctor boundaries hold | `npm run validate:package`; `npm run validate:bundles`; `npm run test:doctor`; `npm run test:bootstrap`; `npm pack --dry-run --json`; seeded disposable HOME fixture | checks package inventory, implicit-child behavior, shared-HOME invariants and four-state compatibility | unapproved real HOME or network-install composition |
| Cross-module candidate remains buildable | `npm run typecheck`; `npm run verify:skills`; affected integration suite; `npm test` only if the final cross-module claim still requires it | catches type, pinned-snapshot and affected integration regressions at the candidate tree | publication or release readiness by itself |
| Changed files remain task-scoped | scoped diff/read inspection; `git diff --check` | detects accidental unrelated edits and whitespace errors | clean repository status outside the declared dirty baseline |

Exact focused test files SHALL be selected from current implementation owners during BUILD rather than invented by this DEFINE artifact. A command passes only for the exact candidate tree and shall not be reused as stale release evidence after dependent changes.

## 4. Required Scenarios

### 4.1 Public evidence and status

| ID | Condition | Expected result |
|---|---|---|
| DOC-01 | artifact uses current-session or opaque ref as sole completion source | audit fails; claim becomes not independently verifiable |
| DOC-02 | historical test count has no accessible command/revision | count is not retained as current PASS |
| DOC-03 | uncertainty exists | ordinary prose preserves it without runtime claim-status prefixes |
| DOC-04 | test plan accepted but BUILD/Git/release not separately authorized | all non-acceptance operations remain blocked |

### 4.2 Single active execution owner

| ID | Condition | Expected result |
|---|---|---|
| OWNER-01 | BUILD selects routing/formal-board/distribution work | umbrella is the only active board and release gate |
| OWNER-02 | old change contains overlapping done/runtime evidence | evidence is reconciled but cannot advance umbrella status by itself |
| OWNER-03 | independent non-overlapping proposal remains open | its own lifecycle/status remains unchanged |

### 4.3 Exact upstream identity

| ID | Condition | Expected result |
|---|---|---|
| UP-01 | only `@latest` is known | blocked |
| UP-02 | version/commit/gitHead/tarball hash disagree | blocked with exact mismatch |
| UP-03 | one protocol reference or canonical role is missing | blocked |
| UP-04 | all exact values agree | prerequisite closes without granting other operations |

### 4.4 Routing projection

| ID | Condition | Expected result |
|---|---|---|
| ROUTE-01 | exact matrix and roles | deterministic one-to-one specialist output |
| ROUTE-02 | `general`, unknown or duplicate role | visible failure; no fallback |
| ROUTE-03 | source protocol/hash drift | generated validation fails |
| ROUTE-04 | manifest attempts custom role description | validation fails or generated field is absent; RoleProfile remains authority |
| ROUTE-05 | task inactive | compact catalog absent |

### 4.5 Ordinary, formal and continuation

| ID | Condition | Expected result |
|---|---|---|
| MODE-01 | ordinary omitted agent | existing `general` normalization/default async preserved |
| MODE-02 | formal omitted/general agent | pre-allocation failure |
| MODE-03 | formal async omitted | pre-allocation failure |
| MODE-04 | exact formal specialist/explicit mode | accepted subject to board/package/permission gates |
| CONT-01 | same package/role/scope/write/acceptance/evidence | continuation allowed and audited |
| CONT-02 | any identity/claim dimension changes | new job/Agent required |
| CONT-03 | specialized Agent attempts nested dispatch | denied by existing non-nesting boundary |

### 4.6 Formal board, protection and reconciliation

| ID | Condition | Expected result |
|---|---|---|
| BOARD-01 | exact valid v1 change root | one root and two owning protected paths |
| BOARD-02 | traversal/symlink/collision/ambiguous/legacy mismatch | zero allocation and zero mutation |
| BOARD-03 | task prose ambiguously names package | no package inference; reject |
| WRITE-01 | formal child write/edit owning board | deny before bytes change |
| WRITE-02 | formal bash exact deny unavailable or YOLO | no formal child bash |
| WRITE-03 | ordinary child | current workspace/bash/permission behavior unchanged |
| REC-01 | completed/partial + readable result | returned + `RECONCILED`, not done |
| REC-02 | blocked/failed/interrupted/unexecuted/missing | blocked; zero replay/fallback |
| REC-03 | open async join | dependent/phase remains blocked until inspection/disposition |

### 4.7 Distribution and doctor

| ID | Condition | Expected result |
|---|---|---|
| DIST-01 | npm tarball candidate | no generic `skills/**` or global-sync installer path |
| DIST-02 | seeded disposable HOME lifecycle | shared Skills byte-identical; no implicit `rose-aili` child |
| DIST-03 | repository-local snapshot | exact verification passes while runtime publication remains absent |
| DIST-04 | stale `hasInstallScript` or dependency graph drift | package/lock validation fails |
| DOC-STATE-01 | protocol/roles/structure compatible with different hash | `present-compatible`, source match non-exact |
| DOC-STATE-02 | required reference absent | `missing`, integrated non-pass, no repair |
| DOC-STATE-03 | unsupported protocol or invalid roles/structure | `incompatible` |
| DOC-STATE-04 | unreadable or ambiguous | `unverified` |

### 4.8 Independent and release gates

| ID | Condition | Expected result |
|---|---|---|
| GATE-01 | integration passes; emergency checkpoint blocked | integration may close independently; checkpoint remains blocked |
| GATE-02 | local implementation/tests pass | commit/push/publish/release/real install remain unauthorized |
| GATE-03 | exact upstream evidence changes after checks | affected evidence becomes stale and must be refreshed |

## 5. Fault Injection and Silent-Failure Checks

| Fault | Injection | Must observe |
|---|---|---|
| Generated drift hidden | alter matrix/hash/output ordering | validation fails rather than regenerating an accepted-looking fallback |
| Role authority duplication | add handwritten descriptions to routing output | failure or omission of duplicate source |
| Board alias escape | symlink/traversal/collision fixture | pre-allocation zero-write failure |
| Formal bash protection loss | disable exact deny or use YOLO fixture | bash removed only from formal child |
| Reconcile pseudo-success | terminal job without readable output | blocked, not returned/done |
| Hidden HOME mutation | fake lifecycle child and seeded shared tree | invocation/hashes expose failure |
| Doctor false PASS | directory exists but required protocol missing | missing/incompatible, never integrated PASS |
| Moving-source substitution | change dist-tag after exact capture | exact candidate remains the only accepted identity |
| Status conflation | mark tests passed and infer release approval | release gate remains pending |

## 6. Open Questions / Unverified

| Type | Item | Effect | Treatment |
|---|---|---|---|
| Resolved input | exact upstream release tuple | `rose-aili@0.4.2` maps npm `gitHead` and tag to `bb1fedacc46d71045daa6257d121f2b71ba29d54`; exact tarball and both protocol hashes verified | preserve exact values in source brief and synchronize repository lock/provenance only after separate approval |
| Resolved boundary | historical PR versus current dirty implementation | historical PR diff is exactly 34 OpenSpec files; current dirty implementation does not inherit completion from it | keep old completion/runtime claims historical and require fresh umbrella evidence |
| Environment | live provider and real HOME/WSL composition | no environment-wide claim | separate accepted operation/test gate |
| Release authority | commit/push/publish/GitHub release/install | no publication action | request each exact approval only after local readiness |

## 7. Final Acceptance Gate

- [x] 用户于 2026-08-01 明确接受本 final `test-plan.md`。
- [x] 用户在同一指令中给出 fresh BUILD intent，要求直接进入 BUILD。
- [x] exact upstream release tuple 已解析并验证。
- [x] Package 5.1 所需 root lock metadata mutation 与精确文件删除已分别获得批准并完成。
- [ ] 任何后续 lockfile、删除、external、Git、publish、release、真实安装操作分别获得所需精确批准。

当前 readiness：`SHIP_READY_LOCAL_0.1.16`；本地重建、repair review、完整 suite、prepublish、候选包与 bounded exposure gate 已通过，Git、publish、release 与真实安装尚待执行。

## 8. Superseding 0.1.16 SHIP Repair Evidence

This bounded repair adds claim-matched scenarios without changing the accepted public `formalContext: { changeId }` v1 shape:

| Repair | Fresh scenario | Expected boundary |
|---|---|---|
| Loaded production reachability | Load `extensions/index.ts`, invoke parent `hub formal-plan`, then explicitly invoke `formal-reconcile` | exact task request with operation/ownership/write-scope evidence; child action denied; ready Board preserved by reconciliation; no automatic dispatch, acceptance, done, join closure or phase movement |
| Formal output contract | Assemble the real generated `aili.implementer` role with the actual Runtime formal assignment override and derive a compliant envelope from that prompt | ordinary assignments still request role JSON; formal output uses exact parser field order and package/role identity |
| Continuation restart reconciliation | same-identity follow-up is running, completed without fresh immutable evidence, failed, or interrupted | running waits/preserves; the three terminal non-eligible cases block; initial result is never replayed as fresh evidence |
| Formal write scope | mutation-capable role has empty, in-scope, out-of-scope, or owning-file target | empty fails before allocation; in-scope is allowed by the lease; out-of-scope and owning formal files are denied before mutation; read-only effective roles may remain empty |
| 0.1.16 release gate | inspect package scripts and load the focused packaged Runtime/catalog test | `validate:generated` includes roles/routing; prepublish includes compatibility and loaded Runtime; historical interim validator remains separate |

Fresh focused evidence is `11` files and `88/88` tests passing, plus `npm run typecheck` passing. The focused generated tests directly execute the role, routing, Skill, permission, compatibility and provenance verifiers. ROSE also supplied a separate fresh full-suite result after correcting the worktree-fixture CWD in `tests/integration/permission-modes.test.ts`: `93` files passed, `2` skipped; `725` tests passed, `2` skipped. This repair lane did not rerun that full suite and does not convert the supplied result into Git, publish, release, or install authority.

ROSE final verification supersedes the bounded-lane counts: focused repair/security coverage passes `39/39`; the final full suite passes `733` tests with `2` intentional skips across `95` files; `prepublishOnly`, typecheck, strict OpenSpec, Linux disposable lifecycle and diff hygiene pass. The packed `0.1.16` candidate has `5,752` entries, SHA-256 `336497c8d160a73db0b7ee70f2d60a04dc509af2dd12898fcd9090efabed9293`, and no forbidden first-party path or bounded sensitive-pattern hit.

The aggregate npm validator commands and strict OpenSpec command remain not run in this lane because the active runtime command policy denies those command forms. The underlying generator verifiers and owning Runtime tests pass, but task 8.6 remains open until ROSE runs the exact final command gate.
