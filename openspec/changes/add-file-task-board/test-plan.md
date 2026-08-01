# 测试文档：add-file-task-board

> **Historical/superseded status (2026-08-01):** This test plan is retained as capability and verification-source material only. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This plan cannot independently authorize dispatch, advancement, acceptance, closure, publication, or release. Any completion, test-count, snapshot, runtime, acceptance, or opaque session-reference claim below is historical and was not independently reverified during this reconciliation.

## 0. 文档元信息

- 来源：`proposal.md`、`design.md`、`context.md`、`interview.md`、`tasks.md` 和三个 capability specs；current `task`/`hub` runtime、RoleProfiles/manifest、workspace mutation guard、process-owned permission sandbox/custom config、canonical embedded delivery references、official Pi 0.82.1 extension docs；bounded Agent evidence reports与Round-3 production-locality inspection。
- 初始生成：2026-07-28；Round-3 material revision：2026-07-30。
- 适用 change：`add-file-task-board` 的历史能力与验证来源；不得作为新的 BUILD target。
- 状态：`HISTORICAL_SUPERSEDED`。本文保留先前记录的 acceptance，但本次 reconciliation 未独立重新验证该 acceptance。
- 前一版状态：Round-2 accepted plan已支持packages through 3.3；package 2.4 production-locality discovery使其public-schema/write-protection边界失效并触发本Round-3 reacceptance。
- Research closure：formal placement、delegation/runtime/catalog seams、exact formal-root input、write/edit guard、sandbox custom deny和fail-closed bash boundary均已由current source关闭；无待补材料研究问题。

## 1. 被测对象、目标与边界

### 1.1 被测对象

- Formal-only `aili-task-board/v1` parser、validator、exact OpenSpec root、状态/依赖/证据/disposition/join/progress合同。
- Exact-change opt-in `external-task-session/v1` bootstrap reconciliation；strict persistent五refs默认不变，缺失身份显式unavailable，post-return timing保持accepted limitation。
- Ordinary Pi benefit-based delegation与active IDEATE/DEFINE/BUILD/SHIP package-ownership precedence。
- ROSE Orchestrator职责、Specialized Agent hard dispatch、pre-recorded waiver、no-normal-general、explicit sync/async和evidence-based phase gates。
- RoleProfile-derived Agent Catalog、recommended phase views、active board Owner projection和task/lifecycle model-facing guidance。
- ROSE-only board/progress protection、task/hub refs、same-session join和restart reconciliation。
- Optional `formalContext: { changeId }` task-item marker、exact v1 pre-allocation resolution、persistent protected paths、formal bash exact-deny/fail-closed behavior与ordinary task regression。
- Legacy/unmanaged OpenSpec checklist与exact one-change opt-in upgrade。
- Canonical `aili-workflows` owner与`aili-pi` exact pinned consumer/adapter chain。

### 1.2 必须支持的接受 claim

- 唯一新task-board authority是`openspec/changes/<change-id>/{tasks.md,progress.txt}`；没有`task/<task-id>`、`.aili/tasks`或隐藏任务库。
- Ordinary Pi无材料delegation benefit时仍可direct；active formal board中Agent-owned ready package必须先dispatch exact Specialized selector。
- ROSE独占phase/change identity、decomposition、Owner、决策、waiver、join/disposition、integration、board writes、final diff、fresh verification和verdict。
- Formal Agent package显式selector和execution mode；ordinary omitted-agent→general和Runtime default-async不变。
- 前置结果使用sync；async只用于独立package并在dependent/phase gate前完成named join和inspection。
- `returned`永不自动等于`done`；blocked/failed/interrupted/unexecuted/missing-output不伪装为successful return。
- Expected evidence与actual Evidence分离；done和phase completion依赖accepted evidence/disposition/verification而非调用次数。
- 主 Agent在dispatch前看到bounded phase-relevant responsibilities；description只来自RoleProfiles，phase routing不授予权限。
- Worker不能修改owning board/progress；formal write/edit在mutation前deny，formal bash只在exact sandbox deny可证明时存在；恢复不自动重放、fallback selector、接受结果或推进phase。
- 四种permission modes、ordinary task/hub lifecycle/defaults、credential/operation gates不变；`formalContext`只增加formal child的更严格deny，绝不扩权。

