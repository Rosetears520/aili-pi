# Pi 消费 rose-aili 0.4.13：验证记录

## 范围与来源

本次只更新 aili-pi 固定共享资源、消费约束、doctor、TODO/Progress 自有提示及相应文档/测试。没有修改依赖或 package-lock，没有重装全局资源，没有修改上游脏工作区。

- 发布版本：rose-aili@0.4.13。
- Git tag、干净源码 HEAD、npm gitHead：2fb0f64f165bba9f3d70acb60c8923c1efec0d93。
- Registry tarball 下载 SHA-512 与 npm dist.integrity 一致；实际 SHA-256：50745b6984002f80d7189ec96d619f1ac9b61746af09ff9a2ff00454a7d32bba。
- 通过现有生成器同步：58 个共享 Skill、562 个文件、21 个角色（20 个专用角色与 general）、20 个专用路由。数量属于仓库完整快照，不是用户全局安装清单计数。
- 固定资源及自有版本约束使用同一个发布身份，不将全局安装版本当作包内资源版本。

## 已执行

1. `npm run sync:skills -- --source .tmp/rose-aili-0.4.13-source --revision 2fb0f64f165bba9f3d70acb60c8923c1efec0d93 --package-version 0.4.13 --npm-git-head 2fb0f64f165bba9f3d70acb60c8923c1efec0d93 --tarball-sha256 50745b6984002f80d7189ec96d619f1ac9b61746af09ff9a2ff00454a7d32bba --replace-existing`
2. `npm run sync:roles -- --source .tmp/rose-aili-0.4.13-source`、`npm run sync:agent-routing`、`npm run sync:adapters`、`npm run generate:provenance`。
3. `npm test -- tests/unit/workflow-bundle.test.ts tests/integration/workflow-bundle-consumers.test.ts tests/unit/doctor.test.ts tests/unit/runtime.test.ts tests/bootstrap/bootstrap.test.ts`：5 文件、59 项通过。
4. `npm run verify:skills`、`npm run verify:roles`、`npm run verify:agent-routing`、`npm run validate:compatibility`、`npm run validate:provenance`：通过。
5. `npm run typecheck`：通过。
6. `npm run validate:package`：8 项通过；`npm run validate:generated`：7 项通过。
7. `npm test -- tests/unit/roles.test.ts tests/unit/provenance.test.ts`：12 项通过。

上述工作区测试合计86项，未运行全套测试。

随后将仅含本任务的暂存候选通过 checkout-index 导出至忽略的仓库内测试目录（不是 worktree，不改原工作区），复用现有 node_modules，不安装依赖。在该候选中一起运行上述9个测试文件：85项通过；`npm run typecheck` 通过。少的一项是其他任务的新增 runtime 测试，未纳入本提交。暂存差异检查通过；因此最终源码验证不依赖未提交的其他任务修改。

## 兼容性与未验证边界

同步保持现有 fail-closed 证据策略：`manifests/adapter-evidence.json` 的历史记录未改，旧 revision 证据不能提升新版兼容性。生成后的 Skill 兼容性为18 optional、40 blocked（等待新 revision 绑定的 adapter 证据）。这不是同步失败，也不宣称新 Skill 的真实行为已验证；该清单不等同于角色工具可用性。

doctor 新测试验证的是安装指南识别、有效/无效来源和无写入检查；runtime 测试验证实际注册/注入的内容与参数，不是模型真实执行 TODO 的成功率证明。

真实模型 B01–B11、重启后的实际会话加载以及新版 adapter 行为证据没有在本次执行。不得声称这些已通过。

## 提交边界

用户授权当前 main 实施及任务隔离提交/push。其他任务的既有改动保持工作区原状；重叠的 docs/persistent-agents.md、src/runtime/rose-context.ts、tests/unit/runtime.test.ts 仅暂存本任务区块。不进行 npm 发布。
