# Requirements Interview: Shared and Pi Skill Distribution

## Metadata

- Mode: focused material decisions
- Target: `openspec/changes/separate-shared-and-pi-skill-distribution/`
- Status: `FINAL_TEST_PLAN_ACCEPTED_BUILD_BLOCKED`
- Date: 2026-07-30

## Decision 1 — Distribution ownership

### User decision

[已知|用户] `aili-workflows` 后续继续独立演进，通用 Skills 只从它安装；Pi 特化从 `aili-pi` 安装并由 `aili-pi` 控制。

### Accepted interpretation

[框架内] `rose-aili` owns shared `.agents/skills`; `aili-pi` owns Pi Package resources and SHALL NOT replace shared Skill directories.

## Decision 2 — Pi-specific Skill placement

### User decision

[已知|用户] 如果存在 Pi 特化 Skills，它们不应安装到 `.agents`，应进入 Pi 自己的资源面。

### Accepted interpretation

[框架内] Package-owned Pi Skills use `aili-pi/pi-skills/<name>/SKILL.md` plus explicit `package.json#pi.skills`. They remain inside the Pi Package install managed under Pi's `.pi` package store; `aili-pi` does not copy them into project `.pi/skills` or user `~/.pi/agent/skills`.

## Decision 3 — Install/update trigger

### User decision

[已知|用户] 选择“两个显式独立命令”：共享 Skills 使用 `npx -y rose-aili@latest install` / `npx -y rose-aili@latest update`，Pi Package 使用自己的 Pi install/update。

### Rejected alternatives

- [已知|用户] 不采用 `aili-pi` npm `postinstall` 自动执行 `rose-aili@latest`。
- [已知|用户] 当前不采用 `aili-pi` bootstrap 的 `--with-workflows=latest` 组合触发。

## Decision 4 — Formal change ownership

### User decision

[已知|用户] 新建独立 OpenSpec change，精确 ID 为 `separate-shared-and-pi-skill-distribution`；不把 installer/package/provenance 重构塞入 `add-file-task-board` package 4.3。

## Decision 5 — Current dirty worktree

### User decision

[已知|用户] 允许本次 DEFINE 仅写新 change 目录；禁止修改、暂存、清理、覆盖或重置其他已有 tracked/untracked changes。

## Decision 6 — Upstream formal compatibility prerequisite

### User decision

[已知|用户] 在解释当前 `rose-aili@0.4.0` 缺少 generic formal task-board contract 后，用户选择“保留前置门禁（推荐）”。

### Accepted interpretation

[框架内] `aili-pi` 不接受 temporary integrated formal incompatibility。必须先有一个 exact `rose-aili` successor 发布/提供并通过 generic formal-contract verification，之后才可移除现有 shared-skill install path。

## Readiness

[工具结果] material product/architecture decisions are closed for final test-plan review。`rose-aili@latest` 缺少 generic formal-board contract 是已知且用户确认保留的 external dependency blocker，不是未研究的问题；BUILD 必须按 test plan 的 precondition fail closed。

## Final Test-Plan Acceptance

[已知|用户] 用户明确选择“接受，保持 BUILD 阻塞（推荐）”，接受 `test-plan.md`，但不提供 fresh BUILD intent，也不授权 upstream write、npm publish/install、真实 HOME、lockfile mutation、文件删除、Git 或 release 操作。