### 1.3 Explicitly not run / out of scope

- 不运行真实provider、真实用户HOME、真实external repository/worktree、浏览器或发布流程，除非后续accepted package单独要求并获批准。
- 不实现/验证informal board、promotion/supersession、Todo数据库、scheduler、`/aili-work`、workboard UI、status bar、dispatch telemetry产品面或automatic child-context assembly。
- 不改变global `task` default；只验证optional formalContext identity/protection input，所有省略该字段的ordinary normalization和工具行为保持现状。
- 不以固定Agent call quota、真实模型“意愿”或单次提示效果作为offline PASS。真实dispatch-rate improvement属于后续controlled behavioral/telemetry evidence。
- 不执行dependency/lockfile、Git commit/push/merge、publish、release或canonical `aili-workflows`写入，除非后续获得各自精确批准。

## 2. 需求 / 决策 / 风险追踪

| ID | 来源 | Package | Planned artifact / existing seam | 验证 | 覆盖状态 |
|---|---|---|---|---|---|
| FTB-01 formal-only root | file-task-board Req 1；D-001/002 | 2.2 | formal root resolver/initializer | exact-root/absence fixtures | complete (2.2) |
| FTB-02 path/identity fail-closed | file-task-board Req 2 | 2.2 | resolver + disposable repo | symlink/traversal/ambiguity zero-write | complete (2.2) |
| FTB-03 fixed Markdown/actual Evidence | file-task-board Req 3；D-003/011 | 2.1 | parser/validator | AST + missing/duplicate/evidence negatives | complete (2.1) |
| FTB-04 seven states/returned≠done | file-task-board Req 4；D-010 | 2.1,2.3 | transition guard | full state table + checkbox invariants | complete through 2.3 |
| FTB-05 dependency/execution/join | file-task-board Req 5；D-009 | 2.1,2.3,3.3 | graph/join adapter | cycle/sync/async/incomplete-join | complete through 3.3；restart recovery remains 2.4 |
| FTB-06 evidence/disposition terminal gate | file-task-board Req 6；D-011 | 2.3 | writer/validator | accepted/partial/rejected/follow-up | complete (2.3) |
| FTB-07 ROSE-only writes | file-task-board Req 7；D-014/021 | 2.4 | task formalContext + exact-root resolver + workspace/sandbox guards | exact protected-file bytes；formal bash deny/fail-close | planned after Round-3 acceptance |
| FTB-08 append-only events | file-task-board Req 8 | 2.3 | progress writer | prefix/hash preservation + bounded events | complete (2.3) |
| FTB-09 resume/no replay | file-task-board Req 9 | 2.4 | hub reconciliation | terminal matrix + zero replay | planned after Round-3 acceptance |
| FTB-10 validator/legacy opt-in | file-task-board Req 10；D-016 | 2.1,4.1 | validator/migration fixture | legacy unchanged + one exact upgrade | 2.1 classification complete；4.1 migration planned |
| FTB-11 no operation authority | file-task-board Req 11；D-018 | 3.3,5.1 | permission/task regressions | unapproved operations remain blocked | orchestration gate complete；final permission matrix 5.1 planned |
| FTB-12 exact bootstrap bridge | file-task-board bootstrap requirement；D-020 | 2.3a | parser/update bootstrap adapter | strict default；exact opt-in；no fabrication；append-only reconciliation；timing limitation | complete (2.3a；98/98 focused PASS) |
| CAT-01 canonical catalog | catalog Req 1；D-012 | 3.1 | RoleProfile projection | exact selectors/order/description source | complete (3.1) |
| CAT-02 phase routing view | catalog Req 2；D-013 | 3.1 | phase policy projection | four sets resolve; outside specialist with reason | complete (3.1) |
| CAT-03 pre-call guidance | catalog Req 3 | 3.2,3.3 | task/lifecycle metadata + explicit provider seam | active/inactive/ordinary/formal fixtures | complete offline；live provider remains named Unverified |
| CAT-04 bounded/no prompt disclosure | catalog Req 4 | 3.1,3.2 | projection | line/field bounds; role body absent | complete through 3.2 |
| CAT-05 Owner exact selector/context | catalog Req 5；D-007/008/021 | 2.1,2.4,3.3 | validator/dispatcher | exact task.agent + formalContext changeId；refs separate | selector complete through 3.3；formalContext binding pending 2.4 |
| CAT-06 general compatibility boundary | catalog Req 6；D-008 | 3.2,3.3 | lifecycle adapter | formal omission/general fail; ordinary default pass | complete through 3.3 |
| CAT-07 visible catalog/availability failure | catalog Req 7 | 3.1,3.3 | failure paths | no stale/general/alternate fallback | complete through 3.3 |
| CAT-08 bounded schema/no permission expansion | catalog Req 8；D-021 | 2.4,3.2,5.1 | optional formalContext + existing regressions | ordinary schema/default/lifecycle/permission equality；formal only tightens | planned after Round-3 acceptance |
| ORCH-01 two delegation lanes | orchestration Req 1；D-004 | 1.2,3.3 | canonical workflow + adapter | ordinary direct and formal hard dispatch | complete through 3.3 |
| ORCH-02 ROSE authority/decomposition | orchestration Req 2；D-005 | 1.2,3.3 | package/gate policy | mixed package split; verdict cannot dispatch | complete through 3.3 |
| ORCH-03 matching specialist default | orchestration Req 3；D-006 | 1.2,3.3 | Owner classification | four-phase material examples | complete through 3.3 |
| ORCH-04 waiver taxonomy | orchestration Req 4；D-007 | 2.3,3.3 | validator/progress | all allowed + post-hoc/invalid negatives | complete through 3.3 |
| ORCH-05 explicit joins | orchestration Req 5；D-009 | 2.3,3.3 | task/hub adapter | sync order + async order-independent join | complete through 3.3 |
| ORCH-06 result mapping/disposition | orchestration Req 6；D-010/011 | 2.3,2.4,3.3 | runtime/board adapter | completed/partial/blocked/failed/missing | transition/dispatch complete；restart recovery 2.4 pending |
| ORCH-07 phase role foregrounding | orchestration Req 7；D-012/013 | 3.1,3.2 | lifecycle guidance | current phase + active Owners, no auto lane | complete offline；live provider remains named Unverified |
| ORCH-08 evidence-based phase gate | orchestration Req 8；D-015 | 3.3,5.2 | gate evaluator | call-count false positive negatives | evaluator complete；final matrix 5.2 planned |
| ORCH-09 phase-one boundary | orchestration Req 9；D-017/018/021 | 2.4,3.2,3.3,5.1 | scoped diff/regressions | only formalContext schema delta；no UI/hidden state/default/permission expansion | planned after Round-3 acceptance |
| OWN-01 canonical upstream/exact snapshot | D-019 | 1.0–1.3 | source evidence + upstream packet + lock/snapshot | upstream checks + verify:skills | complete for accepted source/snapshot；future writes remain separately gated |
| RISK-01 ceremonial dispatch | design Risks | 3.3,5.1 | duplicate-scope/evidence tests | call without use never closes gate | 3.3 complete；final matrix 5.1 planned |
| RISK-02 orphan async result | design Risks | 2.3,2.4,3.3 | join/restart fixtures | no dependent/phase advance | planned |
| RISK-03 broad waiver restores direct default | design Risks | 2.3,3.3 | waiver validator | closed classes and pre-record timing | complete through 3.3 |

