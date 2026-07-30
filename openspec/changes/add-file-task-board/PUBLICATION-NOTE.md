# Public PR Sanitization Note

[已知|用户] 用户选择在提交到公开仓库前制作脱敏副本。

[工具结果] 本公开副本省略仅用于本地连续性的 `progress.txt` 与 `handoffs/**`，将 `tasks.md` 中的内部 Agent session references 替换为保持协议形状的脱敏占位符，并移除本机 canonical-source 绝对路径。

[框架内] 这些占位符不提供 Runtime evidence、resume authority、verification 或 completion proof；实现与接受状态必须由当前受信环境中的 fresh evidence 重新确认。
