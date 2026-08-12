# 最终候选测试计划：converge-pi-runtime-mcp-memory-and-context

## 0. 文档状态与门禁

- **阶段**：BUILD。
- **状态**：用户于 2026-08-12 明确接受修订最终测试计划（`ACCEPTED_CODEX_REMOTE_V2_REVISION`）。
- **BUILD 授权**：用户于 2026-08-12 明确授权开始 BUILD，并要求实现 Specialized Agent 使用 `gpt-5.6-terra` 与最高思考等级；最终检验可使用 terra，或最高 high 思考等级的 sol。同日用户明确接受 `rose-aili@0.4.7` 的完整 20-Agent 公开 catalog，包括新增只读 `aili.solution-architect`；这不是 adapter 排除项。依赖/lockfile、许可证、用户配置、Palace、安装、网络、Git、发布或 release 变更仍须分别取得独立精确授权。
- **本次行为**：仅依据 `proposal.md`、`design.md`、`tasks.md`、`context.md`、`interview.md` 与 `specs/**/*.md` 编写计划；**未运行任何测试或验证命令**。
- **执行原则**：自动化检查只能在后续 BUILD 获得授权后运行；每个 live probe 还须取得对应的独立 operation approval。任何 PASS 都不自动接受本计划、不授权下一阶段、不授权发布。

## 1. 测试目标与证据分类

### 1.1 目标

1. 证明 Workflow runtime bundle 是唯一语义来源，完整暴露 20 个 canonical Specialized Agents（含只读 `aili.solution-architect`），并在版本、schema、provenance、cross-file identity 或 selector inventory 漂移时 fail closed。
2. 证明 Parent 与至少两个 persistent Worker 共享配置路径但使用独立 MCP adapter/runtime，且所有 MCP origin 都受权限交集约束。
3. 证明 MemPalace/MCP 是唯一 durable memory，Palace/Wing/shared/diary 映射确定，无 SQLite、mirror、mining 或第二 store fallback。
4. 证明 `task`/`hub` 的 preflight、identity、model、renderer、delivery/audit 状态一致且脱敏。
5. 证明 Pi 原生 theme/working/thinking 独占 UI，AILI 仅通过官方 API 提供低频、可释放、窄宽度可降级 footer。
6. 证明完整 `billion-context-pi` 与 exact `pi-codex-compact` package/source identity、功能边界、tests/docs/licenses/attribution 被保留，并按 provider 对每个 turn 选择唯一 owner；同时 algal 与 AILI Compact 完全退出 production，ACP 非正式 delegation 边界保持明确。
7. 证明完整 `@narumitw/pi-retry@0.31.0` 分类/watchdog/status 行为在 Pi 0.84.1 上工作，Pi 仍是唯一 retry loop，错误原因、分类、重试决定和终态可解释且脱敏。
8. 证明官方 Pi core/AI/coding-agent/TUI baseline 全部统一到 exact `0.84.1`，没有仅改 peer range 而未验证 seam 的假兼容。
9. 证明 MIT 主许可证、第三方许可证、provenance、SBOM、notices 和真实 tarball inventory 一致。
10. 证明 Linux disposable HOME 的 clean install 与从当前发布基线 upgrade 保留拒绝迁移和 legacy 配置，并如实报告外部前置条件。

### 1.2 三类证据

| 类别 | 含义 | 可支持的结论 | 不可替代的证据 |
|---|---|---|---|
| **A — 自动化** | unit/integration、fixture、typecheck、generated/package/tarball 检查；默认使用 fake adapter/server/provider 和 disposable 路径 | 确定性逻辑、失败语义、资源释放调用、package inclusion/exclusion、静态所有权 | 真实凭据、真实 MCP server/process/browser/model、真实 provider、真实 TUI |
| **L — operation-gated live probe** | 必须逐项获批的安装、外部配置、Palace、provider、terminal probe | 固定版本在批准环境中的实际兼容性与有限 smoke 结果 | 不证明所有服务器、provider、终端、并发和网络环境普遍可靠 |
| **N — 测试不可证明的限制** | 产品/授权/主观或开放世界边界 | 只能以文档、所有权记录或明确限制陈述 | 用户授权、法律上的最终 relicense 权利、UI 主观性能、无穷外部副作用、正式 acceptance/release readiness |

## 2. 计划中的测试文件与 fixture

测试文件名是后续 BUILD 的目标；实现时若仓库模块边界要求改名，必须在 `progress.txt` 记录一一映射，不得减少场景。

