# 测试文档：replace-subagent-runtime-with-persistent-agent-framework

## 0. 文档元信息

- 来源：`proposal.md`、`interview.md` D-001–D-014、`design.md`、`specs/persistent-agent-orchestration/spec.md`、`specs/subagent-model-selection/spec.md`、official Pi SDK/Extension/Session 文档与 pinned OMP `17.1.3` revision `59619623e1eeb7c290649eeaf3a269284ce8adef`。
- 生成时间：2026-07-25。
- 适用范围：当前未实现的 OpenSpec change `replace-subagent-runtime-with-persistent-agent-framework`。
- 状态：`release worktree / provider, positive child sandbox, and disposable external-workspace probes passed / 0.1.10 release authorized`。
- 当前授权：用户于 2026-07-25 接受最终测试计划及 repository-local BUILD，随后精确批准 dependency/lockfile public migration，并批准将用户级 Pi 包替换为当前工作区、刷新后执行运行时验证。真实 provider 的无工具 sync/follow-up/async probes、Bubblewrap child Bash及一次性OS临时目录中的external workspace/Git lifecycle已完成；用户已授权release-only worktree、`0.1.10`、commit、push `origin/main`与npm publish。OMP 源码复制或实质改写、`aili-workflows` 写入、force-push/history rewrite及AILI Compact发布仍未授权。

## 1. 被测对象、目标与边界

### 1.1 被测对象

- AILI-owned `task`/`hub` public tool contract。
- 20 个 bundled Agent selectors、profile v2、prompt/tool/spawn/model policy。
- Parent-scoped official Pi child Session JSONL、coordinator journal、registry/lifecycle、park/revive、crash recovery。
- Async/sync/batch、32-way FIFO scheduler、nested sync、job/cancel/result delivery。
- Running aside、idle wake、parked revive、durable mailbox、wait/inbox。
- Parent UI approval bridge、credential guard、project trust 和 active-tool ceiling。
- Conflict-aware shared/isolated workspace、writeScope/resource leases、patch/branch evidence。
- One-shot/instance/project/global/profile/parent model precedence及受确认持久写入。
- OMP-style raw output/result preview/history layering、parent ownership、fork/delete/retention。
- Legacy runtime removal、旧 runs 非破坏性保留、provenance/doctor/package/release gates。

### 1.2 必须支持的接受 claim

- 正常 Agent task 可创建稳定、可通信、可 park/revive 的官方 Pi child Session，而不是一次性 run archive。
- Parent 重启后能安全重建 registry、mailbox 和 pending result；不会自动重放可能已有副作用的 task，也不会重复注入 completion。
- Async Agent 可与 parent/其他 top-level Agent 并行且最多 32 active turns；nested child 不产生后台递归爆炸。
- General/specialized tools和权限只能缩窄；后台 ask 返回 parent UI，无 UI/凭据路径 fail closed。
- 单次模型覆盖只影响一个 turn；持久覆盖按固定优先级、作用域、trust和逐次确认执行。
- 共享 workspace 仅在已知冲突时自动隔离；未声明 bash 副作用不被虚假宣传为完全检测。
- Full raw output/history可审计，context-facing preview有界且明确标记；child历史不因 cancel/release/preview cap静默删除。
- Stable release不能在 host seam、provenance、权限、persistence或live evidence缺失时 false PASS。

### 1.3 明确不支持的结论

- 本地 fake-model/session tests不证明真实 provider、OAuth/API key、网络、Bubblewrap或外部 workspace可用。
- Worktree isolation不等于 OS sandbox，也不保护受信任进程的所有副作用。
- `writeScope`与 file-tool guard不证明任意 Bash/外部进程无冲突。
- Q-022 的 unlimited turn不表示退出 Pi 后daemon继续运行。
- Strict OpenSpec PASS不授权 BUILD、dependency install、commit、publish或release。

## 2. Pre-BUILD host seam gates

以下 gate 必须先以 disposable HOME、temporary repository和 fake model完成；失败即返回 DEFINE，不能在实现中私下改弱合同。

