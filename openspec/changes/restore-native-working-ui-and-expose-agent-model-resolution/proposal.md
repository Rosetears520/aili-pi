## Why

本提案处理同一次真实使用中暴露的两个独立但都直接影响交互可靠性的问题：Agent 调度结果缺少实际角色与模型信息，导致失败发生后才知道 selector/model 解析有误；AILI 自定义 Working 动画持续刷新整个 TUI，长任务中可能出现明显卡顿。

起草时的代码检查表明，`task` 已能在 schema 阶段拒绝未知 selector，但显式 `model` 的 canonical `provider/model` 校验和最终模型解析发生在 child turn 启动路径。异步 accepted result 只有 Agent/job/turn ID 与 selector，没有人类名称、请求模型、最终 provider/model 或解析层；这些字段虽写入后续 turn audit/settlement 的一部分，仍未贯通 accepted result、`hub` 查询、异步 delivery 和 TUI 展示。现有模型优先级已经表达为 one-shot、instance、trusted project role、user-global role、profile、parent fallback，但“调用未指定 model 时继承配置或父级”的行为没有在第一次可见结果中白盒化。涉及 `src/runtime/persistent-agents/task-schema.ts`、`task-coordinator.ts`、`production.ts`、`model-selection.ts` 与 `output-delivery.ts`；这些事实必须在 BUILD 前按目标版本复核。

起草时的 TUI 检查表明，`package.json` 直接启用 `extensions/matrix/index.ts`。该 Extension 默认配置为 12 FPS，在 Agent 活动期间隐藏 Pi 原生 Working Line，渲染一行 `Weaving the next move… / elapsed / output tokens` 加四行 Code Rain，并通过 timer 请求重绘。12 FPS 是否是全部卡顿的唯一根因尚未通过性能测量证明，但移除该动画会直接消除这条周期性重绘路径。`REASONING · N STEP(S)` 使用的 `renderRoseGradient()` 当前是缓存的静态渐变，没有自身 timer；本提案仍把“只保留静态颜色、禁止扫光/时间相位”写成明确契约，防止它被 Working 动画的全屏重绘或后续实现重新动画化。

## What Changes

- **BREAKING — restore Pi-native working feedback:** AILI 不再注册或运行 Rose Matrix Working widget，不再隐藏、替换或持续刷新 Pi 原生 Working Line。`Weaving the next move…`、elapsed/output-token 行、四行 Code Rain、Shimmer、12 FPS scheduler，以及 `/rose-matrix`、`/sakura-matrix`、`fps`、`density`、`rain`、`preview` 等动画配置入口从生产 surface 退出。
- 既有 `~/.pi/agent/rose-cyberdeck-matrix.json` 和 legacy Matrix 配置只作为无人读取的用户历史文件保留；升级、启动、测试和回滚都不得自动删除或改写它们。
- `REASONING · N STEP(S)` 和 reasoning marker 可以保留 Rose-to-Ice 颜色渐变，但渐变必须是确定性、静态、可缓存的：不得读取时间、帧号或 phase offset，不得创建 timer，不得主动 `requestRender()`，也不得出现扫光、位移或闪烁。Reasoning 正文及 Pi 的 thinking 可见性语义不变。
- **Agent/model preflight before allocation:** 每个 flat/batch task 必须在创建任何 durable Agent/job/turn 之前完成 exact selector、role profile、模型标识、解析层、provider availability、authentication 和 thinking compatibility 校验。Batch 任一成员失败时全部零分配。未知 selector 的错误必须列出 canonical selectors。显式 canonical `provider/model` 按原值校验；显式 bare model（例如 `gpt-5.6-luna`）先匹配 parent provider 下已认证且可用的同名模型，否则搜索用户当前已认证且可用的模型 catalog。唯一匹配才可使用；零匹配或多 provider 重名都必须在分配前失败并列出 canonical candidates，不得按列表顺序猜测 provider。
- **Omitted model means configured inheritance:** 单次 task 未提供 `model` 时，不产生 one-shot override；继续按 `instance > trusted project role file > user-global role file > role profile frontmatter > parent active/fallback model` 解析。没有任何文件或 instance override 时必须继承官方 Pi 当前 parent active/fallback model。相同规则适用于后续 `hub send`/revive：上一 turn 的 one-shot model 不得黏住，新 turn 必须重新读取有效配置或父级。低优先级 fallback 不得覆盖一个已明确但不可用的高优先级配置。
- 每个已接受 task 的首个返回结果必须记录同一组白盒字段：`name`、实际去重后的 `agentId`、canonical `selector`、`requestedModel`（未指定时固定为 `null`，表示 inherit）、canonical `effectiveModel`、`modelLayer` 和 effective `thinking`。紧凑 TUI tool 行只显示 `name · selector · provider/model`；requested model、`modelLayer` 与 thinking 放在展开详情和适用的 `hub`/audit surfaces。例如完整详情为：

  ```json
  {
    "name": "github-pr1-3-triage",
    "agentId": "github-pr1-3-triage",
    "selector": "aili.web-researcher",
    "requestedModel": null,
    "effectiveModel": "openai-codex/gpt-5.6-luna",
    "modelLayer": "parent-fallback",
    "thinking": "high"
  }
  ```

