## Why

子代理调度当前能在执行前校验模型和 thinking，却没有把同一份实时可用模型能力目录暴露给父代理。父代理因此可能猜测 thinking，或在只切换模型时错误继承父级不兼容的 thinking，导致请求在 Herdr/managed 启动前被拒绝，用户只能从失败信息反推 Ctrl+L 已经可见的模型能力。

同时，AILI 内嵌的 billion-context 仍默认注册 `acp_delegate`，它与正式 `sub` 争夺“子代理”意图；而用户明确要求使用 Claude Code、Gemini CLI、Codex CLI、OpenCode 或 Grok CLI 时，当前 `sub` 也没有最小的显式表达方式。第一版不需要重写这些 CLI 的原生 Driver：让正式 Pi Agent 在 Herdr pane 中以受控 bash 调用当前安装版本的非交互 CLI 即可。

## What Changes

- 在每个父用户轮次开始时，从官方 Pi 当前 `ModelRegistry`/模型目录生成一份只读、受限的 Subagent Model Catalog，数据源与 Ctrl+L 的已认证可用模型视图一致。
- 将该目录作为父代理的动态调度上下文暴露，至少包含 canonical `provider/model`、支持的 thinking 等级、目标模型默认 thinking、文本/图片输入模态和目录新鲜度说明；不得包含 credential、token、header、provider 私密配置或受保护路径。
- 同时暴露当前轮次的子代理模型授权摘要：`inherit-only`、`explicit` 或 `delegated-choice`，以及适用的 model、thinking 和 selector 范围。目录可见性只用于发现，绝不产生或扩大授权。
- 目录按父用户轮次刷新，并贯穿该轮的模型调用；真实 dispatch 仍在 durable Agent/job/turn 分配前重新验证 availability、authentication、thinking compatibility 和 selector scope。不会为每次工具调用触发网络刷新，也不会动态重注册 `sub` 工具。
- 修复“显式指定目标模型但未指定 thinking”语义：用户侧视为没有 thinking override，不得继承父模型的 thinking，也不得自动选择最高等级。当前 persistent child 使用隔离的空 in-memory settings，因此 preflight 按其真实 Pi 0.84.4 默认语义冻结 `medium` 经目标模型 capability clamp 后的具体生效值，并以 `model-default` 来源传给两种 backend。
- 保持“两个字段都省略”时继承当前配置/父级；只指定 thinking 时继续作用于继承模型并严格校验；模型和 thinking 都指定时严格使用该组合。
- 改进 `SUB_MODEL_DENIED`、`SUB_THINKING_UNSUPPORTED` 等失败信息：给出当前用户消息中可直接复制的 canonical model + thinking + selector 示例，避免重复错误码；失败仍发生在 Herdr pane、managed child 和 durable identity 创建之前。
- 明确模型输入模态不等于工具能力：`text,image` 不表示可以读取 MP4 音轨或执行 ASR；只有实际可用的媒体/转写工具或角色能力才能声明该任务可执行。
- 不新增第二个模型目录、授权 owner、子代理启动 owner 或 Ctrl+L 替代 UI；managed 与 Herdr 继续复用同一 preflight 和冻结后的 loadout。
- 将 `sub` 保持为唯一正式委派入口：未明确指定外部 CLI 时保持现有 Pi 执行；只有当前用户消息明确说出 canonical CLI 名称时，`sub` 才接受对应 one-shot `cli` 值。
- 第一版外部 CLI 不是新的 AILI Driver。显式 `cli` authority、Herdr backend、角色/bash eligibility 和 frozen loadout 在同一 preallocation 中原子决定；Pi 子代理仍是 `pi-cli` Driver，并通过 immutable built-in `external-cli-runner` modifier 在可见 pane 内调用外部 CLI；审计记录 `nestedCli`，不得把它伪装成 Agent Driver。
- package-owned probe helper 在第一次执行前以 5 秒/64 KiB 边界检查 allow-listed executable、`--version` 和 `--help`；Pi Agent 只使用当前 help 明示的非交互模式，不凭模型记忆猜参数，不自动安装、升级、登录、启动浏览器认证、使用权限绕过参数或显式恢复外部 CLI session。
- 外部 CLI 请求只在当前用户轮有效；没有再次明确指定时，continuation 回到普通 Pi 行为。现有 managed Agent 不可原地切换到外部 CLI，必须新建 Herdr Agent；现有 Herdr Agent 可在明确授权的 turn 使用 runner。用户已接受功能优先的正常 HOME 策略：明确指定 CLI 即授权该 CLI 为当前任务使用其已有登录/config/cache 和固有 provider network/source 行为；AILI 不读取或记录凭据，也不声称能检查 vendor 内部写入与网络目的地。
- 在 AILI 拥有的 billion-context 组合中永久关闭 delegation：不注册 `acp_delegate`、`acp_delegate_wait`、`acp_delegate_cancel`，不注入对应 prompt/widget；保留 `compress`、`decompress`、`search_context`、`acp_status` 和 context owner。factory 明确禁用后，用户/project `acp.json` 不得重新开启。用户另行安装的独立第三方 Extension 不属于本包控制范围。

