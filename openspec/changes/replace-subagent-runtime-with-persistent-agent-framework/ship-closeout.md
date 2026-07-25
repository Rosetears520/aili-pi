# SHIP Closeout Report

## 1. 元信息

- Trace ID: `SHIP-persistent-agents-0.1.10-20260725`
- Outcome: `pass`（release-ready，等待已授权的 commit/push/publish）
- Mode / backend: AILI SHIP / OpenSpec
- Closeout document path: `openspec/changes/replace-subagent-runtime-with-persistent-agent-framework/ship-closeout.md`
- Completed scope: 仅 Persistent Agent `task`/`hub` 公共迁移、positive child sandbox、release packaging 与 `0.1.10`
- BUILD gate status: `IMPLEMENTED_TARGETED_VERIFIED`
- Branch/worktree hygiene status: `release/persistent-agents-0.1.10` 基于 `origin/main@227d9dc`；所有可见 dirty path 均为本 change；原工作区保持未提交且未清理
- Approval/archive status: 用户已批准 release worktree、`0.1.10`、commit、push `origin/main` 与 npm publish；未批准 archive、tag、force-push 或 worktree removal

## 2. 变更摘要

- 使用 AILI-owned persistent `task`/`hub` 完整替换 `@agwab/pi-subagent` 和公共 `subagent`。
- 提供 20 个 canonical Agent selectors、official Pi child Session JSONL、durable coordinator、async delivery、hub follow-up、model/tool/permission/workspace policy。
- 接入 positive child sandbox：child Bash 复用 parent-initialized `pi-permission-modes` SandboxManager，并使用 child-cwd-specific filesystem profile；不可用时继续 fail closed。
- 明确未纳入：原工作区中的 AILI Compact 源码、测试、文档、OpenSpec、`.pi/`、`graphify-out/` 与其他 unrelated dirty state。
- 与原 spec 的最终偏差：无 public contract 降级；此前 unverified sandbox seam 已通过授权实现和 Bubblewrap live gate。

## 3. 已实现行为

- 公共 orchestration 工具只有 `task` 与 `hub`，不存在 `subagent`/`aili_task` alias。
- `task` 每项创建稳定 Agent ID；`hub send` 在同一 child JSONL 中继续后续 turn。
- top-level async、sync、batch、32-turn FIFO、park/revive、crash reconciliation、output/history refs 与 exactly-once completion delivery生效。
- `blocking` 保持 profile-only；公开调用使用 `async:false`，model-visible schema 已明确提示并严格拒绝未知字段。
- sandbox-required Bash 只在 parent SandboxManager ready 且 workspace metadata兼容时运行；否则拒绝，不允许 approval 降级为 unsandboxed。
- 回滚：安装上一 npm 版本可恢复旧 runtime；旧 `.pi/agent/runs/`、Pi sessions、用户配置和新 sidecars均不迁移、不重解释、不自动删除。

## 4. 对既有功能的影响

- 破坏性公共变化：旧 `subagent` tool 被移除，调用方必须迁移到 `task`/`hub`。
- 既有 Pi CLI、single Extension entry、permission modes、quota、web、preview、LSP、themes、skills 与 prompts 保持。
- AILI Compact不在此 worktree、Git提交或 npm tarball中，因此其 AGPL/MIT 未决状态不进入本 MIT release。
- 证据锚点：`src/runtime/persistent-agents/`、`manifests/live-verification.json`、`docs/persistent-agents.md`、当前 OpenSpec specs/tasks/test-plan。

## 5. 风险评估

### 5.1 回归风险

- 风险：持久 Agent 涉及 session、journal、async 和 delivery 多条路径。
- 缓解：完整 Vitest、focused live gates、typecheck、generated/package/doctor/release validators均 fresh PASS。

### 5.2 兼容性风险

- 风险：`subagent` 是明确 breaking removal；Pi `0.82` 尚未按新 host seams 重定义。
- 缓解：README/文档给出迁移合同；package绑定 Pi `0.81.1` 验证基线；`support-pi-0-82-0` 不进入本 release claim。

