# Session Handoff: AILI Compact P0 + v0.2.0

## 目标与当前结论

本文件同时交接以下两个顺序相关的 change：

- `openspec/changes/fix-aili-compact-recovery-deadlock/`，目标 `v0.1.14`
- `openspec/changes/redesign-aili-compact-lifecycle/`，目标 `v0.2.0`

截至 2026-07-28 continuation，生产实现、自动化测试、复制 session 迁移、fake-provider、生产入口、性能门、Pi 0.82.1 post-BUILD contract audit、精确 ACP provenance 和 fail-closed candidate evidence 工具链均已完成；当前工作区包版本仍为 `0.1.13`。任务统计为 P0 `54/61`，v0.2.0 `46/57`。除真人验收和 live provider/Pi 测试外，真正的顺序阻塞是：当前没有可追溯的 P0-only source snapshot，因而不能诚实物化历史 `v0.1.14` candidate、完成 old-binary rollback rehearsal，再物化 `v0.2.0` candidate。

## 不要重做的工作

- P0 recovery/no-cancel/manual rescue/repair/age/config/doctor 已实现。
- PR2 safe planning、quality、provider suffix、cache identity 已实现。
- PR3 v3 schema、T1/T2/T3 lifecycle、decompress/recompress、dual readers 已实现。
- PR4 BranchIndex、alignment、cooling、10K-message/100K-reference 性能门已实现。
- PR5 非候选范围的 docs、migration、fake-provider 和 fail-closed release validator 已实现。
- 2026-07-27 fresh baseline：45 files / 351 focused tests PASS；84 files / 546 full tests PASS，2 个 live-gated tests skipped；typecheck、bootstrap、package、generated、baseline provenance、capabilities 和两个 change 的 strict OpenSpec validation 均 PASS。

权威进度和证据：

- `openspec/changes/fix-aili-compact-recovery-deadlock/progress.txt`
- `openspec/changes/redesign-aili-compact-lifecycle/progress.txt`
- `artifacts/test-results/aili-compact-build-verification.json`
- `artifacts/test-results/aili-compact-agent-session.json`
- `artifacts/test-results/aili-compact-migration.json`
- `artifacts/test-results/aili-compact-fake-provider.json`
- `artifacts/test-results/aili-compact-lifecycle-performance.json`
- `artifacts/test-results/aili-compact-branch-index-performance.json`

## 2026-07-28 continuation 增量

- 新增 `pi-0.82.1-contract-audit.md`，结论 `PASS_NO_PUBLIC_CONTRACT_DRIFT`、时间属性 `POST_BUILD_ONLY`。P0 1.5 和 redesign 1.4 继续未勾选，不能倒签为 BUILD 前完成。
- ACP provenance 已更新到精确 `v1.14.3@00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb`；保持 reference-only/no-copy，确定性 `THIRD_PARTY_NOTICES.md` 与 SBOM 已重建，`npm run validate:provenance` PASS。redesign 5.4 已勾选。
- `scripts/aili-compact-release-evidence.ts` 现在导出真实 candidate binding；migration、10K/100K performance、fake-provider artifact 均记录 package version、Pi version 和完整实现 SHA-256。
- 新增 `scripts/generate-aili-compact-release-evidence.ts` 及 `generate:compact-release-evidence` / `validate:compact-release-evidence`。它只生成 bounded provenance/sanitizer/index；缺失或 stale 输入会保持 `NON_PASS`，不会生成 provider/migration 假证据。
- 当前证据绑定真实 `0.1.13` 与 implementation `b64ad85090ce49c4fc2b4f35f5f8a22b4aa66856ad5359b064ba39dc8e8eda3c`。live artifact 缺失、migration 的 separately-installed-v0.1.14 row 仍为 `Unverified`，所以 sanitizer/index 正确为 `NON_PASS`。
- fresh 结果：release/provenance unit `7/7` PASS；migration/fake-provider/performance focused `7/7` PASS；全量 `84 files / 547 tests` PASS、2 个 live-gated tests skipped；typecheck、bootstrap `15/15`、package `6/6`、generated `6/6`、provenance、capabilities、evidence generation/verification PASS。Linux release validator 仍准确报 8 类阻塞。
- WSL/Linux `npm pack --dry-run --json` baseline PASS：`0.1.13`、6213 entries、无 `artifacts/`、`tests/`、`openspec/`、`.tmp/`、`.env*`；包含 Compact runtime、release validator/generator、provenance/SBOM/notices。它不是 candidate review。
- Git 事实：当前分支 HEAD 仍为旧 `v0.1.9`，`origin/main`/tag `v0.1.13` 为 `c56b279`；没有 `v0.1.14` tag/commit、stash 或 tarball，`.tmp` 只有真实 `0.1.13` package。当前源码同时含 P0 与 v0.2，禁止直接改名为 `0.1.14`。
- 当前用户指令已明确要求直接推进粘贴清单中除真人安装/验证外的工作。本轮据此执行了 repo-local provenance/notices/SBOM、evidence 与 dry-run；同一 scope 可用于真实 P0-only snapshot 存在后的 version/lock/candidate mutation，但不包含 dependency 变更、真实 HOME/provider credentials、commit、push、publish、tag 或 release。

