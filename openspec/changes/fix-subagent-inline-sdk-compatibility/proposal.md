## Why

> **Superseded (2026-07-25):** `replace-subagent-runtime-with-persistent-agent-framework` replaces the affected runtime instead of repairing inline compatibility. This change must not receive an independent production patch; its historical failure fixtures remain regression evidence only until the separately gated legacy dependency removal completes.

[已知|会话证据] 普通 `subagent` 调用在未指定 backend 时由 `@agwab/pi-subagent@0.4.8` 自动选择 `inline`，但该 runner 仍调用 Pi 0.81.1 主入口未导出的 `AuthStorage.create()` 和不存在的 `ModelRegistry.create()`，导致子任务在模型请求发出前以 `Cannot read properties of undefined (reading 'create')` 立即失败。现有 AILI live verification 只显式覆盖 `headless`，因此发布验证可以通过而默认用户路径仍不可用。

## What Changes

- 让 AILI 支持的普通单任务和并行 `subagent` 调用在省略 backend 或使用 `auto` 时选择与 Pi 0.81.1 兼容的执行路径，不再进入已知损坏的默认 inline 初始化路径。
- 对显式 `inline` 请求提供确定、可操作的兼容性结果；不得继续把 SDK 初始化异常模糊归类为真实模型/provider 失败。
- 保持 pinned upstream `subagent` 的公开工具名称、参数 schema、Agent 解析、显式 `headless`/`tmux` 行为、async lifecycle、worktree/sandbox、artifact/result envelope 和取消语义。
- 保持 AILI 子进程凭据路径 guard、`PI_PERMISSION_MODE` 模式转发、调用方工具上限和递归 subagent 排除，不以兼容修复削弱权限边界。
- 增加省略 backend 的真实默认路径回归，并分别覆盖单任务、并行、显式 headless、显式 inline 诊断、权限模式转发和无业务文件变更。
- 修正 doctor/release evidence，使其明确记录实际验证的 backend 与 Pi SDK 兼容面，禁止用仅 headless 的证据证明默认 backend 可用。

## Capabilities

### New Capabilities

- `subagent-runtime-compatibility`: 定义 AILI 在当前 Pi SDK 上选择、诊断和验证 subagent backend 的兼容性契约。

### Modified Capabilities

<!-- 当前 `openspec/specs/` 没有已发布 capability；本变更不修改其他 change-local capability。 -->

## Impact

预计影响 `src/runtime/subagents.ts`、subagent unit/integration/live tests、doctor/release evidence 与 README/troubleshooting。首选方案不 fork 或复制 upstream runner，也不修改 `node_modules`；若实现发现必须升级 `@agwab/pi-subagent` 或变更 lockfile，须停止并取得单独的 dependency/lockfile 批准。commit、push、publish、release、安装及真实 provider probe 均不由本 proposal 授权。
