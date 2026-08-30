## Why

[用户方案|2026-08-21] 真实 Pi 会话验收暴露了当前 `sub + formal_task + hub` 三入口运行时的结构性问题：

1. **模型被迫当调度器**：主模型要自己 `hub wait`（验收中出现的 300 秒 `timeoutMs` 人为失败源就是模型主动 wait）、`hub jobs` 轮询、`hub output` 取结果、`hub send` 续接——Subagent 系统长成了一个小型分布式任务系统。
2. **紧凑模型名解析失败**：`gpt5.6luna`/`glm5.1` 这类输入在 one-shot 执行路径只做 exact id 匹配，解析失败后静默 fallback 到 Terra/xhigh，任务显示 completed 但模型根本不是请求的那个。
3. **completed + 空 output**：`assistantText()` 倒序命中第一条 assistant 消息（可能 tool-only）就返回 `""`，空结果被当作成功持久化。
4. **history 整段不可读**：一行命中 credential 规则即 deny 整个 child history，诊断能力反而缺失。
5. **运行状态 Markdown 过度校验**：高频变化的 `formal-task-board.md`/`progress.txt` 被当作机器协议反复解析，代码工作完成后仍可能花费时间做与行为无关的格式验证。

## What Changes

- **公开协议收敛为 `sub` 单入口**：schema 精确为 `description/prompt/subagent_type/task_id/background/model/thinking`；删除公开 `tasks[]` batch 与 `task/context/name/async/tools/workspace/writeScope/cwd` 编排字段。foreground（同步返回结算结果）为默认；`background:true` 立即返回 `task_id` 并由 `AsyncDeliveryService` 自动投递。嵌套 sub 保持同步、深度受限，且禁止 background。
- **`task_id` 续接**：`task_id` 1:1 映射稳定 `agentId`，即"可续接的 Child Session identity"。不带 `task_id` 创建并立即执行一个 Turn；带 `task_id` 重开同一 Child Session 执行下一 Turn（同会话、保留上下文、每 Turn 重新解析 model/thinking）。运行中返回 `SUB_BUSY`；selector 不一致返回 `SUB_SELECTOR_MISMATCH`；formal Agent 拒绝公开续接（`SUB_FORMAL_CONTINUATION_REFUSED`，formal 续接归 formal_task 生命周期）。
- **Hub 整体删除**：`hub.ts`、`HUB_TOOL_SCHEMA`、`HubService`、`HUB_RENDERERS`、`modelHubOperation`、hub 工具注册、mailbox/wait/jobs/output/history/inbox/model 全部移除；cancel 原语保留为用户侧 `/sub-cancel <task_id>` 与运行时 `cancelTask`；controller idle TTL 保留为纯内部资源回收。
- **model/thinking 严格语义**：解析顺序改为 本 Turn 已授权选择（direct-user-turn/确认 Allow once/YOLO）→ instance → project-role → user-role → parent → profile → runtime；显式请求解析失败/不支持/未授权时以 `SUB_MODEL_UNAVAILABLE`/`SUB_MODEL_AMBIGUOUS`/`SUB_MODEL_DENIED`/`SUB_THINKING_UNSUPPORTED` 失败整个 sub 调用（不再静默 fallback）。新增 `resolveSubModelIdentifier`：canonical → exact id → exact alias → 唯一 compact alias（`normalizeModelKey`），多匹配列候选绝不猜。
- **空结果修复**：`assistantText()` 跳过 tool-only assistant 消息继续向前找非空文本；settled Turn 无非空 terminal output 时结算为 `SUB_EMPTY_RESULT` failed（formal 包络校验保持在其后）。
- **history 逐条 redact**：`readAgentHistory` 改为逐 entry `redactCredentialText` + 残余探测（受保护路径 → `<redacted-protected-path>`），返回 `redactedSensitiveEntries` 计数；child 工具执行入口的 fail-closed credential guard 不变。
- **命名清理**：`task-schema→sub-schema`、`task-coordinator→sub-coordinator`、`task-registration→sub-registration`、`task-hub-renderer→sub-renderer`；`TaskCoordinator→SubCoordinator`、`TaskToolInfo→SubToolInfo`、`registerCanonicalAiliTaskTool→registerCanonicalAiliSubTool`、`isCanonicalAiliTaskActive→isCanonicalAiliSubActive`；`runtime.task→runtime.sub`。结果/验收快照新增 `taskId` 字段。
- **运行状态文件降级为非阻塞连续性记录**：多步骤工作创建并追加自由格式 `progress.txt`；`formal-task-board.md` 仅为可选的人类任务备注。`sub` 与 trusted formal dispatch 不再读取或格式校验这两个 Markdown 文件；运行状态以 Journal 为准，OpenSpec 只校验原生 planning artifacts。
- **消费已发布 canonical 修复**：固定并同步 `rose-aili@0.4.8` / `a5284ee105a084392a944aee04313dcf7c294a64`，接受退役 `aili-task-board/v1` runtime schema，将 formal notes 记录为普通 hash-bound reference，并让 bundle/doctor 只把 Agent selection 与 package envelope 视为机器协议。

## Capabilities

### New Capabilities

- `lightweight-progress-tracking`: 定义必须创建但不做格式校验的 `progress.txt`，以及可选且非权威的 `formal-task-board.md`。

### Modified Capabilities

无。

## Impact

- 删除：`src/runtime/persistent-agents/hub.ts`、`tests/unit/persistent-agent-hub.test.ts`、`tests/integration/task-hub-identity.test.ts`。
- 重写/重构：`sub-schema.ts`、`sub-coordinator.ts`（续接 + busy guard + 空结果 invariant + 前台默认）、`sub-registration.ts`、`sub-renderer.ts`、`runtime.ts`（仅注册 sub/formal_task + `/sub-cancel`）、`production.ts`（严格模型语义 + `resolveSubModelIdentifier` 接入 + 续接执行路径 `sendUserMessage` + assistantText 修复 + 删除 modelHub/releaseAgent/revive）、`model-selection.ts`（层序重排 + compact resolver）、`output-delivery.ts`（history redact）、`policy.ts`（hub 出桥名单并入 legacy 硬拒）、`storage` 兼容（idle/parked→running 原生支持）。
- 外围：`native-integrations.ts`、`formal-orchestration.ts`、`doctor.ts`、`live-evidence-contract.ts`、`scripts/live-release-support.ts`（观察器改新参数面）、Web `agent-dispatch.ts`/`MessageView.tsx`/`tool-execution-progress.ts`。
- 测试迁移：persistent-agent-sub(sub-registration/renderer/policy/output-delivery/sub-collision)/runtime/production/formal-orchestration-runtime/model-selection/doctor/runtime/package-runtime；新增 SUB_BUSY/续接/空结果/嵌套 background 拒绝/history redact 用例。
- 上游同步：`skills/`、`upstream/aili-workflows-runtime/`、lock/compatibility/roles/routing/provenance/README/bootstrap/doctor/workflow-bundle 与聚焦测试更新到 `rose-aili@0.4.8`。
- 清单：`manifests/adapter-evidence.json`（subagent.dispatch 工件路径与哈希刷新）；`live-verification.json` 保持历史 NON_PASS 证据不变（真实 provider 验收另行执行）。
- 文档：`README.md`、`docs/persistent-agents.md`。
- Legacy：旧 Journal 中 hub 事件仅作历史 replay，不迁移不删除；崩溃后旧 running job 仍记 `interrupted` 不自动重放；已完成 idle child 可通过 `task_id` 透明续接。
