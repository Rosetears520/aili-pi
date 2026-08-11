## Context

本 change 以 `aili-pi-pr1-post-upstream-implementation.md` 为原始实施说明，并吸收现有 `add-file-task-board` 与 `separate-shared-and-pi-skill-distribution` 的重叠执行范围。两个旧 change 保留为历史/capability-source 参考；本 umbrella 是后续唯一 BUILD/release owner。原始说明中的 PR commit、package version 和 upstream revision 是历史基线，不代表当前脏工作树已经完成、验证或获准发布；BUILD 开始时必须重新确认目标 revision、diff 与 operation gates。

核心依赖是单向的：canonical `aili-workflows` 先拥有并发布通用协议，`aili-pi` 再固定 exact release 并实现 Pi-specific projection/adapter。`aili-pi` 不成为 shared Skill 的第二语义 owner，也不把 Pi Runtime、sandbox、Journal 或 `formalContext` 细节反向复制到通用协议。

## Goals / Non-Goals

**Goals**

- 建立 upstream release → exact pin → generated routing → Pi formal adapter → distribution decoupling → release evidence 的确定性顺序。
- 让 ordinary Pi、formal lifecycle、persistent continuation、human artifact 与 authorization boundary 在模型可见 surface 上一致。
- 对 formal board identity、状态、owning-file protection、reconciliation 和 no-false-done 提供 fail-closed adapter。
- 让 npm tarball、HOME mutation、doctor compatibility 与发布状态可以被离线、可复核地验证。

**Non-Goals**

- 不在本 change 中设计 canonical shared protocol；它由 `aili-workflows` 独占。
- 不新增 `general` 的 formal owner 身份，不删除 ordinary `general` compatibility，也不扩展 nested dispatch。
- 不新增 `packageId` 到 public `formalContext` v1，不从 task 自然语言模糊解析 package identity。
- 不实现 TUI/WSL image-paste proposal 或 emergency checkpoint proposal。
- 不声明 OS sandbox、任意进程 containment、真实 provider overflow 或未来 moving `@latest` compatibility。
- 不自动执行 install/update、网络请求、Git、publish 或 release。

## Decisions

### 1. Exact upstream release is the first BUILD gate

BUILD 必须获得并验证以下不可移动输入：`ROSE_AILI_VERSION`、40 字符 commit、npm `gitHead`、tarball SHA-256、`aili-agent-selection/v1`、`aili-task-board/v1`、两个 reference SHA-256 与 canonical role inventory。仅查询 dist-tag 或只比较 embedded snapshot 不足以解锁。

这些值写入 `upstream/aili-workflows.lock.json` 和 provenance/compatibility evidence。任何值缺失、冲突或无法由 exact tarball/revision 复核时，dependent packages 保持 blocked。

### 2. The umbrella is the sole BUILD and release owner

`add-file-task-board` 继续保存 formal board/orchestration 的历史 requirement 与 design 来源；`separate-shared-and-pi-skill-distribution` 继续保存安装/分发边界的历史 requirement 与 design 来源。它们不再作为 active BUILD boards，不独立 dispatch、advance、accept 或 close 与本 umbrella 重叠的 packages。

本 umbrella 引用而不篡改旧 capability semantics，并独占共同 prerequisite、consumer integration、status reconciliation、implementation queue 和 release gate。若旧 artifacts 与 umbrella 冲突，以经过本 change 接受的 requirement、task 和 fresh evidence 为后续执行依据；旧状态只作为待对账历史证据。

旧 artifacts 中的 `done`、测试计数或 runtime refs 必须与当前可访问 revision、公开 diff 和 fresh command evidence 对账。无法对账的状态降为 pending、blocked-upstream 或 not-independently-verifiable；不删除不确定性，只改用普通语言表达。

### 3. Routing projection is generated, while descriptions retain one authority

`scripts/sync-agent-routing.ts` 从 exact upstream matrix 与 canonical roles 生成 `manifests/agent-routing.generated.json`。manifest 记录 source repository、commit、protocol、source hash 和每个 specialist 的 selector/triggers/near misses/evidence/phase affinity/execution guidance。

生成器必须保证 canonical specialist role 一一映射、`general` 不进入 specialist matrix、未知 role/selector/协议/hash 失败、phase affinity 不授予权限。模型可见的一句话 description 继续从 validated RoleProfiles/`manifests/roles.json` 获取，generated routing 不创建第二份 description authority。

### 4. Runtime actively exposes ordinary/formal routing rules

每轮最小 `rose-context` 规则说明 ordinary benefit scan、formal ROSE ownership、exact Specialized package owner、persistent same-package continuation、human-facing ordinary prose 以及 acceptance/authorization separation。完整可读合同留在 `templates/APPEND_SYSTEM.md`，两者必须一致。

`task` active 时，metadata/prompt guidelines 提供紧凑 selector catalog；inactive 时不注入 orphan catalog。ordinary omitted agent 继续归一化为 `general`；formal request 必须显式 Specialized selector 和 `async`。`general.spawns` 保留 ordinary compatibility，但不是 formal evidence 或 formal package owner。

### 5. Persistent continuation is identity-preserving, not scope-expanding

只有 package ID、canonical role、scope、forbidden scope、write scope、acceptance boundary 和 expected evidence 全部不变时，才可在同一 persistent Agent 上澄清、补证或做同范围一次修复。新 requirement/package、scope/role/permission/claim 变化、released Agent 或 superseded work 必须创建新 job/Agent，并留下可审计字段。

### 6. Pi consumes `aili-task-board/v1` without redefining it