## 3. 选定验证

| Claim | 命令或检查 | 说明 |
|---|---|---|
| Formal parser/root/state/evidence/legacy | `npx vitest run tests/unit/formal-task-board-update.test.ts tests/unit/formal-task-board-root.test.ts tests/unit/formal-task-board.test.ts` | implemented through package 2.3；77/77 PASS；exact root/zero-write、固定grammar、state、waiver、join、disposition、append-only prefix及rollback negatives |
| Exact bootstrap reconciliation | `npx vitest run tests/unit/formal-task-board-bootstrap.test.ts tests/unit/formal-task-board-update.test.ts tests/unit/formal-task-board.test.ts` | package 2.3a已实现；default strict rejection、exact identity/decision、external syntax、historical RECONCILED、post-return limitation、current-pair fixture；98/98 focused PASS |
| Ordinary/lifecycle ownership/waiver/gates | `npx vitest run tests/unit/formal-orchestration.test.ts` | package 3.3已实现；四phase、ordinary、waiver、two-member join order、blocked member和phase gate；latest combined regression 106/106 PASS |
| Catalog/phase views/bounded output | `npx vitest run tests/unit/agent-catalog.test.ts tests/unit/roles.test.ts` | package 3.1已实现；绑定canonical RoleProfiles；13/13 PASS |
| Runtime dispatch/join/write/restart | `npx vitest run tests/integration/formal-orchestration-runtime.test.ts` | planned file；formalContext、exact root、write/edit/bash protection、task/hub/file recovery integration |
| Existing task/hub API compatibility | `npx vitest run tests/unit/persistent-agent-task.test.ts tests/integration/persistent-agent-runtime.test.ts tests/unit/persistent-agent-workspace.test.ts tests/unit/persistent-agent-storage.test.ts tests/unit/persistent-agent-output-delivery.test.ts` | 保留ordinary general/default-async/refs/journal/workspace行为 |
| Permission modes/non-expansion | `npx vitest run tests/unit/persistent-agent-permission.test.ts tests/unit/persistent-agent-child-sandbox.test.ts tests/integration/permission-sandbox.test.ts tests/integration/permission-modes.test.ts tests/integration/package-runtime.test.ts` | 检查ordinary mode/sandbox/credential/tool/runtime边界与formal exact-deny/fail-close |
| Type and broad package regression | `npm run typecheck`; `npm test` | 捕获跨模块、prompt、snapshot、role和package集成回归 |
| Canonical snapshot/generated consistency | `npm run verify:skills`; `npm run validate:roles`; `npm run validate:generated` | 证明exact consumer chain与无第二description mapping |
| OpenSpec structure | `openspec validate add-file-task-board --strict --no-interactive` | 解析三个capability全部requirements/scenarios |
| Scope hygiene | `git diff --check`; scoped diff/read检查 | 确认无informal/UI/schema/default/permission非预期delta |