| 领域 | 计划文件 |
|---|---|
| Workflow bundle | `tests/unit/workflow-bundle.test.ts`；`tests/integration/workflow-bundle-consumers.test.ts`；更新 `tests/unit/doctor.test.ts`、`tests/unit/package.test.ts`、`tests/unit/generated.test.ts` |
| MCP path/config/status | `tests/unit/mcp-config.test.ts`；`tests/unit/mcp-status.test.ts`；`tests/integration/mcp-session-runtime.test.ts` |
| MCP 权限 | `tests/unit/mcp-permission.test.ts`；更新 `tests/unit/persistent-agent-permission.test.ts`；`tests/integration/mcp-permission-origins.test.ts` |
| MemPalace mapping | `tests/unit/mempalace-mapping.test.ts`；`tests/integration/memory-fail-closed.test.ts` |
| task/model/rendering | `tests/unit/persistent-agent-model-selection.test.ts`；`tests/unit/task-hub-renderer.test.ts`；`tests/integration/task-hub-identity.test.ts`；更新 `tests/unit/persistent-agent-output-delivery.test.ts` |
| Native UI/footer | `tests/unit/footer-layout.test.ts`；`tests/unit/footer-lifecycle.test.ts`；`tests/integration/native-ui-ownership.test.ts`；更新 `tests/unit/package.test.ts` |
| Provider-routed compaction | `tests/unit/context-upstream-inventory.test.ts`；`tests/unit/context-provider-router.test.ts`；`tests/unit/codex-checkpoint-replay.test.ts`；`tests/integration/context-runtime-load.test.ts`；`tests/integration/codex-remote-compaction-compat.test.ts`；`tests/integration/acp-delegation-boundary.test.ts` |
| Explainable retry | `tests/unit/provider-retry-classification.test.ts`；`tests/unit/provider-retry-watchdog.test.ts`；`tests/integration/provider-retry-runtime.test.ts` |
| Pi 0.84.1 compatibility | `tests/integration/pi-0-84-1-runtime.test.ts`；更新 `tests/integration/extension-load.test.ts` 与 package/generated tests |
| License/provenance/package | `tests/unit/license-disposition.test.ts`；`tests/unit/provenance.test.ts`；更新 `tests/unit/generated.test.ts`、`tests/unit/package.test.ts` |
| Install/upgrade | 更新 `tests/bootstrap/bootstrap.test.ts`；`tests/integration/package-clean-install.test.ts`；`tests/integration/package-upgrade.test.ts` |
| Fixtures | `tests/fixtures/workflow-bundles/`、`tests/fixtures/mcp/`、`tests/fixtures/mempalace/`、`tests/fixtures/renderers/`、`tests/fixtures/package-inventory/`；不得放真实 secret、Palace 内容或 provider response |

## 3. 需求 / 决定 / 风险 traceability

覆盖状态含义：`PLANNED-A` 为后续自动化；`GATED-L` 为独立授权 live probe；`LIMIT-N` 为测试不可证明；当前均未执行。

### 3.1 Workflow bundle

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| WF-01 | 单一 pinned `rose-aili@0.4.7` bundle；system、role metadata、selection map、protocols、installation contract、provenance 全部可消费 | 1.1, 2.1–2.2 | `workflow-bundle.test.ts`、`workflow-bundle-consumers.test.ts` | artifact→consumer matrix；immutable view；固定 version/commit/schema | PLANNED-A |
| WF-02 | missing、mixed identity、unsupported schema、cross-file mismatch fail closed，无 stale fallback | 2.1 | 同上 + `doctor.test.ts` | 每一故障 fixture 阻塞 affected startup；doctor 指出具体 artifact | PLANNED-A |
| WF-03 | canonical selector/role/protocol 不保留手写第二语义源；完整采用 20-role catalog 与 `aili.solution-architect` | 2.2–2.3 | role/routing tests；`npm run validate:roles`；package negative assertions | bundle consumer、roles manifest、selection map、doctor、task catalog 均为同一 20-role inventory；`solution-architect` 只读 ceiling 与 canonical source 一致；固定 19-role assertion、adapter filtering 与 duplicate map/prompt 不在 production inventory | PLANNED-A |
| WF-04 | APPEND_SYSTEM/global resource 职责退役；legacy 用户文件只报告不改写 | 2.3, 10.4, 11.3 | `doctor.test.ts`、`bootstrap.test.ts`、upgrade fixture | legacy bytes 前后 hash 一致；manual cleanup guidance；无用户写入 | PLANNED-A |
| WF-05 | bundle provenance、SBOM、notices、doctor、tarball 一致 | 1.1, 10.3, 11.2 | `npm run validate:provenance`；`npm run validate:generated`；tarball inventory | pin/commit/schema/inventory 漂移使验证 non-pass | PLANNED-A |

### 3.2 MCP Parent / two-Worker isolation、lifecycle 与多-origin 权限

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| MCP-01 | `${XDG_CONFIG_HOME:-$HOME/.config}/mcp/mcp.json`；Parent/Workers 同路径；源码无当前用户名绝对路径 | 3.1 | `mcp-config.test.ts` | XDG override、HOME default、missing env、explicit fixture override；portable source assertion | PLANNED-A |
| MCP-02 | Parent + Worker A + Worker B 三个独立 adapter/runtime；Worker 仅显式 child extension，无 ambient UI/coordinator extension | 3.2 | `mcp-session-runtime.test.ts` | 三个不同 instance/transport IDs、同 config path；forbidden extension load count=0 | PLANNED-A |
| MCP-03 | park、release、cancel、prepare/revive failure、replacement、shutdown 各自 exactly-once dispose，不影响其他 session | 3.3 | lifecycle parameterized fixtures | 每个 seam 的 create/dispose counters；dispose Worker A 后 Parent/B 可继续；无 orphan handle | PLANNED-A |
| MCP-04 | 权限为 Parent grant ∩ role ceiling ∩ task tools/write/workspace ∩ Pi mode ∩ server capability | 3.4 | `mcp-permission.test.ts`、`mcp-permission-origins.test.ts` | 正/负向 intersection table；任何一层 deny 均不执行 server call | PLANNED-A |
| MCP-05 | **所有 origin**：proxy、promoted direct、script、resource、approval request；防 same-name collision、proxy discovery 绕过 | 3.4 | per-origin matrix | 每 origin 覆盖 allow、Parent disable、role/task narrowing、revocation；collision 仍绑定 canonical capability | PLANNED-A |
| MCP-06 | headless approval fail closed；allow-once/session grant及撤销不扩大 scope | 3.4 | 更新 `persistent-agent-permission.test.ts` | no UI=0 calls；allow-once 仅一次；session grant 限当前 session；revocation 即时生效 | PLANNED-A |
| MCP-07 | lazy status/doctor 不启动 transport；configured/cached/connected/failed/disabled/needs-auth/unavailable 可区分；单 server failure 不泛化 | 3.5 | `mcp-status.test.ts`、`doctor.test.ts` | status snapshot 与 start counter=0；逐 server truthful state | PLANNED-A |
| MCP-08 | MemPalace、Context7、Playwright、唯一 `colbymchenry/codegraph` 固定 identity；禁止 latest/branch | 1.1, 4.1 | config/provenance fixtures | exact pins 接受；floating 和其他 CodeGraph identity 拒绝 | PLANNED-A |
| MCP-09 | 真实 Parent + 两 Worker harmless call、denied operation、独立 disposal | 4.9 | 后续 manifest 固定的 live harness | 脱敏 session/status/disposal receipt；不输出 credential | GATED-L：需 runtime probe approval |
| MCP-10 | running/queued turn 在 crash、reload、replacement 时记录 interrupted/unexecuted，且 provider/tool/MCP/memory side effect 不自动 replay | 3.3, 9.1 | `mcp-session-runtime.test.ts` crash/reload fixtures；更新 persistent runtime recovery tests | exactly-once cleanup；durable interrupted/unexecuted；restart 后 server/provider/memory call count=0 | PLANNED-A |