| Gate | 要证明的接口 | 最小证据 | 失败处理 |
|---|---|---|---|
| HOST-1 Persistent Session | exact official Pi `SessionManager.create/open()` 可在 parent sidecar创建、关闭、重开 child JSONL | 无 provider调用的 create/open/append/replay fixture；single writer | 回 DEFINE；不得退回 `--no-session` run |
| HOST-2 Resource/tool cloning | public SDK可从 trusted parent state重建active custom tools并过滤top-level coordinator | built-in + AILI + fake extension tool intersection fixture | 回 DEFINE或收窄accepted contract；不得假 full inheritance |
| HOST-3 Approval bridge | child-only policy可暂停job并调用parent UI，覆盖file/bash/network/custom asks | allow/deny/no-UI/shutdown fake UI matrix | 回 DEFINE；不得用 child yolo 规避 |
| HOST-4 Parent sidecar lifecycle | exact Pi host对fork/delete/archive的可观察 seam和gap | temporary session selector/lifecycle fixture；bytes before/after | 记录host gap并仅验收AILI path；不monkey patch Pi |
| HOST-5 Isolation | minimal Git adapter可处理clean/dirty baseline、patch、cleanup | disposable Git repo/worktree fixture | 冲突任务fail closed；不shared fallback |
| HOST-6 Version alignment | 所有 imported SDK symbols与selected Pi pin一致 | typecheck + revision manifest + runtime import smoke | 同步`support-pi-0-82-0`后再继续 |

## 3. 需求 / 决策 / 风险追踪