Pi adapter 解析 exact OpenSpec change root、board header/packages、七状态、role mapping、waiver/join/evidence/disposition、checkbox/done 与 append-only progress。路径 traversal、symlink、collision、ambiguous identity 或 legacy mismatch 在 allocation/mutation 前失败；legacy/unmanaged board 保持可读且不自动迁移。

`formalContext` v1 仅为 `{ changeId }`。调用前由 ROSE board orchestrator 验证 current package owner，并在 assignment 中明确 package ID。若以后需要 Runtime hard-bind package，应另开 change 评估 `{ changeId, packageId }`。

### 7. Formal children cannot mutate the owning board

从 validated `changeId` 派生 owning `formal-task-board.md`/`progress.txt`；OpenSpec `tasks.md` 继续只保存接受的任务定义，不作为 Runtime Board，也不自动迁移。protected paths 随 workspace lease/Agent lifecycle 持久。`write`/`edit` 在 mutation 前拒绝；formal child bash 只有在 exact deny 能被证明时保留，否则移除。YOLO 不绕过 deny，ordinary child 行为不受影响。

restart reconciliation 读取 exact board、bounded progress tail 和 Agent Journal/hub output/history：completed/partial 且结果可读映射到 `returned`；blocked/failed/interrupted/unexecuted/missing 映射到 `blocked`。恢复只追加 `RECONCILED`，不自动 replay、redispatch、fallback selector、accept、done 或推进 phase。

### 8. Shared Skills become verification-only in this repository

repository-local `skills/**` 可暂留为 exact generated verification baseline，但不进入 npm tarball、不由 `postinstall` 写 HOME、不允许语义手改，也不作为第二 shared owner。`package.json` 移除通用 Skills runtime publication 与 global sync lifecycle；lockfile 只允许与此相关的 root `hasInstallScript` 精确变化，dependency graph 不变。

README/bootstrap 分别说明 shared workflow 与 Pi Package 的显式安装/更新命令。便利命令可以使用用户选择的版本，但 doctor/release evidence 必须使用 exact version。任何真实 HOME 或外部安装仍需单独授权。

### 9. Doctor reports observed compatibility without repair

doctor 只读检查默认 shared reference paths，输出 `present-compatible | missing | incompatible | unverified`，并可附加 `source_match=exact | compatible-newer | modified | unknown`。兼容性以支持的协议版本、required roles 和结构解析为主，exact hash 只是附加 evidence，不能把兼容的新版本误判为 incompatible。

doctor 不安装、不更新、不从 embedded snapshot 恢复、不联网；required protocol 缺失时 integrated workflow 不得报告 PASS。

### 10. Release gate excludes independent proposals and keeps operation authority separate

formal-board/distribution release 只在公开文档、exact upstream pin、generated routing、formal adapter、distribution decoupling、doctor、tarball/HOME/runtime tests 全部有 fresh evidence 后关闭。TUI/image-paste 和 emergency checkpoint 保持独立，不互相阻塞或借用完成状态。

实现完成不授予 commit、push、publish、GitHub release 或真实 WSL install 权限。每项操作在执行前重新确认 exact target、risk 和批准。

## Risks / Trade-offs

- **历史状态与当前工作树混淆。** 通过 revision/diff/fresh evidence 对账，无法复核的完成状态 fail closed。
- **旧 board 被误当成并行执行入口。** BUILD preflight 明确只解析本 umbrella；旧 change 仅作 capability/history 参考，任何重叠 dispatch 或完成状态不计入当前 gate。
- **generated manifest 成为第二 role authority。** 只生成 routing fields，description 从 RoleProfile 读取并做 drift check。
- **formal protection 误伤 ordinary Agent。** 保护仅由 validated `formalContext` 激活，并以 ordinary regression 固定现有行为。
- **exact hash 阻止兼容升级。** release pin 使用 exact hash；doctor runtime compatibility 使用协议/结构并单独报告 source match。
- **移除 embedded fallback 暴露缺失安装。** doctor fail-visible 并给显式命令，但不静默修复用户环境。

## Migration Plan

1. 校正公开文档与状态来源，将旧两个 change 标识为重叠范围的历史/capability-source 参考，并确认本 change 的 final test plan。
2. 获取并验证 exact upstream release；更新 lock/provenance（涉及外部访问或 lockfile mutation时另行批准）。
3. 生成 routing projection，并接入 role/metadata/context surfaces。
4. 实现 formal board parser/root/update/protection/reconciliation 与 persistent continuation audit。
5. 移除 shared Skill runtime publication/HOME owner，更新 doctor/docs/bootstrap/package validation。
6. 运行 focused → integration → package/tarball/disposable HOME verification，记录未验证环境项。
7. 只有取得各自精确批准后才进行 commit、push、publish、release 或真实安装。

Rollback 恢复前一版 lock、generated manifest、Runtime adapter 与 package lifecycle；不删除用户 shared Skills、不自动运行 `rose-aili`、不重放 Agent job，也不改动独立 proposals。

## Resolved Inputs and Remaining Questions

- exact `rose-aili` identity 已解析并固定为 `rose-aili@0.4.2`、Git/npm commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`、tarball SHA-256 `df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f`，以及已记录的两份 protocol reference hashes；moving placeholder blocker 已关闭。
- 历史公开 PR 的 34-file OpenSpec-only boundary 已独立核对；当前大量未提交实现仅由 fresh local BUILD evidence 支撑，不继承公开 PR 的完成状态，也没有 candidate commit。
- 真实 provider、真实 HOME composition、publish/release 与 WSL install 仍在独立 operation gate 下。