### 3.3 MemPalace-only、Palace/Wing/shared/diary mapping

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| MEM-01 | MemPalace/MCP 是唯一 durable source；禁 AILI SQLite、rose-memory、Markdown mirror、transcript mining、alternate fallback | 4.4, 7.4, 10.4 | `memory-fail-closed.test.ts`、package/source negative assertions | unavailable 时 memory call 明确失败、0 fallback files；普通非 memory task 可继续 | PLANNED-A |
| MEM-02 | Pi/OpenCode 共用 `/home/rosetears/code/ai/.mempalace`，不复制/隐式初始化第二 Palace | 4.1, 4.4 | `mempalace-mapping.test.ts`、config preview fixture | selected CLI/env contract 指向唯一 canonical path；无第二 store creation | PLANNED-A |
| MEM-03 | trusted project→唯一 Wing；cross-project→`shared`；stable Agent→确定 diary；history/JSONL 仅 hot context | 4.4 | mapping table tests | normalization、collision、untrusted、ambiguous、worktree、rename、stable diary、shared promotion authority 全覆盖 | PLANNED-A |
| MEM-04 | Palace absent/failed，读写/search 不得声称成功；memory 不覆盖当前 repo/contract/permission/evidence | 4.4–4.6 | fail-closed + precedence fixtures | no success receipt/no fallback；current accepted source wins | PLANNED-A |
| MEM-05 | install/init/read/write/delete/import/mine/model download 分别 gated；拒绝迁移保持 legacy bytes | 1.2, 4.2–4.7, 11.3 | authorization ledger inspection；disposable upgrade fixtures | 未获批操作为 not-run；拒绝路径无 mutation | PLANNED-A + LIMIT-N（授权本身不可由测试授予） |
| MEM-06 | 固定 Palace 初始化、只读 health/search、单次 bounded write/readback | 4.5–4.6 | 后续逐操作命名 probe | redacted status/lookup receipt；Wing/diary 可观察；无 raw-memory dump | GATED-L：init/read/write 分别批准 |
| MEM-07 | embedding 下载、并发/naming 真实兼容性 | 4.7 | pinned MemPalace live probe | exact model/version/target evidence | GATED-L；固定 release 行为当前 Unverified |
| MEM-08 | init/read/write/delete/import/mine/shared-promotion grants 不得互相继承 | 1.2, 3.4, 4.5–4.7 | `mcp-permission-origins.test.ts` + MemPalace fake server action×grant matrix | 每个未授权 action 的 server call count=0；read grant 不允许 write/delete/import/mine，write 不隐含 shared promotion | PLANNED-A |

### 3.4 task / hub 全状态、preflight、identity 与 renderer

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| TH-01 | flat/batch 在 durable allocation 前完成 selector、role、model/layer、auth/availability、thinking preflight；batch 原子 | 5.1 | `persistent-agent-model-selection.test.ts` | unknown selector、bad format、ambiguous bare model、unavailable/auth、thinking mismatch 均 0 Agent/job/turn；一项失败整批 0 allocation | PLANNED-A |
| TH-02 | omitted/explicit canonical/bare model precedence；effective model/thinking frozen；provider 前 revalidate 不 silent switch；one-shot 不 sticky | 5.1–5.2 | model + identity integration tests | 每 precedence layer；config change 后本 turn 保持/显式失败；下一 hub turn 重新解析 | PLANNED-A |
| TH-03 | top-level 与 nested `task` 共用 `renderCall`/`renderResult`；首帧不只显示 `Task` | 5.3 | `task-hub-renderer.test.ts` | name、canonical selector、effective provider/model、status + 单行 assignment；未分配字段省略不伪造 | PLANNED-A |
| TH-04 | task 单项/批量状态逐项：`preparing`、`queued`（若 structured runtime 暴露）、`running`、`completed`、`partial`、`failed`、`blocked`、`cancelled`、`malformed result` | 5.3 | renderer golden/structural fixtures | 每状态视觉与 structured detail 可区分；batch item 与 aggregate status 不混淆；malformed 回退 Pi normal renderer且不改 execution semantics | PLANNED-A |
| TH-05 | hub `wait/output/history/cancel/jobs/list/send/release`（以注册 surface 为准）显示 action + Agent/job target，并覆盖成功、pending、not-found/blocked、failed、cancelled/malformed | 5.2–5.3 | task-hub renderer + identity tests | action/target 清楚；不把 TUI 状态当 acceptance/completion/formal evidence | PLANNED-A |
| TH-06 | expanded metadata：requested/effective model、layer、thinking、sync/async、Agent/job/turn、output/history refs、终态 | 5.2–5.3 | `task-hub-identity.test.ts`、delivery tests | task settlement、async delivery、hub、audit 字段一致 | PLANNED-A |
| TH-07 | assignment summary 去换行、宽度/byte-width 有界并脱敏 credential、protected path、完整 prompt | 5.2–5.3 | width/redaction property fixtures | secret marker 在 renderer/details/delivery/audit 均不存在；只保留 bounded summary | PLANNED-A |