所有planned test文件必须在BUILD locality确认后创建；本test plan不声称它们目前存在或已经PASS。

## 4. 条件性场景 / 边界 / 权限用例

### 4.1 Formal placement and absence

| ID | 条件 | 预期 |
|---|---|---|
| PATH-01 | exact resolved OpenSpec change | 只使用same-root tasks/progress |
| PATH-02 | no formal lifecycle | 不创建任何task board |
| PATH-03 | ambiguous/symlink/traversal/collision | pre-write失败，零文件变化 |
| PATH-04 | search code/docs for informal authority | 无`task/<task-id>`/`.aili/tasks` resolver、promotion或current-authority claim |

### 4.2 Ordinary versus lifecycle ownership

| ID | 条件 | 预期 |
|---|---|---|
| MODE-01 | ordinary local low-benefit work | direct合法，无waiver/Agent quota |
| MODE-02 | active lifecycle Agent-owned ready package | exact selector先dispatch；ROSE不重复scope |
| MODE-03 | ROSE decision/integration/verdict package | Dispatch forbidden，Execution direct |
| MODE-04 | package混合decision+implementation | ready前拆分 |
| GEN-01 | formal Agent package省略agent或用general | allocation前orchestration失败 |
| GEN-02 | ordinary task省略agent | existing general normalization不变 |

