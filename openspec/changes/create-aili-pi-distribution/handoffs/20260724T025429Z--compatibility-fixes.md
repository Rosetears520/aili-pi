---
schema_version: "1.0"
snapshot_id: "20260724T025429Z--compatibility-fixes"
task_root: "openspec/changes/create-aili-pi-distribution"
status: "finalized"
created_at: "2026-07-24T02:54:29.280933Z"
finalized_at: "2026-07-24T02:55:57.344919Z"
language: "zh-CN"
continues_from: null
continues_from_sha256: null
content_sha256: "94693fac6503014acec3af2f0967a0a871ba7ee79e7d604e06b50090b9f6ee45"
---
# Session Handoff: compatibility-fixes

Snapshot ID: `20260724T025429Z--compatibility-fixes`

## Goal

完成并区分两个独立兼容性修复：Pi 0.81.1 下 subagent omitted/`auto` 的 inline SDK 失败，以及 YOLO 多行权限 glob 误回退为询问；保持真实安装、provider 和发布边界可见。

## Contract References

- 项目规则：`AGENTS.md`。
- Subagent contract：`openspec/changes/fix-subagent-inline-sdk-compatibility/`；最终 `test-plan.md` 已接受。
- Permission contract：`openspec/changes/fix-permission-mode-multiline-glob-matching/`；最终 `test-plan.md` 已接受。
- BUILD ledger：`openspec/changes/create-aili-pi-distribution/progress.txt` 最后的 compatibility checkpoints。

## Scope Boundary

- 已授权并执行：仅 repository-local source、test、manifest、OpenSpec、文档及无网络本地验证。
- 未授权/未执行：dependency declaration或 `package-lock.json` 变更、installed/global Pi Package写入、真实 provider/credential live probes、外部仓库写入、commit、push、publish、release。
- sandbox status命令通知不可见、quota/theme UI 属独立残余问题。

## Completed/Pending/Blocked

- Completed locally：subagent planner将普通 omitted/`auto` 路由到 headless，显式 inline pre-start fail closed，并保留 compatible selectors/lifecycle；fake-Pi覆盖通过。
- Completed locally：exact `pi-permission-modes@2.2.0` generated adaptation使用 dotAll shared matcher；真实 adapted dispatcher执行四条 harmless multiline/heredoc/external-directory Bash，UI select次数为 0。
- Completed edge repair：generator/release validator通过 Node package resolution支持 scoped npm hoisting；release evidence绑定 exact upstream/adapted hashes、inventory和语义。
- Pending/Blocked：subagent omitted-default provider probe与 explicit-headless credential probe需要独立授权；四个依赖 skill因此保持 blocked。
- Pending/Blocked：当前 Pi进程仍加载旧 installed Package。2026-07-24 真实 heredoc仍弹出旧 `Allow bash?`；global/live修复不得声明完成。

## Evidence Anchors

- Subagent implementation/tests：`src/runtime/subagents.ts`、`tests/unit/subagents.test.ts`、`tests/integration/generic-subagent.test.ts`、`tests/integration/live-subagent.test.ts`。
- Permission implementation/tests：`src/vendor/pi-permission-modes/{index,resolve}.ts`、`src/runtime/package-resolution.ts`、`scripts/sync-permission-modes.ts`、`tests/unit/permission-patterns.test.ts`、`tests/integration/permission-modes.test.ts`。
- Provenance/gates：`upstream/pi-permission-modes.lock.json`、`manifests/{provenance,sbom,live-verification,adapter-evidence}.json`、`src/runtime/registry.ts`。
- Root-cause anchors：upstream inline调用 removed SDK factories；upstream matcher为 `new RegExp(re)`，adapted matcher为 `new RegExp(re, "s")`。

## Decisions

- 两个 OpenSpec保持独立，不把 subagent backend适配与 permission matcher修复混为一个行为改动。
- 不做 YOLO hardcode；修复共享 matcher，保留 custom ask/deny、last-match-wins、most-restrictive composition和 headless fail closed。
- 不复制或修改 installed `node_modules`；permission adaptation由 exact baseline生成、锁定并如实标为 `adapted`。
- 不伪造 live PASS：repository-local结果、当前 installed runtime和 provider readiness分别报告。

## Open Questions/Risks

- Unverified：真实 omitted-backend provider completion及 credential live probe。
- Unverified：将 repository fix安装到 Pi后的新进程是否完全消除真实多行弹窗；当前进程明确仍是 stale runtime。
- Unverified：两个 upstream项目后续未发布版本是否已有等价修复；任何升级仍需 dependency/lockfile批准。
- Risk：选择 “Allow for session” 仅记忆完整命令文本，不能代替 matcher修复。

## Verification State

- Fresh PASS：`npm test` 为 112 passed / 3 gated skipped；typecheck；focused permission 11/11；focused subagent 30 passed / 2 gated skipped。
- Fresh PASS：generated、compatibility、provenance、package、capability、permission hash/drift checks；两个独立 OpenSpec strict validation与完整 status；package dry-run六个必要适配 artifact；`git diff --check`；`package-lock.json` 无 diff。
- Expected NON_PASS：`npm run validate:release` 恰有 6 blockers（2 个 live-evidence + 4 个 dependent skills）。
- Unavailable：配置的 LSP diagnostics未提供可用 server；TypeScript由 `tsc --noEmit`覆盖。
- Live NON_PASS：当前已安装/已加载权限 runtime仍对真实 multiline heredoc弹窗；未做安装或新进程验证。

## Next Action

先重新验证当前 branch/worktree和两个 OpenSpec，然后向用户呈现一个精确、可回滚的 installed-Package update + 新 Pi进程 permission live-probe操作范围并取得单独批准；未获批准不得写 `~/.pi/agent` 或声称 live/global已修复。Subagent provider probes继续使用另一项独立批准。

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

以两个 OpenSpec的 `tasks.md`、上列 implementation/tests/manifests及 `git status --short` 为导航；`.pi/`、`graphify-out/` 和既有 `.tmp/` 内容不是修复产物，不得自动清理或提交。

## Subagent Activity

两个 read-only sandboxed headless审计 worker均在模型前因 deny-all sandbox/provider认证不可用而失败；未自动重试，未产生可用审计结论。

## Suggested Next-Session Prompt

从精确的不可变 handoff 快照 `openspec/changes/create-aili-pi-distribution/handoffs/20260724T025429Z--compatibility-fixes.md` 恢复。它只用于导航，不是合同、权限、Git 真相、验证或完成证据。先重新验证当前 repository root、worktree、branch/HEAD、dirty 状态、权限、合同、附件和引用证据，并简要重述当前 scope；遇到冲突或 Unverified 项立即停止受影响工作，然后只从快照的 Next Action 继续。
