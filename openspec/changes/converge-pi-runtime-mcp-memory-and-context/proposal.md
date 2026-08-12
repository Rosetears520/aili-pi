# Proposal: Converge Pi Runtime, MCP, Memory, Context, and Native UI

## Why

`aili-pi` 当前同时保留了多条已经偏离目标产品边界的实现与草案：旧 Workflow 投影和全局资源安装职责仍由 Pi Package 持有；长期记忆仍有已退役的 AILI SQLite 草案；MCP 尚未进入 Parent 与 persistent Worker runtime；`task` 启动时只显示通用工具名；Matrix 和 Zentui 覆盖了 Pi 原生 working/thinking 与主题；仓库还保留一套不再采用的 AILI Compact 实现。

本变更将这些方向收敛为一个产品合同：`aili-workflows` 提供治理和角色 bundle，`aili-pi` 负责 Pi runtime；MemPalace 经通用 MCP 提供唯一长期记忆；兼容的 `openai-codex` 使用固定 `@narumitw/pi-codex-compact` Remote Compaction V2，其他 provider 使用完整 `billion-context-pi`；`pi-retry` 补充可解释的 provider retry/stall 处理；交互恢复 Pi 原生主题、working 和 thinking，仅保留一个使用 Pi 官方 API 的轻量底栏。官方 Pi 基线统一为 `0.84.1`。

## What Changes

### Workflow runtime ownership

- `aili-pi` 消费并验证受支持 `rose-aili` release 提供的 Pi runtime bundle，包括 system、role metadata、selection map、protocols、installation contract 和 provenance。
- 只有在 bundle consumer、persistent Agent 映射和验证路径可用后，才退役旧 Workflow snapshot、重复 prompts、重复角色安装与 `APPEND_SYSTEM.md` 治理正文安装职责。
- `aili-workflows` 继续拥有 Pi 全局 `AGENTS.md`、Delivery/Utility prompts、角色语义、选择规则和协议；`aili-pi` 不维护第二份手写语义源。
- 完整采用 `rose-aili@0.4.7` 的 20 个 canonical Specialized Agents，新增公开 selector `aili.solution-architect`；Pi adapter 不保留固定 19-role 合同，也不静默过滤 canonical role。

### MCP runtime

- 将 `pi-mcp-adapter` 的完整公开能力作为 `aili-pi` runtime dependency 接入，而不是要求用户另装第二个 Pi Package。
- MCP 的用户级共享配置固定为：

  ```text
  /home/rosetears/.config/mcp/mcp.json
  ```

  实现使用可移植的 XDG/home 解析得到该默认位置，不把绝对用户名写入通用源码。
- Parent session 与每个 persistent Worker session 都加载 MCP；它们读取同一配置，但每个 session 拥有独立 adapter/runtime instance，并在 session shutdown、park/replacement 或失败清理路径中释放自身资源。
- MCP tools 的实际能力是 Parent grant、canonical role ceiling、package task scope、Pi permission mode 与 MCP server/adapter capability 的交集；MCP 接入不扩大授权。
- MCP server 默认保持 lazy；doctor/status 查询不得仅为检查而连接 lazy server。

### MemPalace as the sole durable memory

- MemPalace/MCP 是唯一长期记忆 source of truth；不实现 AILI SQLite、`rose-memory`、Markdown mirror、transcript-mining 或其他 fallback。
- Pi 与 OpenCode 共用同一个 Palace，用户确认的目标位置为：

  ```text
  /home/rosetears/code/ai/.mempalace
  ```

  该位置通过配置或环境变量传给 MemPalace，不复制成第二份 store。
- Palace 内的项目 Wing、shared Wing 和 stable Agent diary 映射必须有确定合同；AgentSession/history 只是热上下文，不是长期记忆。
- MemPalace 不可用时，普通不依赖长期记忆的任务可以继续；读取、写入、搜索或声称长期记忆成功的操作必须明确 unavailable/fail closed。
- 初始 MCP 配置包括 MemPalace、Context7、Playwright MCP 和经最终身份确认的 CodeGraph MCP。版本、命令、许可和 CodeGraph 项目身份必须在依赖写入或安装前固定并验证。

