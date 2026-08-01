# Change Context

## Identity

- Change: `integrate-upstream-formal-agent-protocols`
- Mode: BUILD (complete; SHIP and operation gates remain separate)
- Backend: OpenSpec
- Source brief: `aili-pi-pr1-post-upstream-implementation.md`
- Historical/capability-source changes: `add-file-task-board`; `separate-shared-and-pi-skill-distribution`

## Maintained Intent

在 canonical `aili-workflows` 发布 shared Agent-selection 与 formal task-board 协议后，让 `aili-pi` 固定 exact release，生成 Pi routing projection，实现 formal task-board/persistent Agent adapter，解除 shared Skill 分发耦合，并用统一、可复核的 gate 完成 PR #1 后续改造。

## Confirmed Decisions

1. `integrate-upstream-formal-agent-protocols` 是重叠范围唯一的后续 BUILD/release owner；两个旧 change 仅保留历史/capability-source 参考，不再独立推进重叠任务。
2. 原始实施说明移动到本 change 目录并保留为 source brief。
3. canonical shared protocol 由 `aili-workflows` 独占；`aili-pi` 只消费 exact release 并拥有 Pi adapter。
4. ordinary omitted-agent→`general` 保持；formal package 必须 exact Specialized owner。
5. `formalContext` v1 只包含 `changeId`；package identity 由 ROSE 在 dispatch 前验证。
6. repository-local shared Skill snapshot 只作 verification baseline，不作为 installed runtime resource。
7. doctor 只读、离线、fail-visible，不自动修复。
8. TUI/image-paste 与 emergency checkpoint proposals 不属于本 release gate。
9. test-plan acceptance、implementation authorization、lockfile/file deletion、Git、publish、release 与真实安装互不替代。

## Rejected or Deferred Options

- 不把本材料只并入 `add-file-task-board` 或只并入 `separate-shared-and-pi-skill-distribution`，因为其范围跨越共同 upstream prerequisite 与 consumer integration。
- 不让三个 change 同时作为 active BUILD boards，也不新增去重/状态仲裁层。
- 不用 moving `@latest` 作为 release compatibility proof。
- 不新增依赖模型主动发现的 Pi routing Skill。
- 不在当前 change 删除 ordinary `general.spawns` 或扩展 public `formalContext` package schema。
- 不把未提交工作树、opaque session ref 或同批文档互证当成公开完成证明。

## Resolved Inputs and Remaining Gates

- Exact upstream release input is `rose-aili@0.4.2` at Git/npm commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`, tarball SHA-256 `df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f`, Agent-selection reference SHA-256 `562951ec896b351983223a4a04833c260d9570307a1688dbaf7032055ee4161d`, formal-board reference SHA-256 `04343832b5cdfbde65f53f0a981a5f0e7c6e1b3507e65e5fdfbf2b3f696af58b`, and the matching 19-role inventory.
- Final `test-plan.md` was explicitly accepted on 2026-08-01 together with fresh BUILD intent.
- The approved Package 5.1 root-lock metadata mutation and exact distribution-file deletions are complete. Any further lockfile/deletion operation, external repository operation, real HOME operation, Git action or release action requires its own exact approval.

## Traceability Anchors

| Source brief section | Contract destination |
|---|---|
| Cross-change execution ownership | interview Round 1; design Decision 2; spec sole-owner requirement |
| 5 Public-document correction | proposal; design Decision 2; `Public artifacts SHALL use independently reviewable status evidence` |
| 6 Exact upstream protocol | design Decision 1; `BUILD SHALL consume one exact upstream protocol release` |
| 7 Routing projection | design Decision 3; `Pi routing projection SHALL be deterministic and generated` |
| 8 Runtime guidance | design Decisions 4-5; model-facing routing and persistent-continuation requirements |
| 9 Formal task-board adapter | design Decisions 6-7; formal-board identity, context and protection requirements |
| 10 Persistent continuation | design Decision 5; `Persistent continuation SHALL preserve package identity` |
| 11 Distribution decoupling | design Decision 8; shared-Skill installation ownership requirement |
| 12 Doctor compatibility | design Decision 9; `Doctor SHALL report compatibility without repair` |
| 13 Independent compression proposal | design Decision 10; independent-proposal requirement |
| 15-18 Tests and release gates | test-plan; completion/release-authority requirement |

## Lifecycle Status

Requirements-grilling is `READY`, final test-plan acceptance is closed, and packages 1.1 through 6.5 are complete. BUILD is complete; SHIP and all real release operations remain separate fresh-intent gates. Formal routing, continuation, canonical Board, owning-file protection, restart reconciliation, shared/Pi distribution separation, read-only doctor compatibility, cross-module tests and the offline disposable lifecycle have fresh focused evidence; real provider/process-loss, real HOME/WSL/public-registry composition remain explicit limitations.

The material owning-file conflict found during convergence was explicitly reaccepted on 2026-08-01: Runtime owns `formal-task-board.md` plus `progress.txt`; OpenSpec `tasks.md` remains the accepted task-definition artifact and is not auto-migrated.
