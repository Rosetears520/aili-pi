# 需求拷问包：create-aili-pi-distribution

## 1. 资料来源与证据

| 来源 | 已检查内容 | 观察到的事实 | 置信度 | 备注 |
|---|---|---|---|---|
| 当前 `/define` 请求（2026-07-22） | 用户目标与约束 | [已知\|用户] 目标是制作官方 Pi 的插件/发行包；主题、ROSE、subagent 等内容需要 Pi 特化；共享 skills 以 `aili-workflows` 为唯一来源。 | high | [已知\|用户] 用户允许在必要时参考其他插件库，并要求通过 requirements-grilling 批量澄清。 |
| `openspec/config.yaml` | OpenSpec 项目配置 | [工具结果] 当前 schema 为 `spec-driven`，没有项目上下文或额外 artifact 规则。 | high | [工具结果] OpenSpec CLI 版本为 `1.2.0`。 |
| `openspec/changes/create-aili-pi-distribution/.openspec.yaml` | 变更身份 | [已知\|用户] 用户已确认 change ID 为 `create-aili-pi-distribution`。 | high | [工具结果] OpenSpec 已创建该变更 scaffold。 |
| 当前工作目录 Git 检查 | `git rev-parse`、branch、status | [工具结果] `/home/rosetears/code/aili-pi` 当前不是 Git repository。 | high | [推断] 在 BUILD 前必须确认最终仓库落点与 Git 初始化/分支策略。 |
| Pi 官方仓库固定 revision | Package、Extension、Skills、安全、subagent 示例 | [已知\|外部] 调研时 Pi `main` revision 为 [`906b40a`](https://github.com/earendil-works/pi/commit/906b40a75329bc3a4c19865f0279903f6be6d476)，稳定 npm 版本为 `@earendil-works/pi-coding-agent@0.81.1`；Package 可声明 `extensions`、`skills`、`prompts`、`themes`，没有 package-level `agents` 资源。 | high | [已知\|外部] 来源：[packages.md](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/packages.md)。 |
| Pi 官方 Extension 与安全文档 | 事件、工具拦截、UI、权限边界 | [已知\|外部] Extension 可通过 `before_agent_start` 修改 system prompt、拦截 tool call，并提供状态/footer UI；Pi Package/Extension 以用户进程权限运行，不构成 OS sandbox。 | high | [已知\|外部] 来源：[extensions.md](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/extensions.md)、[security.md](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/security.md)。 |
| `Rosetears520/aili-workflows` 固定 revision | 公开仓库与 npm 元数据 | [已知\|外部] 调研固定到 [`c40e4fc`](https://github.com/Rosetears520/aili-workflows/commit/c40e4fc0c78391354a3b0fc4822a73b84ff3225f)（`rose-aili@0.2.5`）；仓库采用 MIT License。 | high | [工具结果] 固定树包含 64 个 skill 目录、ROSE + 19 个 subagent、5 个 command、8 个 script、2 个 template、2 个 manifest 和 6 个 TypeScript source file。来源：[component manifest](https://github.com/Rosetears520/aili-workflows/blob/c40e4fc0c78391354a3b0fc4822a73b84ff3225f/manifests/rose-aili.components.json)。 |
| Pi 官方 subagent 示例 | 独立 subagent Extension prior art | [已知\|外部] Pi 将 subagent 作为 Extension 示例而非 Package 的原生 agent 资源。 | high | [已知\|外部] 来源：[official subagent example](https://github.com/earendil-works/pi/tree/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/examples/extensions/subagent)。 |
| Pi / OMP / community subagent 深入调研（2026-07-22） | process model、取消、并发、权限上限、协议边界 | [已知\|外部] Pi 官方 `0.81.1` 示例使用独立 `pi --mode json -p --no-session` child process；Oh My Pi `17.0.7` 使用其 Bun/OMP 基础设施的 in-process executor；`@agwab/pi-subagent@0.4.8` 提供 MIT 许可的 Unix process-group termination 与 tool ceiling prior art。 | high | [推断] AILI 最优路径是官方示例派生的 owned child-process adapter，并只在审计和保留 MIT notice 后选择性适配 Agwa 的 hardening patterns。来源：[Pi example](https://raw.githubusercontent.com/earendil-works/pi/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/examples/extensions/subagent/index.ts)、[OMP executor](https://raw.githubusercontent.com/can1357/oh-my-pi/7b141199d524b859c357fc89654f10b62b9f3df1/packages/coding-agent/src/task/executor.ts)、[Agwa license](https://raw.githubusercontent.com/AgwaB/pi-subagent/daa7b83819116a62008ad17aa65fcd50fefbafd0/LICENSE)。 |
| 社区 prior art | subagent、权限、TUI、完整 harness、sandbox | [已知\|外部] 已调查 `pi-subagents@0.35.1`、`@gotgenes/pi-permission-system@20.10.0`、`pi-zentui@0.11.0`、`gentle-pi@1.2.0`、`pi-sandbox@0.5.1`。 | medium | [未验证] 尚未执行这些项目的运行时测试；`pi-subagents` 与 `gentle-pi` 存在许可证文件或归属清晰度风险，因此目前只能作为架构参考。 |

## 2. 当前理解

- [已知\|用户] **目标：** 发布一个安装在官方 Pi 之上的 AILI Pi 发行包，用户日常仍使用 `pi`，而不是 fork/rebrand Pi 或改用 Oh My Pi。
- [已知\|用户] **共享内容边界：** `aili-workflows` 是 skills 的唯一 canonical source；`aili-pi` 不应手工维护第二套 skill 正文。
- [已知\|用户] **Pi 特化边界：** ROSE 主运行时、19 个 subagent 的执行规则、生命周期 prompt、权限/YOLO 策略、主题和 UI 由 `aili-pi` 拥有。
- [已知\|用户] **发行形态：** 使用正常 Pi Package + 薄 bootstrap；bootstrap 只在需要时调用官方 Pi installer，然后使用 `pi install`，不复制 Pi package manager 或接管 Pi settings。
- [已知\|用户] **技能同步：** canonical 正文只在 `aili-workflows` 修改；`aili-pi` 发布时嵌入固定 commit/hash 的原样 snapshot，不在运行时拉取，也不维护 semantic overlay。
- [已知\|用户] **subagent 路径：** 使用官方 Pi 示例派生的 owned child-process adapter；社区代码仅在 license/provenance/API/maintenance 审计通过后选择性适配。
- [已知\|用户] **当前非目标：** 修改 Pi 核心 agent loop、改名 `pi` CLI、使用 OMP runtime、交付 Windows、OS sandbox 或主题/TUI/font 实现、在未审计前复制社区代码。
- [未验证] **剩余证据项：** 64-skill 逐项 audit、latest compatibility probe、child credential projection/process-tree cleanup/protocol caps、组合键跨终端传递与 clean-machine Unix E2E。

## 3. 覆盖矩阵与状态

状态只能使用：`Confirmed by evidence`、`Not applicable`、`Needs question`、`Open Question`、`Unverified`。

| 维度 | 状态 | 证据 / 原因 | 关联问题 | 写回目标 |
|---|---|---|---|---|
| goal/success | `Confirmed by evidence` | [已知\|用户] Q2/Q13 将目标定义为分层全量兼容、完整核心 v1 contract 和分阶段 BUILD。 | Q2、Q13 | `proposal.md` / specs / `test-plan.md` |
| scope/non-goals | `Confirmed by evidence` | [已知\|用户] 核心 change 覆盖 Pi distribution、skills、ROSE、subagents、permissions、registry/packs 和 Unix bootstrap；主题/TUI/font 拆入后续 change。 | Q2、Q8、Q13 | `proposal.md` |
| roles/permissions | `Confirmed by evidence` | [已知\|用户] 自动模式采用 session-only bounded YOLO；高风险门禁保留，无 UI 时 ask=>deny。 | Q7/F2 | `design.md` / specs |
| happy path | `Confirmed by evidence` | [已知\|用户] 干净 Unix 安装 latest Pi，再由薄 bootstrap 调用 `pi install`；ROSE/skills/subagents/registry 由 Package 加载。 | Q3、Q4、Q5、Q10 | `design.md` / specs |
| failure path | `Confirmed by evidence` | [已知\|用户] latest 未通过 AILI compatibility/smoke 时在修改 AILI 前 fail-closed；optional 缺失由 doctor 明示；child failure 不自动重试。 | Q2、Q3、Q5、Q9 | `design.md` / `test-plan.md` |
| retries/rollback | `Confirmed by evidence` | [已知\|用户] 核心采用薄 bootstrap，不复制 Pi package manager；AILI 不自动重试 child，不自动强更既有 Pi，失败报告部分状态。 | Q3、Q5、Q10 | `design.md` / `test-plan.md` |
| boundary conditions | `Revised and accepted` | [已知\|用户] 本 change 仅支持 Linux；macOS/native Windows 在 mutation 前明确 unsupported；无 UI 时 ask=>deny；组合键必须有 slash command fallback。 | Q4、Q7、Q8、Q9、2026-07-23 当前会话 | specs / `test-plan.md` |
| data lifecycle | `Confirmed by evidence` | [已知\|用户] skills 使用固定 commit/hash 的发布快照；核心 bootstrap 不接管 Pi settings 或额外 receipt；runtime 不修改认证。 | Q10、Q14 | `design.md` / specs |
| state transitions | `Confirmed by evidence` | [已知\|用户] subagent 采用 fresh child process、single-use、terminal、max concurrency 2、no resume/retry/recursion。 | Q5 | `design.md` / specs |
| API/CLI/UI contracts | `Confirmed by evidence` | [已知\|用户] 公开身份、`pi` 日常入口、setup 命令、session toggle 与 `/aili-mode` fallback 已确定；主题 UI 不在本 change。 | Q7、Q8、Q12 | specs / `tasks.md` |
| compatibility/migration | `Confirmed by evidence` | [已知\|用户] 全量 compatibility inventory + capability registry/packs；skill 正文只在 canonical `aili-workflows` 修改，Pi 同步固定 snapshot。 | Q2、Q9、Q14 | `design.md` / `tasks.md` |
| terminology/domain model | `Confirmed by evidence` | [已知\|用户] 产品是官方 Pi 上的 AILI distribution/package；permission gate 与 sandbox 分离；YOLO 是 session mode。 | Q7、Q11、Q12 | `context.md` / `design.md` |
| security/privacy | `Confirmed by evidence` | [已知\|用户] bounded YOLO、高风险门禁、noninteractive fail-closed、本次不含 OS sandbox。 | Q7、Q11 | `design.md` / `test-plan.md` |
| performance/reliability | `Confirmed by evidence` | [已知\|用户] owned child-process adapter、并发 2、严格输出上限、process-tree cancellation 与无自动 retry 是设计约束。 | Q5 | `design.md` / `test-plan.md` |
| observability | `Confirmed by evidence` | [已知\|用户] compatibility report、doctor、subagent streaming/status 和 fail-closed diagnostics 属于核心能力。 | Q2、Q5、Q9、Q10 | `design.md` / `tasks.md` |
| acceptance/testability | `Confirmed by evidence` | [已知\|用户] 用户已于 2026-07-22 明确接受最终 `test-plan.md`；[工具结果] OpenSpec artifacts 已通过 strict validation。测试结果仍是后续 BUILD/SHIP evidence，不是 DEFINE 缺口。 | Q2-Q14 | specs / `test-plan.md` |
| rollout/rollback | `Confirmed by evidence` | [已知\|用户] clean install 使用 latest；既有 Pi 不强更；更新需显式 `--update-pi`；核心 package lifecycle 委托 Pi。 | Q3、Q10、Q13 | `proposal.md` / `design.md` |
| explicit non-goals | `Confirmed by evidence` | [已知\|用户] 本 change 不含 Pi fork/OMP runtime、Windows、OS sandbox、主题/TUI/font 实现或默认安装全部 optional integrations。 | Q4、Q8、Q9、Q11 | `proposal.md` |

## 4. 需要你填写的问题

### Q1 — 最终 repository 落点与 Git 状态

- **问题：** 当前 `/home/rosetears/code/aili-pi` 不是 Git repository。这个目录是否就是未来独立的 `Rosetears520/aili-pi` repository？
- **为什么要问：** [推断] 最终 repository identity 决定 package metadata、CI、release、source links、BUILD 分支和 rollback 证据。
- **影响：** `proposal.md`、`design.md`、`tasks.md`、所有 BUILD 操作。
- **推荐默认：** [推断] **A**：当前目录就是新的独立 `aili-pi` repository；DEFINE 可继续，Git 初始化/remote/首个开发分支作为后续获批操作，不在本轮自动执行。
- **选项：** A. 当前目录就是新仓库；B. OpenSpec 应迁到另一个已存在仓库（请给绝对路径）；C. 这里只做提案，BUILD 目标以后再定。
- **后果 / 取舍：** [推断] A 最直接；B 可复用现有工程但改变 artifact owner；C 可继续定义但不能达到 BUILD `READY`。
- **你的填写：** 当前目录就是目标仓库；远端为 `https://github.com/Rosetears520/aili-pi`，尚未初始化本地 Git repository。
- **写回位置：** `context.md` / `proposal.md`

### Q2 — “全部内容”的完成定义

- **问题：** `aili-workflows` 的 64 skills、ROSE、19 subagents、5 lifecycle commands 以及关联 memory/browser/tool 假设，什么状态才允许宣称“全部内容已 Pi 特化”？
- **为什么要问：** [工具结果] Pi 能发现 skill 不等于 skill 中的 OpenCode tool/path/runtime 假设已经可用。
- **影响：** scope、capability specs、compatibility report、release acceptance、测试矩阵。
- **推荐默认：** [推断] **A**：全量清点并分为 `native`、`adapted`、`optional`、`blocked`；稳定版必须没有未解释的 `blocked`，optional integration 可以明确 `SKIP` 且 doctor 给出安装办法。
- **选项：** A. 分层全量兼容；B. 每项都必须端到端可运行才发布；C. 只发布审计通过的核心子集。
- **后果 / 取舍：** [推断] A 保留“全部内容”且允许外部能力按 pack 管理；B 最严格但显著扩大首版；C 最快但不符合当前“全部内容”表述。
- **你的填写：** A. 分层全量兼容。
- **写回位置：** `proposal.md` / compatibility spec / `test-plan.md`

### Q3 — Pi 版本兼容与更新策略

- **问题：** 每个 AILI 稳定版应安装固定测试过的 Pi 版本，还是始终安装/接受 `latest`？
- **为什么要问：** [已知\|外部] 当前 Pi 稳定版要求 Node `>=22.19.0`，Extension API 与主题 schema 可能随版本变化。
- **影响：** bootstrap、peer dependency、CI matrix、doctor、升级/rollback。
- **推荐默认：** [推断] **A**：AILI release 固定一个 tested Pi version，同时声明最小版本和最大不兼容边界；`latest` 仅显式 opt-in。
- **选项：** A. 固定 tested version + compatibility range；B. 始终 latest；C. 只检查最低版本，不负责安装/升级 Pi。
- **后果 / 取舍：** [推断] A 稳定性最好；B 获取新功能最快但容易破坏；C 最轻但弱化“一句话安装”。
- **你的填写：** clean install 使用官方 latest；已有 Pi 默认不强制升级，只有显式 `--update-pi` 才升级；若当前 Pi/latest 未通过 AILI compatibility/smoke，则在修改 AILI 前 fail-closed。
- **写回位置：** versioning spec / `design.md`

### Q4 — 一句话安装的平台与入口

- **问题：** 首个稳定目标是否必须同时覆盖 Linux、macOS、Windows？
- **为什么要问：** [推断] `curl | sh` 不能覆盖原生 Windows；跨平台需要 npm/npx 主入口及薄 Shell/PowerShell bootstrap。
- **影响：** installer spec、CI、release assets、rollback tests。
- **推荐默认：** [推断] **A**：`npx @rosetears/aili-pi setup` 为跨平台权威入口；Linux/macOS 提供固定版本 `install.sh`，Windows 提供 `install.ps1`；三者调用同一 Node 核心。
- **选项：** A. 三平台首版；B. Linux/macOS 首版，Windows 后续；C. 首版要求用户已安装 Pi，只做 `pi install`。
- **后果 / 取舍：** [推断] A 最符合“一句话安装”但测试面最大；B 更快；C 不满足此前安装 Pi + 工作流的完整体验。
- **你的原始填写：** B. Linux/macOS（Unix）首版，Windows 后续。
- **范围修订（2026-07-23）：** [已知|用户] 正式改为 Linux-only；macOS 与 native Windows 均不属于本 change 的支持范围或发布门禁。该修订需要更新最终 Test Plan 并重新接受后才能恢复 BUILD。
- **写回位置：** installer spec / `proposal.md`

### Q5 — subagent 执行模型与复用边界

- **问题：** 19 个 subagent 应采用哪种运行时？
- **为什么要问：** [已知\|外部] Pi 没有 package-level agents；必须由 Extension 构建 runtime。执行模型决定 fresh、single-use、terminal、取消传播、并发和权限继承是否可证明。
- **影响：** subagent spec、design、performance、tests、第三方依赖。
- **推荐默认：** [推断] **A**：基于 Pi 官方 MIT subagent 示例做 owned adapter；每个任务启动独立 ephemeral Pi child process，默认最大并发 2，不允许 resume、自动重试或递归委派。
- **选项：** A. 官方示例派生的自有 child-process adapter；B. 直接依赖 `pi-subagents`；C. 同进程 `AgentSession` runtime。
- **后果 / 取舍：** [推断] A 最贴合现有 ROSE 语义且依赖风险低；B 开发快但受第三方行为/许可证清晰度影响；C 性能可能更好但隔离和生命周期证明更难。
- **你的填写：** 用户要求补充调查 Pi 官方、Oh My Pi 和插件实现，并授权模型基于证据选择最优路径。
- **调研后的选择：** [推断] 采用 A：基于 Pi 官方 MIT 示例构建 AILI owned child-process adapter；选择性适配 `@agwab/pi-subagent` 的 process-group termination、interrupt escalation、artifact 和 tool-ceiling patterns；不采用 OMP runtime，也不把社区插件的宽泛 lifecycle contract 直接暴露为 AILI contract。
- **选择依据：** [工具结果] 官方示例已经证明 `--mode json --no-session` fresh process 路径；OMP 使用 in-process executor 且依赖 `@oh-my-pi/*`；现有社区插件都未同时满足并发 2、no retry/resume/recursion、parent∩role permission、process-tree cancellation 与严格 50 KiB structured result。
- **写回位置：** subagent spec / `design.md`

### Q6 — 第三方代码与依赖政策

- **问题：** 对参考插件代码，应允许直接 production dependency、复制并修改、还是仅作设计参考？
- **为什么要问：** [工具结果] 当前候选项目的许可证、维护质量和归属清晰度不一致；用户提出“优先复用没写过的代码”，但发布包需要可追溯 provenance。
- **影响：** dependency policy、THIRD_PARTY_NOTICES、SBOM、update/security response、tasks。
- **推荐默认：** [推断] **A**：官方 Pi MIT 示例可固定 revision 后适配；社区库必须逐项通过 license/provenance/API/maintenance 审计，再选择 pinned dependency 或有归属记录的 adaptation；有缺口的只作参考。
- **选项：** A. 审计后选择性复用；B. 尽量直接依赖社区包；C. 全部自行重写，仅看 API 文档。
- **后果 / 取舍：** [推断] A 平衡复用与供应链风险；B 最快但控制力最低；C 控制力最高但违背复用优先且工程量最大。
- **你的填写：** A. 审计后选择性复用。
- **写回位置：** `design.md` / dependency tasks / release spec

### Q7 — safe / standard / YOLO 的精确语义

- **问题：** YOLO 是否仍保留项目外访问、凭据、发布和破坏性操作的 ask/deny 底线？
- **为什么要问：** [已知\|外部] Pi Extension 具有用户权限；YOLO 若定义为无条件 allow，会把 Package policy 当成完整系统授权。
- **影响：** permission spec、UI copy、noninteractive behavior、security tests。
- **推荐默认：** [推断] **A**：默认 `standard`；显式 `yolo` 自动批准当前项目内普通读写与非破坏性命令，但 external-directory、credential/auth、destructive、publish/push/release 仍精确 ask/deny；无 UI 时 ask => deny。另提供 `safe`。
- **选项：** A. bounded YOLO；B. 除 secrets hard-deny 外全部自动批准；C. 不实现 AILI permission mode，沿用 Pi 默认执行模型。
- **后果 / 取舍：** [推断] A 与现有 AILI 安全契约最接近；B 自动化最强但事故半径最大；C 实现最少但无法迁移 OpenCode policy 语义。
- **你的填写：** 自动模式应是特殊的可切换模式，例如通过 `Ctrl+Shift+Alt+A` 开启或关闭。
- **证据补充：** [已知\|外部] Pi Extension 支持注册类似 `ctrl+shift+alt+x` 的 keybinding；`Ctrl+Shift+Alt+A` 在 Pi `0.81.1` 没有已记录的默认冲突，但 modifier 是否可靠到达取决于终端和 tmux 配置。来源：[Extension API](https://raw.githubusercontent.com/earendil-works/pi/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/src/core/extensions/types.ts)、[terminal setup](https://raw.githubusercontent.com/earendil-works/pi/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/docs/terminal-setup.md)。
- **最终答案：** session-only `standard ↔ bounded-yolo`；状态必须持续可见；保留 external-directory、credential/auth、destructive、push/publish/release 的精确 ask/deny；无 UI 时 ask=>deny；提供 `/aili-mode` fallback。
- **写回位置：** permission spec / `design.md` / `test-plan.md`

### Q8 — 主题与 TUI 首版边界

- **问题：** 首版 UI 是只交付 Theme JSON，还是同时交付响应式 header、working indicator、footer/status 和 subagent widget？
- **为什么要问：** [已知\|外部] Theme 只定义颜色；ASCII、动画、footer 和任务进度属于 Extension UI。
- **影响：** UI spec、accessibility、terminal matrix、tasks。
- **推荐默认：** [推断] **A**：一个原创 `aili-macaron-dark` theme + 响应式 header + 可关闭/reduced-motion working indicator + compact footer/status + subagent widget；light themes、字体下载和 Otty 配置后置。
- **选项：** A. 单主题 + 完整轻量 UI；B. 仅主题；C. 首版即多主题 + 字体/Otty。
- **后果 / 取舍：** [推断] A 能形成可识别体验且范围可控；B 最快但不满足既有视觉目标；C 视觉最完整但扩大跨终端测试和许可面。
- **你的填写：** 主题/TUI/font 拆到后续 OpenSpec change；当前先完成核心能力，并在当前 change 中整理官方 Theme/TUI 与候选字体资料供后续 DEFINE 使用。
- **后续保留：** [开放问题] “JetBrains Maple Mono”是指 JetBrains Mono、Maple Mono、二者 fallback 组合还是某个具体发行变体；该问题不属于当前 change 的 BUILD gate。
- **写回位置：** UI spec / `proposal.md` / `test-plan.md`

### Q9 — OpenCode-only 工具与 optional integrations

- **问题：** skills 所依赖的 browser、memory、CodeGraph、Graphify、OpenSpec、Lark 或其他外部能力，首版应如何处理？
- **为什么要问：** [未验证] skills 能被 Pi 发现不代表这些工具名和运行时在 Pi 中存在。
- **影响：** compatibility spec、extension tools、packs、doctor、install side effects。
- **推荐默认：** [推断] **A**：建立 capability registry；Pi 原生或 AILI adapter 能力标为 `native/adapted`，第三方能力作为显式 optional pack；缺失时 skill 不假装成功，doctor 返回 `SKIP/WARN` 和安装指引。
- **选项：** A. capability registry + optional packs；B. bootstrap 默认安装全部外部工具；C. 只改 skill 文档，不提供 runtime adapters。
- **后果 / 取舍：** [推断] A 可审计且避免默认副作用；B 最接近全家桶但供应链/平台/下载面巨大；C 工作量小但不能声称 Pi 特化完成。
- **你的填写：** A. capability registry + optional packs。
- **写回位置：** compatibility/integration specs / `design.md`

### Q10 — installer、settings 与卸载所有权

- **问题：** setup 是否可以合并用户的 Pi settings、设置默认主题并写 AILI config/receipt？
- **为什么要问：** [推断] 一句话安装需要明确哪些路径由 AILI 管理，以及失败/卸载时哪些内容可回滚或保留。
- **影响：** installer spec、config schema、receipt、rollback/uninstall tests。
- **推荐默认：** [推断] **A**：原子 merge + 0600 backup + receipt；只管理 AILI 自有字段/路径；不写认证；卸载只删除 receipt 证明且 hash 未变的 owned files，并保留 memory、sessions、auth 和用户修改。
- **选项：** A. managed merge + receipt；B. 只执行 `pi install`，不改默认设置；C. AILI 接管一份完整 Pi settings。
- **后果 / 取舍：** [推断] A 兼顾拎包入住与用户所有权；B 最安全但体验不完整；C 最一致但最容易覆盖用户配置。
- **你的填写：** 采用薄 bootstrap；核心不改写 Pi settings，不增加自有 package receipt，也不复制 Pi 的 update/remove 逻辑。
- **证据补充：** [已知\|外部] `pi install` 已负责在 Pi 存在时安装、记录、更新、移除 npm/Git/local Package，并加载 extension/skill/prompt/theme 与 package dependencies。来源：[Pi packages documentation](https://raw.githubusercontent.com/earendil-works/pi/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/docs/packages.md)。
- **不足边界：** [推断] `pi install` 不负责在干净机器上先安装 Pi，也不自动运行 AILI compatibility doctor 或选择会产生额外副作用的 optional packs。核心只补这两个必要边界；未来 optional pack 若创建 Package 之外的文件，再单独定义 receipt/rollback，不提前制造通用 installer framework。
- **写回位置：** installer/config specs / `design.md`

### Q11 — OS sandbox 是否属于本次 scope

- **问题：** 本次是否需要交付 OS-level sandbox，还是只交付 application-level permission policy？
- **为什么要问：** [已知\|外部] Pi security 文档明确 Package/Extension 不是 sandbox；`pi-sandbox` 等能力还有平台约束。
- **影响：** security claims、dependencies、platform support、tests。
- **推荐默认：** [推断] **A**：本次交付 application-level safe/standard/YOLO gate，明确不称 sandbox；OS sandbox 作为后续 optional capability，先记录 threat model 和平台限制。
- **选项：** A. 本次不交付 OS sandbox；B. 首版提供 optional sandbox pack；C. strict mode 强制 sandbox。
- **后果 / 取舍：** [推断] A 范围可控且声明诚实；B 增加安全能力但需平台测试；C 安全边界最强但可能阻塞 Windows 和“一行安装”。
- **你的填写：** A. 本次不交付 OS sandbox。
- **写回位置：** `proposal.md` / security spec / `design.md`

### Q12 — 公开身份与用户命令

- **问题：** 是否确认 repository、npm package 和 setup 命令采用以下身份：`Rosetears520/aili-pi`、`@rosetears/aili-pi`、`npx @rosetears/aili-pi setup`，日常仍执行 `pi`？
- **为什么要问：** [推断] 这是公开 package/API contract，影响文档、release、配置 schema 和兼容测试。
- **影响：** proposal、package metadata、CLI spec、docs。
- **推荐默认：** [推断] **A**：确认上述身份；Package 同时包含 Pi resources 和 setup/update/doctor/uninstall CLI，但不提供替代 agent CLI。
- **选项：** A. 确认；B. 使用无 scope 的 `aili-pi`；C. 自定义其他名称。
- **后果 / 取舍：** [推断] scoped npm 名称归属清楚；无 scope 更短但名称可用性和归属需确认。
- **你的填写：** A. 确认 `Rosetears520/aili-pi`、`@rosetears/aili-pi`、`npx @rosetears/aili-pi setup`，日常继续运行 `pi`。
- **写回位置：** `proposal.md` / CLI spec / `context.md`

### Q13 — 提案覆盖的 release 终点

- **问题：** 这个 OpenSpec change 是定义完整 `v1.0` 终态并分阶段实现，还是只定义第一个最小里程碑？
- **为什么要问：** [推断] 完整终态包含同步、installer、64 skills、ROSE、19 subagents、permissions、UI、optional integrations 和跨平台 release；单个 BUILD 队列可能过大。
- **影响：** proposal scope、capabilities、task package size、acceptance 和 release gate。
- **推荐默认：** [推断] **A**：提案定义完整 v1 contract，但 tasks 按可独立验证的里程碑分包；只有全量 acceptance 满足才标记 v1，早期 package skeleton 使用 pre-1.0 版本。
- **选项：** A. 完整 v1 contract + 分阶段 BUILD；B. 仅 v0.1 package/UI skeleton；C. 拆成多个独立 OpenSpec changes。
- **后果 / 取舍：** [推断] A 保持一个产品合同且实施可分片；B 最快但遗漏当前明确范围；C 单次变更更小但跨变更依赖和验收管理更复杂。
- **你的填写：** A. 完整 v1 contract + 分阶段 BUILD。
- **写回位置：** `proposal.md` / `tasks.md` / `test-plan.md`

### Q14 — canonical skills 修改与同步

- **问题：** 当 canonical skill 含 OpenCode-specific 文本时，修改发生在 `aili-workflows` 还是 `aili-pi` overlay？
- **为什么要问：** [推断] 两边都维护正文会破坏“唯一来源”；运行时读取 `main` 又会破坏可重复 release。
- **影响：** cross-repository ownership、sync design、compatibility manifest、agent worklist、release provenance。
- **推荐默认：** [推断] canonical 正文只在 `aili-workflows` 修改为 backend-neutral/capability-based；`aili-pi` 发布时嵌入固定 commit/hash 的原样 snapshot，不维护 semantic overlay。
- **你的填写：** 正文改在 `aili-workflows`；Pi 原样同步固定版本；当前 change 需要给后续 agent 一份明确的 upstream skill migration 清单。
- **权限边界：** [工具结果] 该答案定义了产品所有权，但不是当前对外部 repository 的 write/attach 操作授权；执行时仍需 exact target/revision/operation approval。
- **写回位置：** `proposal.md` / `design.md` / `tasks.md` / upstream migration checklist

## 5. 设计漏洞 / 证据缺口 / 反例

| ID | 类型 | 说明 | 建议处理方式 | 状态 |
|---|---|---|---|---|
| L1 | Missing repository evidence | [工具结果] 当前目标只有 OpenSpec scaffold，不是 Git repository，也没有 package source、tests 或 project `AGENTS.md`。 | [推断] 通过 Q1 确认 owner；BUILD 前完成 Git/rules/branch gate。 | open |
| L2 | Compatibility gap | [未验证] 64 个 skills 未逐项执行或审计；部分包含 OpenCode-specific 工具与路径。 | [推断] 建立生成式 compatibility inventory 和每 skill acceptance。 | open |
| L3 | Runtime gap | [未验证] Pi child process 对取消传播、structured result、max output、权限继承和 Windows shell 的实际行为尚未运行验证。 | [推断] 在 design 中要求 compatibility spike 和 executable tests。 | open |
| L4 | Security boundary | [已知\|外部] tool-call gate 不是 sandbox；YOLO 会扩大用户权限下的执行面。 | [推断] 通过 Q7/Q11 固化 claims 和 fail-closed 行为。 | open |
| L5 | Supply-chain risk | [工具结果] `pi-subagents` 缺少预期 root LICENSE 文件；`gentle-pi` 的归属文本不足以直接证明所有项目代码 provenance。 | [推断] 不复制；如需采用，先做逐 repo 许可审查并记录 revision/notice。 | open |
| L6 | Update drift | [推断] 若运行时从 `aili-workflows/main` 拉取 skills，同一 AILI 版本会产生不可重复内容。 | [推断] 推荐固定 commit 的 build-time snapshot。 | open |
| L7 | False completeness | [推断] 只让 Pi 显示 skill/prompt/theme 名称，不能证明 OpenCode-specific 行为已迁移。 | [推断] 通过 compatibility statuses + behavior tests 禁止假完成。 | open |
| L8 | Local-reference permission | [工具结果] 本轮没有向 `.worktrees/` 拉取任何外部 repository；当前目录也不是可作为 A33 host 的 Git repository。 | [推断] 目前使用固定 URL 的只读公开研究；如后续确需本地代码审计，必须逐个给出 exact source、revision、destination 并取得新的 exact ADD approval。 | open |

## 6. 术语 / 领域模型挑战

| ID | 术语或边界 | 冲突 / 模糊点 / 边界场景 | 证据 | 建议处理 | 写回位置 |
|---|---|---|---|---|---|
| D1 | `Pi Package` vs `plugin` | [已知\|外部] 官方资源模型称 Package；Extension 只是 Package 内一种资源。 | Pi `packages.md` | [推断] 对外使用 `AILI Pi distribution/package`，代码层使用 `Extension`、`Skill`、`Prompt`、`Theme`。 | `context.md` |
| D2 | `全部内容` | [推断] 可能表示“全部文件被打包”，也可能表示“全部能力端到端可用”。 | 当前用户请求 + compatibility evidence | [推断] 通过 Q2 定义为有状态、有验收的全量 compatibility inventory。 | `context.md` / specs |
| D3 | `YOLO` | [推断] 可能表示项目内普通操作自动批准，也可能表示全系统无条件执行。 | 当前会话 | [推断] 通过 Q7 定义边界，并避免把 YOLO 描述成 sandbox。 | `context.md` / permission spec |
| D4 | `canonical skill source` | [推断] “唯一来源”不自动决定 submodule、runtime download 或 generated snapshot。 | 当前用户请求 | [推断] 通过 Q2/Q6 固化 source pin、生成和 provenance。 | `context.md` / `design.md` |
| D5 | `subagent` | [已知\|外部] Pi Package 没有原生 agent resource；AILI subagent 是由 owned Extension runtime 加载角色 profile 的执行上下文。 | Pi package/subagent docs | [推断] 在 glossary 中区分 `role profile`、`task invocation`、`child process`。 | `context.md` |
| D6 | `permission gate` vs `sandbox` | [已知\|外部] 前者是 application policy，后者是 OS isolation boundary。 | Pi security docs | [推断] 两词禁止互换。 | `context.md` / security spec |

## 7. 填写说明

- 可以直接在每个问题的“你的填写”后写答案。
- 也可以在聊天里按 `Q1: A`、`Q2: A` 的形式批量回答；模型会把答案、分类和写回位置同步回本文件并重新读取。
- 接受推荐默认答案时，可以写“全部同意默认”，再单独覆盖不同项。
- 不确定的地方写“不确定”；不会被静默写成事实。
- 未回答的 material question 将保留为 `Open Question`，整体 readiness 为 `BLOCKED`。
- `test-plan.md` 完成后仍需一次独立、明确的最终接受；当前问卷回答不等于 BUILD 授权。

## 8. 后续写回映射

| 用户答案 | 将写回到 | 写回方式 | 写回前门禁 |
|---|---|---|---|
| Q1、Q12 | `proposal.md`、`context.md` | repository/package/CLI identity | confirmed / accepted `UNVERIFIED` |
| Q2、Q9 | `proposal.md`、compatibility/integration specs、`test-plan.md` | scope、compatibility states、optional packs、acceptance | confirmed / waived / accepted `UNVERIFIED` |
| Q3、Q4、Q10 | installer/version/config specs、`design.md`、`tasks.md` | install/update/rollback/platform contract | confirmed |
| Q5 | subagent spec、`design.md`、`tasks.md`、`test-plan.md` | runtime、state machine、limits、verification | confirmed |
| Q6 | `design.md`、release spec、dependency tasks | provenance/dependency policy | confirmed |
| Q7、Q11 | permission/security specs、`design.md`、`test-plan.md` | modes、risk gates、sandbox claims | confirmed |
| Q8 | `proposal.md`、`context.md`、`theme-references.md` | 当前 change 非目标 + 后续 change 输入 | confirmed |
| Q13 | `proposal.md`、`tasks.md`、`test-plan.md` | milestone structure与 v1 acceptance | confirmed |

## 9. 答案吸收记录

_用户回答后由模型补充；聊天内容在写回并重读前不是最终 source of truth。_

| 问题 | 用户答案 | 分类 | 形成的决策 | 已写回位置 | 剩余不确定 / 追问 |
|---|---|---|---|---|---|
| Q1 | 当前目录对应已创建但未初始化的 `Rosetears520/aili-pi`。 | `confirmed` | 当前目录是 change owner；Git init/remote 仍是后续单独操作。 | 本文件 | [开放问题] BUILD 前需取得 exact Git 初始化/remote 操作授权。 |
| Q2 | 分层全量兼容。 | `confirmed` | 全量 inventory 使用 `native/adapted/optional/blocked` 状态；稳定版不允许未解释 blocked。 | 本文件 | 无。 |
| Q3 | clean install 使用 latest；已有 Pi 不强更；显式更新；不兼容时 fail-closed。 | `confirmed` | latest policy、existing-install policy 与 failure behavior 已确定。 | 本文件 | [未验证] compatibility probe 需 executable prototype。 |
| Q4 | Linux-only 首版。 | `revised-and-accepted` | v1 仅支持 Linux；macOS 与 native Windows 均明确 unsupported。 | 2026-07-23 当前会话用户决定与 Test Plan 再接受 | [工具结果] 修订后 strict validation 通过；BUILD 已恢复。 |
| Q5 | 调研后由模型选择最优路径。 | `confirmed` | owned child-process adapter，官方示例为主，审计后选择性采用 Agwa hardening。 | 本文件 | [未验证] 凭据投影、process-tree cleanup、严格 protocol caps 需 prototype。 |
| Q6 | 审计后选择性复用。 | `confirmed` | 许可/provenance/API/maintenance gate 是复用前置条件。 | 本文件 | 无。 |
| Q7 | session-only bounded YOLO；`Ctrl+Shift+Alt+A` + slash fallback；高风险门禁保留。 | `confirmed` | 自动模式、持久化、可见性和 fail-closed boundary 已确定。 | 本文件 | [未验证] 组合键跨终端传递需测试。 |
| Q8 | 主题/TUI/font 拆到后续 change；当前只整理资料并预留稳定 hook。 | `confirmed` | 视觉实现不是当前 change 的 capability 或 BUILD gate。 | 本文件 | [开放问题] 字体和视觉选择转移到后续 change。 |
| Q9 | capability registry + optional packs。 | `confirmed` | 外部能力不默认全装；缺失状态必须可诊断。 | 本文件 | 无。 |
| Q10 | 采用薄 bootstrap，不改 Pi settings，不复制 package manager。 | `confirmed` | 官方 installer + `pi install` 是核心安装路径；optional 外部资产以后单独治理。 | 本文件 | 无。 |
| Q11 | 本次不含 OS sandbox。 | `confirmed` | 只定义 application policy；不得宣称 sandbox。 | 本文件 | 无。 |
| Q12 | 确认推荐公开身份。 | `confirmed` | repository/package/setup/日常 CLI identity 已确定。 | 本文件 | [未验证] npm scoped package 的实际发布权限/可用性。 |
| Q13 | 完整 v1 contract，分阶段 BUILD。 | `confirmed` | 一个 change 定义 v1，tasks 按可验证里程碑分包。 | 本文件 | 无。 |
| F1 | clean install 使用 latest；已有 Pi 不强更；显式 `--update-pi`；不兼容时在 AILI mutation 前停止。 | `confirmed` | latest policy 与 fail-closed 行为已确定。 | 本文件 | [未验证] latest compatibility probe 需 executable prototype。 |
| F2 | session-only bounded YOLO，快捷键 + slash fallback，高风险门禁保留。 | `confirmed` | 自动模式不持久化，必须可见且 fail-closed。 | 本文件 | [未验证] 组合键跨终端传递需手工/自动矩阵验证。 |
| F3 | 薄 bootstrap。 | `confirmed` | 官方 installer 负责 Pi，`pi install` 负责 Package；核心不接管 settings/receipt。 | 本文件 | optional pack 若产生外部文件，需后续独立 ownership design。 |
| F4 | 主题/TUI/font 拆到后续 OpenSpec change。 | `confirmed` | 当前 change 只预留稳定状态/快捷键接口并整理参考，不实现视觉主题。 | 本文件 | [开放问题] 后续 change 再确认具体字体与视觉验收。 |
| Q14 | canonical 正文改在 `aili-workflows`，Pi 同步固定原样快照，并出具 agent migration 清单。 | `confirmed` | 不允许 `aili-pi` semantic skill overlay；上游修改需要独立仓库权限与证据。 | 本文件 | [未验证] 64-skill 逐项 locality audit 尚未执行。 |

## 当前 readiness

- **Requirements-grilling：** `READY`
- [工具结果] **状态依据：** 当前 change 的 material 产品决策已回答并分类；主题/TUI/font 已明确移出本 change；剩余项均为 executable evidence 或未来 exact-operation gate，而非未决产品语义。
- [工具结果] **DEFINE readiness：** `READY`；proposal/design/specs/tasks/context/interview/test-plan 已形成，OpenSpec strict validation 通过，最终 `test-plan.md` 已获用户明确接受且无 waiver。实际 BUILD 仍需显式 BUILD 请求和各项精确操作授权。
