# Requirements Interview: Shared and Pi Skill Distribution

> **Historical/superseded status (2026-08-01):** These dated decisions remain capability-source history, but `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This interview grants no current dispatch, advancement, acceptance, closure, publication, or release authority. Any acceptance or external-state statement below was not independently reverified during this reconciliation.

## Metadata

- Mode: focused material decisions
- Target: `openspec/changes/separate-shared-and-pi-skill-distribution/`
- Status: `HISTORICAL_SUPERSEDED`
- Date: 2026-07-30

## Decision 1 — Distribution ownership

### User decision

历史决策要求 `aili-workflows` 后续继续独立演进，通用 Skills 只从它安装；Pi 特化从 `aili-pi` 安装并由 `aili-pi` 控制。

### Accepted interpretation

`rose-aili` owns shared `.agents/skills`; `aili-pi` owns Pi Package resources and SHALL NOT replace shared Skill directories.

## Decision 2 — Pi-specific Skill placement

### User decision

历史决策要求 Pi 特化 Skills 不安装到 `.agents`，而进入 Pi 自己的资源面。

### Accepted interpretation

Package-owned Pi Skills use `aili-pi/pi-skills/<name>/SKILL.md` plus explicit `package.json#pi.skills`. They remain inside the Pi Package install managed under Pi's `.pi` package store; `aili-pi` does not copy them into project `.pi/skills` or user `~/.pi/agent/skills`.

## Decision 3 — Install/update trigger

### User decision

历史决策选择“两个显式独立命令”：共享 Skills 使用 `npx -y rose-aili@latest install` / `npx -y rose-aili@latest update`，Pi Package 使用自己的 Pi install/update。

### Rejected alternatives

- 不采用 `aili-pi` npm `postinstall` 自动执行 `rose-aili@latest`。
- 当时不采用 `aili-pi` bootstrap 的 `--with-workflows=latest` 组合触发。

## Decision 4 — Formal change ownership

### User decision

历史决策建立独立 OpenSpec change，精确 ID 为 `separate-shared-and-pi-skill-distribution`；不把 installer/package/provenance 重构塞入 `add-file-task-board` package 4.3。

## Decision 5 — Current dirty worktree

### User decision

当时的 DEFINE 仅允许写新 change 目录；禁止修改、暂存、清理、覆盖或重置其他已有 tracked/untracked changes。

## Decision 6 — Upstream formal compatibility prerequisite

### User decision

历史决策记录在说明 `rose-aili@0.4.0` 当时缺少 generic formal task-board contract 后选择“保留前置门禁（推荐）”。该外部版本事实未在本次 reconciliation 中重新验证。

### Accepted interpretation

`aili-pi` 不接受 temporary integrated formal incompatibility。必须先有一个 exact `rose-aili` successor 发布/提供并通过 generic formal-contract verification，之后才可移除现有 shared-skill install path。

## Readiness

当时的记录将 material product/architecture decisions 标为 closed for final test-plan review，并将 `rose-aili@latest` 缺少 generic formal-board contract 记为保留的 external dependency blocker。该外部状态未在本次 reconciliation 中重新验证，且此旧记录不再拥有 BUILD authority。

## Final Test-Plan Acceptance

历史决策记录称用户选择“接受，保持 BUILD 阻塞（推荐）”并接受 `test-plan.md`，但未提供 fresh BUILD intent，也未授权 upstream write、npm publish/install、真实 HOME、lockfile mutation、文件删除、Git 或 release 操作。该 acceptance 未在本次 reconciliation 中独立重新验证。
