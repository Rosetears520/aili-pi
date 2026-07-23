## Context

[已知|用户] 本 change 定义一个独立 `@rosetears/aili-pi` distribution，底座必须是官方 Pi，日常命令保持 `pi`；`aili-workflows` 继续作为共享 skills 唯一 canonical source（来源：`interview.md` Q1、Q12、Q14）。[已知|外部] Pi Package 支持 extension/skill/prompt/theme，但没有 package-level agent 或内建权限系统，因此 ROSE、subagent 与 permission modes 必须由 owned Extension 提供（来源：[Pi packages](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/packages.md)、[Pi security](https://github.com/earendil-works/pi/blob/906b40a75329bc3a4c19865f0279903f6be6d476/packages/coding-agent/docs/security.md)）。

[工具结果] 当前 repository 只有 OpenSpec scaffold，尚未初始化 Git，也没有 package source、tests 或 project `AGENTS.md`。[推断] Git 初始化、remote 设置、项目规则初始化和任何跨 repository attachment/write 必须在 BUILD 前或对应 package 开始前分别通过精确操作门禁。

## Goals / Non-Goals

**Goals:**

- [已知|用户] 用一个正常 Pi Package 承载 ROSE runtime、5 个 lifecycle prompts、19 个 role profiles、共享 skill snapshot、permission modes、capability registry 和 doctor。
- [已知|用户] 用薄 Unix bootstrap 组合官方 Pi installer 与 `pi install`，不复制 Pi package manager。
- [已知|用户] 让每个 subagent invocation 都是 fresh、single-use、terminal，默认最大并发 2，且不允许 AILI-level resume、自动 retry 或递归委派。
- [已知|用户] 提供 session-only bounded YOLO，并保留高风险 ask/deny、noninteractive fail-closed 与状态可见性。
- [已知|用户] 对全部 shared skills 建立可审计兼容状态；稳定版不得存在未解释的 `blocked`。
- [已知|用户] 给后续 agent 提供 canonical skills 的 backend-neutral migration 清单，并确保 Pi 发布快照可重复、可追溯。

**Non-Goals:**

- [已知|用户] 不 fork/rebrand Pi，不使用 Oh My Pi runtime，不更改日常 `pi` CLI。
- [已知|用户] 本 change 不交付 macOS、native Windows、OS sandbox、主题/TUI/font 实现，也不默认安装全部 optional integrations。
- [已知|用户] 本 change 不接管 Pi settings、认证、session、update/remove 或 package receipt。
- [推断] 本 change 不承诺 community plugin 的原样 API/行为，也不在许可/provenance 未清晰时复制其代码。

## Decisions

### 1. 一个 owned Pi Package，Extension 作为运行时入口

[框架内] `package.json` SHALL 声明一个 owned Extension entry、固定 skill snapshot 和 5 个 prompt templates；主题目录不进入本 change 的 manifest。[框架内] Extension SHALL 分模块注册 ROSE context、`aili_task`、permission mode、capability registry、doctor、keybinding 与状态指示，但 Package SHALL 只暴露一个 extension entry，避免多个独立 hook 的顺序冲突。

[推断] 选择这一结构而非 fork Pi，因为官方 Extension API 已覆盖 system prompt 注入、tool interception、commands、shortcuts 和 status；fork 会增加上游合并及同名 CLI 风险。[推断] 选择 owned Extension 而非拼装多个未审计社区 Extension，因为 AILI 需要一个一致的 parent/role permission ceiling 和 lifecycle contract。

### 2. Canonical skills 使用固定原样快照，不维护 Pi semantic overlay

[框架内] `upstream/aili-workflows.lock.json` SHALL 记录 repository URL、40 位 commit SHA、skill root、skill count、tree/content hashes 和同步时间。[框架内] `scripts/sync-skills` SHALL 只接受与 lock revision 匹配的本地 source 或显式 exact revision source，原样复制 canonical skill tree，并拒绝 dirty/mismatched input。[框架内] prepack/CI SHALL 验证 snapshot 与 lock/hash 一致；runtime SHALL 不访问 `aili-workflows/main`。

[已知|用户] 任何需要改变 skill 正文或语义的兼容修复 SHALL 先发生在 `aili-workflows`，再发布新固定快照；`aili-pi` SHALL 不维护 semantic overlay（来源：`interview.md` Q14）。[框架内] Pi-specific tool/path differences SHALL 优先由 capability aliases/adapters 和 registry 解决。[框架内] 如果 backend-neutral 化无法保持语义，兼容状态 SHALL 为 `blocked`，直到 canonical source 被修订。

[推断] 选择原样快照而非 submodule/runtime download，可同时保持单一正文来源、npm 自包含和 release 可重复性。

### 3. 共享 skill 中立化由独立 upstream lane 执行

[框架内] `upstream-skill-migration.md` SHALL 是后续 agent 的迁移合同，规定 inventory、搜索模式、rewrite rule、capability ownership、验证和禁止项。[框架内] 对 `aili-workflows` 的实际修改 SHALL 在该 repository 自己的规则、Git 状态和 artifact owner 下完成；当前 change 只消费经确认的 pinned result。

[框架内] 第一个兼容里程碑 SHALL 生成每个 skill 的记录：source path/hash、required capabilities、backend-specific anchors、目标修改、owner、verification、状态和理由。[框架内] 未清点条目 SHALL 视为 `blocked`，不得用“Pi 已发现 skill”代替行为兼容证据。

### 4. ROSE 与 prompts 使用 Pi-native adapter，不替换 Pi 基础 system prompt

[框架内] `before_agent_start` SHALL 在 Pi 当前 system prompt 后追加稳定 ROSE rules 与紧凑 runtime summary，而不是替换 Pi 基础 prompt。[框架内] 5 个 prompt templates SHALL 保留 `/ideate`、`/define`、`/build`、`/ship`、`/local-review` 的用户语义；ROSE SHALL 继续识别等价自然语言 intent。[框架内] 如果 prompt 名发生冲突，doctor SHALL 报告冲突并禁止静默 shadow 作为通过状态。

[推断] ROSE role text 和 19 个 role profiles 可以从 `aili-workflows` 当前语义中派生，但 Pi-specific resource/tool/frontmatter SHALL 由 `aili-pi` 生成并拥有，因为用户只指定 skills 为唯一 canonical source。

### 5. Subagent 使用官方示例派生的 Unix child-process adapter

[已知|外部] Pi `0.81.1` 官方示例通过 `pi --mode json -p --no-session` 启动独立 child、解析 JSONL 并流式更新（来源：[official example](https://raw.githubusercontent.com/earendil-works/pi/20be4b18d4c57487f8993d2762bace129f0cf7c6/packages/coding-agent/examples/extensions/subagent/index.ts)）。[已知|外部] OMP `17.0.7` 使用依赖 `@oh-my-pi/*` 的 in-process executor，不满足保留官方 Pi runtime 的边界（来源：[OMP executor](https://raw.githubusercontent.com/can1357/oh-my-pi/7b141199d524b859c357fc89654f10b62b9f3df1/packages/coding-agent/src/task/executor.ts)）。

[框架内] AILI SHALL 注册 `aili_task`，每次最多接收 2 个 task，使用 semaphore 将全局 active child 限制为 2。[框架内] 每个 task SHALL 获得新 UUID、一个明确 role profile、父级与 role policy 的交集、当前 project root 和必要的项目规则；child SHALL 使用 `--no-session`，并禁用非 AILI resource 自动发现或递归 task registration。[框架内] child 结束后 SHALL 销毁 invocation state，且 API SHALL 不提供 resume、chain、background continuation 或自动 redispatch。

[框架内] 取消 SHALL 终止 Unix process group，并在宽限期后升级信号；child event、stderr、JSONL line、artifact detail 和最终 model-visible result SHALL 分别有 byte limit，最终结果上限为 50 KiB。[框架内] 超限 SHALL 返回显式 truncation/error metadata，不能静默丢失证据。[框架内] AILI 不自动重试整个 task；Pi/provider 在同一 child 内部的 transport behavior 不得被报告为一个新 AILI task。

[框架内] community code 仅可在 `THIRD_PARTY_NOTICES.md`/SBOM 记录 revision 和 license 后选择性适配。[推断] `@agwab/pi-subagent` 的 MIT process-group、interrupt escalation、artifact 和 tool-ceiling patterns 是最强候选，但其完整 public runtime contract不直接成为 AILI API（来源：[license](https://raw.githubusercontent.com/AgwaB/pi-subagent/daa7b83819116a62008ad17aa65fcd50fefbafd0/LICENSE)）。

### 6. 权限由 parent-active ∩ role-allowed ∩ mode-policy 决定

[框架内] 每次 tool call 的有效策略 SHALL 是 parent active permission、role allowlist 和当前 session mode policy 的交集；child 永远不能扩大 parent 权限。[框架内] `standard` 是 session 初始模式；`bounded-yolo` 只自动允许当前 project root 内已分类的普通读写与非破坏性命令。[框架内] external-directory、credential/auth、destructive、push/publish/release SHALL 保持 exact ask/deny；无 UI 时任何 ask SHALL 变为 deny；无法可靠分类 SHALL ask 或 deny，不能默认 allow。

[框架内] `Ctrl+Shift+Alt+A` SHALL 在当前 session 切换 `standard ↔ bounded-yolo`，不得持久化到下一 session；状态 SHALL 持续可见。[框架内] `/aili-mode standard|yolo` SHALL 提供同等 fallback，并在 keybinding conflict/unsupported terminal 时保持功能可达。[框架内] mode 切换不是一次外部目录、发布或破坏性操作的预授权。

### 7. Capability registry 是完整性与 optional pack 的 source of truth

[框架内] `manifests/capabilities.json` SHALL 定义 capability ID、provider/adapter、required/optional、平台、secret/network/side-effect class 和 doctor probe；本 change 的 required platform evidence 仅为 Linux。[框架内] `manifests/skill-compatibility.json` SHALL 覆盖每个固定 snapshot skill，并只使用 `native`、`adapted`、`optional`、`blocked`。

[框架内] `native` 表示 Pi 已提供并通过行为测试；`adapted` 表示 AILI adapter 提供并通过行为测试；`optional` 表示 skill 可安装但依赖显式 pack，缺失时 SHALL 返回 `SKIP/WARN` 与安装指引；`blocked` 表示不满足合同并禁止稳定 release。[框架内] doctor SHALL 输出 human-readable 与 JSON 结果，且 missing/failed work SHALL 不被吞掉或报告为成功。

[推断] optional pack 的外部下载、settings 修改、receipt 或 rollback 不在核心通用 installer 中预建；每个产生 Package 外部副作用的 pack SHALL 先有独立 DEFINE contract。

### 8. Thin bootstrap 委托官方 Pi 与 Pi package manager

[框架内] Linux `install.sh`/setup SHALL 在 Pi 缺失时调用官方 Pi installer，并在 Pi 已存在时默认不升级。[框架内] `--update-pi` SHALL 是升级既有 Pi 的显式开关。[框架内] clean install SHALL 使用当时官方 latest；setup SHALL 在 AILI mutation 前执行版本/API/resource smoke，失败时停止并保留可复现诊断。[框架内] macOS/native Windows invocation SHALL fail before mutation with an unsupported-platform result.

[框架内] 通过检查后 setup SHALL 调用 `pi install npm:@rosetears/aili-pi@latest` 或与 bootstrap release 对应的明确 source。[框架内] 核心 SHALL 不覆盖 Pi settings、认证、session 或其他 packages；失败后 SHALL 报告 Pi 与 AILI 的分别状态，不因 AILI 失败自动删除用户原有或刚安装的官方 Pi。[推断] 选择该边界可避免重复实现 update/remove/ownership；未来额外资产另行治理。

### 9. 主题视觉作为后续 change

[已知|用户] Theme JSON、自定义 header/working indicator/footer/widget 和字体选择移入后续 OpenSpec change；当前 change 只保证 mode/subagent 状态有最小可见文本接口，并生成 `theme-references.md`（来源：`interview.md` F4）。[框架内] 当前 Package manifest SHALL 不以未验收主题作为核心依赖或完成条件。

## Risks / Trade-offs

- [风险] [未验证] Pi latest 可在 AILI release 后改变 Extension/API 行为。→ [框架内] setup 在 mutation 前执行 compatibility smoke；CI 追踪 latest；不兼容时 fail-closed，而不是静默降级。
- [风险] [未验证] 64 skills 中可能存在无法用 runtime adapter 中立化的 OpenCode-specific 语义。→ [框架内] 先产出逐项清单；正文修复回到 canonical repo；未解决条目标记 `blocked`。
- [风险] [未验证] child process 可能遗留进程、吞掉 stderr、超限内存或继承过宽资源。→ [框架内] 使用 process group、升级终止、流式解析、全通道 byte caps、显式 tool/resource allowlist 和负向测试。
- [风险] [未验证] Pi 用户认证在 child 模式下的 provider/模型差异可能导致启动失败。→ [框架内] child 沿用官方 Pi 用户配置但禁用非 AILI resources；prototype 覆盖至少一种 API-key provider 和一种 Pi-supported login path；不得复制或记录凭据。
- [风险] [未验证] `Ctrl+Shift+Alt+A` 可能被终端、tmux 或其他 Extension 截获。→ [框架内] `/aili-mode` 是强制 fallback；doctor 报告 shortcut registration，测试覆盖 tmux/常用终端的可达性。
- [风险] [推断] 薄 bootstrap 无跨官方 Pi + AILI 的全事务 rollback。→ [框架内] 在 AILI mutation 前检查；失败保留官方 Pi并清楚报告 partial state，避免破坏性自动卸载。
- [风险] [推断] 跨 repository skill 修订可造成发布时序耦合。→ [框架内] lock file、hash、upstream release/commit 和 compatibility report 共同形成显式依赖；AILI release 不跟随 `main`。
- [风险] [推断] 社区代码可引入供应链或许可负担。→ [框架内] audit gate、pinned revision、NOTICE/SBOM、最小适配和可替换边界是采用前置条件。

## Migration Plan

1. [框架内] 在获得精确操作授权后初始化 `aili-pi` Git repository/remote/开发分支，建立项目规则、package skeleton 与测试基线。
2. [框架内] 对固定 `aili-workflows` revision 运行 `upstream-skill-migration.md` 清单，形成 64-skill inventory；需要正文修订的工作进入其 owning repository，完成后更新 lock revision。
3. [框架内] 建立 Pi Package、原样 skill snapshot、5 prompts、ROSE adapter、capability manifests 与 doctor；先验证 `pi -e`/local package load，再验证 `pi install`。
4. [框架内] 实现 19-role child-process orchestrator、协议限制、取消传播、permission ceiling 和 streaming evidence。
5. [框架内] 实现 standard/bounded-yolo、shortcut/fallback、noninteractive fail-closed 与权限负向测试。
6. [框架内] 实现 Linux thin bootstrap、latest smoke、explicit update 和 clean-machine/reinstall/remove E2E。
7. [框架内] 运行完整 compatibility、license/provenance、package dry-run、Linux matrix 与 release gates；稳定版只有在无未解释 `blocked` 后才能发布。

[框架内] Rollback SHALL 优先使用 `pi remove` 回退 AILI Package；核心不删除 Pi、认证、session、其他 Package 或用户文件。[框架内] upstream skill 修订 SHALL 通过其独立 Git commits 回滚，不能由 `aili-pi` installer 反向修改 canonical repository。

## Open Questions

- [未验证] BUILD 开始时官方 Pi latest、API 和 Node floor 需要重新取证；当前 `0.81.1` 只是 DEFINE 研究基线。
- [未验证] npm scope `@rosetears/aili-pi` 的实际发布权限与名称可用性尚未通过 registry-authenticated dry run 验证。
- [工具结果] 64-skill inventory 已固定；native integrations 对每个 Pi capability 的行为证据仍须作为 changed-scope verification 重新取得。
- [未验证] pinned dependency APIs 是否能完整承载 global resources、sandbox degradation、child policy adapter 与 provider-auth behavior，需要 executable integration tests；失败将触发 DEFINE material-delta，而不是静默重造生命周期。
- [开放问题] 主题、TUI 与“JetBrains Maple Mono”的准确字体身份在后续独立 OpenSpec change 决定，不阻塞当前核心 change。

## Superseding Native-Integration Design — 2026-07-23

[框架内] This section supersedes earlier design text for ROSE prompt placement, subagent implementation, permission modes, sandbox posture, global resource ownership, and their tests. Unchanged Package, snapshot, Linux-only, no-replacement-CLI, and provenance requirements remain in force.

### 1. One owned integration boundary, four pinned dependencies

[框架内] `@rosetears/aili-pi` SHALL retain one declared Extension entry. Its runtime SHALL initialize audited exact versions of `pi-web-access`, `pi-quota-status`, `pi-permission-modes`, and `@agwab/pi-subagent` through that entry; it SHALL not expose a second independently loaded AILI extension or direct users to install four unrelated packages.

[框架内] `package.json` and the committed lockfile SHALL pin the four integration versions. `THIRD_PARTY_NOTICES.md`, SPDX SBOM, provenance manifest, capability registry, and doctor SHALL identify package name, version, source revision/license evidence, adapter files, and focused verification. A dependency that fails API/load/provenance verification SHALL not silently fall back to the old AILI implementation.

### 2. Native web search and quota status

[已知|用户] The owned entry SHALL delegate the complete `pi-web-access` upstream surface: web search, content fetch, stored-content retrieval, GitHub clone/extraction, PDF extraction, YouTube/local-video handling, curator commands, and its bundled skill. Its default auto provider chain may use OpenAI/Codex, Exa, Brave, Parallel, Tavily, Perplexity, Gemini API, or opt-in browser-cookie Gemini; docs/doctor SHALL disclose provider selection rather than misrepresenting a single native-only path.

[框架内] GitHub clone caches, PDF output, local-video input, temporary curator service, network requests, browser-cookie opt-in, provider/API-key config, and bundled skill discovery are explicit side-effect/permission surfaces. The integration SHALL not silently narrow or reimplement them; its tests, doctor, provenance, and documentation SHALL make them visible. Actual user-home, credential, browser-cookie, provider-network, and real external-directory effects remain separately approved operations.

[已知|用户] The owned entry SHALL register `pi-quota-status` by default. Its normal session lifecycle may maintain the user-owned `~/.pi/agent/pi-quota-status/state.json`; `/quota config` creates its config template only on user request. No test or bootstrap may write actual user quota files without a separately approved exact operation. Disposable HOME fixtures SHALL prove the default behavior.

### 3. Permission modes and sandbox degradation

[框架内] The owned entry SHALL delegate permission UI and interception to `pi-permission-modes`: `Default`, `Plan`, `Build`, `YOLO`, `/perm`, and `Alt+M`. The prior AILI `standard`, `bounded-yolo`, `/aili-mode`, and Ctrl-key contract SHALL be removed rather than retained as a competing mode system.

[框架内] On Linux, sandbox-capable modes SHALL attempt Bubblewrap only when prerequisites and topology permit. Missing Bubblewrap, socket support, or incompatible Git worktree topology SHALL be visible as a degradation or confirmation path. Documentation, doctor, and result messages SHALL not claim OS isolation, universal containment, or protection from a trusted process.

### 4. Pi-subagent lifecycle with an AILI policy adapter

[框架内] AILI SHALL call `@agwab/pi-subagent/api` for child spawn, session lifecycle, bounded concurrency, cancellation, and artifact collection. AILI SHALL not retain its own process-group/JSONL/artifact lifecycle implementation once the API contract is proven.

[框架内] The AILI adapter SHALL accept only a fresh request with an AILI role and explicit policy packet, project root, and non-empty path boundaries for mutation-capable roles. It SHALL project role tool ceilings and a child guard into the spawned child, normalize the returned result to AILI’s structured evidence format, and fail closed for missing policy, unsupported output, or no UI confirmation.

[框架内] The adapter SHALL keep maximum active children at two and SHALL not expose `pi-subagent` worktree, background, resume, automatic redispatch, or recursive delegation features. It SHALL set artifact output to an ignored task-owned path under the current project (initially `.tmp/aili-subagent-runs`); it SHALL not create/remove Git worktrees.

### 5. Global static ROSE and role resources

[框架内] The distributable package SHALL carry an AILI Pi adapter template and generated role profiles, but Pi discovers their installed copies globally: an AILI marker-bounded block in `~/.pi/agent/APPEND_SYSTEM.md` and profiles in `~/.pi/agent/agents/aili/`.

[框架内] A dedicated explicit bootstrap operation SHALL create missing AILI-owned resources or update only an unmodified marker-owned block/profile. It SHALL never overwrite unrelated `APPEND_SYSTEM.md` content, unowned profile files, or a malformed/conflicting AILI marker. It SHALL not remove stale profile files automatically; doctor SHALL report stale/mismatched resources and provide a manual/removal path that remains a separately approved destructive operation.

[框架内] The global ROSE adapter SHALL retain semantic routing, evidence-before-editing, smallest claim-matched verification, task scope, uncertainty questions, user-language output, and project-rule precedence. It SHALL omit OpenCode frontmatter, OpenCode permission syntax, Task/task_id delegation protocol, A33/external-directory policy, formal OpenSpec hard dependencies, and conflicting skill-routing controls.

### 6. Migration and acceptance sequence

1. [框架内] Revise and strictly validate this DEFINE contract; user reaccepts the final Test Plan.
2. [框架内] Obtain a separate exact approval to modify dependencies and lockfile; install pins and prove API/load seams with no real HOME/global writes.
3. [框架内] Implement the minimal owned integration adapter, remove superseded owned runtime surfaces, update provenance/docs/tests, and run focused offline checks.
4. [框架内] Obtain a separate exact approval for any `~/.pi/agent/` installation/update probe; use disposable HOME for ordinary tests.
5. [框架内] Run claim-matched dependency, integration, sandbox-degrade, global-resource, child-policy, and package checks before any completion claim.

## Superseding Generic Subagent and Pi-native AGENTS Design — 2026-07-24

### 1. Generic upstream lifecycle is the public tool contract

[已知|用户] The owned Extension SHALL expose `subagent`, not `aili_task`. Its input/action surface SHALL remain compatible with the pinned `@agwab/pi-subagent@0.4.8` public schema: generic/role agent selection, single or parallel run, async/detach/notify, status/logs/wait/interrupt/mark-background/reconcile, explicit workspace/worktree, external `cwd`, backend/model/tool/resource controls, and upstream version-bounded fan-out. AILI SHALL not retain the two-child semaphore, forced headless/shared/no-sandbox flags, project-root-only path boundary, or mandatory 50 KiB structured task report.

[框架内] AILI SHALL retain one thin non-removable safety wrapper: it injects/retains the active `pi-permission-modes` and credential-path policy even when callers specify child extensions/resources, and it does not allow a caller to disable those guards through generic tool options. The upstream runner remains owner of spawning, process lifecycle, sandbox implementation, run artifacts, worktrees, and lifecycle actions.

### 2. Roles become optional named profiles

[已知|用户] The 19 profiles remain globally installed as `aili.<role>` agents. Selecting one uses its generated prompt/tool ceiling. Generic work may select another permitted global/project agent, provide one-off role context, or be agentless as the upstream API permits. Upstream recursive tool exclusion remains; no AILI worker may recursively delegate.

### 3. External access, credential denial, and sandbox

[已知|用户] Explicit non-credential external `cwd`/path work and worktree mutation are allowed. The active vendor permission mode decides external allow/ask/deny; no-UI asks deny. Credential/auth/private-key targets remain hard-denied across file tools and parsed bash commands, with no content returned in model-visible lifecycle output or artifacts. This is an application/vendor-policy guarantee, not a universal OS-containment claim.

[框架内] Sandbox is per invocation. `sandbox: true` is deny-all network; a model-backed run that needs egress must list exact valid `allowedDomains`. Sandbox false/absence is allowed only under normal active permission policy and does not disable protected-path denial. Worktree isolation remains explicit and must fail loudly if unavailable.

### 4. Pi-native synchronization of global AGENTS mechanisms

[已知|用户] The source is `aili-workflows/templates/opencode-global-AGENTS.md` at pinned commit `7eb35f357ad489f5841ee10dac1e44549c1bdb76` and SHA-256 `45b2c81650433c64e6316f078d1cdb11779cf3a0309eabdbd3fd64d616f3f2c0`. A generated/provenance-checked Pi adapter SHALL synchronize portable governance only: authority order, untrusted evidence, routing/delegation discipline, exact approvals, evidence/claim hygiene, scope, verification, and project-rule precedence.

[框架内] The adapter SHALL intentionally omit OpenCode-only Task/task_id, A33 attachments, permission syntax, CodeGraph initialization authority, global OpenCode installation paths, and mandatory lifecycle hard dependencies. It remains marker-owned under Pi `APPEND_SYSTEM.md`; any real user-home update stays separately approved.

### 5. Migration and acceptance

1. [框架内] Update the OpenSpec contract and final test plan; the user explicitly reaccepts the final revised test plan.
2. [框架内] Replace the public runtime/tool surface, role integration, child policy, global-template derivation/provenance, doctor, docs, and focused tests without changing the pinned dependency/lockfile.
3. [框架内] Run disposable-HOME and fake-run fixtures first; any real provider, sandbox, external directory, or global-home probe needs its own exact approval.
4. [框架内] Retire `aili_task` only after generic `subagent` discovery and negative safety tests pass. No compatibility alias is retained unless a later accepted contract adds one.