### 4.3 Waivers

| ID | 条件 | 预期 |
|---|---|---|
| WAV-01 | user supplied complete bounded evidence | pre-record waiver + direct + WAIVED event合法 |
| WAV-02 | role unavailable, ROSE equivalent lawful capability | exact capability/permission/scope evidence后可waive |
| WAV-03 | another accepted package exactly covers scope | duplicate cancelled + superseded disposition + covering evidence；不dispatch/direct/waive |
| WAV-04 | concrete measured negative benefit | 具体成本和missing added evidence可审计 |
| WAV-05 | dependency incomplete/cancelled/scope changed | pending/blocked/cancelled，不伪造waiver |
| WAV-06 | invalid selector/specialist-only capability unavailable | blocked/DEFINE，无general或alternate fallback |
| WAV-07 | waiver after direct execution | invalid post-hoc，phase gate不通过 |

### 4.4 Sync, async and joins

| ID | 条件 | 预期 |
|---|---|---|
| JOIN-01 | scout evidence是下一包前置 | exact `async:false`; inspection前dependent pending |
| JOIN-02 | two independent packages share J-01 | exact `async:true`; completion order不影响join语义 |
| JOIN-03 | one async member unreadable/blocked | join保持open/blocked，phase不前进 |
| JOIN-04 | async Agent完成但未读取output/history | 无JOINED/disposition，dependent不ready |
| JOIN-05 | ROSE在等待时重复worker scope | deterministic gate failure/duplicate-scope evidence |

### 4.5 State, evidence and disposition

| ID | 条件 | 预期 |
|---|---|---|
| STATE-01 | completed readable canonical result | running→returned，checkbox空 |
| STATE-02 | partial readable result | returned，必须partial disposition/残余处理 |
| STATE-03 | worker blocked/failed/interrupted/unexecuted/missing output | blocked，不returned/done |
| STATE-04 | worker text says done/PASS | 无状态authority |
| STATE-05 | Expected evidence存在但actual Evidence pending | done validation失败 |
| STATE-06 | ROSE-owned或valid-waived direct package完成 | running→done仅在actual Evidence、allowed disposition和fresh verification后合法 |
| DISP-01 | accepted evidence + integration + verification | returned→done + `[x]` |
| DISP-02 | partially accepted + residual transferred | done仅在named residual/limitation合法时 |
| DISP-03 | rejected/needs-follow-up | blocked或new package，不done |
| DISP-04 | terminal status reopen | reject，新scope新ID |

### 4.6 Catalog and phase guidance

| ID | 条件 | 预期 |
|---|---|---|
| CAT-01 | valid current RoleProfiles | underlying catalog each selector once/canonical order |
| CAT-02 | each phase view | exact recommended selectors resolve；description来自RoleProfiles |
| CAT-03 | active nonterminal Owner outside shortlist | 有responsibility reason时foreground且合法 |
| CAT-04 | recommended role没有accepted package | 不自动创建/dispatch lane |
| CAT-05 | task inactive | 无orphan catalog/guideline |
| CAT-06 | role hash/duplicate/unknown phase selector failure | visible non-pass；无stale/fallback |
| CAT-07 | render view | one bounded line/entry；无full prompt/hash/provenance body |

### 4.7 Write protection, recovery and legacy