### 3.5 Pi-native UI 与 footer

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| UI-01 | 删除 Matrix、四行 rain、shimmer/status、timer/commands/settings；不得隐藏/替代 Working Line | 6.1–6.2 | `native-ui-ownership.test.ts`、package/source negative assertions | 无 Matrix registration/source/package resource；无 `setWorkingVisible(false)`；无 AILI spinner | PLANNED-A |
| UI-02 | 删除 Rose/Zentui theme/editor/header/message/thinking ownership及 prototype patch；保留可分离 fixed-editor/WSL image paste | 6.1–6.2 | call-path ownership fixture + retained behavior tests | 无 custom theme/chrome、`updateContent` patch、ThinkingTrail/REASONING；retained behavior 有独立 owner 或 material discovery stop | PLANNED-A |
| UI-03 | legacy Matrix/theme/Zentui 配置 install/upgrade/startup 时 byte-identical 且 ignored | 6.2, 9.3 | bootstrap/upgrade fixture | old files hash/mtime policy按合同不变；Pi-native active | PLANNED-A |
| UI-04 | footer 仅 public `setFooter()`/`setStatus()`；model/quota 优先；reset/update age/time 可用时真实，不可用时 omit/unavailable | 6.3 | `footer-layout.test.ts` | wide/unavailable/stale fixtures；不创建第二 update client、不伪造 success | PLANNED-A |
| UI-05 | 窄终端确定降级：optional cwd/git/context/update/time 先删，material model/quota 后处理，绝不超宽 | 6.3 | width table + Unicode byte/display-width fixtures | 每个 width 的 deterministic segments；rendered width ≤ terminal width | PLANNED-A |
| UI-06 | clock ≤ 每分钟一次；status 仅 value change redraw；shutdown/reload/fork/replacement 清 timer/listener | 6.4 | `footer-lifecycle.test.ts` fake timers | 10 分钟最多 minute-level clock redraw；重复值 0 redraw；dispose 后 0 callback | PLANNED-A |
| UI-07 | 真实 Parent/Worker/tool 执行只出现 Pi-native working/thinking，footer 稳定 | 6.5 | 手工 real TUI probe | 环境、Pi version、terminal width、有限观察记录 | GATED-L；主观流畅度/所有 terminal 不可证明（LIMIT-N） |

### 3.6 Codex Remote V2、provider-routed ACP、delegation boundary 与 AILI Compact 移除

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| CTX-01 | 完整 `billion-context-pi@0.1.34` 与 exact `@narumitw/pi-codex-compact` package/source/tests/docs/licenses/provenance；algal production absent | 1.1, 7.1 | recursive billion inventory + Codex package inventory + negative package assertions | billion tracked files完整；Codex identity/contents exact；无 algal runtime/hook | PLANNED-A |
| CTX-02 | turn-frozen provider/API/model route：exact compatible Codex→Remote V2；direct OpenAI/Azure/custom/其他→ACP；missing/contradictory fail before mutation | 7.2 | `context-provider-router.test.ts` matrix | Codex、direct OpenAI、Azure、custom、代表性非OpenAI及矛盾输入有唯一 owner 或零 mutation | PLANNED-A |
| CTX-03 | ACP 仅在 compatible Codex bypass context/nudge/compaction cancellation；完整 `acp_delegate*` 始终可用 | 7.2, 7.5 | router + extension-load + ACP delegate fixtures | Codex ACP context call count=0；其他 provider Codex hook count=0；delegate 不冒充 persistent Agent | PLANNED-A |
| CTX-04 | Codex exact marker/fingerprint/model replay、bounded checkpoint、repeated compaction、Pi fallback、ordinary transport ownership | 7.3 | `codex-checkpoint-replay.test.ts`、`codex-remote-compaction-compat.test.ts` | automatic/manual/threshold/overflow/reload/resume/fork 正向；malformed/oversize/duplicate/mismatch fail closed | PLANNED-A |
| CTX-05 | 单一 route token 门控完整 hook inventory；注册顺序、并发 turn、中途 model 选择、router throw、session/tree/fork/reload 原子 | 7.2–7.3 | handler-order/concurrency/state-transition fixtures | selected owner mutation≤1；other owner context/payload/cancel/persist call=0；router failure零 mutation | PLANNED-A |
| CTX-06 | AILI Compact 与 algal production source/hooks/tools/commands/config/docs claims 均不进入发行物；历史 entries/decision docs 保留 | 7.1, 7.4 | negative package/source + historical session fixture | 无 `aili_*`、`/aili-compact`、algal handler；旧 bytes 保留且 retired call count=0 | PLANNED-A |
| CTX-07 | ACP spawned cwd/roles/depth/wait/cancel/result-file及非正式边界保持完整 | 7.5 | `acp-delegation-boundary.test.ts` | formal router不选ACP；生命周期与负向路径符合上游；不identity-conflate | PLANNED-A |
| CTX-08 | Pi 0.84.1 Parent permission interception对representative ACP read/write生效；不能证明则material discovery | 7.5 | disposable process/file harness | deny=0 side effect/0 formal success；cancel无child | GATED-L |
| CTX-09 | Codex Remote V2、direct OpenAI ACP 与代表性非OpenAI ACP真实路由 | 7.6 | provider-backed sessions | actual model/runtime owner；selected runtime成功；other-owner call count=0 | GATED-L：三类分别批准 |
| CTX-10 | Pi 是唯一 retry budget/backoff owner | 7.3, 8.2 | retry-disabled/transient/cancel fixtures | extension retry=0或等价单 owner；一个 Pi attempt 最多一个 transport | PLANNED-A |
| CTX-11 | 32K 与 upstream-default retained-history 比较不凭推测改默认 | 7.6 | separately approved representative long-session matrix | latency、input/cached/output tokens、checkpoint size、continuity；无证据则保持 upstream default | GATED-L |

