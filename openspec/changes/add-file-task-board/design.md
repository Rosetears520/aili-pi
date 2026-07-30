## Context

[已知|用户] 第一阶段只做正式 OpenSpec 提案，不建立 `task/<task-id>`。用户要求主 Agent 从“可以自己做也可以派发”转为 AILI lifecycle 的 Orchestrator：主 Agent策划、分解、决定、整合和最终验证；有边界的材料侦察、实现、测试、研究和独立审查由匹配的 Specialized Agents执行。完成条件依赖 Agent evidence graph，而不是一句“多调用 Subagent”或固定调用次数。

[工具结果|本地] 当前 `task`/`hub` 已有 persistent Agent/job/turn、sync/async、output/history、restart journal、workspace guard 和 canonical selector validation。当前上层 workflow、APPEND_SYSTEM 和 README 仍使用 benefit-based delegation；省略 `agent` 默认为 `general`，顶层非 blocking Agent 默认 async，task metadata没有 selector 职责或 lifecycle dispatch policy。

[工具结果|本地] 当前 RoleProfile/manifest拥有 20 个 canonical selectors、description、tools/capabilities/status/provenance，但没有 phase tags。当前 lifecycle prompt 能表达 IDEATE/DEFINE/BUILD/SHIP，Runtime没有持久 active-phase state。现有 OpenSpec checklists没有 task-board v1 marker，必须继续可读且不被批量改写。

[已知|官方 Pi 0.82.1] Extension tool的 `description`、`promptSnippet` 和 active-tool `promptGuidelines` 对模型可见；custom session entries/context hooks可用于以后扩展，但第一阶段不需要新增 phase persistence或隐藏状态。

## Goals / Non-Goals

**Goals**

- 只在明确 OpenSpec change root建立正式、文件优先的 workboard。
- 把普通 Pi 的 benefit-based delegation与 active AILI lifecycle的 package ownership清楚分开。
- 让每个材料 package明确 ROSE或Specialized Agent Owner、dispatch、execution mode、join、证据和 disposition。
- 保留 ROSE 的策划、决策、整合、验证和 verdict authority，同时让 Agent-owned ready package默认真实派发。
- 让主 Agent在派发前看到 phase-relevant selector职责；description只有 RoleProfiles 一个权威来源。
- 使同步/异步结果都能被回收、检查、join和恢复，且 `returned != done`。
- 保持旧 OpenSpec checklist、task/hub lifecycle和四种权限模式兼容。

**Non-Goals**

- 不创建 `task/<task-id>`、`.aili/tasks`、informal promotion/supersession或第二任务数据库。
- 普通 Pi omitted-agent→`general`、顶层 default-async和既有task/hub字段语义不变；只为formal caller增加一个optional exact identity marker。
- 不新增 Agent selector、role prompt、spawn能力、工具、模型权限或 permission mode。
- 不做自动 child-context assembly、phase Session Entry、`/aili-work`、workboard/status-bar UI、scheduler或telemetry产品面。
- 不用固定 Agent调用数、自动review swarm或“必须至少调用一个Agent”作为完成条件。

## Decisions

### 1. One formal source of truth

唯一 v1 root是已通过 lifecycle identity gate精确解析的：

```text
openspec/changes/<change-id>/
├── tasks.md
└── progress.txt
```

`tasks.md`保存当前 package contract/state；`progress.txt`保存append-only bounded events；Agent Journal保存Agent/job/turn/runtime事实。Parser不得模糊扫描 change、创建ordinary task board或把三层事实合并成隐藏数据库。

Root和两个文件必须位于repository内且是普通路径；symlink、绝对路径、`.`/`..`、escape、collision或ambiguous change identity在任何写入前fail closed。

### 2. Ordinary Pi and active AILI lifecycle use different delegation precedence

- **Ordinary Pi:** 没有active IDEATE/DEFINE/BUILD/SHIP formal board时，保留现有trigger/benefit scan；主 Agent可以直接完成低风险、局部或负收益委派任务。
- **AILI lifecycle:** ROSE先建立/恢复formal board并给package分配Owner。对`Owner: agent:<selector>`，accepted package ownership本身形成dispatch obligation，不再由主 Agent临时用ordinary benefit gate改回direct。
- 并非所有lifecycle package都Agent-owned。材料决策、package分解、waiver、join/disposition、整合、最终diff检查、fresh verification和phase verdict必须ROSE-owned。
- 如果一个package混合ROSE-only decision与Agent execution，必须先拆包，不能把整个决策交给worker或让ROSE借决策名义完成全部execution。