### 5.3 安全 / 权限风险

- 风险：Bash、credential、approval、sandbox 和外部 workspace。
- 缓解：credential hard denial先于 approval；parent acceptance不是 blanket allow；无UI/bridge loss fail closed；Bubblewrap live fixture验证范围内写、越界写拒绝、denyRead；Git-worktree `.git` file不兼容时拒绝 Bash。

### 5.4 工作流 / 数据丢失 / 运维风险

- 风险：crash、pending delivery、旧数据与 workspace cleanup。
- 缓解：running→interrupted、queued→unexecuted且不自动 replay；delivery ledger exactly-once；旧数据非破坏保留；isolated cleanup后history可读但禁止revive。

## 6. Release-blocker audit

- Target / scope: `@rosetears/aili-pi@0.1.10`，Persistent Agent-only MIT tarball
- Fresh evidence: `npm run validate:release` PASS；npm pack/publish dry-run PASS；installed-tarball validator PASS；Pi RPC从已安装tarball加载 `/aili-doctor`，`agent.framework=PASS`
- Blocking findings: 无
- Important findings: 无
- Accepted-risk findings: `npm audit --omit=dev`报告 Pi host/dev-peer tree中的 `brace-expansion` high 与 `protobufjs` moderate；两者位于 `node_modules/@earendil-works/pi-coding-agent`，不在本 tarball的 bundled或own files中，本 Package将Pi作为peer且固定host验证基线，未通过本 release偷偷升级host依赖
- Out-of-scope findings: AILI Compact许可证与实现、Pi 0.82 migration、当前原工作区 unrelated dirty state
- `Unverified` items: npm publish后的registry propagation只能在实际publish后确认

## 7. 分支 / 工作区清理门

- Branch/status inspected: `release/persistent-agents-0.1.10...origin/main`
- Dirty path classification: release worktree中全部为task-scoped；`.tmp/`和`node_modules/`为ignored task scratch/dependencies；原工作区dirty为unrelated-pre-existing并保持不动
- Safe task-owned scratch removed: external Git与sandbox live fixtures均自动删除；pack/install smoke位于ignored release `.tmp/`
- Cleanup proposed / approval required: 不自动删除release worktree或分支；archive/tag/branch deletion/worktree removal仍需单独批准

## 8. 验证证据

- `npm test`: 35 files passed、2 skipped；173 tests passed、3 skipped（live gates默认skip）
- live gates: 1 file、2 tests PASS（positive sandbox + external Git）
- typecheck、generated、20 roles、package、capabilities、compatibility、provenance/SBOM、doctor、redaction、strict OpenSpec、`git diff --check`: PASS
- `npm run validate:release`: PASS
- pack dry-run: `@rosetears/aili-pi@0.1.10`，6175 files，13,567,551 bytes；required persistent artifacts present；AILI Compact/legacy subagent/.pi paths为0
- `npm publish --dry-run --access public --ignore-scripts`: PASS
- installed tarball: release validator PASS；Pi RPC extension load PASS；`agent.framework=PASS`
- Rerun commands见 `test-plan.md` 与 `manifests/live-verification.json`

## 9. 剩余风险与未验证项

- `Unverified`: registry propagation和用户安装仅能在publish后确认。
- 当前原工作区继续包含未提交AILI Compact及其他工作；本release不会清理、stash或覆盖。
- 没有创建Git tag或GitHub Release，因为当前授权只覆盖commit、push main与npm publish。

## 10. 建议与下一步

- Recommendation: 按已授权顺序执行 task-scoped commit → push `origin/main` → npm publish `0.1.10` → registry/install smoke → 追加最终release evidence commit并push。
- Follow-up package: AILI Compact许可证路线和Pi 0.82 host-seam realignment分别处理。
- Memory writeback receipt: N/A。
- Next steps: 发布后保持release worktree，除非用户另行批准删除。