### Transparent task and hub UI

- `task` 增加 Pi 官方 `renderCall`/`renderResult`，调用一开始就显示用户可识别的信息，而不是只显示 `Task`。
- 紧凑行显示 task name、canonical selector、实际 provider/model 和状态；下一行显示截断、去换行并脱敏的 assignment summary。
- 分配后及展开详情显示适用的 Agent/job/turn identity、sync/async、requested/effective model、model layer、thinking、output/history references 和最终状态。
- batch、preparing、running、completed、partial、failed、blocked、cancelled 与 malformed result 必须可区分。
- `hub wait/output/history/cancel/jobs/list` 显示目标 Agent/job 和动作；TUI 状态不是 acceptance、completion 或 formal evidence。
- Agent/model preflight、零分配失败和 identity 贯通继续修改 `persistent-agent-orchestration` 与 `subagent-model-selection` 合同。

### Pi-native UI and lightweight footer

- 删除 Rose Matrix extension、四行 Code Rain、其上方 shimmer/status、相关 timer、commands、配置、迁移代码与测试；不再隐藏 Pi 原生 Working Line。
- 删除对 `AssistantMessageComponent.prototype.updateContent` 的 thinking/reasoning monkey patch、`ThinkingTrailComponent`、`✦ REASONING` 树状轨道及相关测试，使 Pi 原生 thinking component 完整接管。
- 退出 Rose Cyberdeck/REM 自定义主题、Zentui 自定义 editor/header/message chrome 和主题配置；不以另一套动画、spinner 或主题替代。
- 保留一个通过 Pi 官方 `setFooter()`/`setStatus()` API 实现的轻量底栏。底栏可显示当前时间、Codex quota、quota 重置/更新时间、AILI/Pi package 更新状态，以及 Pi 原生可得的 model/context/git/cwd 信息；窄终端必须有确定性降级。
- 时间和更新信息使用低频、可清理的刷新机制，不恢复 Matrix 类高帧率全屏重绘。

### Replace AILI Compact with Codex Remote V2 plus complete billion-context routing

- 删除当前 `src/runtime/aili-compact/`、AILI Compact commands/config/docs/scripts/tests、package exclusions、doctor/capability/provenance 声明及所有 production hooks。
- 完整保留固定上游 `ranxianglei/billion-context-pi` 的 source tree、功能、命令、tools、tests、license、copyright 和 attribution；不选择性删除上游能力。
- 对兼容的 `openai-codex`，唯一 active compaction/replay owner 是固定 `@narumitw/pi-codex-compact`：自动、手动、threshold 和 overflow 路径使用 Codex Remote Compaction V2，后续请求使用严格 marker/fingerprint/model 验证后的 opaque checkpoint replay。
- 对 direct `openai/*` 及所有其他 provider，唯一 active compaction/context rewriting owner 是 `billion-context-pi`，并完整启用 `compress`、`decompress`、`search_context`、`acp_status` 与 `acp_delegate*`。
- `algal/pi-openai-server-compaction` 仅保留在 `compaction-decision.md` 中作为 direct OpenAI、hybrid portable-summary 与 replay prior art；当前不加载、不 vendoring、不形成第二 Codex replay owner。
- 必要本地改动仅限 provider router、阻止 `billion-context-pi` 对兼容 Codex context/compaction 事件的占用、Pi `0.84.1` 集成和单一 retry owner。每一 provider turn 只能有一个 compaction owner。
- 用户接受 `acp_delegate*` 与 AILI persistent `task`/`hub` 两套 Agent surface 并存；Codex 选择 Remote V2 不移除 ACP delegation tools，但其 ACP context rewriting/compression 必须 bypass。

### Absorb complete pi-retry with explainable failures

