## Why

[已知|用户] AILI 需要独立于核心 distribution 的 Rem Cyberdeck 视觉与 TUI 体验；用户选择以 `beautifulrem/pi-sakura-cyberdeck` 的功能构成为参考，并提供了 Rem Unicode/Braille 头图。

## What Changes

- 从 `pi-sakura-cyberdeck@165a1f8011a12a58a6409b56b8a6c0416cd9b589` 复制 Theme、header、matrix、Zentui editor/footer 和 fixed-editor；仅替换 Rem 头像和完整 Rem 配色。
- 保持其默认启用固定底部 editor 的行为：内部兼容检查失败时保留原生 editor 并报告降级。
- footer 聚合 cwd、Git branch/dirty、context usage、token count、本机时间与现有 quota/permission/network status；移除 OS 与 runtime version，空间不足时换行。
- 增加 Theme/TUI 的单元、集成、手动终端和降级验证。

## Non-Goals

不替换/fork Pi，不复制 Pi 核心，不重做 quota 轮询，不增加字体安装/下载，不支持 macOS/native Windows。

## Impact

预计影响 `package.json` 的 Pi themes resource、vendored `extensions/zentui/`、header/matrix extensions、`themes/`、tests、README、MIT licenses/NOTICE、provenance 与 SBOM。任何 dependency/lockfile 变动、提交、发布仍需独立批准。
