## Why

[已知|用户] 当前工作视觉由 Pi 原生 Working Line 与独立 Sakura Matrix Widget 组成，状态行和代码雨之间存在布局间隔；固定暗色拖尾在浅色背景下也会降低可读性。用户已选择一次完成 Rose Shimmer、四行 Rose Code Rain、深浅适配、无空白行保证以及从 Rem/Sakura 到 Rose 的完整产品品牌迁移。

## What Changes

- 用一个 above-editor Widget 统一承载一行 Rose Shimmer 与四行 Rose Code Rain；活动期间隐藏 Pi 原生 Working Line，并与现有 Matrix 共用一个动画时钟。
- 增加 `requesting`、`thinking`、`working`、`tool` 状态机；并行工具按活动 `toolCallId` 集合计数，最后一个工具结束后回到 `requesting`，首个正文流事件再进入 `working`。
- 仅显示单调时钟计算的真实耗时和 Pi/provider 事件直接报告的真实 output usage；不得通过字符数估算 token。
- 将 Code Rain 改为以雷姆蓝、青色和冰蓝为主、Rose 品牌色为辅的确定性调色板，并在正常轨迹完成后以确定性短纵向轨迹补齐完全空白的行。
- 增加 `auto | dark | light` 外观解析：明确配置优先，已知当前主题次之；未知主题不静默猜测背景，并提供可操作提示与明确回退。
- **BREAKING**：唯一正式主题由 `rem-cyberdeck` 改为 `rose-cyberdeck`，Header、Matrix、Zentui、README、配置路径和内部 Rose palette/gradient 符号同步迁移；不再同时发布两个视觉相同的正式主题。
- 保留 `/sakura-matrix` 作为仅用于迁移的弃用别名；新 Matrix/Zentui 配置不存在时可读取并迁移旧配置，且不得删除旧文件。
- 保留 `pi-sakura-cyberdeck` 的上游名称、锁定 revision、许可证、NOTICE 和 provenance/SBOM 身份；只更新本地修改说明以准确描述 Rose 改造。

## Capabilities

### New Capabilities

- `rose-working-animation`: 统一 Rose Shimmer + Code Rain Widget、状态机、真实统计、深浅外观、无空白行保证、生命周期清理与命令/配置兼容。
- `rose-cyberdeck-branding`: 单一 `rose-cyberdeck` 主题、Header/Zentui/文档品牌迁移、旧主题迁移提示及第三方归属边界。

### Modified Capabilities

- None. `openspec/specs/` 当前没有已发布的 canonical capability spec；本 change 以新 capability 明确取代先前已发布 change 中的 Rem/Sakura 产品行为，但不改写历史合同。

## Impact

预计影响 `extensions/matrix/`、`extensions/header/`、`extensions/zentui/`、`src/runtime/` 的头图资源、`themes/`、`package.json` 的 Pi theme resource、README、Matrix/Zentui/package/provenance 测试，以及本 change 的 OpenSpec 文档。不得增加依赖或修改 lockfile；外部访问、用户设置写入、Git、发布、安装及真实 provider/TUI 操作仍需各自独立权限，本提案不授权实现或任何此类操作。