- 完整吸收 `@narumitw/pi-retry@0.31.0` 的 published source、unknown-error classification、Codex retryable backend/websocket classification、stall watchdog、receiving/retrying status、Pi retry-policy respect、license 和 attribution。
- Pi 继续拥有 retry attempt、budget 与 exponential backoff；AILI 不创建第二个 retry loop，也不自动启用被用户关闭的 retry policy。
- 错误展示必须保留 bounded 原始 cause，并显示分类、retry reason、attempt/next-delay（Pi 可提供时）和终态；不得只显示 `retrying` 或把未知错误伪装成已解决。
- 同一失败只能分类/提示一次；retry disabled、watchdog disabled、unmatched error、retry exhausted 和 abort/cancel 必须可区分。上游项目后续 deprecated 状态进入 provenance/doctor 风险说明。

### Package license and release evidence

- `@rosetears/aili-pi` 主许可证从 `AGPL-3.0-or-later` 改为 MIT，并更新 `package.json`、根 `LICENSE`、README 和 package metadata。
- 第三方代码继续保留各自许可证；MIT 主许可证不得覆盖或改写 Apache-2.0 等第三方义务。
- 新增或 vendored dependency 必须记录精确版本/提交、来源、license、完整 license text、reuse boundary、provenance、SBOM、`THIRD_PARTY_NOTICES.md` 和 package tarball inventory。
- clean install、从当前发布版本升级、拒绝配置迁移、doctor、package validation 和 Linux runtime 验证必须覆盖新的所有权边界。

## Capabilities

### New Capabilities

- `workflow-runtime-bundle-consumption`: 验证并消费 `aili-workflows` 的 Pi runtime bundle，同时阻止重复语义所有权。
- `mcp-runtime-integration`: 通过共享配置为 Parent 和 persistent Worker 提供会话隔离、权限受限、可诊断的 MCP runtime。
- `mempalace-memory-runtime`: 通过 MCP 将一个用户 Palace 映射为唯一长期记忆，并对不可用状态 fail closed。
- `agent-dispatch-transparency`: 在 task/hub/TUI、delivery 和 audit surfaces 中一致暴露脱敏的 Agent、assignment、状态和 model identity。
- `pi-native-runtime-ui`: 由 Pi 原生主题、working 和 thinking 拥有交互反馈，AILI 只提供官方 API 上的轻量 footer 状态。
- `provider-routed-context-runtime`: 兼容 Codex 使用固定 `pi-codex-compact`，其他 provider 使用完整 `billion-context-pi`，并保证每 turn 唯一 compaction owner。
- `explainable-provider-retry`: 完整保留 `pi-retry` 分类/watchdog，并暴露 bounded retry 原因和终态。
- `pi-0-84-1-runtime-compatibility`: 将 host/core/TUI 类型与所有集成声明统一到官方 Pi `0.84.1`。
- `package-license-and-provenance`: 以 MIT 作为主项目许可证，同时维护所有第三方许可、来源和发行物证据。

### Modified Capabilities

- `persistent-agent-orchestration`: Parent/Worker 增加 MCP lifecycle，并贯通 task/hub identity、状态与 model metadata。
- `subagent-model-selection`: durable allocation 前完成 selector/model preflight，冻结并立即显示 effective model。
- `rose-working-animation`: 从 AILI-owned animation 改为退役合同，禁止隐藏或替代 Pi Working Line。
- `reversible-context-compression`: implementation owner 从 AILI Compact 改为 provider-routed upstream compaction；旧 AILI Compact schema/runtime 不再是 production contract。
- `sqlite-memory-storage`: 退役；不进入 BUILD 或发行物。
- `memory-learning-runtime`: 由 MemPalace/MCP 的唯一长期记忆合同完全替代。

## Change Relationships