### 3.7 Explainable pi-retry

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| RETRY-01 | 完整 `@narumitw/pi-retry@0.31.0` published source/README/LICENSE、分类器/watchdog/status/policy行为及later-deprecated provenance | 1.1, 8.1 | inventory/provenance comparison | frozen files/behaviors完整；deprecated维护状态可见 | PLANNED-A |
| RETRY-02 | known unknown-detail、Codex websocket limit、explicit retry backend分类；unmatched不伪造 | 8.2 | `provider-retry-classification.test.ts` | known各tag一次；unmatched原样；原始bounded cause保留 | PLANNED-A |
| RETRY-03 | Pi 0.84.1唯一拥有attempt/budget/backoff；disabled/exhausted不产生第二loop | 8.2 | retry runtime fixtures | disabled watchdog不abort；exhausted终态无额外attempt；Pi counters权威 | PLANNED-A |
| RETRY-04 | stall、receiving refresh、user cancel、provider abort、idle/end/reload/replacement cleanup可区分 | 8.2–8.3 | fake timers + integration | watchdog只abort一次；user cancel不改成stall；old timer/status不跨session | PLANNED-A |
| RETRY-07 | Codex Remote V2 transport与provider stream共享attempt-scoped watchdog/abort provenance，且无扩展第二 retry loop | 7.3, 8.2 | cross-capability transport×retry state matrix | user cancel无fallback/retry；watchdog tag一次并交Pi；每attempt一个transport/watchdog；old event不刷新new timer | PLANNED-A |
| RETRY-05 | error diagnostics显示provider/model、category、sanitized cause、retry decision、attempt/delay when available、terminal state | 8.2–8.3 | renderer/redaction fixtures | 不只显示retrying；无header/payload/secret；renderer不改retry semantics | PLANNED-A |
| RETRY-06 | 真实retryable Codex error/connection limit或受控stall smoke | 8.2–8.3 | separately approved bounded provider/stall probe | observed classification、Pi attempt/backoff、terminal result | GATED-L |

### 3.8 Pi 0.84.1 compatibility

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| PI-084-01 | 四个完整scope包 `@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai`、`pi-tui` dev/runtime-resolved exact 0.84.1；host peer `*`例外明确；无current 0.82.1或nested duplicate | 9.1 | package/lock/docs/generated + `npm ls` + runtime package identity | resolved exact一致；stale/nested conflict失败 | PLANNED-A |
| PI-084-02 | compaction/retry/MCP/Agent/UI integrations typecheck与seam-test on 0.84.1，不只扩大peer range | 7.3, 8.2, 9.1 | typecheck + extension-load + event/provider/session fixtures | public APIs可用；每个compat patch有symbol/reason/test | PLANNED-A |

### 3.9 MIT、third-party、provenance、SBOM、notices 与 tarball

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| LIC-01 | 每个 retained first-party/copied/adapted path 有 relicense disposition；Unverified 不得被 notices/SBOM 洗白 | 10.1 | `license-disposition.test.ts` | 每 path 为 MIT-authorized/separate/remove/blocking；missing/unknown 阻塞 | PLANNED-A；法律最终判断 LIMIT-N |
| LIC-02 | owner exact authorization 后 root LICENSE、package、lock root、README 主许可证一致 MIT，无 stale AGPL production claim | 10.2 | disposition validator、`package.test.ts` | 四处一致；在 owner approval 缺失时保持 blocked，不执行替换 | PLANNED-A + LIMIT-N（测试不授予授权） |
| LIC-03 | 第三方许可证独立：尤其 Playwright Apache-2.0；MIT 不覆盖第三方义务 | 1.1, 10.3 | provenance/license inventory fixtures | exact identity/license text/copyright/notice；错误归为 MIT 时 fail | PLANNED-A |
| LIC-04 | 每个 dependency/bundled/copied/reference-only 有 version/commit、source、license、完整 text、reuse boundary、verification | 1.1, 10.3 | `npm run validate:provenance`；`provenance.test.ts` | canonical inputs、lock、notices、SPDX SBOM byte-current；reference-only 不称 bundled | PLANNED-A |
| LIC-05 | 真实 tarball 包含 Workflow/MCP adapter/完整 billion-context、exact Codex compact integration、pi-retry、Pi 0.84.1 evidence和licenses，排除 Matrix/theme/Zentui/AILI Compact/algal/duplicate Workflow | 7.1–7.4, 10.3–10.4, 11.2 | `npm pack --dry-run --json`；授权后 real tarball extract + clean load | inclusion/exclusion inventory、license files、Extension load；任一漂移 NON_PASS | PLANNED-A（pack 操作按 task 11.2 授权边界执行） |
| LIC-06 | frozen upstream tarball/wheel identity、license、runtime compatibility | 1.1 | package artifacts/hash/inventory compatibility checks | 每 pin 独立证据；矛盾即 material discovery，不 float | GATED-L 若需 fetch/install；本地已有 canonical artifact 可自动只读验证 |