| ID | 条件 | 预期 |
|---|---|---|
| WRITE-01 | mutation child写owning tasks/progress | pre-write deny，bytes/hash不变 |
| WRITE-02 | writeScope包含board parent/为空 | immutable exclusion仍生效；邻近合法文件可写 |
| WRITE-03 | valid formalContext + shared/isolated workspace | exact same-root pair解析；两owning paths随Agent lifecycle持久；initial/revive均deny |
| WRITE-04 | formal child bash + audited sandbox available | per-command custom config含exact two-file `denyWrite`；其他permission profile字段不扩张 |
| WRITE-05 | formal child bash + sandbox unavailable/disabled/YOLO | bash不在effective tools；不回退heuristic或unsandboxed执行 |
| WRITE-06 | ordinary task省略formalContext | existing writeScope、bash、sandbox、general/default-async完全不变 |
| WRITE-07 | invalid/missing/legacy/symlink/identity-mismatch change | allocation前visible fail；zero child、zero board mutation、zero fuzzy fallback |
| REC-01 | running + completed readable | RECONCILED→returned，不done |
| REC-02 | blocked/failed/interrupted/unexecuted/missing | blocked + zero replay/fallback |
| REC-03 | partial async join after restart | per-member reconcile，join不重复dispatch |
| REC-04 | terminal package + stale/released ref | terminal不反转，gap可见 |
| LEG-01 | no v1 marker | legacy/unmanaged，bytes不变，不claim PASS |
| LEG-02 | exact one-change opt-in | in-place preserve representable history；其他changes不变 |

### 4.8 Phase gates and permissions

| ID | 条件 | 预期 |
|---|---|---|
| GATE-01 | N Agents called but outputs ignored | phase incomplete |
| GATE-02 | Agent-owned package lacks refs/valid waiver | phase incomplete |
| GATE-03 | returned result lacks disposition | phase incomplete |
| GATE-04 | open join | phase incomplete |
| GATE-05 | final scope not inspected/fresh check absent | phase incomplete |
| GATE-06 | material delta in BUILD | stop→DEFINE reacceptance |
| PERM-01 | unapproved dependency/Git/publish request | blocked regardless of board/Owner/YOLO |
| PERM-02 | compare registrations/config/schema/defaults | only optional formalContext added；four modes、ordinary task/hub lifecycle、general/default async unchanged |
| PERM-03 | regenerated test plan未接受 | implementation packages不执行 |

### 4.9 Exact bootstrap reconciliation

| ID | 条件 | 预期 |
|---|---|---|
| BOOT-01 | exact `add-file-task-board` + accepted decision + real `agent://ses_*` | external form只在显式bridge option下合法；job/turn/history精确标unavailable |
| BOOT-02 | default validator或另一change使用external form | fail closed；strict persistent五refs不变 |
| BOOT-03 | historical invalid bootstrap anchors | 仅append BOARD/package RECONCILED；旧progress prefix/hash不变 |
| BOOT-04 | external sync call返回后才可见session ref | observed bundle标记`dispatch_timing=unverified-before-return`；不声称pre-dispatch persistence |
| BOOT-05 | synthetic job/turn/history、缺user-decision ref或identity mismatch | zero-write fail；无fallback/waiver |
| BOOT-06 | bridge pair完成reconciliation | normal mode仍拒绝；exact bridge mode PASS且残余limitation可见 |

## 5. Fault injection与silent-failure checks