| ID | 需求 / 决策 | 来源 | 主要任务 | 计划文件 / Fixture | 关键断言 | 状态 |
|---|---|---|---|---|---|---|
| ORCH-01 | 只暴露 `task`/`hub`，移除 `subagent` alias | orchestration Req 1；D-001 | 5.1, 6.1, 11.3 | tool-discovery unit/integration | `task`,`hub` present；`subagent` absent；无 legacy run | OFFLINE PASS：public switch complete |
| ORCH-02 | 19 `aili.*` + `general`；专用 prompt不被general覆盖 | Req 2, 8；D-001, D-004, D-006 | 2.1–2.5, 4.1, 4.4 | role manifest/golden fixtures | exactly 20 selectors；role hashes/output semantics保留 | OFFLINE PASS |
| ORCH-03 | stable ID、重复name suffix、hub-only follow-up | Req 3；D-001, D-010 | 3.1, 5.2, 6.1 | ID/collision/resume fixtures | no overwrite；same name creates `-2` | OFFLINE PASS |
| ORCH-04 | parent-scoped official Pi child JSONL与journal replay | Req 4；D-001 | 1.3, 3.1–3.4 | disposable session tree | exact path persisted；resume no model call | OFFLINE PASS（HOST-1） |
| ORCH-05 | lifecycle/TTL/park/revive/aborted | Req 5；D-001, D-008 | 3.4–3.6 | fake clock/session fixture | 420000ms park；`<=0` disables timer；aborted no revive | OFFLINE PASS |
| ORCH-06 | crash/exit interrupted、queued unexecuted、no replay | Req 6；D-012, D-013 | 3.5 | fault-injection fixture | 0 repeated provider/tool side effects | OFFLINE PASS |
| ORCH-07 | no parent conversation copy | Req 7；D-010 | 4.1 | parent/child JSONL fixture | unrelated marker absent；explicit context present | OFFLINE PASS |
| ORCH-08 | profile hot reload与shadow trust | Req 8–9；D-005, D-006 | 2.4–2.5, 4.4 | v1→v2/invalid/untrusted fixtures | next turn new hash；in-flight old；invalid fail closed | OFFLINE PASS |
| ORCH-09 | tool intersection与unavailable reporting | Req 10；D-002 | 1.4, 4.2–4.3 | active-tool capability matrix | no parent/role expansion；missing tool explicit | OFFLINE PASS（HOST-2） |
| ORCH-10 | explicit spawns、depth 2/cap 4、nested sync | Req 11；D-008, D-013 | 4.5 | nested fake Agent fixture | no self/unlimited；no nested async fan-out | OFFLINE PASS |
| ORCH-11 | async default、sync option、32 FIFO、unlimited turn | Req 12；D-011, D-012 | 5.3–5.5 | controllable deferred model | exactly 32 active；FIFO；>200 requests not AILI-aborted | OFFLINE PASS |
| ORCH-12 | durable exactly-once completion | Req 13；D-012 | 7.1–7.2 | crash-point delivery fixture | parent contains one delivery ID after every crash point | OFFLINE PASS |
| ORCH-13 | running aside/idle wake/parked revive/single writer | Req 14；D-008 | 6.2 | step-boundary session fixture | current step not interrupted；no concurrent turn | OFFLINE PASS |
| ORCH-14 | durable mailbox cap100/reject-new | Req 15；D-011, D-012 | 6.3 | restart/overflow fixture | no double delivery；existing100 preserved；101 fails | OFFLINE PASS |
| ORCH-15 | cancel/release preserves transcript | Req 16；D-010, D-014 | 6.4, 7.5 | running/idle/cross-parent matrix | running terminal；idle unregistered；history readable | OFFLINE PASS |
| AUTH-01 | background ask routes parent UI；no UI fail closed | Req 17；D-013 | 1.5, 8.1–8.5 | fake UI/AbortSignal matrix | per-job pause；no yolo；no hang | OFFLINE PASS（HOST-3；real UI unverified） |
| AUTH-02 | credential hard denial/no leak | Req 17；accepted safety boundary | 8.4 | seeded fake HOME + artifact scan | protected content absent from every channel | OFFLINE PASS |
| WORK-01 | conflict-aware scopes/shared default/isolated overlap | Req 18；D-013, D-014 | 1.7, 9.1–9.5 | disposable Git/resource lease fixtures | disjoint shared；overlap isolated；unavailable fails | OFFLINE PASS（HOST-5；real workspace unverified） |
| OUT-01 | raw `.md` + JSONL，500000B/5000L result，5000-char preview | Req 19；D-014 | 7.1, 7.3–7.4 | large output fixture | preview marks truncation；raw bytes intact | OFFLINE PASS |
| OWN-01 | fork empty、no individual delete、parent cascade/gap | Req 20；D-009, D-014 | 1.6, 7.5 | fork/delete/temp session fixture | no copied registry；release retains；gap visible | OFFLINE PASS with documented HOST-4 gap |
| MIG-01 | old runs/config non-destructive | Req 21 | 11.3–11.4 | seeded legacy layout | byte hashes unchanged；not rehydrated | OFFLINE PASS；legacy dependency/runtime removed without data conversion |
| PROV-01 | OMP copied/adapted code revision/license evidence | Req 22 | 11.2, 11.5 | provenance/NOTICE/SBOM validator | missing symbol evidence rejects release | PASS：reference-only/no-copy branch；copy branch not exercised |
| MODEL-01 | fixed six-layer precedence | model Req 1 | 10.1, 12.6 | table-driven fake ModelRuntime | every layer wins only in order | OFFLINE PASS |
| MODEL-02 | one-shot non-pollution and per-item batch model | model Req 2 | 10.2 | config byte snapshots | exactly one turn affected；0 config diff | OFFLINE PASS |
| MODEL-03 | instance persistence and role scopes/trust | model Req 3–4 | 10.3 | restart/trust fixtures | exact instance only；project > global only trusted | OFFLINE PASS |
| MODEL-04 | fresh confirmation for every Agent config write | model Req 5 | 10.4 | fake UI/write failure fixtures | each request prompts；deny/noUI bytes identical | OFFLINE PASS |
| MODEL-05 | atomic scope-preserving config | model Req 6 | 10.3–10.4 | lock/read-only/malformed fixtures | unrelated content preserved；no partial write | OFFLINE PASS |
| MODEL-06 | explicit unusable model fails without fallback | model Req 7 | 10.5 | fake registry/auth/thinking matrix | 0 lower-layer provider calls | OFFLINE PASS |
| MODEL-07 | per-turn recompute and audit/redaction | model Req 8–9 | 4.4, 10.6 | idle/running/revive fixtures | in-flight stable；next turn new；no secret metadata | OFFLINE PASS |
| EVID-01 | stable verification cannot false PASS | model Req 10；orchestration Req 22 | 11.5, 12.8, 14.1–14.3 | doctor/release negative fixtures | unverified seam/provenance/live row stays non-pass | PASS：doctor/release保持NON_PASS |

## 4. 选定验证接口

以下命令是验收接口；focused test files在BUILD中按repository placement规则创建后生效。

