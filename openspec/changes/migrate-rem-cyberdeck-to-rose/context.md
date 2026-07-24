# Change Context: Rose Cyberdeck Migration

## Goal

[已知|用户] 一步完成当前思考/工作动画系统与产品品牌迁移：单个 Widget 展示 Rose Shimmer 与四行 Rose Code Rain，在深浅背景下保持可读、每帧无空白雨行、并行工具状态准确，同时把当前产品可见 Rem/Sakura 命名统一为 Rose。

## Confirmed Decisions

- [已知|用户] 选择 `C｜完整 Rose 品牌增强版`，范围包括统一动画、四阶段状态机、逐字符 Shimmer、真实统计、Rose Code Rain、无空白行保证、深浅适配、完整品牌迁移、向后兼容、来源/许可证边界和列出的测试验收。
- [已知|用户] 工具全部结束后采用方案 B：`tool → requesting`；只有后续 assistant `text_start` / `text_delta` 才进入 `working`。
- [已知|用户] 动画活动期间隐藏 Pi 原生 Working Line；Rose Shimmer 与 Code Rain 共用现有单一动画时钟。
- [已知|用户] token 只允许使用 Pi/provider 事件直接提供的真实 usage；没有真实 usage 时隐藏字段，禁止字符数估算。
- [已知|用户] Code Rain 正常几何节奏、确定性、单单元格 glyph、超宽全宽采样和 96 轨道上限保留；空白行仅通过渲染后的确定性短纵向轨迹兜底。
- [已知|用户] 深色向 `#10121D`、浅色向 `#FAF7F2` 淡出；浅色状态文字必须使用更深派生色。
- [已知|用户] canonical 产品名称为 `rose-cyberdeck`、`ROSE CYBERDECK`、Rose Shimmer、Rose Code Rain、`/rose-matrix`；旧 `/sakura-matrix` 仅作弃用兼容。
- [已知|用户] legacy Matrix 配置可迁移但不得删除；不得长期发布两个视觉相同的正式主题。
- [已知|用户] `pi-sakura-cyberdeck` 的上游名称、revision、license、NOTICE、provenance 与 SBOM 身份保持原样，不得制造原创归属误导。

## Evidence-backed Design Conclusions

- [工具结果] Pi 0.81.1 把 Working status container 放在 above-editor Widget 之前，并给非空 above-editor Widget 增加 `Spacer(1)`；把状态行并入同一 Widget 能消除状态行与雨之间的空行，但不会修改 Widget 整体上方的 Pi 布局间隔。
- [工具结果] Pi Extension API 暴露 `theme.name`，但没有可靠的任意自定义主题背景分类接口；`auto` 对未知主题必须 fail closed 并要求显式 `appearance`。
- [工具结果] `AssistantMessageEvent` 提供 `partial.usage`，但 provider 是否流式更新并无统一保证；缺失 usage 时隐藏 token 字段即可闭合行为。
- [工具结果] 当前 Matrix 几何、超宽 selector 和 glyph width 已有单元测试；现有完整 drop digest 同时绑定颜色，因此新合同把几何与 palette 断言拆开。
- [工具结果] Zentui 已有原子配置写入与“仅显式设置才持久化”的用户所有权策略；旧 Zentui 配置采用 fallback-read，首次显式保存才写新路径。

## Boundaries

- 不增加依赖、不修改 `package-lock.json`、不 fork/修改 Pi 核心、不复制外部 Shimmer 实现。
- DEFINE 只写 OpenSpec 合同；不实现、不运行真实 provider/TUI、不修改用户 Home 设置、不执行 Git、发布、安装或外部操作。
- 旧主题设置只提示迁移，不静默改写。
- legacy 配置和 rollback 数据不得自动删除。
- 兼容命令和第三方归属是允许保留 Sakura/Rem 字样的明确例外；其他产品品牌使用 Rose。

## Language

- **Rose Shimmer**：统一 Widget 的第一行；逐字符移动高光与往返指示符共同表达当前 phase。_Avoid_: 原生 Working Line、整行闪烁。
- **Rose Code Rain**：统一 Widget 的后四行确定性字符雨。_Avoid_: Sakura Matrix（除兼容/归属文本）。
- **appearance**：`auto | dark | light` 的 Matrix 颜色解析配置；显式值优先，未知 auto 主题不猜测。
- **activeToolCount**：活动 `toolCallId` 集合的逻辑大小，不是可独立增减的裸计数器。
- **real output usage**：Pi/provider assistant 事件直接报告的正数 `usage.output`；每个 assistant message 内单调不减，已结束 message 只累计一次，跨 message 的合法归零不视为 drift。_Avoid_: estimated tokens、字符数换算。
- **legacy attribution**：必须原样保留的上游名称、来源、revision、license、NOTICE、provenance/SBOM 身份；不属于当前产品品牌。

## Open Questions

无 material Open Question。

## Unverified

- 真实 Linux 深/浅终端中的最终视觉、对比度观感与 Pi 上游固定 Widget spacer，需要 BUILD 后另行授权的手工 TUI 检查。
- 各 provider 是否在 streaming 阶段报告 `usage.output`；缺失时 token 字段按合同隐藏，不影响实现可判定性。