### 3.10 Clean install、upgrade、doctor 与操作边界

| ID | 需求 / 决定 / 风险来源 | Tasks | 测试 / 命令 | 预期证据 | 覆盖状态 |
|---|---|---|---|---|---|
| INST-01 | disposable Linux HOME clean install：单 Workflow/context owner、runtime 可 load、外部 MCP prerequisites 如实 unavailable，不隐式安装/配置/init | 11.3 | `package-clean-install.test.ts`、`npm run test:e2e:linux-clean` | isolated HOME inventory、process log；0 `~/.config`/Palace/browser/model hidden write | GATED-L：安装权限；fixture automation PLANNED-A |
| INST-02 | 从当前 published baseline upgrade；legacy Matrix/theme/Compact/APPEND_SYSTEM/memory config/data 保留；拒绝迁移不变 | 11.3 | `package-upgrade.test.ts`、`bootstrap.test.ts` | before/after hashes；new package ignores legacy；无 OpenCode rewrite/implicit import | GATED-L：baseline install/upgrade 权限；fixture automation PLANNED-A |
| INST-03 | malformed/conflicting MCP config：preview redacted、写入为零；approved write backup + atomic replace；failure 保留原件 | 4.1, 4.3 | `mcp-config.test.ts` disposable HOME | clean merge/conflict/malformed/redaction；preview no write；write-failure old bytes intact | PLANNED-A；真实 `~/.config` write GATED-L |
| INST-04 | doctor/capability 如实区分 bundle、MCP server、MemPalace、context owner、external prerequisites，不安装/连接 lazy service | 3.5, 4.5, 10.4 | `npm run test:doctor` | no side-effect counters；逐项 non-pass 原因；无 global false PASS | PLANNED-A |
| INST-05 | Context7、Playwright、CodeGraph 分别 smoke；browser/install/index 分别授权 | 4.7–4.8 | server-specific live scripts | 每 server bounded receipt；一个失败不伪造全局 MCP 失败/成功 | GATED-L：每工具、browser、project index、probe 分别批准 |
| INST-06 | 真实 candidate tarball 创建、hash、解包 inventory、从 tarball clean load/install | 11.2–11.3 | `npm pack --json` 生成真实 `.tgz`；`sha256sum`；`tar -tf`/解包；disposable HOME 从该 `.tgz` 安装并 load | actual archive path/hash；required runtime/license inclusion；retired exclusion；installed Extension load | GATED-L：package creation/install operations separately approved |
| INST-07 | 真实 upgrade baseline 固定为当时当前公开 package 的 exact version/integrity，先安装 baseline artifact 再升级 candidate tarball | 11.3 | registry metadata capture；baseline install；candidate `.tgz` upgrade；before/after inventory/hash | baseline identity/integrity；legacy bytes preserved；拒绝迁移；OpenCode 未改写；单 runtime owner | GATED-L：baseline install与upgrade分别批准 |
| INST-08 | legacy UI rollback 路径与 fixed-editor、WSL image-paste 分别保留 | 6.1–6.2, 11.3 | owner/call-path tests；disposable install→upgrade→rollback fixture | 两项 retained behavior 独立正向断言；legacy Matrix/theme/Zentui files byte-identical且忽略 | PLANNED-A；真实 rollback install GATED-L |

## 4. 自动化场景矩阵补充

### 4.1 MCP permission origin 最小矩阵

对 `proxy`、`direct`、`script`、`resource` 四种执行 origin，以及独立 `approval` origin，至少参数化以下行：

1. 全部五层允许 → 仅 canonical operation 执行一次。
2. Parent MCP disabled → discovery 可如实隐藏/标 unavailable，执行 0 次。
3. read-only role 发现 write capability → deny，不能换 origin 绕过。
4. task tools/write/workspace narrowing → 超界 target deny。
5. Pi mode=`plan`/headless ask → deny，无 server side effect。
6. server 未暴露 capability → 不由 AILI 合成。
7. direct tool 与本地 tool 同名 → identity collision fail closed。
8. proxy search 返回 forbidden tool → subsequent call 仍 deny。
9. allow-once → 第一次允许，第二次重新 ask/deny。
10. session grant → 仅 issuing session；Worker A grant 不进入 Parent/Worker B。
11. grant revocation → 后续 call deny，不复用 cached approval。
12. dispose race → promise settled、transport closed once、无跨 session teardown。

### 4.2 task/hub renderer 最小矩阵

- Flat 与 batch 分别覆盖：preparing、running、completed、partial、failed、blocked、cancelled、malformed；若 coordinator 暴露 queued/pending，也必须单独覆盖，不能映射成 running。
- Sync 与 async：accepted、settled、delivery、`hub wait` 前后 metadata 一致。
- `hub output/history/cancel/jobs/list/send/release`：action、target、terminal/nonterminal/error 状态明确；未注册 action 按实际 public surface 标 N/A，不得虚构。
- 宽度：0/极窄/常用/宽终端、Unicode、ANSI-safe、multiline、长 selector/model/name。
- 脱敏：token/API key/Bearer、credential path、assignment 中完整 prompt、嵌套 malformed detail。
- renderer throw/malformed result：回落 Pi default renderer；tool result、allocation、delivery 不被 renderer 改写。