| Claim | 命令 / 检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| Schema、ID、profile、model、journal纯逻辑 | `npx vitest run tests/unit/agent-*.test.ts tests/unit/model-selection.test.ts tests/unit/role*.test.ts` | 无provider、可精确覆盖边界与负向矩阵 | 不证明Pi SDK integration |
| Persistent session/lifecycle/task/hub | `npx vitest run tests/integration/persistent-agent*.test.ts tests/integration/task-hub*.test.ts` | disposable sessionDir + fake ModelRuntime覆盖JSONL和工具合同 | 不证明真实provider/auth |
| Permission bridge/credential | `npx vitest run tests/integration/agent-permission*.test.ts` | fake UI、seeded fake HOME、artifact scan可重复 | 不证明OS sandbox containment |
| Workspace conflict/isolation | `npx vitest run tests/integration/agent-workspace*.test.ts` | disposable Git repo覆盖clean/dirty/conflict/cleanup | 不证明所有filesystem/Bash副作用可检测 |
| Parent lifecycle/output/retention | `npx vitest run tests/integration/agent-parent-lifecycle*.test.ts tests/integration/agent-output*.test.ts` | 直接检查fork/delete/restart/large artifact bytes | host无hook时不能证明built-in Ctrl+D即时cascade |
| Type与完整回归 | `npm run typecheck`；`npm test` | 覆盖项目编译与全测试 | 不替代live provider evidence |
| Generated/package/doctor | `npm run validate:generated`；`npm run validate:package`；存在后运行updated doctor/release validator | 验证profiles、manifest、tarball、false PASS gates | 不授权publish |
| OpenSpec | `openspec validate replace-subagent-runtime-with-persistent-agent-framework --strict --no-interactive` | 解析全部delta requirements/scenarios | 不证明实现完成 |
| Package边界 | `npm pack --dry-run --json`；检查tarball file list | 防遗漏runtime/profile/license及泄漏fixtures | 不授权install/publish |
| Diff卫生 | `git diff --check`；scoped `git diff -- package.json package-lock.json ...` | 检查文本问题与未授权surface | 不证明无外部副作用，需fixture/状态检查 |
| 真实provider/sandbox/HOME/external workspace | 仅在单独exact approval后运行命名live test；命令由实现后的manifest固定 | 验证真实环境 seam | 未授权时保持unverified，不得用offline替代 |

## 5. 核心场景矩阵

### 5.1 Identity、session与恢复

| ID | 条件 | 预期 |
|---|---|---|
| LIFE-01 | 创建`general`且省略name | 返回可读unique Agent ID；child JSONL和registry先落盘 |
| LIFE-02 | 两次name=`Scout` | `Scout`,`Scout-2`；文件不覆盖 |
| LIFE-03 | parent resume | registry重建；0 provider calls；parked refs可见 |
| LIFE-04 | idle 420000ms | live session dispose；state parked；JSONL保留 |
| LIFE-05 | TTL=0 | timer不park；process shutdown仍dispose/interrupted |
| LIFE-06 | crash写坏final journal line | warning +忽略final partial；其前state恢复 |
| LIFE-07 | middle journal corruption | orchestration fail closed；不造成功state |
| LIFE-08 | running crash | turn interrupted；Agent parked；0 replay |
| LIFE-09 | queued crash | job unexecuted；0 replay |
| LIFE-10 | interrupted Agent收到hub send | same transcript新turn，包含interruption说明 |

### 5.2 Async、jobs与delivery

| ID | 条件 | 预期 |
|---|---|---|
| ASYNC-01 | non-blocking task省略async | 立即返回Agent/job；parent继续 |
| ASYNC-02 | async=false | 等待并直接返回；无async duplicate message |
| ASYNC-03 | blocking role + async=true | role强制sync并报告effective mode |
| ASYNC-04 | 33 tasks同时提交 | 32 running，1 FIFO queued；permit后按序启动 |
| ASYNC-05 | child派生grandchild | nested call sync；共享ancestor permit/depth |
| ASYNC-06 | >200 requests/长wall-clock | 不因AILI budget停止；manual cancel仍有效 |
| ASYNC-07 | parent关闭时child完成 | durable pending；resume后one message |
| ASYNC-08 | crash after parent append before ack | scan deliveryId；不重复注入 |
| ASYNC-09 | running cancel | child abort；Agent terminal；partial transcript readable |
| ASYNC-10 | queued cancel | cancelled-before-start；0 child session/model call或明确空session policy |

### 5.3 Messaging与mailbox

| ID | 条件 | 预期 |
|---|---|---|
| MSG-01 | running recipient | current tool step完成后steer；不interrupt |
| MSG-02 | idle recipient | exactly one new turn |
| MSG-03 | parked recipient | revive then one new turn |
| MSG-04 | live hand-off success | mailbox unread不增加 |
| MSG-05 | dispose race hand-off throws | durable buffered + failed-but-buffered receipt |
| MSG-06 | restart | pending mailbox恢复且可drain |
| MSG-07 | 100满后第101条 | 第101拒绝；前100不变；sender看到overflow |
| MSG-08 | permanent revive failure | failed；不buffer假待办 |
| MSG-09 | cross-parent target | not-found/unauthorized；无state disclosure/mutation |

