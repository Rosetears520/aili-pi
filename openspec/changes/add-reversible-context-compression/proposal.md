## Why

[已知|用户] 长会话需要降低发送给模型供应商的上下文，同时让 Pi 已持久化的 Session JSONL/tree 保持完整可查询。用户要求在现有 `@rosetears/aili-pi` 内建一个具备 `ranxianglei/opencode-acp@v1.12.6` 可移植功能面的 Pi 适配能力，安装时关闭 Pi 原生自动压缩，并让 AILI Compact 成为 threshold/manual/overflow 的唯一压缩与 GC owner。

[已知|源码审计] 对 pinned `v1.12.6`（commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`）的源码对照表明，当前 AILI Compact 已完成 Pi-native append-only state/replay、基础 projection、native compaction coordination 和 cache UI，但尚未完成模型可寻址引用、真实 recap projection、range/message 模式、命令语义、完整 policy/GC/subagent 行为及 ACP 六槽位 custom prompt。方案必须先纠正这些完成度和接口差异，再继续 BUILD。

## What Changes

- 新增并继续完善默认启用的 **AILI Compact** runtime component；它仍是现有唯一 AILI Extension 的一部分，而非独立 Package、beta 或第二实现。
- 用户接口固定为 `/aili-compact` namespace；模型工具固定为 `aili_compact`、`aili_decompress`、`aili_prune`、`aili_search_context`、`aili_compact_status` 和 recap protocol tool `aili_context_recap`。不注册 ACP/DCP 名称或 alias。
- 保持 Pi 已持久化的 Session JSONL/tree entries append-only 不变。状态通过真实成功 tool result 的 `details` 及版本化 custom control/automatic entries 追加；每个 provider request 前生成纯、幂等、fail-open 的压缩 projection。
- 增加 epoch-scoped、replay-stable 的模型引用目录。模型通过 `aili_compact_status`、search 和 bounded nudge 获取 message/block references；mutation transaction 仍保存并校验真实 Pi entry IDs/digest，不把易猜的 provider 索引当事实源。
- `aili_compact` 提供 Pi-adapted `range` 和 `message` 两种模式，支持 bounded batch、topic、material-benefit validation、完整 protocol atom、protected content 和 nested block lineage。压缩后的 provider projection 必须在原 anchor 注入确定性的 `aili_context_recap` assistant-tool/result protocol pair，并移除 stale compression call duplication；summary 不得只依赖历史 tool-call arguments 存活。
- `/aili-compact` 子命令必须具有真实行为：`context`/`stats` 输出不同的 bounded 视图，`sweep` 进行 grouped safe cooling，`manual` 与 `autoCooling` 分离，`compress` 触发一次明确的模型回合，`decompress`/`recompress` 操作当前 epoch block，其他 AILI controls 保持 append-only/fail-open。
- 交付 Pi-adapted portable behavior：protected-content policy、dedupe/purge-error、adaptive nudges、manual gating、current-branch search/status/recap、nested decompression/recompression、subagent gating、generational block GC 和 cache observability。已确认的上游冲突或缓存回归不得作为 parity 目标。
- Custom prompts 默认关闭，并改为六个固定语义槽位：`system.md`、`compress-range.md`、`compress-message.md`、`context-limit-nudge.md`、`turn-nudge.md`、`iteration-nudge.md`。项目文件覆盖全局同名文件；Pi 通过 system-prompt hook 将各槽位放入对应的 bounded guidance section。静态工具 schema、安全约束和协议格式不可被 override。
- AILI Compact 采用 pinned ACP 的 exclusive-owner 部署边界：Linux bootstrap 原子合并用户全局 `~/.pi/agent/settings.json`，写入 `compaction.enabled=false` 且保留其他键；若文件不是合法 JSON则失败而不覆盖。AILI 在 provider request 前独立执行 provider-free 100% major GC，并对任何仍到达的 manual/threshold/overflow hook fail-closed 取消；不得生成新的 Pi 原生 `CompactionEntry`。若 AILI GC 无法恢复预算，provider overflow 必须如实暴露，不允许 Pi summary/retry 兜底。
- Cache key/eligibility 必须包含 provider、model、session、epoch/branch、projection、system/custom guidance 和有效 tool surface。仅 identity 与上一完成请求相同且响应包含数值 cache-read/write 字段时才是 eligible；hit 使用 `cacheRead/(input+cacheRead+cacheWrite)`，最近 20 个 eligible 且至少 5 个样本才可判定 `>=85%`，其余状态单独显示。
- Footer、按需详情与 responsive non-capturing below-editor widget 继续只显示真实数值 telemetry。Pi 0.81.1 public Extension API 不提供非抢焦点右侧面板；accepted fallback 不变。

## Prior-art adoption policy

- Pi host/session/tree/current-branch/provider-context/native epoch 语义优先于 ACP。
- 采用 ACP 的用户可观察目标，不照搬其 OpenCode sidecar、auto-update、legacy migration、`toFile`、自动创建配置/prompt、ACP/DCP alias 或 synthetic ignored-user-message 机制。
- 不照搬 pinned source 中已禁用的 in-place tool-output pruning、未生效的 `deep` search 参数、stale schema defaults 或仅在 100% 生效的 batch-cleanup 配置。
- 本仓库实现必须独立编写并通过本地 contract/fixtures 验证；本变更不授权复制 AGPL source/prompt/schema/fixture/asset。

## Capability

### New Capability

- `reversible-context-compression`：AILI Compact 在 Pi 0.81.1 host 上提供可逆 provider-time context projection、模型可寻址 compression/recap protocol、Pi-native compaction coordination、真实 cache observability 与 fail-open diagnostics。

## Impact

预计影响 `install.sh`、`scripts/bootstrap.sh`、`src/runtime/index.ts`、`src/runtime/aili-compact/`、doctor/capability diagnostics、Zentui cache presentation、README、`tests/unit/`、`tests/integration/`、`tests/bootstrap/` 和 `tests/fixtures/`。不新增依赖或 Package entry。

## Boundaries and approval state

- 2026-07-26 的本地候选 BUILD acceptance 不覆盖 2026-07-27 确认的 exclusive-owner、用户 HOME 配置写入和无 Pi overflow fallback 行为。该 material delta 将 change 返回 DEFINE；修订后的 `test-plan.md` 需要用户重新接受后才能恢复 BUILD。
- [已知|用户决定] 从目标版本 `0.1.13` 起，整个 `@rosetears/aili-pi` Package 采用 `AGPL-3.0-or-later`；既有第三方MIT/OFL/Apache等许可与notice保持原样，既往0.1.12及更早版本的既有许可不被追溯撤回。
- `ranxianglei/opencode-acp@v1.12.6` / commit `f1a33d9f4ce55af808eb4e050717c914ed16084b` 必须进入packaged provenance与notice，明确AGPL来源及当前no-direct-copy/reference boundary。解除硬编码AGPL/MIT blocker必须以package/lock/LICENSE/README/provenance/SBOM/tarball一致性测试为前提。
- 任何直接AGPL source/prompt/schema/fixture/asset copy仍需单独精确批准与文件级provenance。版本、commit、push、publish、release与真实provider/TUI仍保留各自操作门禁；本决定本身不执行这些操作。
- 不 fork Pi、不改 `node_modules`、不覆盖 Pi built-in 工具、不建 raw-content sidecar、不写 Session JSONL 的既有条目、不在 `context` hook 做网络或非确定性摘要。唯一新增的 HOME 写入是用户已明确选择的 bootstrap 原子合并 `~/.pi/agent/settings.json`；它不得覆盖其他设置或修复/替换 malformed JSON。
- 真实 provider/cache performance probe 是独立授权项；无证据时 `UV-LIVE-1` 保持 Unverified。
