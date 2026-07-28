# Session Handoff: AILI Compact P0 + v0.2.0 / v0.1.15 released

## 目标与当前结论

本文件同时交接以下两个顺序相关的 change：

- `openspec/changes/fix-aili-compact-recovery-deadlock/`，原目标 `v0.1.14`；npm 从未发布该版本
- `openspec/changes/redesign-aili-compact-lifecycle/`，目标 `v0.2.0`

截至 2026-07-28 release closeout，生产实现、自动化测试、复制 session 迁移、fake-provider、生产入口、性能门、Pi 0.82.1 post-BUILD contract audit、精确 ACP provenance 和 fail-closed candidate evidence 工具链均已完成。用户在已知当前源码混合 P0 与 redesign、没有 P0-only snapshot、live/provider 与历史 binary 证据仍缺失后，明确要求跳过未发布的 `0.1.14`，把当前合并实现作为 patch `0.1.15` 发布并安装到 WSL Pi；不得发布 `0.2.0`。该授权现已执行完毕：npm/GitHub `v0.1.15` 已公开发布，真实 WSL Pi 已从 `0.1.13` 升级到唯一的 `0.1.15`。任务统计仍为 P0 `54/61`、v0.2.0 `46/57`，本次例外不把最终 `v0.2.0` gate 或缺失证据改成 PASS。

## 2026-07-28 v0.1.15 发布 closeout

- npm `@rosetears/aili-pi@0.1.15` 已发布并成为 `latest`；shasum `009b776e032b98fd3cb40abd5543273bf33f2a5f`，`gitHead` `bf7b41eef62a614d3b5dad26a71f4cebb6988dc7`。
- annotated `v0.1.15`、`origin/main`、`origin/release/0.1.15` 已发布；tag peel 精确指向 release commit。GitHub Release 为公开、非 draft、非 prerelease，并带 13,812,792-byte tarball。
- clean-clone 全量复验：84 files PASS、2 live-gated skipped；547 tests PASS、2 skipped。interim validator、Linux E2E、publish dry-run、tarball sanitizer/review 和所有授权内验证均 PASS。
- 真实 WSL Pi 保持 `0.82.1`；settings 仅有 `npm:@rosetears/aili-pi@0.1.15`，安装 package 为 `0.1.15`，`pi list` 与无 provider 调用的 `pi --help` extension-load smoke 均 PASS。
- 真实 WSL Pi Package 的 production audit 为 0 vulnerabilities / 120 dependencies；安装文件抽样与 release candidate byte-identical。
- candidate 源码的 peer-inclusive audit 仍有 1 high，来自官方 Pi `0.82.1 -> minimatch@10.2.5 -> brace-expansion@5.0.7`；AILI tarball 不含这些文件，本次未授权 dependency upgrade。真实 WSL AILI 安装树审计为 0，二者不能混写。
- 完整证据与下一会话边界见 `ship-closeout-v0.1.15.md`。live/provider、人眼 TUI、post-BUILD 时间偏差与 historical `v0.1.14` binary row 继续保持 `Unverified`。

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
- 当前 candidate evidence 绑定真实 `0.1.15` 与 implementation `b64ad85090ce49c4fc2b4f35f5f8a22b4aa66856ad5359b064ba39dc8e8eda3c`。migration 的自动 rows、10K/100K performance、fake-provider 和 provenance 均通过；live artifact 缺失、separately-installed-v0.1.14 row 保持 `Unverified`，所以 sanitizer/index 正确为 `NON_PASS`。
- `npm run validate:interim-release` PASS；它要求 exact `0.1.15` package/lock/SBOM、明确用户授权、自动证据绑定、唯一 historical Unverified、缺失 live artifact，以及最终 `0.2.0` validator 仍准确报告 package/index/migration/performance/fakeProvider/live/provenance/sanitizer 八类 `NON_PASS`。
- fresh 结果：typecheck、package `6/6`、generated `6/6`、skills `64/471`、roles `20`、compatibility `45`、provenance、capabilities、bootstrap `15/15`、Linux clean-package E2E、五个 strict OpenSpec change 和顺序物化均 PASS。首轮全量并发的三个 5 秒超时项已分别 focused PASS；worktree sandbox 测试因 `.git` 是文件而失败，最终全量需在 clean clone 复验。
- WSL/Linux publish dry-run 与最终真实 tarball review PASS：`0.1.15`、6216 entries、13,812,792 bytes packed、60,130,877 bytes unpacked；项目自身无 `artifacts/`、`tests/`、`openspec/`、`.tmp/`、`.env*`、本机绝对路径或 credential/private-key 命中。tarball shasum 为 `009b776e032b98fd3cb40abd5543273bf33f2a5f`，SHA-256 为 `758c928f05739383e045f1c5c7991ff72f356988a6c420079c629779787bc5b3`。
- Git 事实：候选分支 `release/0.1.15` 基于 `origin/main@c56b279`；没有 `v0.1.14` tag/commit/tarball。当前原始脏分支未被清理、提交或覆盖。
- 当前用户指令明确授权 exact `0.1.15` package/lock/SBOM、任务范围 commit、快进 `origin/main`、annotated tag、公开 npm/GitHub release 和真实 WSL Pi Package 安装；仍不包含依赖升级、provider credentials/live matrix 或把人工验收伪报完成。

本节覆盖下面历史清单中关于“audit 尚未做”“ACP 仍是旧 pin”“candidate evidence 尚无生成器”的旧状态描述；旧文字保留用于说明原始顺序与停止条件。

## 历史剩余工作清单（状态以顶部 continuation 增量为准）

### 1. Pi 0.82.1 public contract drift audit（已补做，时间条件仍不可倒签）

