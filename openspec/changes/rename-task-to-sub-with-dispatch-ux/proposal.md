## Why

[用户验收反馈|2026-08-21] 真实会话验收发现三项体验问题：

1. **YOLO 模式仍弹确认**：`Worker model/thinking override` 的 Allow once 弹窗不区分权限模式——用户已切到 YOLO（bypass），运行时仍然打断。核实：三个交互确认（模型/思考覆盖、`AILI Agent model change`）只看 `hasUI`，完全不读权限模式；`currentMode()` 已有完整的模式解析链（会话 `perm-mode` 条目 → `PI_PERMISSION_MODE` → headless 回退 → 默认）但丢弃了模式名。
2. **`task` 命名与 `hub` 不成对**：工具名 `task` 语义模糊，更名 `sub`（subagent 分发）与 `hub`（Agent 管理）形成一对。
3. **Web 端 subagent 信息缺失**：TUI 有 `name · selector · model · thinking · status` 紧凑行与身份明细，Web 只有通用工具块（原始 JSON 或 task 文本预览）。核实：所需数据全部已到达 Web（结果 `details`=完整 TaskResponse、live `partialResult.details`=TaskLiveSnapshot、异步投递=customType `aili.agent-result` 富 details），缺的只是展示层。

## What Changes

- **YOLO 自动通过**：`resolveCurrentMode` 暴露模式名；导出 `resolveCurrentPermissionModeName`/`isBypassPermissionMode`；preallocate 与 modelHub 的确认在 `yolo` 下直接通过（bypass 同时充当 headless 会话的确认通道），决策审计新增 `overrideDecision: "auto-approved-bypass"`；Agent 工具审批不动（yolo 下已被子权限解析器短路）。
- **`task` → `sub`**：全命名面更新（注册守卫/权限旁路/policy 桥/子工具表/doctor 证据/rose-context 提示词/docs/README/角色文件）；无别名（延续既有决策）；`formal_task` 不变；旧会话历史 `toolName:"task"` 退回默认渲染器（仅展示降级）。
- **Web 渲染对齐**：新增 `src/web/lib/agent-dispatch.ts`（TUI 同款字段选择）；`ToolCallBlock` 对 sub/task/formal_task/hub 特例——折叠预览显示身份行/动作摘要，展开显示 requested/effective/modelSource/overrideDecision/lifecycle/ids 结构化明细，原始 JSON 收进显式披露；运行中进度优先解析 TaskLiveSnapshot（替代把 JSON 当进度文本）；新增 `AiliAgentResultCard` 渲染 `aili.agent-result` 异步投递卡片。

## Impact

- `src/runtime/persistent-agents/production.ts`（模式解析导出 + 两处确认）、`model-selection.ts`（决策枚举）、`task-coordinator.ts`（同步结算附带 modelDecision）、`task-registration.ts`/`runtime.ts`/`policy.ts`/`native-integrations.ts`/`rose-context.ts`/`doctor.ts`（更名面）、`scripts/live-release-support.ts`（观察器工具名）
- Web：`lib/agent-dispatch.ts`（新）、`components/MessageView.tsx`、`components/aili/AiliAgentResultCard.tsx`（新）、`lib/tool-execution-progress.ts`、`hooks/useAgentSession.ts`、i18n en/zh
- 清单：`manifests/roles.json`（general profileHash/sourceHash）、`manifests/live-verification.json`（20 文件哈希）、`manifests/adapter-evidence.json`（10 工件哈希）
- spec delta：MODIFIED `persistent-agent-orchestration`（工具名）、MODIFIED `subagent-model-selection`（yolo 场景）、ADDED `web-persistent-agent-rendering`
