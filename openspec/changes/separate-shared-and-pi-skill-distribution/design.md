## Context

> **Historical/superseded status (2026-08-01):** `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This design remains capability-source material only and must not independently dispatch, advance, accept, close, publish, or release overlapping packages. Readiness, completion, test-count, snapshot, runtime, acceptance, and external-state claims below are historical assertions not independently reverified during this reconciliation.

Historical decisions in `interview.md` Decisions 1-3 described `rose-aili` and `@rosetears/aili-pi` as two explicit installation surfaces: the former manages shared Skills, while the latter manages Pi runtime/resource specialization.

The 2026-07-30 repository record said the implementation coupled both surfaces through the `@rosetears/aili-pi` npm `postinstall`: Pi-managed install/update used the embedded snapshot to replace `~/.agents/skills/<name>`. It also recorded that the complete snapshot entered the npm tarball without registration in `package.json#pi.skills`. This was not independently reverified here.

## Goals / Non-Goals

**Goals:**

- 建立共享 `.agents` Skills 的单一 installer/owner：`rose-aili`。
- 让 `aili-pi` 安装、更新和卸载不写 `~/.agents/skills`，且不隐式运行 npm/npx 安装另一个产品。
- 保留 repository-local exact snapshot 作为 build-time compatibility/provenance baseline，同时从 npm runtime distribution 中移除该 snapshot。
- 为未来 Pi 专用 Skills 建立 package-local `pi-skills/**` + explicit `pi.skills` owner 约定。
- 对 shared workflow 缺失或 protocol drift 提供只读、非伪成功的 doctor visibility。

**Non-Goals:**

- 本 change 不修改或发布 `aili-workflows`，不创建新的通用 Skill，不把 Pi adapter 细节写入 shared Skills。
- 本 change 不创建占位 Pi Skill，不改变 Pi `0.82.1` resource discovery，不 fork/包装 Pi package manager。
- 本 change 不自动安装/更新 `rose-aili`，不新增 dependency，不写真实 HOME，不执行 Git/publish/release。
- 本 change 不移除 repository-local snapshot/lock/compatibility evidence，除非后续独立 accepted delta 明确替代这些 build-time owners。

## Decisions

### 1. Shared and Pi resources have separate lifecycle owners

`rose-aili` SHALL be the sole writer for shared `~/.agents/skills`. `aili-pi` SHALL own only resources loaded through its Pi Package, explicit Pi global-resource command, or repository-local verification surfaces.

Design rationale: 该分离避免两个 updater 对同一 directory 交替替换，也使用户可独立选择 shared workflow cadence 与 Pi runtime cadence。

### 2. `aili-pi` never invokes `rose-aili` implicitly

README/bootstrap completion output SHALL present the exact independent commands, but no `package.json` lifecycle, Extension hook, Pi command, bootstrap default, or update path may execute `npx`, `npm install`, `rose-aili install`, or `rose-aili update` on the user's behalf.

`@latest` is an explicit moving-source choice made by the user at command invocation. `aili-pi` SHALL NOT translate it into a pinned dependency or claim that future versions are already verified.

### 3. Repository snapshot remains evidence-only and is excluded from npm runtime

`skills/**` and `upstream/aili-workflows.lock.json` MAY continue to support source-tree hash, compatibility and provenance checks. `package.json#files` SHALL exclude `skills/`, and `package.json#pi.skills` SHALL NOT reference it.

The global synchronization `postinstall` SHALL be removed. Its runtime script/type/test owner SHALL be removed under a separate exact deletion approval or made provably unreachable and excluded from the tarball; final acceptance requires zero executable installed path capable of shared-skill replacement.

Design rationale: 保留 source-tree snapshot 可让 compatibility evidence 继续绑定 exact revision；不随 tarball 发布可满足“installed shared Skills only come from rose-aili”而不在同一 change 重造全部 provenance machinery。

