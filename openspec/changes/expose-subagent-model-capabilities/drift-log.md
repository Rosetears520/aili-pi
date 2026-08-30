# Drift Log

## 2026-08-29 — billion-context dist 处置偏离 task 6.2 字面（source import + pack exclusion）

Task 6.2 原文要求"Rebuild/verify the adapted billion-context dist owner"。仓库与运行环境没有 tsup/esbuild 构建链（upstream 快照无自身 node_modules，根 package 也不含 tsup），且治理规则禁止为构建引入新依赖/lockfile 变更。实际实现：

- `src/runtime/context-runtime.ts` 改为直接导入 canonical retained source `upstream/billion-context-pi/src/index.js`（与全仓 TS-source 导入约定一致）；
- 上游 `applyUserConfig` 保持单调合并：factory 显式 `delegate:false` 后，global/project `acp.json` 不能重新开启 delegation；
- 陈旧的生成 `dist/` 保留为 tracked evidence（inventory 测试继续以它为只读证据），但从 npm 发布包排除（`!upstream/billion-context-pi/dist/`），避免发布未由生成器重建的陈旧生成物；
- `manifests/provenance.json` localChanges 与 notices 同步说明该处置。

行为等价性由 `tests/integration/context-runtime-load.test.ts`（真实加载 composition、断言 delegate 工具不存在）与 `tests/unit/context-upstream-inventory.test.ts` 覆盖；未执行任何真实 provider/vendor CLI。

## 2026-08-29 — 子代理中断后的收尾修正

`aili.implementer`（gpt-5.6-terra xhigh）在运行约 29 分钟后因 provider stopReason error 中断，未返回总结；其磁盘改动经 Parent 逐项核查后保留。Parent 修正两处测试问题：model-selection 新回归用例的 fixture 残留 `oneShot.thinking`（清理为 `oneShot: undefined`，实现本身符合规格）；external-cli 测试未隔离宿主 PATH（改为仅指向 fake 可执行目录，并补齐 7.6 矩阵：missing/non-exit/no-safe-mode/grok 身份/超界截断+凭据脱敏/挂起超时/pre-abort）。