| Fault | Injection | 必须观察 |
|---|---|---|
| Partial board write | fail write/rename before replacement | prior valid board完整；无半状态/checkbox |
| Progress append failure | fail append/fsync seam | board不能claim event/dispatch/join已记录 |
| Agent accepted without durable refs | malformed task settlement | package不running或phase不前进 |
| Terminal job without output/history | delete/unavailable evidence fixture | blocked，不returned/done |
| Delivery/board race | async completion during update | single settlement/event，无duplicate dispatch/done |
| Join member completes twice | duplicate delivery/reconcile | idempotent member evidence，join只关闭一次 |
| Worker claims final verdict | canonical output contains PASS/done | treated as evidence；ROSE gate不变 |
| Post-hoc waiver | direct work先于WAIVED timestamp | invalid，no completion credit |
| Manifest/phase mapping drift | corrupt hash/unknown selector | catalog/orchestration non-pass，无fallback |
| Worker board mutation | write/edit with empty or parent scope | deny，board byte-identical |
| Formal bash without exact sandbox | disable/YOLO/degraded sandbox fixture | formal child has no bash；ordinary child remains current behavior |
| Forged formal context | unknown/legacy/symlink/mismatched changeId | pre-allocation reject；no scan/fallback/child |
| Call-count false success | many terminal Agent fixtures, no inspection | phase remains incomplete |
| Ordinary Pi regression | no lifecycle context | no formal selector/async enforcement |

## 6. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| Resolved | canonical `aili-workflows` attachment/write与current Git/rules | 1.2已完成 | exact task-scoped source package committed at `d08b343ac45e4f90510a7af6b76f95d38d9e0cb1`；未push/merge/publish/release |
| Resolved | accepted upstream snapshot/lock同步 | 1.3已完成 | exact 64-skill/472-file snapshot及generated checks已通过 |
| Resolved and accepted | 用户选择并接受bounded bootstrap bridge final test plan：exact identity/decision opt-in、真实external session ref、显式unavailable、append-only RECONCILED、post-return timing limitation、persistent strict default | package 2.3a可进入BUILD | 按accepted BOOT matrix实现；禁止伪造refs或静默重写历史 |
| Separately gated | dependency/lockfile、Git、publish、release | 不属于默认执行面 | 各自fresh exact approval |
| Resolved material locality | package 2.4确认production Runtime缺少exact formal-root input；write/edit guard存在但bash exact deny依赖audited sandbox custom config | public task schema boundary已材料变化 | 用户已选择optional formalContext；按WRITE-03..07验证，未接受前不恢复BUILD |
| Unverified behavior | real model在controlled tasks中的dispatch rate、waiver rate、general usage与token savings | Offline deterministic tests不能证明“意愿提高” | UI/telemetry不在phase one；后续单独定义controlled behavioral evidence，不作为本BUILD假PASS |
| Unverified environment | live provider、overflow、external browser/home/repository behavior | 不支持环境扩张claim | 只有后续accepted live gate可证明 |

材料研究 gap：`0`；材料合同决策：`0`；Round-3 final test-plan acceptance gate：`CLOSED`。

## 7. Final acceptance gate

- [x] 用户曾明确接受Round-1 regenerated `test-plan.md`，包括formal-only scope、ordinary/lifecycle precedence、ROSE duties、Specialized hard dispatch、waiver taxonomy、sync/async joins、phase guidance、evidence/disposition gates、Unverified和“权限四模式不变”。
- [x] 用户以“接受，你直接做”给出新的 BUILD intent；实现仍受每项 exact operation gate 约束。
- [x] 1.2、1.3所需的exact operations已分别获批并完成；后续dependency/lockfile、host Git、publish、release仍需各自fresh exact approval。
- [x] 用户已选择bounded bootstrap bridge材料合同；该回答关闭决策但不替代final test-plan acceptance。
- [x] 用户已以“接受并继续（推荐）”显式接受本Round-2 regenerated final test plan并恢复BUILD。
- [x] 用户已选择“Add formal task context (Recommended)”作为package 2.4材料合同；该回答关闭schema/protection决策但不替代Round-3 final test-plan acceptance。
- [x] 用户已选择“Accept and continue (Recommended)”显式接受本Round-3 regenerated final test plan并恢复BUILD；该接受不授权dependency、Git、publish或release操作。

当前 BUILD readiness：`NOT ACTIVE / SUPERSEDED`。先前的 done、dependency-ready 和 sync-order 记录仅作历史参考；重叠工作的未来 BUILD 与 release 只由 `integrate-upstream-formal-agent-protocols` 管理。