本节覆盖下面历史清单中关于“audit 尚未做”“ACP 仍是旧 pin”“candidate evidence 尚无生成器”的旧状态描述；旧文字保留用于说明原始顺序与停止条件。

## 历史剩余工作清单（状态以顶部 continuation 增量为准）

### 1. Pi 0.82.1 public contract drift audit（已补做，时间条件仍不可倒签）

P0 task 1.5 和 redesign task 1.4 要求在 BUILD 前确认 official Pi `0.82.1` 的 compact hook、context/custom-message、cache 和 settings public contract。这个时间条件已经无法倒签满足。

审计已写入 `openspec/changes/redesign-aili-compact-lifecycle/pi-0.82.1-contract-audit.md`，无 drift；除非真人明确接受时间性偏差或 DEFINE write-back，否则保持 P0 1.5 和 redesign 1.4 未勾选。

### 2. 候选版本顺序已确定；source provenance 仍阻塞

当前 `package.json`、`package-lock.json`、SBOM 和 provenance 根身份均为 `0.1.13`。下一会话不得自行推断跳过 `v0.1.14` 或直接覆盖为 `v0.2.0`。

当前用户已确认直接推进非真人项；执行顺序保持：

1. 先物化 `v0.1.14` candidate，完成 P0 candidate/package gate，并保留可独立安装的包。
2. 用该历史 candidate 完成 redesign task 3.11 的 forward/rollback rehearsal。
3. 再物化 `v0.2.0` candidate，更新对应 package/lock/SBOM/provenance/notices 和 release evidence。

这不允许把当前混合树冒充 P0-only candidate。只有取得或严谨重建真实 P0-only source snapshot 后，才能执行已授权的 version/lock/SBOM/provenance/notices candidate mutation。

### 3. 完成 redesign task 3.11 的历史 binary 回滚证据

现有 copied-session matrix 已通过，但没有 separately installed historical `v0.1.14` binary，因此 `artifacts/test-results/aili-compact-migration.json` 对该行仍为 `Unverified`。

在 `v0.1.14` candidate 存在后：

- 在 disposable HOME 中独立安装该 candidate；不要使用真实 HOME。
- 生成/复制包含 v1/v2/repair 状态的 session，再由 `v0.2.0` candidate 前向迁移并写 v3。
- 回切 `v0.1.14` binary，证明已文档化的旧 binary rollback limitation，并验证 raw/source rescue 路径。
- 更新 migration artifact、hash 和 sanitizer 结果；证据必须绑定实际 candidate identity。

### 4. 更新精确 ACP provenance（已完成）

redesign task 5.4 要求的 reference-only identity 已精确更新为 `v1.14.3@00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb`，并已通过 deterministic provenance/SBOM/notices verification 与 no-copy source-symbol scan。

已更新并验证：

- `manifests/provenance.json`
- `manifests/sbom.json`
- `THIRD_PARTY_NOTICES.md`
- 任何由 `scripts/generate-provenance.ts` 管理的派生文件

保持 `reference-only`、`sourceFiles: []` 和 no-copy 边界；后续不要复制 ACP 源码或把行为参考写成依赖声明。

### 5. 生成 candidate-bound release evidence

`npm run validate:release` 当前按设计 fail closed。2026-07-28 WSL/Linux 检查得到 8 项失败：package、index、migration、performance、fakeProvider、live、provenance、sanitizer。artifact binding/generator 已完成；其余必须由真实 candidate evidence 闭合，不能把现有 `0.1.13` BUILD artifacts 改名冒充。

获得候选 mutation 和测试授权后：

- 生成 `artifacts/test-results/aili-compact-release-evidence.json`。
- 重新生成并绑定 candidate package version、implementation hash、artifact hash 的 migration/performance/fake-provider evidence。
- 运行 sanitizer，确保没有 credential、真实 HOME、raw provider payload 或不允许的 session 内容。
- live evidence 保持 `Unverified`，直到单独 live 授权和三 provider family matrix 真正通过。
- 在 Linux 官方 Pi 环境运行 `npm run validate:release`；任何 required row 缺失都保持 NON_PASS。

