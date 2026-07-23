---
schema_version: "1.0"
snapshot_id: "20260723T044204Z--rem-cyberdeck-theme"
task_root: "openspec/changes/add-rem-cyberdeck-theme"
status: "finalized"
created_at: "2026-07-23T04:42:04.574806Z"
finalized_at: "2026-07-23T04:43:09.883763Z"
language: "zh-CN"
continues_from: null
continues_from_sha256: null
content_sha256: "594a8a34e2bb588d96aefa783164433fbd7b538e732552b18ec3af81990336ef"
---
# Session Handoff: rem-cyberdeck-theme

Snapshot ID: `20260723T044204Z--rem-cyberdeck-theme`

## Goal

为官方 Pi 上的 AILI 创建独立的 Rem Cyberdeck 视觉/TUI 变更：Rem 配色与用户提供的 Unicode/Braille 头像头部、状态页脚、Codex 配额展示，并评估固定底部输入区的兼容实现。

## Contract References

- 新任务根：`openspec/changes/add-rem-cyberdeck-theme/`；本快照创建时尚无 proposal、design、tasks、spec 或 test plan。
- 已完成的 `openspec/changes/create-aili-pi-distribution/theme-references.md` 明确把 Theme/TUI 实现排除在原分发变更之外；主题工作必须作为新变更定义。
- 当前 Pi 扩展入口为 `extensions/index.ts`，运行时注册入口为 `src/runtime/index.ts`，原生集成见 `src/runtime/native-integrations.ts`。

## Scope Boundary

- 范围内：Pi Theme JSON、AILI 自有 header、working indicator、footer，以及经过明确兼容策略批准后的固定编辑器体验。
- 页脚目标信息：当前目录、Git 分支/状态、Codex quota、runtime、context usage、token count。
- 范围外：替换或 fork `pi` CLI、改造 Pi 核心 TUI、复制 Sakura 的改造版 `pi-zentui`、原生 Windows、OS-sandbox 承诺、重新实现 quota 轮询。

## Completed/Pending/Blocked

- 已完成：阅读官方 Pi themes/extensions/packages/TUI 文档与 header、footer、working indicator 示例；检查 Sakura Cyberdeck 的 MIT 参考实现；确认用户已提供 Rem Unicode/Braille 艺术；确认 CodeGraph 已初始化且 Graphify 结构图已生成。
- 待完成：定义 proposal、design、tasks、delta spec、test plan；取得固定编辑器行为的明确兼容决策；实现并做聚焦验证。
- 阻塞/非主题依赖：Graphify 对 373 个非代码文件的语义提取缺少 Gemini/Google 凭据；这不阻止主题变更的定义或实现。

## Evidence Anchors

- Sakura 参考工作树：`.tmp/pi-sakura-cyberdeck-inspect-19851/`，其中 `themes/sakura-macaron.json`、`extensions/header/index.ts`、`extensions/matrix/index.ts` 与 `NOTICE` 已检查；许可证为 MIT。
- 官方 Pi 公共 UI API 已确认可用于 `ctx.ui.setHeader()`、`ctx.ui.setWorkingIndicator()` 与 `ctx.ui.setFooter()`；它们应作为低风险实现优先路径。
- `pi-quota-status` 已是包依赖，且支持相关 Codex OAuth provider/model 的订阅 quota 轮询；优先复用，不新增轮询器。
- Graphify 结构输出位于 `graphify-out/`：1,419 nodes、2,599 edges、89 communities；其当前为未跟踪产物，是否提交或忽略尚未决定。

## Decisions

- 将 Rem 视觉/TUI 作为新 OpenSpec 变更，而不是写回已完成的分发变更。
- Sakura Cyberdeck 只作为设计/实现参考；不得无出处复制其修改版 `pi-zentui`。如复用 MIT 代码，需保留正确许可证和来源说明。
- 固定输入区是高风险项；先采用 Pi 公共 header/footer/working APIs，再决定是否接受内部 TUI patch 或可选降级方案。
- Codex quota 优先通过现有 `pi-quota-status` 集成展示。

## Open Questions/Risks

- Open Question：固定编辑器是否为默认启用、可选启用，或仅提供实验性模式；需定义不支持终端时的降级行为。
- Risk：Sakura 的 alternate-screen 与鼠标报告路径可能破坏终端文本选择、URL 点击和 scrollback。
- Open Question：需要以何种 Pi Theme JSON token 具体表达 Rem 调色板，以及用户是否还希望提供位图角色资产。
- Unverified：当前分支、HEAD、未跟踪产物和上游 Pi APIs 均需在恢复时重新确认。

## Verification State

- 主题尚未实现，未运行主题相关自动化或手动 TUI 验证。
- CodeGraph/Graphify 数字来自上一会话的已生成产物，恢复时仅作为导航信息，不作为当前状态证明。
- 本次只创建了新变更目录和 handoff；创建时 `git status --short --branch` 显示分支 `build/create-aili-pi-distribution`，并有未跟踪的 `graphify-out/` 与新变更目录。

## Next Action

在 `openspec/changes/add-rem-cyberdeck-theme/` 创建完整的 OpenSpec DEFINE 合同，先记录固定编辑器兼容/降级策略和可验收的 footer 数据源，再开始代码实现。

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

- 本次新建：`openspec/changes/add-rem-cyberdeck-theme/handoffs/20260723T044204Z--rem-cyberdeck-theme.md`。
- 主题实现文件、OpenSpec 合同文件和测试文件均尚未创建。

## Blocker / Stop Reason

用户要求创建会话交接，以便下个会话继续主题功能；尚未授权或开始主题实现。

## Suggested Next-Session Prompt

从精确的不可变 handoff 快照 `openspec/changes/add-rem-cyberdeck-theme/handoffs/20260723T044204Z--rem-cyberdeck-theme.md` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。