### 4.3 MemPalace mapping 最小矩阵

- trusted canonical repo、symlink/realpath、worktree、case/Unicode normalization、rename。
- 两个 project name 相同但 canonical identity 不同，不碰撞 Wing。
- untrusted、无 VCS、ambiguous remote、路径逃逸均 fail closed。
- project→shared promotion 要有显式 authority；默认不提升。
- stable Agent 同 project 恢复同 diary；不同 project/Agent 不串 diary。
- Palace unavailable/command failure/search failure/write failure 分别报告，不创建 SQLite/Markdown/第二 Palace。
- session JSONL 中 memory-like 文本不触发自动 mining/write。

### 4.4 Footer 最小矩阵

- model + current quota + reset/update age + clock；quota absent、stale、malformed、provider 非 Codex。
- optional context/git/cwd/package status 按固定优先级移除；不触发 package network polling。
- 终端 resize 可重复得到同一 layout；line display width 不超限。
- minute timer advance、quota same/change、reload/replacement/shutdown；旧 callback 不更新新 session。

## 5. 后续允许时的最窄命令顺序

以下命令仅是计划，不在本次执行。BUILD 中先运行受影响领域最窄命令，再扩大范围；任何命令实际执行都记录 command、时间、环境、exit code、摘要与 artifact reference。

```text
npx vitest run tests/unit/workflow-bundle.test.ts tests/integration/workflow-bundle-consumers.test.ts
npx vitest run tests/unit/mcp-config.test.ts tests/unit/mcp-status.test.ts tests/unit/mcp-permission.test.ts tests/integration/mcp-session-runtime.test.ts tests/integration/mcp-permission-origins.test.ts
npx vitest run tests/unit/mempalace-mapping.test.ts tests/integration/memory-fail-closed.test.ts
npx vitest run tests/unit/persistent-agent-model-selection.test.ts tests/unit/task-hub-renderer.test.ts tests/integration/task-hub-identity.test.ts tests/unit/persistent-agent-output-delivery.test.ts
npx vitest run tests/unit/footer-layout.test.ts tests/unit/footer-lifecycle.test.ts tests/integration/native-ui-ownership.test.ts
npx vitest run tests/unit/context-upstream-inventory.test.ts tests/unit/context-provider-router.test.ts tests/unit/codex-checkpoint-replay.test.ts tests/integration/context-runtime-load.test.ts tests/integration/codex-remote-compaction-compat.test.ts tests/integration/acp-delegation-boundary.test.ts
npx vitest run tests/unit/provider-retry-classification.test.ts tests/unit/provider-retry-watchdog.test.ts tests/integration/provider-retry-runtime.test.ts tests/integration/pi-0-84-1-runtime.test.ts
npx vitest run tests/unit/license-disposition.test.ts tests/unit/provenance.test.ts tests/unit/doctor.test.ts tests/unit/package.test.ts tests/unit/generated.test.ts
npx vitest run tests/bootstrap/bootstrap.test.ts tests/integration/package-clean-install.test.ts tests/integration/package-upgrade.test.ts
npm run typecheck
npm run validate:provenance
npm run validate:generated
npm run validate:package
npm test
```

在获得相应 package-operation 授权后，dry-run 只作预览，真实 tarball 证据必须另行执行：

```text
npm pack --dry-run --json
npm pack --json
sha256sum <generated-candidate.tgz>
tar -tf <generated-candidate.tgz>
# 随后在 disposable HOME 从该 exact .tgz clean install/load
npm run test:e2e:linux-clean
```

OpenSpec 文档检查（只证明 artifact 可解析，不证明实现或授权）：

```text
openspec validate converge-pi-runtime-mcp-memory-and-context --strict --no-interactive
```

## 6. Live probe 授权清单与证据合同

每行独立批准，不得从其他批准推断；命令须在实现后固定到 progress/evidence manifest，禁止 `latest`。输出必须脱敏且 bounded。

| Probe | 前置独立批准 | 最小观察 | 禁止推断 |
|---|---|---|---|
| Parent + Worker A/B MCP | runtime probe；必要 external process | 同 config、三实例、deny、dispose isolation | 不代表所有 MCP tools 安全 |
| MemPalace init | Palace exact target init | version、target、init status | 不含 read/write 权限 |
| MemPalace read/search | Palace read | bounded redacted hit/status | 不含 write/delete/import/mine |
| MemPalace write/readback | Palace write + read | exact Wing/diary redacted receipt | 不含 delete、shared promotion或生产数据正确性 |
| Embedding model | exact download target | model/version/location/result | 不授权其他 model/download |
| Context7 | network/server probe | bounded retrieval identity | 不证明内容权威或持续在线 |
| Playwright | package install、browser install、browser probe分别批准 | browser/version、single harmless action | 不授权任意站点或持久 profile |
| CodeGraph | package install、选定 project init/index、query分别批准 | repo/package identity、project、bounded query | 不授权其他 project/index |
| ACP Pi 0.84.1 | local process/disposable file probe | denied read/write、cancel cleanup | 不证明所有 spawned tools/OS side effects |
| Direct OpenAI ACP | provider access | actual direct-OpenAI model + ACP context/compaction owner；Codex hook count=0 | 不授权 Codex 或费用上限外调用 |
| Codex Remote V2 | provider access | actual Codex model + opaque checkpoint/replay owner；ACP context count=0 | 不授权 direct OpenAI；不自动授权 32K/64K 对比 |
| Codex retained-history comparison | provider access + bounded comparison budget | same histories under 32K and upstream default；latency/input/cached/output/checkpoint/continuity | 不自动改变默认；不授权其他provider |
| Non-OpenAI ACP | provider access | actual model + ACP compress/decompress/search owner | 不授权其他provider |
| Provider retry/stall | provider access or controlled-stall operation | bounded cause/category/Pi attempt/backoff/terminal result | 不证明所有错误皆可重试 |
| Real TUI | terminal/runtime probe | Pi-native working/thinking + footer observation | 不证明主观性能、所有 terminal |
| Candidate tarball | package creation、hash/inventory、disposable install分别批准 | actual `.tgz`、hash、解包 inventory、从该 tarball load | dry-run 不替代真实归档；不授权 publish |
| Clean install / upgrade | exact baseline install、candidate upgrade、rollback 分别批准 | exact baseline version/integrity、package load、inventory、legacy hashes | 不授权当前 HOME 安装或 publish |