### 6. package dry-run 和 candidate review

redesign task 5.10 中自动化主体已经通过，但 `npm pack --dry-run`、candidate contents review 和 candidate-bound release validation 尚未完成。仅在 candidate/version 变更已获批准后执行；这不包含 publish、tag 或 release 权限。

检查至少包括：包根版本、lock 根版本、SBOM/provenance identity、pack 文件清单、无 secret/raw session、无未授权依赖漂移，以及 `v0.1.14`/`v0.2.0` 对应的 docs/public claims。

## 仍需真人或 live 授权的工作

- P0 1.1、redesign 1.1：逐项 human acceptance。
- P0 10.1–10.2：LIVE-P0-1..7 和真实 context-length overflow/retry。
- redesign 5.7：OpenAI、Anthropic、Google Gemini 的 LIVE-V2 rows、真实 production `AgentSession` overflow retry、第三方 context handler 在 AILI 前/后的顺序矩阵。
- redesign 5.11：summary quality/limitations、recovery、migration/rollback、cache、performance 和 public claims 的 human review。
- P0 11.2、redesign 6.1–6.3/6.5：只能在全部前置门真实通过后勾选。

## 下一会话建议执行顺序

1. 重读本文件、两个 `progress.txt`、两个 `tasks.md`、`release-gates.md`/`release.md` 和 `AGENTS.md`。
2. 复核已经完成的 Pi `0.82.1` post-BUILD audit；不要重做或倒签 task。
3. 先解决 P0-only source provenance：取得真实快照，或在独立临时树中从 `v0.1.13` 基线严谨重建并通过完整 P0 gate；不要从当前合并树直接改版本。
4. 物化并保留真实 `v0.1.14` candidate，完成 P0 candidate gate。
5. 用真实 `v0.1.14` candidate 完成 historical binary rollback rehearsal。
6. 再物化 `v0.2.0` candidate，更新 exact ACP provenance，重建 candidate-bound artifacts 和 sanitizer/index。
7. 在 Linux 上运行 package dry-run、candidate review 和 release validator。
8. 最后才申请并执行 live provider/Pi matrix 与 human review。

## 验证命令

应从 Linux/WSL 的真实 Linux Node/npm 环境运行；当前 WSL `PATH` 可能落到 Windows-mounted npm，从 UNC 目录直接调用会触发 Windows `cmd.exe` 的 UNC cwd 问题，先核对 `command -v node` 和 `command -v npm`。

```sh
npm test -- --maxWorkers=4 --testTimeout=15000
npm run typecheck
npm run test:bootstrap
npm run validate:package
npm run validate:generated
npm run validate:provenance
npm run generate:compact-release-evidence
npm run validate:compact-release-evidence
npm run validate:capabilities
openspec validate fix-aili-compact-recovery-deadlock --strict
openspec validate redesign-aili-compact-lifecycle --strict
npm run validate:release
```

`npm run validate:release` 只有在 Linux candidate、candidate-bound local evidence、live evidence 和 sanitizer 全部真实 PASS 后才应返回成功。

## 停止条件与禁止推断

- 当前用户指令已授权清单内 repo-local candidate/version/lock/SBOM/provenance/notices 与 dry-run 工作；本 handoff 不把权限扩大到 dependency、真实 HOME/provider、commit、push、publish、tag 或 release。
- 不触碰真实 HOME、真实 session 或 provider credentials，除非 live scope 和证据落点已单独批准。
- 不把 static/fake/copied-session evidence 当成 live evidence。
- 不把 post-BUILD audit 倒签成“BUILD 前已确认”。
- 不因聚合 task 看似接近完成而勾选 P0 11.2 或 redesign 6.1–6.3/6.5。
- 不执行 commit、push、publish、tag 或 release，除非每个操作分别取得精确批准。

## 建议的下一会话提示词

```text
继续完成 fix-aili-compact-recovery-deadlock 和 redesign-aili-compact-lifecycle。先读取 openspec/changes/redesign-aili-compact-lifecycle/handoff.md，并重新核对 AGENTS.md、两个 progress.txt/tasks.md 和当前工作区事实。

Pi 0.82.1 post-BUILD audit、精确 ACP provenance 和 candidate evidence 工具链已经完成，不要重做。先解决当前没有 P0-only source snapshot 的结构阻塞；禁止把合并后的 P0+v0.2 树直接改名为 v0.1.14。若能取得或严谨重建 P0-only snapshot，按既定顺序物化 v0.1.14、做 disposable-HOME historical rollback rehearsal，再物化 v0.2.0 并重建 evidence。不要触碰真实 HOME/provider，不要 commit/push/publish/tag/release。
```