### 3. Work-package Markdown contract

Board header固定为：

```markdown
- Protocol: `aili-task-board/v1`
- Task kind: `formal`
- Task identity: `<change-id>`
- Goal: `<bounded goal>`
- Phase: `IDEATE | DEFINE | BUILD | SHIP`
- Board status: `active | blocked | done | cancelled`
- Accepted contract: `<refs | pending>`
- Accepted verification: `<test-plan ref | pending>`
- Decision owner: `ROSE`
- Verification owner: `ROSE`
```

每个package恰有一条OpenSpec-compatible checkbox row：

```markdown
- [ ] B-01 — Locate recovery path
  - Status: `ready`
  - Owner: `agent:aili.code-scout`
  - Dispatch: `required`
  - Dispatch reason: `Broad bounded discovery belongs to code-scout.`
  - No-dispatch reason: `N/A`
  - Execution: `sync`
  - Join: `immediate`
  - Depends on: `none`
  - Scope: `...`
  - Forbidden scope: `...`
  - Expected result: `...`
  - Expected evidence: `...`
  - Acceptance: `...`
  - Runtime: `pending | direct | Agent/Job/Turn/Output/History refs`
  - Evidence: `pending | progress/artifact/test anchors`
  - ROSE disposition: `pending | accepted | partially-accepted | rejected | superseded | needs-follow-up`
  - Blocker: `none | ...`
  - Next action: `...`
```

所有字段必须恰好一次。`Expected evidence`是前置合同；`Evidence`是实际发生后的bounded anchors，二者不可互相替代。Runtime同时保存raw Agent/job/turn IDs以及实际存在的`agent://` output ref和`history://` ref，不把instance refs写入Owner。

### 4. Owner assignment is the execution architecture

ROSE在package进入ready前分类：

- `Owner: ROSE`：phase/change identity、分解、依赖、产品/架构/合同/权限/范围决策、waiver、join/disposition、整合、最终diff、fresh verification、verdict。
- `Owner: agent:<specialized-selector>`：有边界的侦察、研究、spec/test定位、独立实现、测试、browser/E2E evidence、security/coverage/silent-failure/review等材料执行。

ROSE Owner必须是`Dispatch: forbidden`、`Execution: direct`、`Join: N/A`。Agent Owner必须引用canonical Specialized selector；formal package不得省略selector或以`general`作为normal Owner。

一个ready Agent-owned package必须先调用exact `task.agent`，ROSE不得在等待期间重复同一scope。Worker不能扩大scope、改变phase、接受test plan、修改board/progress或发布最终verdict。

### 5. Waiver is pre-recorded exception, not an internal thought

`Dispatch: waived`仅在ROSE随后将执行同一package时使用，并必须在执行前记录具体`No-dispatch reason`、Evidence和`WAIVED` event。允许类别：

1. 用户已提供完整、可验证、bounded evidence，Agent不能增加证据；
2. selector当前不可用，但ROSE具有完成同一scope/forbidden scope/acceptance/evidence合同的等价合法工具和权限；
3. 有可陈述的具体wall-clock/context/operation成本证据，且派发不能增加材料证据。

以下不是direct waiver：依赖未满足、scope overlap需拆包、用户改变scope、package取消/替代、invalid selector、ROSE也缺少能力/权限、specialist-only capability不可用。这些情况保持pending、blocked、cancelled或返回DEFINE。若另一package的accepted Evidence精确覆盖当前scope，ROSE把重复package设为cancelled、disposition设为superseded并记录covering evidence，不执行direct work也不伪造waiver。不得事后补waiver，也不得静默fallback到`general`或另一selector。

### 6. Explicit sync/async and join rules

Formal Agent package必须显式声明：

- `Execution: sync`映射到`task.async:false`，`Join: immediate`。当下一决策/package需要其结果时必须使用。
- `Execution: async`映射到`task.async:true`，必须有stable `Join: J-...`；只允许输入独立、scope不重叠、当前可推进工作不依赖其结果的package。
- `Execution: direct`只用于ROSE Owner或valid waived Agent Owner。

Async dispatch后，ROSE可推进不依赖该join的工作，但不得重复worker scope。Join通过现有`hub wait/jobs/output/history`取得terminal state和可读证据；所有join members完成检查/disposition后，dependent package或phase gate才可ready/close。Runtime全局default async保持不变；formal lifecycle永远显式传值。

### 7. Seven states and deterministic runtime mapping

合法package status：

```text
pending | ready | running | returned | done | blocked | cancelled
```

主路径：