## Capabilities

### New Capabilities

- `subagent-model-capability-resolution`: 向父代理暴露实时、只读且不授予权限的子代理模型能力与当前轮授权摘要。
- `subagent-model-selection`: 将既有 change-local 模型选择规则收敛为 canonical capability，并定义显式换模但省略 thinking 时采用目标模型 Pi 默认值的调度语义。
- `subagent-external-cli-execution`: 定义显式当前轮外部 CLI 授权、默认 Pi fallback、Herdr/Pi nested runner、help-first 非交互执行和 ACP delegation 退役。

### Modified Capabilities

- 无。当前仓库尚无 `openspec/specs/` 下可修改的 canonical capability。

## Impact

- Runtime：`src/runtime/persistent-agents/production.ts`、`model-selection.ts`、`runtime.ts`、`sub-schema.ts`、`sub-coordinator.ts`、Herdr preflight/loadout、Prompt Middleware modifier 和 context runtime composition。
- Pi Extension surface：`before_agent_start` 动态系统提示上下文；官方 `ExtensionContext.modelRegistry`、模型 thinking 能力和输入模态元数据。不会依赖未记录的动态 tool-description mutation API。
- Tests：父级 xhigh + 显式 GLM + omitted thinking、目录/授权分离、目录刷新与边界、错误建议、零分配、managed/Herdr 等价、credential redaction、模态与工具能力不混淆；默认 Pi、显式 CLI、missing executable、help-first fake CLI、managed continuation 拒绝、CLI turn 不黏连和 ACP delegation 工具/prompt 不存在。
- Documentation：`docs/persistent-agents.md` 的 model/thinking 默认语义、当前轮授权和失败排查。
- Change relationship：本 change 的 `subagent-model-selection` spec canonicalize 并 supersede `make-persistent-agent-model-thinking-decisions-explicit` 中相冲突的 Parent-thinking fallback 场景；该 change 尚余的 `hub send` 工作保持独立。`restore-native-working-ui-and-expose-agent-model-resolution` 的模型 preflight/透明度范围由本 change 取代，其 Working 动画范围不受影响；两者不得并行实现同一 resolver。
- Non-goals：不改变 Ctrl+L 主会话选择器、不执行 model provider/catalog 网络刷新、不持久化授权、不改变 `/aili-agent-model` 配置所有权、不添加视频/ASR 能力、不实现外部 CLI 原生 Driver/原生 TUI/AILI-owned vendor session resume、不自动安装/登录 CLI、不由 AILI 写用户 HOME；显式 CLI 自身的正常 auth/config/cache 写入按上述已接受边界处理。不修改依赖/lockfile、Git、发布或 release。

本 proposal 只授权规划 artifact 写入，不授权生产代码、测试、生成物或运行时配置修改。后续 BUILD 必须由用户另行明确授权。
