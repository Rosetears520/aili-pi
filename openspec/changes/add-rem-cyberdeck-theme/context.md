# Change Context: Rem Cyberdeck Theme

## Goal

[已知|用户] 为官方 Pi 上的 AILI Package 增加 Rem Cyberdeck Theme/TUI：Rem 调色板、用户提供的 Unicode/Braille 头图、工作动画、信息页脚，以及默认启用并可安全降级的固定底部编辑器体验。

## Confirmed Decisions

- [已知|用户] 以 `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589` 为精确 MIT 源：除 Rem 头像和 Rem 配色外，直接复用其 Theme、header、matrix、Zentui editor/footer 与 fixed-editor。
- [已知|用户] Package SHALL expose four Extensions: the existing AILI entry plus copied Sakura header, matrix, and Zentui entries. 固定编辑器默认启用；若 Pi 内部 TUI 或终端能力检查不通过，回退原生 editor，不得破坏会话。
- [已知|用户] 用户提供的头像位于 `assets/rem-head.txt`，只用于本 change 的 header。
- [工具结果] 现有 Package 已集成 `pi-quota-status@0.3.0`；本 change 复用它的 status，不新增 quota 请求或持久化协议。
- [工具结果] 当前 Package 是 Linux-only；不得扩展平台支持。

## Boundaries

- 不 fork/替换 Pi CLI，不修改 Pi 核心。
- 复制的 Sakura/Zentui MIT 代码必须保留许可文本、NOTICE、精确 revision、文件清单、Rem 变更和 SBOM/provenance 记录；不得复制或改造 Pi 核心。
- 不实现或重做 quota 轮询、认证、浏览器/网络逻辑。
- 不交付字体下载、位图角色资产、macOS/native Windows 或 OS-sandbox 承诺。

## Open Questions

- [未验证] 头像在用户终端字体、宽度和窄终端下的视觉效果，须由后续手动 TUI 检查确认。
- [未验证] 私有 TUI patch 能否覆盖当前及未来 Pi 版本；该能力只能作为兼容检查后的增强。
