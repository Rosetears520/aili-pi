# Change Context: create-aili-pi-distribution

## Goal

[已知|用户] 在官方 Pi 之上发布独立 `@rosetears/aili-pi` distribution，用薄 Unix bootstrap 完成 Pi + AILI 安装，并提供 Pi 特化的 ROSE、shared skills、5 lifecycle prompts、19 subagents、delegated permission modes、capability registry 与 doctor；日常入口保持 `pi`（来源：`interview.md` 与 2026-07-23 native-integration decisions）。

## Confirmed Decisions

- [工具结果] Repository：`https://github.com/Rosetears520/aili-pi`；当前本地目录是 owner，Git branch 为 `build/create-aili-pi-distribution`，尚无 commit。
- [已知|用户] Shared skills：`aili-workflows` 是唯一 canonical source；正文在上游修改，Pi release 嵌入固定 commit/hash 原样 snapshot，无 runtime fetch 或 semantic overlay。
- [已知|用户] Compatibility：全量 inventory 使用 `native/adapted/optional/blocked`；稳定版无未解释 `blocked`。
- [已知|用户] Pi policy：clean install 使用官方 latest；已有 Pi 不强更；`--update-pi` 显式升级；不兼容时在 AILI mutation 前 fail-closed。
- [已知|用户] Platform：本 change 的稳定支持范围仅为 Linux；macOS 与 native Windows 均不在本 change 的支持或发布门禁内（来源：2026-07-23 当前会话范围修订决定）。
- [已知|用户] Subagent：`@agwab/pi-subagent` 的 pinned API 承担 child lifecycle；AILI 保留 fresh、single-use、terminal、max concurrency 2、no automatic resume/retry/recursion 的 policy adapter。
- [已知|用户] Reuse：官方/社区代码均需固定 revision；社区采用前必须通过 license/provenance/API/maintenance audit。
- [已知|用户] Mode：采用 `pi-permission-modes` 的 `Default/Plan/Build/YOLO`、`/perm` 和 `Alt+M`；保留其 high-risk confirmation/headless behavior。Bubblewrap sandbox 可用时启用，缺失/不兼容时显式降级，不作隔离承诺。
- [已知|用户] Installer：薄 bootstrap；核心不接管 Pi settings、认证、receipt 或 update/remove。
- [已知|用户] Theme/TUI/font：拆到后续 OpenSpec change；当前只整理参考资料和预留状态接口。
- [已知|用户] Global Pi resources：静态 ROSE prompt 安装到 `~/.pi/agent/APPEND_SYSTEM.md` 的 marker-owned block；19 role profiles 安装到 `~/.pi/agent/agents/aili/`。首次写入、更新或任何 prune 均是独立 external-directory operation；默认不覆盖不属于 AILI marker 的内容。
- [已知|用户] Native integrations：`pi-web-access`、`pi-quota-status`、`pi-permission-modes` 与 `@agwab/pi-subagent` 以 exact pinned dependency 集成；`pi-web-access` 使用完整 upstream surface，`pi-workflow` 仅保存 reference checkout，当前不得阅读或集成。
- [已知|用户] Quota default：AILI 默认注册 `pi-quota-status`；正常 Pi session 可由上游维护 `~/.pi/agent/pi-quota-status/state.json`，而 `/quota config` 才创建其 config template。该 runtime external state 必须在文档/doctor 中可见；当前 agent 不得以真实 HOME 测试它。

## Rejected Options

- [已知|用户] 拒绝 fork/rebrand Pi、使用 Oh My Pi runtime、替换 `pi` CLI。
- [已知|用户] 拒绝在 `aili-pi` 手工维护第二份 skill 正文或 semantic overlay。
- [已知|用户] 拒绝默认安装全部 optional integrations。
- [已知|用户] 拒绝首版覆盖 macOS、native Windows、OS sandbox 或视觉主题实现。
- [已知|用户] 拒绝手写重造 web search、quota、permission mode 和 child lifecycle；AILI 只保留明确的 policy/configuration adapter。
- [框架内] 拒绝默认启用 pi-subagent worktree、background、resume、automatic redispatch 或 stale-profile prune；这些能力须在独立 DEFINE 中接受。

## Unverified Residuals

- [未验证] BUILD 时 Pi latest/version/API/Node floor。
- [未验证] 64-skill 逐项 migration inventory 和行为兼容结果。
- [未验证] child credential inheritance、process-tree cancellation、JSONL/stderr/final-result caps。
- [未验证] shortcut 在 terminal/tmux/SSH 上的可达性。
- [未验证] 真实官方安装器的 clean-machine Linux E2E、npm publish identity 和 registry 权限。
- [未验证] project `AGENTS.md`、Git branch/status 与 upstream attachment/write 权限；这些需在对应操作前重新取证或询问。

## Language

- **AILI Pi distribution**：官方 Pi 上安装的 `@rosetears/aili-pi` Package 与薄 bootstrap 的组合。_Avoid_: “AILI fork of Pi”。
- **Pi Package**：Pi 官方资源容器，可包含 Extension、Skill、Prompt、Theme。_Avoid_: 把 Package 与单个 Extension 混称为同一层。
- **Owned Extension**：`aili-pi` 唯一运行时入口，组合 ROSE、audited native integrations、thin policy adapter、registry 与 doctor 模块。
- **Canonical skill source**：`aili-workflows/.agents/skills`；skill 正文的唯一编辑 owner。
- **Skill snapshot**：从一个固定 canonical commit/hash 原样嵌入 AILI Pi release 的生成产物。_Avoid_: runtime latest sync。
- **Capability registry**：记录 skill/tool/integration 的 provider、status、side-effect class 与 doctor probe 的 source of truth。
- **Role profile**：从 AILI role 语义生成的 Pi child prompt/tool/policy 配置，不是 Pi Package 原生 agent resource。
- **Task invocation**：一次新 UUID、fresh child process、single-use、terminal 的 subagent 执行。
- **Delegated permission modes**：`pi-permission-modes` 的 `Default/Plan/Build/YOLO`、`/perm` 和 `Alt+M`。_Avoid_: 以旧 AILI modes 或无条件授权描述它。
- **Sandbox degradation**：vendor sandbox prerequisites/topology 不满足时的显式降级状态。_Avoid_: 与 OS isolation 或 universal containment 互换。
- **Optional pack**：需要用户显式选择的外部 capability 集合；缺失时为 `SKIP/WARN`，不得伪报成功。

## Next Gate

[工具结果] The 2026-07-23 web-access/full-surface and quota-default Test Plan is accepted and strict-valid. BUILD may resume only for its accepted contract; replacing `pi-web-search`, global resource writes, commit/push/publish/release remain separate exact operation gates.
