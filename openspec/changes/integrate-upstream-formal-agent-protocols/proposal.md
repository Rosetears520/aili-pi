## Why

`aili-pi` 已经分别定义了 formal task board 和 shared/Pi Skill 分发边界，但 PR #1 后续落地仍缺少一个统一的消费合同：只有 canonical `aili-workflows` 先发布 Agent selection 与 formal task-board 协议，`aili-pi` 才能固定 exact release、生成 Pi routing projection、实现 formal board adapter，并安全移除通用 Skills 的安装与发布责任。

现有材料还混合了历史 PR 基线、当前工作树状态、实现授权和发布授权。若直接按单个旧 proposal 推进，容易把不可公开复核的会话证据、未提交实现或 moving `@latest` 误当成完成证明。需要一个 umbrella change 明确依赖顺序、状态边界、适配范围和统一 release gate。

## What Changes

- 先校正 PR #1 及相关 OpenSpec 文档：人类制品使用普通语言表达不确定性，不把当前会话、opaque runtime ref、未提交工作树或同批生成文档当成独立接受/完成证据。
- 将本 umbrella 设为重叠范围唯一的后续 BUILD/release owner；`add-file-task-board` 与 `separate-shared-and-pi-skill-distribution` 仅保留历史和 capability-source 参考，不再独立派发、推进或关闭重叠任务。
- 将 decision、contract acceptance、implementation authorization/status、verification、Git operation 与 release status 分开记录；重置无法由公开代码、测试或可访问 revision 支持的完成声明。
- 在 BUILD 前要求 canonical `aili-workflows` 发布包含 `aili-agent-selection/v1` 与 `aili-task-board/v1` 的 exact `rose-aili` release，并记录 version、commit、npm `gitHead`、tarball SHA-256、两个 reference hash 与 canonical role inventory。
- 从 exact upstream agent-selection matrix 生成 `manifests/agent-routing.generated.json`，让 Pi Runtime 在 `task` active 时提供紧凑 Specialized Agent catalog；RoleProfile description 仍由现有 role manifest 独占。
- 在 `rose-context.ts`、`templates/APPEND_SYSTEM.md` 和 persistent `task` metadata 中区分 ordinary 与 formal lane：ordinary 兼容 omitted-agent→`general`；formal package 必须显式 exact Specialized owner 与 sync/async mode，且 persistent continuation 只能保持同 package、role、scope、权限和 evidence contract。
- 实现 Pi 的 `aili-task-board/v1` parser、root resolver、state/update adapter、owning board write protection 与 restart reconciliation；`formalContext` v1 只携带 exact `changeId`，不从自然语言推断 package ID。
- 解除 shared/Pi Skill 分发耦合：repository-local `skills/**` 只作 exact verification baseline，不进入 npm tarball、不由 `postinstall` 写入 HOME；共享 Skills 由用户显式运行 exact/selected `rose-aili` 命令管理。
- doctor 只读报告 shared protocol 的 `present-compatible | missing | incompatible | unverified`，不得自动安装、更新、恢复 embedded fallback 或发起网络请求。
- 将 `improve-tui-interaction-and-wsl-image-paste` 与 `replace-pi-native-fallback-with-aili-emergency-checkpoint` 保持为独立 proposal，不纳入本 change 的 formal-board/distribution release gate。

## Capabilities

### New Capabilities

- `upstream-formal-agent-protocol-integration`: 定义 `aili-pi` 对 exact upstream Agent-selection/formal-board 协议的消费、Pi routing/board adapter、shared/Pi 分发解耦、doctor compatibility 与唯一 BUILD/release gate。

### Modified Capabilities

- `file-task-board`: 本 change 消费其 requirement/design 作为 capability source，并独占 upstream protocol 发布后的 Pi adapter、保护与 reconciliation 执行；旧 change 不再作为并行 BUILD board。
- `agent-dispatch-catalog`: 本 change 将 canonical matrix 投影为 Pi Runtime 主动读取的 generated routing manifest。
- `shared-and-pi-skill-distribution`: 本 change 消费其 requirement/design 作为 capability source，并在 exact upstream prerequisite 满足后独占 tarball、postinstall、HOME owner 与 doctor 边界的执行。

## Impact

预计影响 `upstream/aili-workflows.lock.json`、routing/role/compatibility/provenance manifests、Skill/role routing generators、`rose-context.ts`、`templates/APPEND_SYSTEM.md`、formal task-board modules、persistent Agent task/workspace/sandbox/storage seams、doctor、`package.json`、`package-lock.json`、bootstrap/README、package validation及相关 unit/integration/bootstrap tests。

本 proposal 不授权 dependency 或 lockfile mutation、文件删除、external repository write、真实 HOME 安装、Git commit/push/merge、npm publish、GitHub release 或真实 WSL release install。各操作仍需独立精确批准。最终 `test-plan.md` 在用户明确接受前，BUILD readiness 保持阻塞。