P0 task 1.5 和 redesign task 1.4 要求在 BUILD 前确认 official Pi `0.82.1` 的 compact hook、context/custom-message、cache 和 settings public contract。这个时间条件已经无法倒签满足。

审计已写入 `openspec/changes/redesign-aili-compact-lifecycle/pi-0.82.1-contract-audit.md`，无 drift；除非真人明确接受时间性偏差或 DEFINE write-back，否则保持 P0 1.5 和 redesign 1.4 未勾选。

### 2. 候选版本顺序已被 `v0.1.15` interim release 例外覆盖

当前 `package.json`、`package-lock.json`、SBOM 和 registry 根身份均为 exact `0.1.15`。用户已明确决定跳过从未发布的 `v0.1.14`，且明确禁止这次发布 `v0.2.0`。

这项例外只改变本次发布身份与执行顺序：

1. 从 `origin/main@v0.1.13` 的独立 worktree 合入当前实现并物化 `v0.1.15`。
2. 完成自动验证、tarball review、clean-clone full suite、commit/push/tag/npm/GitHub release。
3. 把真实 WSL Pi Package 从 `0.1.13` 更新到 exact `0.1.15` 并验证实际加载身份。

这不把当前混合树冒充 P0-only `v0.1.14`，也不完成 `v0.2.0` acceptance。历史 binary row 和所有 live/human rows继续保持 `Unverified`。

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

`npm run validate:release` 当前按设计 fail closed。2026-07-28 `0.1.15` candidate 检查仍得到 8 项：package、index、migration、performance、fakeProvider、live、provenance、sanitizer；其中 package/artifact 类也反映最终 validator 的目标仍是 exact `0.2.0`。本次发布使用版本锁定且有明确授权记录的 `npm run validate:interim-release`，不改写最终 gate。

获得候选 mutation 和测试授权后：

- 生成 `artifacts/test-results/aili-compact-release-evidence.json`。
- 重新生成并绑定 candidate package version、implementation hash、artifact hash 的 migration/performance/fake-provider evidence。
- 运行 sanitizer，确保没有 credential、真实 HOME、raw provider payload 或不允许的 session 内容。
- live evidence 保持 `Unverified`，直到单独 live 授权和三 provider family matrix 真正通过。
- 在 Linux 官方 Pi 环境运行 `npm run validate:release`；任何 required row 缺失都保持 NON_PASS。

### 6. package dry-run 和 candidate review

`v0.1.15` 的 `npm publish --dry-run`、candidate contents review、candidate-bound interim validation 和 Linux clean-package E2E 均已完成；结果见顶部 continuation 增量。最终 `v0.2.0` task 5.10 仍不得据此勾选。

检查至少包括：包根版本、lock 根版本、SBOM/provenance identity、pack 文件清单、无 secret/raw session、无未授权依赖漂移，以及 `v0.1.14`/`v0.2.0` 对应的 docs/public claims。

## 仍需真人或 live 授权的工作

- P0 1.1、redesign 1.1：逐项 human acceptance。
- P0 10.1–10.2：LIVE-P0-1..7 和真实 context-length overflow/retry。
- redesign 5.7：OpenAI、Anthropic、Google Gemini 的 LIVE-V2 rows、真实 production `AgentSession` overflow retry、第三方 context handler 在 AILI 前/后的顺序矩阵。
- redesign 5.11：summary quality/limitations、recovery、migration/rollback、cache、performance 和 public claims 的 human review。
- P0 11.2、redesign 6.1–6.3/6.5：只能在全部前置门真实通过后勾选。

## 下一会话建议执行顺序

1. 不要重发 `v0.1.15`、移动其 tag 或重复真实 WSL 安装；先读取 `ship-closeout-v0.1.15.md` 并核对当前 Registry/Git 状态。
2. 如用户授权 live scope，再执行三 provider family、真实 overflow/retry 与第三方 handler 顺序矩阵；没有实际证据的 row 继续保持 `Unverified`。
3. 如要补 historical binary row，必须先解决从未发布且无可信 snapshot 的 `v0.1.14` 身份问题，不能拿当前合并树冒充历史 binary。
4. `v0.2.0` candidate/version/lock/tag/publish 仍需新的精确授权，并须通过默认 fail-closed final validator 与 human review。

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

- exact `0.1.15` 的任务范围 commit、push、tag、公开 npm/GitHub release 和真实 WSL Pi Package 安装已经完成；后续不得把该历史授权扩大到 dependency upgrade、provider credentials/live matrix 或 `0.2.0` 发布。
- 不触碰真实 HOME、真实 session 或 provider credentials，除非 live scope 和证据落点已单独批准。
- 不把 static/fake/copied-session evidence 当成 live evidence。
- 不把 post-BUILD audit 倒签成“BUILD 前已确认”。
- 不因聚合 task 看似接近完成而勾选 P0 11.2 或 redesign 6.1–6.3/6.5。
- 不重复执行已完成的 `v0.1.15` 发布或移动 tag；任何依赖升级、live provider 运行或 `v0.2.0` 发布都需新授权。

## 建议的下一会话提示词

```text
继续 AILI Compact 的发布后工作。先读取 openspec/changes/redesign-aili-compact-lifecycle/ship-closeout-v0.1.15.md、handoff.md、release.md、drift-log.md，并核对 AGENTS.md。

@rosetears/aili-pi@0.1.15 已公开发布并成为 npm latest，annotated v0.1.15 精确绑定 release commit，真实 WSL Pi 0.82.1 已安装唯一的 0.1.15，自动验证和安装 smoke 均通过。不要重发、移动 tag 或重复安装。只有用户新授权后才运行 live/provider matrix、依赖升级或物化 v0.2.0；人眼 TUI、post-BUILD 时间条件、真实 provider/overflow 和 separately-installed-v0.1.14 row 必须继续保持 Unverified。
```