### 5.4 Prompt、tools、permissions

| ID | 条件 | 预期 |
|---|---|---|
| POL-01 | specialized role selected | full specialized prompt；general prompt absent |
| POL-02 | v1→v2 idle | next turn v2 hash；old turn v1 hash |
| POL-03 | invalid v2 | pre-model fail closed；不回退v1 |
| POL-04 | parent tool disabled | child无该tool |
| POL-05 | read-only role + parent write | child无write |
| POL-06 | general + new parent active capability | 可load时自动进入交集；不可load时显式unavailable |
| POL-07 | background ask approved | only target job resumes |
| POL-08 | background ask denied/noUI/shutdown | tool fails；job不hang；mode不变 |
| POL-09 | credential path in file/bash/custom | pre-approval hard deny；所有artifact无secret marker |
| POL-10 | untrusted project profile/config | ignored + diagnostic；不执行内容 |

### 5.5 Workspace冲突与隔离

| ID | 条件 | 预期 |
|---|---|---|
| WS-01 | disjoint declared files | shared workspace并行 |
| WS-02 | same file overlap | auto isolated或isolation unavailable pre-write fail |
| WS-03 | different file但same git-index/generated-dir/port/db | resource overlap触发isolation |
| WS-04 | no writeScope | default shared + best-effort state；不宣称安全检测 |
| WS-05 | runtime第二次observable conflict | second mutation blocked；提示isolated retry；不迁移partial Agent |
| WS-06 | explicit shared |不扩大权限；detected hard conflict仍不得silent overwrite |
| WS-07 | explicit isolated dirty repo | baseline投影，result patch/branch，不auto merge |
| WS-08 | cleanup后follow-up | history可读；execution因workspace不存在fail |
| WS-09 | non-Git isolation | actionable failure；不shared fallback |

### 5.6 Model precedence与配置

| ID | 条件 | 预期 |
|---|---|---|
| MOD-01 | 全层存在 | one-shot wins |
| MOD-02 | 无one-shot，有instance | exact instance wins；同role另一instance不继承 |
| MOD-03 | trusted project + global | project wins |
| MOD-04 | untrusted project + global | project ignored；global wins |
| MOD-05 | only profile | profile wins |
| MOD-06 | no override | parent fallback |
| MOD-07 | one-shot后hub follow-up | 正常re-resolve；one-shot不sticky；config byte-identical |
| MOD-08 | Agent请求永久write两次 | 两次独立prompt；一次批准不覆盖下一次 |
| MOD-09 | noUI/deny/write lock failure | bytes和in-memory effective state均不变 |
| MOD-10 | explicit model unknown/noauth | pre-turn fail；不fall through |
| MOD-11 | config changes while running | active turn旧model；next turn新model |
| MOD-12 | metadata scan | provider/model/layer可见；API key/token marker不存在 |

### 5.7 Output、fork与retention

| ID | 条件 | 预期 |
|---|---|---|
| OUT-01 | small output | no truncation；raw/ref/history一致 |
| OUT-02 | >500000B or >5000L | SingleResult tail+truncated；`.md` full bytes |
| OUT-03 | >5000-char completion | parent preview truncated+ref；raw完整 |
| OUT-04 | released Agent | disk fallback history/output；不revive |
| OWN-01 | parent fork | new registry empty；old artifacts不copy/share |
| OWN-02 | copied text含old ref | no control/ownership；resolver按documented scope处理 |
| OWN-03 | cancel/release single Agent | transcript/artifacts保留 |
| OWN-04 | confirmed AILI parent delete | sidecar cascade/trash；无silent orphan |
| OWN-05 | built-in Pi delete无hook | doctor显示gap；reconciliation可审计；不claim immediate parity |
| OWN-06 | legacy `.pi/agent/runs` seeded | byte hashes不变；不显示为new Agent |

## 6. Fault injection与silent-failure checks