```text
Agent:  pending → ready → running → returned → done
Direct: pending → ready → running → done
```

规则：

- `pending → ready`：全部dependencies done、当前phase/operation/acceptance gate满足、Owner/Dispatch/Execution/Join可执行。
- `ready → running`：ROSE direct开始、valid waiver direct开始，或`task`接受exact Agent dispatch并记录refs。
- `running → returned`：Agent completed或partial，canonical structured result与required output/evidence refs可读。
- `running → done`：仅ROSE-owned或valid-waived direct package；ROSE完成direct work、记录actual Evidence与允许的disposition并运行该package所需fresh verification。
- `running → blocked`：worker明确blocked、runtime failed/interrupted/unexecuted、required output missing/stale/unreadable，或operation gate阻塞。
- `returned → done`：ROSE inspection已记录允许的disposition、actual Evidence支持Acceptance、accepted work已整合或残余已转入named package，并完成该package所需fresh verification。
- `returned → blocked`：rejected/needs-follow-up且当前package无法合法结束。
- `blocked → pending|ready`：blocker被显式解除，再按dependency/gate重新计算。
- `cancelled`与`done`终态不重开；新scope使用新ID。

Checkbox `[x]` iff Status=`done`。Agent job completed、worker写“done”、ROSE disposition或checkbox单独存在都不能建立done。

### 8. Disposition records what ROSE believed and used

`ROSE disposition`含义：

- `accepted`：结果及其claims/evidence被完整接受；
- `partially-accepted`：仅列明部分被接受，rejected/unverified residual已转入named package或明确accepted limitation；
- `rejected`：结果不可用于当前Acceptance，package通常blocked；
- `superseded`：另一个accepted package/evidence替代此结果，package走cancelled或允许的terminal处理；
- `needs-follow-up`：需要追加证据/修复，package blocked或新建dependent package；
- `pending`：尚未检查。

每次inspection必须列accepted claims、rejected claims、Unverified、evidence anchors和next action。Disposition不是worker输出字段，worker文本只能作为待检查证据。

### 9. Agent Catalog has one description authority and bounded phase views

Catalog从validated RoleProfiles生成selector、normalized one-line description、status和bounded capability/tool posture；不包含full prompt、hash body、provenance text、model secret或第二份selector-description映射。

Canonical lifecycle policy维护**推荐**phase shortlist，所有selector必须在catalog存在：

- IDEATE：`aili.code-scout`, `aili.doc-researcher`, `aili.web-researcher`, `aili.spec-miner`, `aili.agent-evaluator`。
- DEFINE：`aili.code-scout`, `aili.spec-miner`, `aili.plan-auditor`, `aili.test-coverage-reviewer`, `aili.security-auditor`。
- BUILD：`aili.implementer`, `aili.test-engineer`, `aili.browser-qa-runner`, `aili.e2e-artifact-runner`。
- SHIP：`aili.code-reviewer`, `aili.security-auditor`, `aili.silent-failure-reviewer`, `aili.test-coverage-reviewer`, `aili.pr-test-analyzer`, `aili.convergence-reviewer`。

Active lifecycle guidance foregrounds当前phase shortlist和board中nonterminal Agent Owners；其他matching Specialized selector仍可用，但package必须说明为何职责匹配。这样减少20选1负担而不建立新的description authority或hard permission allowlist。

Ordinary Pi仍可显示/使用`general` default。Formal lifecycle guidance明确：Agent-owned package必须显式Specialized selector，Runtime default general不能满足Owner合同。

### 10. Task metadata explains orchestration, not only API mechanics

`task` description/promptSnippet/promptGuidelines至少说明：

- ordinary Pi保留benefit-based direct path；
- active lifecycle中ROSE拥有decomposition/decision/integration/final verification；
- ready Agent-owned package先派发exact selector；
- formal package显式selector和async；
- prerequisite默认sync，async仅独立且必须join；
- asynchronous output/history在依赖前必须读取；
- direct exception必须pre-record waiver；
- worker不得做phase/verdict/board writes。

Metadata本身不改变normalization、default general/default async、task/hub identity或permission behavior。Round-3材料决定另行向`TASK_TOOL_SCHEMA`增加唯一optional `formalContext: { changeId }`字段；它不是metadata side effect，也不改变省略该字段的ordinary calls。Phase-specific shortlist主要由active lifecycle guidance/board projection提供，避免静态tool metadata把20个角色无差别作为当前候选。

### 11. Only ROSE writes board artifacts

Formal task item显式携带：