- 同一 model identity 必须贯通 sync settlement、async accepted result、pending/delivered parent message details、`hub list/jobs/output/history` 的适用元数据和 turn audit；不得让 accepted UI 显示一个模型而 child 实际使用另一个。模型在 turn 分配时冻结，后续配置变化只影响下一次新 turn；provider request 前仍需验证冻结模型可用。
- 错误结果必须区分 `selector-preflight`、`model-format`、`model-ambiguous`、`model-resolution`、`model-auth` 和 `thinking-compatibility`，并显示发生失败的配置层。任何表面都不得记录 credential、auth header、token、secret-bearing provider 配置或受保护路径。
- 移除动画后，AILI 不以较低 FPS、自适应 FPS、默认关闭但保留代码或另一套 spinner 替代；唯一 Working owner 是 Pi 原生 TUI。静态 reasoning 渐变也不得借用全局 animation timer。

## Capabilities

### New Capabilities

- `agent-dispatch-transparency`: 在 durable allocation 前验证 exact selector/model，并在 task、hub、delivery、audit 与 TUI 中一致暴露 Agent 名称、selector、实际模型和解析层，同时保持凭据不可见。

### Modified Capabilities

- `persistent-agent-orchestration`: async accepted、settlement、delivery 和 hub 结果增加一致的 Agent/model identity；preflight 失败必须零分配且 batch 原子失败。
- `subagent-model-selection`: 明确未指定 model 的配置/父级继承行为、bare model 的 parent-provider-first/unique-catalog resolution、显式 canonical model 的 fail-closed 语义，以及 turn 分配时冻结并立即可见的 effective model。
- `rose-working-animation`: 退役 AILI-owned Working 动画与配置 surface，恢复 Pi 原生 Working Line；Reasoning chrome 仅允许静态颜色渐变。

## Impact

- Runtime：`src/runtime/persistent-agents/` 的 task schema/coordinator、model preflight、turn metadata、hub 和 async delivery；生产任务 TUI 的 tool result renderer。
- TUI/package：`package.json` 的 Pi Extension 列表、`extensions/matrix/`、`extensions/zentui/thinking-message.ts`/`gradient.ts`、相关 README/settings/provenance，以及 Matrix/gradient/reasoning tests。
- Tests：覆盖未知 selector、bare/canonical model、全部模型继承层、batch 零分配、sync/async/delivery/hub/audit 字段一致性、凭据脱敏、无 Matrix Extension/命令/timer、Pi Working owner 未被隐藏，以及 reasoning 渐变在重复 render 与虚拟时钟推进下字节稳定。
- Evidence：自动化可以证明无周期 timer 和确定性 ANSI 输出，但不能单独证明所有终端中的主观流畅度；若要声明卡顿已在真实 TUI 消失，仍需单独授权的长任务手工/性能验证。
- Change relationship：本提案修改 `replace-subagent-runtime-with-persistent-agent-framework` 的 model/orchestration contract，并 supersede `improve-tui-interaction-and-wsl-image-paste` 中继续保留 Shimmer/Rain 的部分；固定编辑器和 WSL image paste 不受影响。AILI-only 摘要所有权与压缩后续跑继续由独立 change `replace-pi-native-fallback-with-aili-emergency-checkpoint` 管理，不能用本提案替代。
- Rollback：安装上一已发布 package 可恢复旧动画；回滚和升级都不删除用户历史 Matrix 配置。新版本不保留双 Working owner，也不以运行时 feature flag 同时注册 Pi 原生与 Matrix widget。
- Non-goals：不改变 Pi thinking 内容、reasoning 展开/隐藏语义、provider API、模型优先级之外的权限、固定编辑器、footer/theme、dependency/lockfile、用户 HOME、Git、publish 或 release。

本 proposal 只授权上述 OpenSpec DEFINE artifact 写入，不授权生产代码修改、配置迁移、依赖/lockfile 变化、真实 provider/TUI probe、用户 HOME 写入、Git、安装、发布或 release。后续仍需完成 capability delta、design、tasks、test-plan、strict validation，并由用户明确接受最终 `test-plan.md` 后才能进入 BUILD。
