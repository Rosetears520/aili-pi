## Why

[已知|用户] `0.1.5` 安装后，footer 优先显示 `OpenAI cache 0/0 · 0M/0M tok`，掩盖了用户要求的 Codex subscription quota；思考视觉仍未完整对齐 pinned Sakura；subagent 调用上方缺少清晰的 Agent 名称。

## What Changes

- 保留 `pi-quota-status@0.3.0` 作为真实 quota 数据与轮询所有者，在 Zentui 展示边界默认隐藏 `pi-cache-stats`，并确保 `pi-quota-status` 在显式启用其他右侧 status 时仍具有更高展示优先级。
- 只展示一个 Codex weekly quota：优先使用 upstream `weekly`/`Wk`，仅在它缺失时兼容当前被误标为 `5h`、但 reset 跨度实际接近 7 天的 primary 数据；统一展示为 `codex <percent> <reset>`，不得伪造或重复窗口、百分比或重置时间。
- 将 Matrix 与 `✦ REASONING` 的动画/渐变视觉恢复到 `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589` 的 Sakura 色值，同时保留 Pi 0.81.1 lifecycle/import 兼容改动。
- 修复 Matrix 在超宽终端中因固定 96-drop 前缀截断而形成永久空白右区的问题；普通宽度继续保留上游的稀疏瀑布节奏与可调 density。
- 在现有 `@agwab/pi-subagent@0.4.8` 工具调用渲染器上方添加 bounded Agent 标签；保留工具名称、参数 schema、执行、结果和 lifecycle 行为。
- 文档说明 `rem-cyberdeck` 是本 Package 的暗色主题及启用方式。

## Non-Goals

- 不实现、复制或 fork 新 quota poller，不读取原始认证数据，不从不存在的数据伪造 weekly quota；`5h` 兼容仅用于当前 upstream primary 周窗口的错误标签。
- 不改变 `pi-cache-optimizer` 的缓存统计与命令行为；只改变其 Zentui 默认展示 placement。
- 不改变 subagent agent resolution、执行 backend、并发、artifact、权限或安全边界。
- 不在 Package 安装时自动覆写用户主题；本机主题切换是本次用户单独批准的外部设置操作。

## Impact

预计影响 Matrix drop selection、Zentui status/config/gradient、subagent tool renderer wrapper、相关 unit/integration tests、README、provenance/NOTICE，以及本 change 的 OpenSpec 证据。dependency/lockfile、commit、push、publish、release、安装和后续真实 provider/subagent probe 仍需独立批准。