## 7. 证据记录格式与 acceptance gate

### 7.1 Operation authorization ledger

下列 operation gate 必须各有独立记录，且“一个批准不得推导另一个批准”：dependency/lockfile mutation、bundled-package change、root-license replacement、shared MCP config write、每个 external tool install、Palace init/read/write/delete/import/mine、embedding download、browser install、CodeGraph project init/index、每个 live/provider/TUI probe、candidate tarball creation、baseline install、candidate upgrade、rollback、Git、publish、release。未授权项保持 `NOT_RUN_GATED`；Git/publish/release 在本 BUILD 范围内默认不执行。

Owner relicense authorization 是受保护的非测试 prerequisite evidence，必须绑定授权主体、涵盖路径、目标版本/时间和精确操作。Validator 只检查引用和逐路径 disposition 完整性，不能把 notices、SBOM 或测试 PASS 当成法律授权。

### 7.2 每项证据必须记录

- trace ID、对应 task/spec scenario、commit/worktree identity（只读记录）、Node/Pi/OS 与固定 dependency identity；
- exact command（仅实际执行后）、exit code、started/finished time；
- fixture/target 是否 disposable、授权编号/状态（live 操作）；
- assertion count/关键结果、失败分类、bounded redacted log path；
- changed-file/package/tarball inventory；
- `PASS`、`FAIL`、`BLOCKED`、`NOT_RUN_GATED` 或 source-backed `N/A`，不得用“预期通过”。

### 7.3 Release 级候选证据集

后续只有下列全部满足，才能由有权主体评估实现完成；本计划自身不作最终判定：

1. 所有 `PLANNED-A` 行有 fresh PASS 或 source-backed N/A；
2. 所有被批准的 `GATED-L` 有 fresh bounded evidence，未批准项明确保留 `NOT_RUN_GATED/Unverified`；
3. Workflow、MCP、memory、task/hub、UI、context、license/package、install/upgrade 每域至少一项正向及一项 fail-closed 负向证据；
4. typecheck、focused tests、generated/provenance/package validation 与真实 tarball inventory 一致；
5. clean install 和 upgrade 均在 disposable Linux HOME 中完成，拒绝迁移路径 bytes 不变；
6. 无第二 memory/context/Workflow owner，无 retired production resource；
7. 所有 material discovery 停止 BUILD，不允许 float pin、静默 patch upstream 或弱化权限；
8. `progress.txt` 明确剩余授权、live limitation 与未验证项；停止于 `IMPLEMENTED_TARGETED_VERIFIED`，不 commit/push/publish/release。

## 8. 测试不可证明或当前保持 Unverified 的边界

1. **授权与法律**：测试不能授予 BUILD、license replacement、依赖、安装、用户写入、Git、publish/release 权限，也不能作最终法律 relicense 结论。
2. **外部兼容性**：unit/fake integration 不证明 frozen tarball/wheel 在真实 Node/Python/Pi、凭据、网络、浏览器、embedding 环境可用。
3. **MemPalace 语义**：固定版本 exact Wing/diary naming、并发和长期数据正确性在 BUILD/live evidence 前为 Unverified；memory 内容不是授权、事实真值或完成证据。
4. **ACP 边界**：representative permission probe 不能证明任意上游 spawned process 或任意 OS 副作用都被拦截；因此 ACP 始终不得用于 formal Agent-owned package 或需要 persistent audit 的工作。
5. **UI**：自动化可证明注册、timer、layout 和 ownership，不能证明真实 Pi 原生动画、quota header、所有 terminal 宽度下的主观体验。
6. **Provider**：direct OpenAI、Codex、non-OpenAI ACP 或 retry smoke 都不证明所有 model、上下文大小、费用、速率限制、错误类别或 provider future behavior。
7. **Package/release**：`npm pack`、clean install、strict OpenSpec PASS 均不等于用户接受 test plan、release readiness、publish 或 release authorization。

## 9. 最终候选结论

本计划已把已确认的需求、设计决定和风险映射到更新后的 Tasks 1–12、计划测试文件/命令、证据类型和覆盖状态，并逐项包含 Workflow bundle、Parent/两 Worker MCP isolation、多-origin 权限、MemPalace-only mapping、task/hub 全状态、Pi-native UI/footer、Codex Remote V2 + complete billion-context provider routing、ACP 非正式边界、完整 explainable pi-retry、Pi 0.84.1、AILI Compact/algal production 移除、MIT/third-party/provenance/tarball，以及 clean install/upgrade。

**当前结论为 `ACCEPTED_CODEX_REMOTE_V2_REVISION / BUILD_AUTHORIZED / NOT_RUN`；各风险操作仍按独立 operation gate 管理。**