### 4. Pi-specific Skills are package-local and explicit

A real Pi-specific Skill SHALL live at `pi-skills/<name>/SKILL.md`, be included by npm `files`, and be explicitly listed in `package.json#pi.skills`. The existing bundled `pi-web-access` Skill remains a separate dependency-owned Pi resource.

No placeholder Skill or duplicate generic workflow is created. Project `.pi/skills` remains user/project-owned, and `~/.pi/agent/skills` remains user Pi-global space; package installation SHALL not copy owned resources into either directory.

### 5. Compatibility is observed, not silently repaired

Doctor SHALL classify the installed shared workflow surface as `present-compatible`, `missing`, `incompatible`, or `unverified` using bounded read-only anchors/version evidence. It SHALL never install, overwrite, fetch, or activate a fallback snapshot.

Missing/incompatible shared workflow SHALL not make core Pi Extension discovery falsely fail if the Extension itself is healthy, but integrated AILI workflow/formal-orchestration status SHALL remain non-pass with the exact remediation command.

### 6. Upstream formal semantics are a precondition

The historical external record said npm `rose-aili@0.4.0` lacked the pinned snapshot's `formal-task-board.md` and formal override anchors. This was not independently reverified during this reconciliation.

Before any future implementation removes the installed fallback, the selected upstream candidate SHALL expose the required generic formal task-board semantics and pass source-owner checks. If it does not, the package remains blocked; `aili-pi` SHALL NOT copy Pi `formalContext`, task/hub, sandbox, Journal, or Runtime details upstream as a workaround. The umbrella change owns any such future BUILD decision.

## Risks / Trade-offs

- [风险] 尚未验证：`@latest` can change after an `aili-pi` release. → Report observed compatibility; never infer it from dist-tag; keep exact release evidence separate.
- [风险] Design concern: removing embedded runtime fallback can reveal missing shared workflows on existing installations. → Document the explicit install command and report non-pass without automatic mutation.
- [风险] Design concern: retaining a repository-only snapshot still costs maintenance. → Keep it only as exact compatibility/provenance evidence; a future change may replace that mechanism after equivalent verification exists.
- [风险] Design concern: a Pi-specific Skill name may collide with a shared Skill. → Require Pi-specific naming/ownership review and collision tests before adding any real `pi-skills` entry; no placeholder is created by this historical change.
- [风险] Design concern: removing `postinstall` changes `package-lock.json#packages[""].hasInstallScript`. → Gate the exact lockfile mutation separately and verify no dependency graph change.

## Migration Plan

1. Accept the final `test-plan.md`; obtain separate exact approvals for lockfile mutation and file deletions before those operations.
2. Publish or otherwise provide an exact `rose-aili` candidate containing the required generic formal workflow semantics under its owning repository/process; this change only verifies the candidate.
3. Remove the `aili-pi` global skill `postinstall`, reconcile `hasInstallScript`, and retire its runtime sync owner without altering dependencies.
4. Exclude generic `skills/` from npm files while retaining source-tree verification owners; preserve current Pi dependency Skill entries.
5. Add docs/bootstrap guidance and read-only doctor classification; do not run real install/update in ordinary tests.
6. Verify tarball inventory, disposable HOME zero-write behavior, Pi Package discovery, generated/provenance consistency and strict OpenSpec; do not publish or mutate real HOME.

Rollback restores the prior package manifest/lock/scripts/docs/tests inside the task-scoped diff. It SHALL NOT delete shared Skills, run `rose-aili`, remove Pi, or mutate user settings.

## Open Questions

- 尚未验证 the first `rose-aili` release containing the generic formal-board contract or an accepted version/revision. This old change cannot unblock or dispatch BUILD package 1; the umbrella change owns future resolution.
- No concrete Pi-specific Skill was accepted in this change; only its future placement/registration contract is retained.
- Real user HOME install/update composition remains unverified and outside deterministic verification until separately authorized by the current owner.
