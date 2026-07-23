# Theme and TUI References for the Follow-up Change

## Scope

[已知|用户] 主题、TUI 与字体实现已移出 `create-aili-pi-distribution`，将在核心能力完成后通过独立 OpenSpec change 定义和验收（来源：`interview.md` F4）。[工具结果] 本文件只保存后续 DEFINE 资料，不是当前 BUILD scope 或视觉接受。

## Pi official sources

- [已知|外部] Theme format、token、placement、switching 与 reload：[Pi themes documentation](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/themes.md)。
- [已知|外部] Theme schema：[theme-schema.json](https://raw.githubusercontent.com/earendil-works/pi/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/src/modes/interactive/theme/theme-schema.json)。
- [已知|外部] 官方暗/亮主题基线：[dark.json](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/src/modes/interactive/theme/dark.json)、[light.json](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/src/modes/interactive/theme/light.json)。
- [已知|外部] Extension 与 UI API：[extensions.md](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/extensions.md)。
- [已知|外部] 官方 UI examples：[custom header](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/examples/extensions/custom-header.ts)、[working indicator](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/examples/extensions/working-indicator.ts)、[custom footer](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/examples/extensions/custom-footer.ts)、[status line](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/examples/extensions/status-line.ts)。
- [已知|外部] Modifier key/terminal setup：[terminal setup](https://github.com/earendil-works/pi/blob/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/docs/terminal-setup.md)、[tmux setup](https://github.com/earendil-works/pi/blob/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/docs/tmux.md)。

## Font candidates to inspect

- [已知|外部] JetBrains Mono 官方页面：https://www.jetbrains.com/lp/mono/
- [已知|外部] JetBrains Mono source/license：https://github.com/JetBrains/JetBrainsMono
- [已知|外部] Maple Mono source/releases：https://github.com/subframe7536/maple-font
- [未验证] 用户表述“JetBrains Maple Mono”尚不能证明是单一 font family、两种字体组合或某个 patched variant；后续 change 必须以准确 family/release/license 为准。

## Decisions deferred to the follow-up DEFINE

- [开放问题] 选择 JetBrains Mono、Maple Mono、二者 fallback，还是一个明确 patched/Nerd Font/CJK variant。
- [开放问题] 字体只作为文档建议，还是由 opt-in installer 下载；若下载，需 source、version、SHA-256、license、owned-path 和 uninstall contract。
- [开放问题] 第一版主题数量、palette、dark/light/high-contrast、CJK/emoji/width 与 256-color/NO_COLOR 降级标准。
- [开放问题] header、working indicator、footer/status、subagent widget 的具体布局和 reduced-motion behavior。
- [开放问题] 用户视觉 acceptance 的截图/终端/列宽矩阵和最终验收方式。

## Follow-up recommendation

[推断] 后续 change 应先从官方 dark/light 与 schema 派生完整 token set，再制作原创 palette；TUI 只使用官方 Extension UI hooks；字体默认先文档化，不在许可/哈希/卸载合同确定前自动下载。**置信度：高。**