- 本变更完整 supersede `add-aili-sqlite-memory`。旧 change 仅保留为历史需求证据，不再拥有未来实现、BUILD 或 release 权限。
- 本变更完整吸收 `restore-native-working-ui-and-expose-agent-model-resolution` 的 Agent/model 白盒和原生 Working 方向，并进一步退役自定义主题与 thinking patch。旧 change 的需求决定可作来源，但其 readiness/authorization 不继承。
- 本变更 supersede 所有继续实现或发布 AILI Compact 的活动 change，包括 `add-reversible-context-compression`、`redesign-aili-compact-lifecycle`、`reconcile-aili-compact-release-lineage`、`fix-aili-compact-recovery-deadlock` 和 `replace-pi-native-fallback-with-aili-emergency-checkpoint`。它们保留为历史设计/风险证据，但不得独立恢复旧 runtime。
- 本变更 supersede `dense-vertical-rose-rain`、`add-rem-cyberdeck-theme`、`migrate-rem-cyberdeck-to-rose` 及 `improve-tui-interaction-and-wsl-image-paste` 中 Matrix、Rose theme 和自定义 thinking/working 部分。固定编辑器、WSL image paste 等未被本提案明确纳入的独立行为不自动删除，除非其实现依赖被退役的 Zentui chrome，届时必须回到 DEFINE 处理材料变化。
- `replace-subagent-runtime-with-persistent-agent-framework` 的 persistent Agent 基础架构继续有效；本变更只修改其 MCP、model preflight、renderer 和 metadata 合同。

## Impact

- Runtime：`src/runtime/persistent-agents/`、新的 Workflow bundle/MCP/memory modules、doctor、capability registry 和 permission bridge。
- UI：删除 `extensions/matrix/` 及 Zentui custom theme/editor/header/message/thinking surfaces；保留或重建最小 footer extension。
- Context/retry：删除 `src/runtime/aili-compact/` 及直接依赖；引入固定 `pi-codex-compact`、完整 `billion-context-pi` 与 `pi-retry` published source，并增加 provider router、Pi 0.84.1 compatibility 和 bounded error presentation。
- Package：dependencies、bundled dependencies、package resources、lockfile、license、notices、SBOM、provenance、README、bootstrap 和 validation。
- External/user paths：`~/.config/mcp/mcp.json`、`/home/rosetears/code/ai/.mempalace`、Python tool environment、MCP server packages及可能的浏览器/embedding model 下载。

## Operation and Authorization Boundaries

本 proposal 只记录已确认的产品方向并授权 DEFINE artifact 写入。它不授权生产代码修改、删除旧实现、dependency/lockfile 修改、复制第三方源码、许可证文件替换、用户 HOME 或 Palace 写入、MCP 配置写入、Python/npm/browser/model 安装、网络下载、Git 操作、发布或 release。

上述操作必须在最终 spec/design/tasks/test-plan 完成、strict validation 通过且用户明确接受最终 `test-plan.md` 后，按风险类别分别取得精确授权。

## Open Questions and Unverified Items

- `pi-mcp-adapter`、MemPalace、Context7、Playwright MCP、CodeGraph、`pi-codex-compact`、`billion-context-pi` 与 `pi-retry` 的 frozen identity、license、完整 file inventory 与 Pi 0.84.1 兼容性必须保持可验证。
- “CodeGraph MCP”存在多个公开项目；在安装、依赖或配置前必须确认唯一仓库/package。
- MemPalace 的准确 stdio command/args、Palace path 环境变量和 Palace/Wing/diary mapping 需按固定版本 CLI 帮助与官方合同定稿。
- 当前 AILI Compact 与 `billion-context-pi` 的 session/context hooks、持久化数据和升级清理边界需要 design 明确；不得同时激活两个 context owner。
- 完整 vendoring 与完整 bundled dependency 两种发行方式都可保留上游代码；最终方式需满足“发行物包含完整上游代码和功能”以及 npm package、更新、provenance 和维护边界，需在 design 中确定。
- 主许可证改为 MIT 的版权授权以仓库所有者的明确决定为前提；第三方和历史来源文件必须逐项核对，不能仅替换根 LICENSE。
- 真实 Pi 原生 UI、Codex quota headers/status、MCP child disposal、Playwright 浏览器与 MemPalace embedding 下载仍需分别授权的 runtime 验证，当前均为 Unverified。
