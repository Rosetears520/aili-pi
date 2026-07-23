# Change Context: Quota, Sakura Animation, and Subagent Agent Label

## Goal

[已知|用户] footer 显示真实 Codex subscription quota，而不是把 cache optimizer 统计误当作额度；Matrix 与 reasoning 视觉对齐 pinned Sakura；subagent 调用上方明确显示具体 Agent 名称。

## Confirmed Decisions

- [已知|用户] Codex 付费额度只展示一个 7-day window，最终格式为 `codex <percent> <reset>`；不得同时显示 `codex` 与 `7d` 两条。
- [工具结果] 当前 `pi-quota-status` state 把 active `openai-codex/gpt-5.6-sol` 的 primary dimension 命名为 `5h`，但 `observedAt` 到 `resetAt` 相差约 5.6 天，证明该数据实际上是周窗口而非 5 小时窗口。`pi-quota-status@0.3.0` 的 usage parser 固定把 `primary_window` 命名为 `5h`，因此属于 upstream label drift。
- [设计结论] AILI 展示优先选择明确的 `weekly`/`Wk` segment；只有它缺失时才把旧版误标 `5h` segment 当作 weekly compatibility fallback。两种来源都统一显示为单个 `codex <percent> <reset>`，百分比/reset 原样保留。
- [工具结果] 错误文本 `OpenAI cache 0/0 · 0M/0M tok` 来自 `pi-cache-optimizer` 的 `pi-cache-stats` status。Zentui 目前按 key 排序，cache 在 quota 前并可先耗尽右侧宽度。
- [已知|用户] 允许检查并调整 quota 插件集成。[设计结论] 源码证据表明 poller 已产生所需真实数据，因此最小修复保留 upstream poller，只修正 AILI/Zentui 的 placement、priority 和 display mapping，不复制 quota source。
- [已知|用户] Matrix 和 `✦ REASONING` 两种工作/思考视觉均使用 pinned Sakura 色值；Rem header、editor shell 和其他主题表面保持 Rem。
- [工具结果] 本机没有 Matrix config，当前因此使用 upstream 默认 `density=0.65`、`height=4`、`fps=10`。算法只在偶数 cell 建轨、随机启用约 65%，且每条 drop 在可见区外还有 `gap=1..5`；普通宽度中出现数列空白主要是上游稀疏瀑布设计，不是字符宽度错误（全部 78 个 glyph 的 Pi-TUI visible width 均为 1）。
- [工具结果] 真正的分辨率相关缺陷是 `selected.slice(0, 96)`：当终端约超过 300 columns 时，只保留左侧前 96 条 active tracks。确定性探针在 width 320/384/480/640 分别留下约 47/89/187/343 cells 的永久空白右区。
- [设计结论] 普通宽度维持 pinned Sakura 稀疏节奏；超宽宽度改为 bounded、确定性且覆盖整个 width 的 track selection，不尝试把所有时间性空列填满。用户若希望整体更密，继续通过 `/sakura-matrix density <0.45-0.95>` 显式选择，而不偷偷改变默认值。
- [已知|用户] subagent 调用渲染上方显示具体 Agent 名称。[设计结论] 未指定 Agent 时明确显示 `agentless`，并把标签限定为请求值而非伪称成功 resolved Agent。
- [已知|用户] 本机 Pi 可以切换到暗色；已将 `~/.pi/agent/settings.json` 的 theme 从 `light` 改为 `rem-cyberdeck`，重启后生效。

## Boundaries

- Quota 数值、reset 和 polling 仍由 `pi-quota-status` 负责；AILI 只做 weekly segment selection、legacy label compatibility 与 footer priority。
- Cache status 可由用户在 Zentui 设置中显式重新启用；即使启用，quota 在窄宽度下优先。
- Matrix 的 width 是 TUI cell count，不是显示器像素分辨率；resize 会按新 width 重新 seed，因此图案会跳变，但 frame timing 不会永久删除特定列。
- Agent 标签必须清理控制字符、折叠空白并限制长度；不把 task、role context 或 secret 内容带入标题。
- Package 不自动修改主题设置；当前本机写入不构成安装器权限。

## Open Questions

- 无 material product question。真实终端视觉与真实 subagent provider 调用在 BUILD 后仍需各自授权或人工验证；提高本机 Matrix density 也属于另一次明确的用户设置选择。