| Fault | Injection | 必须观察 |
|---|---|---|
| Journal append crash | 在event write/fsync边界kill | partial final line诊断；无伪completed |
| Child JSONL open failure | permission/ENOENT fixture | revive failed visible；no mailbox inflation |
| Parent delivery crash | 每个pending/send/ack边界kill | parent最多一条delivery ID；hub仍可query |
| Approval bridge loss | resolve前shutdown parent | deny/abort；promise settle；0 tool side effect |
| Config atomic rename failure | fake storage throw | old bytes完整；effective state不更新 |
| Output artifact write failure | read-onlyartifact dir | job不能把missing full output报告为完整成功 |
| Isolation cleanup failure | locked worktree/fake git error | patch/workspace path retained for diagnosis；no false cleaned |
| Semaphore cancellation race | cancel queued while permit releases | job只启动或取消一次；无ghost Agent |
| Mailbox overflow race | concurrent sends at cap | deterministic 100 retained；每个reject有receipt |
| Profile hash drift | source/profile mismatch | next turn pre-model fail；doctor non-pass |
| Missing OMP provenance | remove symbol record | stable validator fails |
| Missing live evidence | omit authorized probe result | release remains unverified/non-pass，不由unit PASS代替 |

## 7. Test data与artifact placement

- Unit tests：`tests/unit/`。
- Integration/SDK/tool contract tests：`tests/integration/`。
- Disposable HOME、parent/child Session JSONL、journal corruption、fake UI/model、Git workspace fixtures：`tests/fixtures/`。
- Stable human/JSON golden output（仅必要时）：`tests/fixtures/snapshots/`。
- Durable reports：`artifacts/test-results/persistent-agent-framework/`，不得含真实 credential/provider response。
- Temporary run output：repository-local ignored `.tmp/`，测试后只清理task-owned目录。
- 不在repository root创建测试/报告；不写真实 `~/.pi/agent`，除非获得单独exact approval。

## 8. Open Questions / Unverified

| 类型 | 内容 | 对验收的影响 | 处理 |
|---|---|---|---|
| Blocker | parent active custom tools能否用official public SDK安全重建 | 阻塞general full active-tool claim | HOST-2 prototype；失败回DEFINE |
| Blocker | parent UI approval bridge能否覆盖所有ask surface | 阻塞async mutation readiness | HOST-3 prototype；不允许yolo替代 |
| Host gap | built-in Pi session delete是否sidecar-aware | 可能阻塞immediate cascade claim | HOST-4；doctor显式降级/AILI path |
| Unverified | dirty baseline isolation adapter | 阻塞conflicting-write auto-isolate | HOST-5 disposable Git prototype |
| Unverified | exact Pi 0.81.1 vs 0.82.0 host baseline | 阻塞SDK/provenance绑定 | task 1.2与受影响change对齐 |
| Separately gated | OMP symbol copy/adaptation | 阻塞对应copied implementation | exact approval + NOTICE/SBOM/provenance |
| Passed | dependency/lockfile removal | legacy runtime已移除，public surface仅`task`/`hub` | exact approval后完成 |
| Passed | real provider/auth no-tool turns | sync、same-Agent follow-up、async/wait/delivery均通过 | 脱敏证据位于`artifacts/test-results/persistent-agent-framework/` |
| Passed | external workspace/Git lifecycle | disposable repo的dirty projection、worktree/branch、patch、main不变、cleanup/no-revive通过 | `AILI_RUN_EXTERNAL_GIT_LIVE=1` |
| Passed | positive child sandbox execution | child复用parent-initialized SandboxManager；in-scope写成功，越界写与denyRead失败；不可用仍fail closed | `AILI_RUN_CHILD_SANDBOX_LIVE=1` |
| Cross-repo | `aili-workflows` fresh/single-use规则冲突 | 阻塞canonical workflow一致性 | 先packet，写入另行批准 |

## 9. Final acceptance gate

- [x] 用户于 2026-07-25 明确接受本最终 `test-plan.md` 并授权 repository-local BUILD。
- [x] 用户已单独批准 dependency/lockfile mutation，task 11.3及public migration已完成。
- [x] 用户已批准用户级本地工作区安装与刷新后的真实provider无工具运行时验证；sync/follow-up/async evidence已持久化。
- [ ] 用户单独批准具体 OMP code-copy/adaptation symbols 后，才可复制或实质改写对应源码。
- [x] 用户已批准并完成仅限disposable OS临时仓库的external workspace/Git lifecycle验证；当前仓库HEAD/index/history未被写入。
- [x] 用户已批准release-only worktree中的positive child sandbox接入、版本`0.1.10`、任务专属commit、push `origin/main`与npm publish。

Repository-local BUILD、public migration、provider runtime、positive child sandbox和external Git lifecycle probes已完成。AILI Compact未进入此release worktree或MIT tarball；其单独许可证门禁不被本次release重解释。
