## Why

[已知|用户] 将原 `support-pi-0-82-0` 变更直接修订为 `support-pi-0-82-1`：AILI 的受验证官方 Pi host baseline 升级到精确 `0.82.1`。

[已知|本地源码] 当前开发依赖、bootstrap、release/adapter/live evidence、SBOM、README 和 persistent-Agent host-seam tests 仍固定在 Pi `0.81.1`。此前 0.82.0 草案还残留已被 `task`/`hub` persistent-Agent runtime supersede 的 `@agwab/pi-subagent` 设计，不能直接 BUILD。

[已知|官方] Pi `v0.82.1` tag 为 `b4f293684bba718d59cc1157679bcf6157b3a7f5`。官方 release 增加/修复 Claude Opus 5、Anthropic gateway bearer auth、模型目录 ETag refresh、OAuth 错误原因、header-only auth compaction/branch summary、scoped model removal、context-file discovery 和 llama.cpp catalog persistence。官方 npm `@earendil-works/pi-ai@0.82.1` 生成目录仍把 `openai-codex/gpt-5.6-{sol,terra,luna}` 的 `contextWindow` 设为 `272000`。

[已知|用户决策] 不再实施 AILI 372K model metadata 覆盖；Codex OAuth GPT-5.6 Sol、Terra、Luna继续采用Pi 0.82.1上游 `272000` context window及原有metadata。

## What Changes

- **BREAKING — supported baseline:** 将 AILI Linux bootstrap 最低版本、开发依赖和 revision-bound evidence 从 `0.81.1` 提升到精确 `0.82.1`；更新 lockfile、SBOM/provenance、adapter/live evidence、doctor/release validator、测试 fixture、README 和 AGENTS。现有 host-managed wildcard peer dependency不收窄。
- 让 AILI 重注册的 local 与 sandboxed `bash` 完整转发 `ExtensionContext`，保留 Pi 默认的 `PI_SESSION_ID`、持久 session 的 `PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`，并让 Pi 清理继承的陈旧值。
- 保留 Pi 0.82.1 的上游模型目录和 provider ownership；不新增 AILI model metadata adapter，不修改 `node_modules`，也不自动写用户 `models.json`。
- 以实际 `0.82.1` 依赖重新验证唯一 AILI Extension entry、native integrations、wrapped bash、AILI-owned persistent `task`/`hub` parent/child model seam、sidecar/delivery、Zentui fallback、模型目录 refresh 和 bootstrap preflight。
- 保留 Pi native compaction/branch-summary `cacheRetention:"none"` 的既有 host contract；该类请求不进入 AILI Compact eligible warm-repeat cache gate 分母。

## Capabilities

### New Capabilities

- `pi-0-82-1-runtime-compatibility`: 精确 Pi `0.82.1` host identity、wrapped-bash session environment、persistent-Agent host seams、native integration preservation及验证契约。

### Modified Capabilities

<!-- 当前 openspec/specs/ 为空；本 change 不声明已发布 capability delta。 -->

## Impact

预计影响 `package.json`、`package-lock.json`、`scripts/bootstrap.sh`、`src/vendor/pi-permission-modes/index.ts`、`src/runtime/persistent-agents/` 的host seams、runtime doctor/release validators、version-bound manifests、README、AGENTS、provenance/SBOM，以及permission/bootstrap/runtime/extension-load/Zentui tests。

原 `support-pi-0-82-0` change identity 与 capability 目录改名为 0.82.1；direct-dependent OpenSpec 引用同步到新路径。旧 `@agwab/pi-subagent` adapter 已被 supersede，不进入本变更。

本 proposal 不授权 dependency/lockfile mutation、用户 `~/.pi/agent` 写入、Git commit/push、publish 或 release。最终 `test-plan.md` 仍需明确接受；dependency/lockfile 与 live/TUI 操作继续分别精确授权。
