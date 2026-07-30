## Context

[已知|用户] `rose-aili` 与 `@rosetears/aili-pi` 将成为两个显式独立安装面：前者管理共享 Skills，后者管理 Pi runtime/resource specialization（来源：`interview.md` Decisions 1-3）。

[工具结果] 当前实现把两者耦合在 `@rosetears/aili-pi` npm `postinstall`：Pi-managed install/update 会使用 embedded snapshot 替换已有 `~/.agents/skills/<name>`。同时，完整 snapshot 被纳入 npm tarball，但没有注册到 `package.json#pi.skills`。

## Goals / Non-Goals

**Goals:**

- [框架内] 建立共享 `.agents` Skills 的单一 installer/owner：`rose-aili`。
- [框架内] 让 `aili-pi` 安装、更新和卸载不写 `~/.agents/skills`，且不隐式运行 npm/npx 安装另一个产品。
- [框架内] 保留 repository-local exact snapshot 作为 build-time compatibility/provenance baseline，同时从 npm runtime distribution 中移除该 snapshot。
- [框架内] 为未来 Pi 专用 Skills 建立 package-local `pi-skills/**` + explicit `pi.skills` owner 约定。
- [框架内] 对 shared workflow 缺失或 protocol drift 提供只读、非伪成功的 doctor visibility。

**Non-Goals:**

- [框架内] 本 change 不修改或发布 `aili-workflows`，不创建新的通用 Skill，不把 Pi adapter 细节写入 shared Skills。
- [框架内] 本 change 不创建占位 Pi Skill，不改变 Pi `0.82.1` resource discovery，不 fork/包装 Pi package manager。
- [框架内] 本 change 不自动安装/更新 `rose-aili`，不新增 dependency，不写真实 HOME，不执行 Git/publish/release。
- [框架内] 本 change 不移除 repository-local snapshot/lock/compatibility evidence，除非后续独立 accepted delta 明确替代这些 build-time owners。

## Decisions

### 1. Shared and Pi resources have separate lifecycle owners

[框架内] `rose-aili` SHALL be the sole writer for shared `~/.agents/skills`. `aili-pi` SHALL own only resources loaded through its Pi Package, explicit Pi global-resource command, or repository-local verification surfaces.

[推断] 该分离避免两个 updater 对同一 directory 交替替换，也使用户可独立选择 shared workflow cadence 与 Pi runtime cadence。

### 2. `aili-pi` never invokes `rose-aili` implicitly

[框架内] README/bootstrap completion output SHALL present the exact independent commands, but no `package.json` lifecycle, Extension hook, Pi command, bootstrap default, or update path may execute `npx`, `npm install`, `rose-aili install`, or `rose-aili update` on the user's behalf.

[框架内] `@latest` is an explicit moving-source choice made by the user at command invocation. `aili-pi` SHALL NOT translate it into a pinned dependency or claim that future versions are already verified.

### 3. Repository snapshot remains evidence-only and is excluded from npm runtime

[框架内] `skills/**` and `upstream/aili-workflows.lock.json` MAY continue to support source-tree hash, compatibility and provenance checks. `package.json#files` SHALL exclude `skills/`, and `package.json#pi.skills` SHALL NOT reference it.

[框架内] The global synchronization `postinstall` SHALL be removed. Its runtime script/type/test owner SHALL be removed under a separate exact deletion approval or made provably unreachable and excluded from the tarball; final acceptance requires zero executable installed path capable of shared-skill replacement.

[推断] 保留 source-tree snapshot 可让当前 compatibility evidence 继续绑定 exact revision；不随 tarball 发布可满足“installed shared Skills only come from rose-aili”而不在同一 change 重造全部 provenance machinery。

### 4. Pi-specific Skills are package-local and explicit

[框架内] A real Pi-specific Skill SHALL live at `pi-skills/<name>/SKILL.md`, be included by npm `files`, and be explicitly listed in `package.json#pi.skills`. The existing bundled `pi-web-access` Skill remains a separate dependency-owned Pi resource.

[框架内] No placeholder Skill or duplicate generic workflow is created. Project `.pi/skills` remains user/project-owned, and `~/.pi/agent/skills` remains user Pi-global space; package installation SHALL not copy owned resources into either directory.

### 5. Compatibility is observed, not silently repaired

[框架内] Doctor SHALL classify the installed shared workflow surface as `present-compatible`, `missing`, `incompatible`, or `unverified` using bounded read-only anchors/version evidence. It SHALL never install, overwrite, fetch, or activate a fallback snapshot.

[框架内] Missing/incompatible shared workflow SHALL not make core Pi Extension discovery falsely fail if the Extension itself is healthy, but integrated AILI workflow/formal-orchestration status SHALL remain non-pass with the exact remediation command.

### 6. Upstream formal semantics are a precondition

[工具结果|外部] observed npm `rose-aili@0.4.0` lacks the pinned snapshot's `formal-task-board.md` and formal override anchors.

[框架内] Before BUILD removes the current installed fallback, the selected upstream candidate SHALL expose the required generic formal task-board semantics and pass source-owner checks. If it does not, the package remains blocked; `aili-pi` SHALL NOT copy Pi `formalContext`, task/hub, sandbox, Journal, or Runtime details upstream as a workaround.

## Risks / Trade-offs

- [风险] [未验证] `@latest` can change after an `aili-pi` release. → [框架内] report observed compatibility; never infer it from dist-tag; keep exact release evidence separate.
- [风险] [推断] Removing embedded runtime fallback can reveal missing shared workflows on existing installations. → [框架内] document the explicit install command and report non-pass without automatic mutation.
- [风险] [推断] Retaining a repository-only snapshot still costs maintenance. → [框架内] keep it only as exact compatibility/provenance evidence; a future change may replace that mechanism after equivalent verification exists.
- [风险] [推断] A Pi-specific Skill name may collide with a shared Skill. → [框架内] require Pi-specific naming/ownership review and collision tests before adding any real `pi-skills` entry; no current placeholder is created.
- [风险] [推断] Removing `postinstall` changes `package-lock.json#packages[""].hasInstallScript`. → [框架内] gate the exact lockfile mutation separately and verify no dependency graph change.

## Migration Plan

1. [框架内] Accept the final `test-plan.md`; obtain separate exact approvals for lockfile mutation and file deletions before those operations.
2. [框架内] Publish or otherwise provide an exact `rose-aili` candidate containing the required generic formal workflow semantics under its owning repository/process; this change only verifies the candidate.
3. [框架内] Remove the `aili-pi` global skill `postinstall`, reconcile `hasInstallScript`, and retire its runtime sync owner without altering dependencies.
4. [框架内] Exclude generic `skills/` from npm files while retaining source-tree verification owners; preserve current Pi dependency Skill entries.
5. [框架内] Add docs/bootstrap guidance and read-only doctor classification; do not run real install/update in ordinary tests.
6. [框架内] Verify tarball inventory, disposable HOME zero-write behavior, Pi Package discovery, generated/provenance consistency and strict OpenSpec; do not publish or mutate real HOME.

[框架内] Rollback restores the prior package manifest/lock/scripts/docs/tests inside the task-scoped diff. It SHALL NOT delete shared Skills, run `rose-aili`, remove Pi, or mutate user settings.

## Open Questions

- [未验证] The first `rose-aili` release containing the generic formal-board contract has no accepted version/revision yet; BUILD package 1 remains blocked until exact evidence exists.
- [未验证] No concrete Pi-specific Skill is accepted in this change; only its future placement/registration contract is defined.
- [未验证] Real user HOME install/update composition remains outside deterministic verification until separately authorized.