```json
{ "formalContext": { "changeId": "<exact-change-id>" } }
```

Runtime只从当前project root和该validated change ID解析`openspec/changes/<change-id>/{tasks.md,progress.txt}`；在Agent allocation前要求普通路径、same-root v1 pair和exact Task identity，不接受caller-supplied paths、不模糊扫描、不复制board正文。解析后的project-relative deny paths随workspace lease和persistent Agent lifecycle保存，供initial/revived turns复用。

Owning `tasks.md`/`progress.txt`必须进入Runtime-derived protected-path deny set，即使child writeScope为空、声明parent directory或使用shared/isolated workspace也不能写。`write`/`edit`通过workspace mutation guard在文件变化前deny。`bash`不能靠command字符串heuristic获得同等级claim：若process-owned permission sandbox可用，child bash operations必须在每次command的custom config中追加这两个exact `denyWrite`；若sandbox unavailable、disabled或当前mode不要求sandbox（包括YOLO），该formal child的`bash`从effective tools中fail closed移除。Ordinary task的bash、permission mode、sandbox profile和global defaults不变。

Worker只返回canonical result envelope：status、summary、evidence、changedFiles、verification、blockers、risks、confidence。

ROSE检查worker result后才更新state、Evidence、disposition、join和progress。保护只覆盖owning board files，不授予ROSE或worker其他写权限。它是formal task上的额外deny；不重配置permission modes，不把sandbox描述成通用OS隔离，也不保证sandbox unavailable时仍有bash。

### 12. Progress is append-only evidence, not a second board

Event block以RFC 3339 timestamp、subject、event type开头，后续bounded `key=value`。Board-level subject为`BOARD`；package event subject为stable package ID。v1 event types：

```text
BOARD_CREATED | READY | DISPATCHED | WAIVED | RETURNED | INSPECTED |
JOINED | DONE | BLOCKED | UNBLOCKED | CANCELLED | RECONCILED
```

Events只保存Owner、execution/join、Agent/job/turn/output/history refs、bounded evidence、disposition、blocker和next action，不复制完整board、raw transcript、secret、credential或长日志。`JOINED`按member package记录join ID和settled evidence；phase gate从所有members状态派生，不建立隐藏join数据库。

### 13. Resume reconciles without replay or false completion

恢复顺序：

1. 读取exact formal `tasks.md`；
2. 读取`progress.txt` bounded tail；
3. 对running/async join refs查询`hub jobs/output/history`；
4. completed/partial+readable→returned；blocked/failed/interrupted/unexecuted/missing→blocked；
5. 追加RECONCILED并由ROSE检查/disposition；
6. 重新计算join和ready packages。

恢复不得自动redispatch、replay、fallback selector、accept result、勾checkbox或推进phase。Terminal done/cancelled不因stale/released Agent ref反转；evidence gap显式报告。

### 14. Phase gates consume the evidence graph

Phase gate不要求固定Agent数，但必须满足：

1. accepted package queue中的非取消package均done；若存在明确blocking gate，phase只能产生blocked verdict，不能标记complete；
2. Agent-owned packages都有exact dispatch refs或valid pre-recorded waiver；
3. 没有未检查returned result；
4. required joins全部closed且有inspection/disposition；
5. ROSE完成phase-appropriate artifact/changed-scope inspection；
6. 支持当前claim的最小fresh verification已运行；
7. material delta已返回DEFINE，残余Unverified已命名；
8. DEFINE的final test-plan仍由用户明确接受，任何operation gate仍独立。

调用Agent但不读取结果、ROSE重复做同scope、terminal job count、worker PASS或固定dispatch quota都不满足gate。

### 15. Legacy and ownership boundaries

没有`Protocol: aili-task-board/v1`的OpenSpec `tasks.md`分类为`legacy/unmanaged`，不报v1 PASS也不自动修复。显式升级只针对一个exact change，在原位保留可表示的ID/checkmarks/history并追加BOARD_CREATED/migration evidence；不得全仓迁移。

`aili-workflows`拥有ordinary-vs-lifecycle precedence、phase routing、package/task-board/result semantics；`aili-pi`拥有pinned snapshot/lock、Pi metadata/catalog projection、parser/validator、protected-path guard、Journal reconciliation、docs和consumer tests。任何cross-repo write和snapshot更新另行批准。

任务板、Owner、Agent Catalog或active YOLO都不授予网络、外部写、dependency/lockfile、Git、credential、publish、release或phase acceptance权限。

### 16. One exact bootstrap bridge is honest reconciliation, not a second Runtime default

