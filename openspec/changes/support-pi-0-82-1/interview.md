# Requirements Interview: Pi 0.82.1 Runtime Compatibility

## Metadata

- Mode: material-delta write-back
- Target: `openspec/changes/support-pi-0-82-1/`
- Status: `BUILD_LOCALLY_COMPLETE`
- Replaces: `support-pi-0-82-0`

## Retained Decision — Wrapped Bash Session Environment

此前用户选择 **A / Full Pi parity**：AILI local与sandboxed wrapped bash完整传递 `ExtensionContext`，保留 `PI_SESSION_ID`、持久session的 `PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`。AILI不主动读取Session；经已授权bash显式读取所产生的tool result属于Pi普通工具行为，不属于AILI Compact normal projection的原文隔离保证。

本轮没有推翻该决定；Pi 0.82.1继续沿用此host contract。

## Resolved Material Delta — Exact Pi Target

### User decision

将原目标从Pi `0.82.0`改为精确 `0.82.1`，并“现在开始做”。

### Write-back

- change identity改为 `support-pi-0-82-1`；
- capability改为 `pi-0-82-1-runtime-compatibility`；
- package/bootstrap/evidence/test目标统一为0.82.1；
- legacy `@agwab`任务全部替换为当前persistent `task`/`hub` host seams；
- final test plan重新接受前不进入BUILD。

## Superseded Material Delta — Codex GPT-5.6 372K Context

### Confirmed upstream evidence

Pi 0.82.1 npm catalog把 `openai-codex/gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`设为 `contextWindow:272000`，并保留 `inputTokensAbove:272000` long-context cost tier。Pi文档的partial `modelOverrides`存在于用户 `models.json`；Extension legacy `models` registration会替换provider模型集合。

### Superseded user decision

Codex登录的GPT-5.6系列实际可用上下文曾按 `372000` 处理；该决定已被后续用户决定明确撤销。

### Exact interpretation

- provider：仅 `openai-codex`；
- models：仅Sol/Terra/Luna三个Pi 0.82.1实际ID；
- changed field：仅 `contextWindow`；
- direct `openai`、其他Codex模型、cost tier threshold、maxTokens、reasoning、compat、auth不变；
- 不修改node_modules，不自动写用户models.json；
- package runtime使用delegating Provider wrapper，provider ownership冲突时fail closed。

### Visible trade-off

该决定高于Pi 0.82.1 intentional 272K默认值。超过272K时仍适用Pi现有long-context pricing metadata；AILI不得把372K描述成short-tier或免费保证。真实Codex OAuth >272K probe需单独授权。

## Resolved Material Delta — Retain Pi 272K Metadata

### User decision

用户明确决定：“还是272K吧，不改了。”因此取消package-owned372K Provider/model metadata adapter，Codex OAuth GPT-5.6 Sol、Terra、Luna继续使用Pi 0.82.1上游272K metadata。

### Classification and write-back

- Classification: `confirmed` + `material-delta`。
- Scope removed: Provider wrapper、372K parent/child映射、catalog-refresh/owner-conflict/long-context probe测试及相应文档claim。
- Preserved: Pi 0.82.1 baseline、wrapped bash parity、persistent `task`/`hub` host兼容性、native summary cache boundary。
- Write-back targets: proposal、context、design、spec、tasks、test-plan、README。

## Final Test-Plan Acceptance and BUILD Authorization

用户明确回复“接受，你直接做”，接受 `test-plan.md`，批准安装精确 `@earendil-works/pi-coding-agent@0.82.1` 及修改dependency/lockfile，并授权开始BUILD。首次安装暴露顶层0.81.1 TUI类型冲突后，用户再次明确“批准”将 `@earendil-works/pi-agent-core`、`pi-ai`、`pi-tui` 开发依赖精确对齐到0.82.1。上述授权不扩展到HOME/TUI、Git、publish或release操作。

## Readiness

Requirements-grilling与最终test-plan gate均已关闭；本地BUILD与deterministic verification已完成。HOME/TUI、Git、publish和release操作仍未授权。
