# Tasks

## 1. 新 sub 协议与执行语义
- [x] 1.1 `sub-schema.ts`：`SUB_TOOL_SCHEMA`（description/prompt/subagent_type/task_id/background/model/thinking，无 batch 无编排字段）+ `validateSubRequest`；formal 内部 schema 保留 formalContext/continuationAudit，仅供 `submitTrusted`。
- [x] 1.2 `sub-coordinator.ts`：`SubCoordinator.submit`（公开）走新 schema、foreground 默认（default-sync）、background 显式；`submitTrusted` 保持 formal 路径；嵌套 background 拒绝（SUB_BACKGROUND_NESTED）。
- [x] 1.3 `task_id` 续接：`continuableAgent`（SUB_NOT_FOUND/SUB_BUSY/SUB_TERMINAL/SUB_SELECTOR_MISMATCH/SUB_OWNERSHIP/SUB_FORMAL_CONTINUATION_REFUSED）+ `continueAndSchedule`（既有 Agent 上新 job/turn，turnSource=sub.continuation，executor 收 `continuation:true` 走 `sendUserMessage`）。
- [x] 1.4 结果面：settlement/accepted 快照与 renderer 增加 `taskId`；`cancelTask(taskId)` + `/sub-cancel` 用户命令。

## 2. 严格 model/thinking
- [x] 2.1 `model-selection.ts`：层序重排（direct-user-turn → one-shot → instance → project-role → user-role）；`normalizeModelKey` + `resolveSubModelIdentifier`（canonical/exact id/alias/唯一 compact，SUB_MODEL_UNAVAILABLE/SUB_MODEL_AMBIGUOUS）。
- [x] 2.2 `production.ts` preallocate：rejected → SUB_MODEL_DENIED 失败；确认被拒/无 UI → SUB_MODEL_DENIED 失败；确认前先严格 canonicalize；删除 catch-fallback 重解析；ModelSelectionError 按显式请求映射 SUB_MODEL_UNAVAILABLE/SUB_THINKING_UNSUPPORTED。
- [x] 2.3 `normalizeTaskModelReference` compact 兜底（explicit 授权下的紧凑别名）。

## 3. 空结果与 history
- [x] 3.1 `assistantText()` 跳过 tool-only assistant 继续向前；settled 空 output → SUB_EMPTY_RESULT failed（含 production 抛出与 coordinator invariant 双层）。
- [x] 3.2 `readAgentHistory` 逐 entry redact（private-key/assignment 保留字段名/protected-path 整行替换）+ `redactedSensitiveEntries` 计数；child 执行 guard 不变。

## 4. Hub 删除
- [x] 4.1 删除 `hub.ts`/HubService/HUB_TOOL_SCHEMA/HUB_RENDERERS/modelHubOperation/revive/onRelease/releaseAgent；runtime 仅注册 sub/formal_task；schedulePark 变纯内部 controller 回收。
- [x] 4.2 policy：`hub` 入 LEGACY_OR_TOP_LEVEL_ONLY_TOOLS，CHILD_BRIDGE 仅 sub；child 工具表去 hub，嵌套 sub 用新 schema。
- [x] 4.3 doctor/live-evidence-contract/native-integrations/formal-orchestration 路径与命名更新；live-release-support 观察器改新参数面（background!==true 判同步）。

## 5. 命名与兼容
- [x] 5.1 文件重命名 task-*→sub-*（git mv）；TaskCoordinator→SubCoordinator 等符号重命名；runtime.task→runtime.sub。
- [x] 5.2 旧 Journal：hub 事件保留可 replay；idle/parked→running 原生转移支持旧 parked 续接拒绝 formal 之外的语义不变。
- [x] 5.3 manifests/adapter-evidence.json 刷新（含重命名路径映射与删除工件）；skill-compatibility 经 sync 无漂移。

## 6. 测试与文档
- [x] 6.1 单测：persistent-agent-sub（含 SUB_BUSY/续接/空结果/嵌套 background/selector mismatch/terminal）、sub-registration、sub-renderer、policy、output-delivery（redaction）、model-selection（新层序）。
- [x] 6.2 集成：persistent-agent-runtime（新注册面/读写引用）、production（新参数面 sandbox/yolo）、formal-orchestration-runtime（续接拒绝替代 hub send）、sub-collision、package-runtime、doctor、runtime。
- [x] 6.3 Web：agent-dispatch/MessageView/tool-execution-progress 去 hub、新参数面（node --test 7/7、12/12）。
- [x] 6.4 README + docs/persistent-agents.md 重写为 sub 单入口心智模型。
- [ ] 6.5 真实 Pi provider 验收（GLM 5.1 low / GPT-5.6 Luna max / 同 task_id 跨 Turn 换模型 / 双 background 并发 / foreground >5 分钟）——需真实 provider 环境，另行执行后回填。

## 7. 轻量进度记录与校验解耦

- [x] 7.1 `sub` 描述与指南改为：多步骤工作创建自由格式 `progress.txt`；`formal-task-board.md` 可选且不是执行前提。
- [x] 7.2 trusted formal protection 仅校验安全 change id 并派生保护路径，不读取或格式校验 Board/progress Markdown。
- [x] 7.3 README 与 persistent-agent 文档同步运行状态、OpenSpec artifact 和连续性文件的所有权边界。
- [x] 7.4 编写 `docs/aili-workflows-progress-validation-handoff.md`，供独立 Agent 修改 canonical `aili-workflows`。
- [x] 7.5 聚焦测试、typecheck 与当前 change 的 OpenSpec 原生定向校验。

## 8. 消费 rose-aili 0.4.8

- [x] 8.1 核实 release run `32687088484`、tag/source commit、npm gitHead 与 tarball SHA-256。
- [x] 8.2 更新 skill sync release contract：退役 formal Board protocol record，改为 hash-bound formal task notes reference。
- [x] 8.3 同步 58-skill snapshot、generated Pi bundle、roles、routing、compatibility、provenance、README/bootstrap pin。
- [x] 8.4 workflow bundle/doctor 仅保留 Agent-selection 与 package-envelope 机器协议，formal notes 走文档兼容检查。
- [x] 8.5 运行聚焦生成物、bundle、doctor、roles、provenance、package、bootstrap 测试与定向 OpenSpec 验证。

## 9. 现代化恢复异步协调（2026-08-27 用户修订）
- [x] 9.1 保留当前 sub/task_id/managed+herdr backend，重新公开 top-level `background:true`；foreground 默认、nested background 拒绝、自动投递保留。
- [x] 9.2 恢复轻量 `hub jobs|wait|output|history|send|cancel`；不恢复 formal_task、旧 run/attempt selector、旧模型 fallback。
- [x] 9.3 `hub wait` 默认无模型自造超时，仅显式 timeout_ms 或调用取消终止；output/history 使用现有受限、脱敏 sidecar reader。
- [x] 9.4 更新 README、persistent-agent docs、doctor 与聚焦测试；adapter evidence/compatibility 已生成并验证。