Persistent v1 boards continue to require raw Agent/job/turn identities plus `agent://` output and `history://` history refs. That form remains the default and only normal Runtime contract.

本 change 的 active board在validator实现前已由外部Task runner启动；该runner只暴露真实`agent://ses_*` session ref，无法提供可验证raw job/turn/history，也无法在同步call返回前把session ref写入board。为避免伪造ID、重写append-only历史或把当前board豁免成假PASS，允许一个**exact change-bound、用户明确接受、默认关闭**的bootstrap bridge：

```text
external=agent://<session-ref>; transport=external-task-session/v1; unavailable=job,turn,history
```

Bridge必须满足：

1. caller显式提供exact task identity和当前user-decision ref；默认validator/root/updater不自动启用；
2. `BOARD RECONCILED`绑定identity、transport、decision和`strict_default=preserved`；
3. 历史package只追加`RECONCILED`补充真实external ref、inspection/verification anchors和accepted limitation，不修改旧事件；
4. 同一bootstrap build后续package可在external call返回后原子记录observed dispatch/return/inspection/done bundle，但必须标记`dispatch_timing=unverified-before-return`，不得宣称已证明pre-dispatch ref持久化；
5. unavailable字段必须精确列出，不得生成synthetic job/turn/history；bridge Evidence不能授予permission、acceptance或operation authority；
6. exact opt-in之外，external form和post-return bundle均fail closed；persistent Runtime、ordinary defaults和七状态正常路径不变。

该桥接是当前bootstrap evidence的bounded accepted limitation，不是第二个task/hub lifecycle、公共Task schema或通用外部adapter。Package 2.3a先实现strict-default negatives、one-change reconciliation、append-only prefix和no-fabrication fixtures，再恢复BUILD。

## Risks / Trade-offs

- **[Risk] 为提高dispatch率而制造形式Agent calls。** → Gate验证evidence usage、join、disposition和no-duplicate-scope，不验证调用次数。
- **[Risk] 主Agent退化成无判断dispatcher。** → ROSE-only职责和final inspection/verification是hard gate。
- **[Risk] phase shortlist成为第二份role authority。** → 只维护phase→selector routing，description始终从RoleProfiles生成，并测试所有selector存在。
- **[Risk] async Agent无人回收。** → async必须named join；dependent/phase gate在join+inspection前阻塞。
- **[Risk] broad waiver恢复“直接做默认”。** → 只允许pre-recorded closed classes，post-hoc/空泛理由fail closed。
- **[Risk] worker自报completed制造done。** → readable result最多returned；Evidence+ROSE disposition+verification才done。
- **[Risk] formal board增加Markdown维护成本。** → 只在OpenSpec lifecycle使用，不影响ordinary Pi，不增加informal板/UI/database。
- **[Risk] forged formalContext造成错误保护或board选择。** → caller只提供changeId；Runtime在allocation前验证exact same-root v1 identity，拒绝paths、legacy、symlink、mismatch和fuzzy fallback。
- **[Trade-off] exact sandbox deny不可用时formal child失去bash。** → fail closed优先于不可证明的immutable claim；ordinary/非formal child保持当前mode行为，ROSE把需要bash的formal package标blocked而不静默降级。
- **[Trade-off] Runtime defaults不改变。** → lifecycle显式传selector/async，保留ordinary compatibility，但需要orchestration adapter/validator执行上下文规则。

## Migration Plan

1. 在canonical `aili-workflows`中增加formal task-board与lifecycle Agent-orchestration protocol，修改direct/delegated、phase prompts、package/task/result contracts；cross-repo另行批准。
2. 同步exact snapshot/lock；在`aili-pi`加入formal parser/validator、catalog/phase view、task metadata guidance和protected board paths。
3. 接入exact selector dispatch、explicit sync/async join、progress events和Agent Journal reconciliation；新增optional formalContext identity field，但不改变task/hub public defaults。
4. 保留legacy checklists；只提供exact one-change opt-in upgrade。
5. 加入ordinary Pi regression、四phase ownership/dispatch、waiver/join/evidence/disposition/recovery/permission focused tests。
6. 更新文档说明ordinary与AILI lifecycle边界。Rollback移除adapter/projection/validator并恢复上一pinned snapshot；保留人类可读formal boards，不删除用户文件。

## Open Questions

无未关闭的材料产品/架构问题。Cross-repository attachment/write、snapshot/lock、implementation locality、dependency/Git/publish/release是独立operation gates。Regenerated final `test-plan.md`仍需用户明确接受，接受前BUILD readiness为`BLOCKED`。
