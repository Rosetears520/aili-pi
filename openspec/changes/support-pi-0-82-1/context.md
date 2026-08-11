# Change Context: Pi 0.82.1 Runtime Compatibility

## Change Identity

- `change_id`: `support-pi-0-82-1`
- `previous_change_id`: `support-pi-0-82-0`
- `capability`: `pi-0-82-1-runtime-compatibility`
- `backend`: OpenSpec `spec-driven`
- `lifecycle_phase`: BUILD closeout
- `acceptance_state`: `BUILD_LOCALLY_COMPLETE_DETERMINISTIC_VERIFICATION_PASSED`

## Goal

[已知|用户] 将 `@rosetears/aili-pi` 的受验证官方 Pi host baseline 升级到精确 `0.82.1`。Codex OAuth GPT-5.6 Sol、Terra、Luna保留Pi 0.82.1上游 `272000` context window，不新增AILI metadata覆盖。

## Confirmed Evidence

- [本地源码] `package.json`固定 `@earendil-works/pi-coding-agent@0.81.1`；`scripts/bootstrap.sh`固定 `MINIMUM_PI_VERSION='0.81.1'`。
- [本地源码] `src/runtime/registry.ts`、`manifests/live-verification.json`、`manifests/adapter-evidence.json`、`manifests/subagent-provenance.json`、SBOM、README、AGENTS 和 host-seam tests含`0.81.1` revision identity。
- [本地源码] wrapped permission bash接收但未向 local/sandboxed `createBashTool().execute` 传递 `ExtensionContext`。
- [官方 Pi] `v0.82.1` tag/commit 为 `b4f293684bba718d59cc1157679bcf6157b3a7f5`；release page：<https://pi.dev/news/releases/0.82.1>；GitHub release：<https://github.com/earendil-works/pi/releases/tag/v0.82.1>。
- [官方 Pi] `@earendil-works/pi-coding-agent@0.82.1` npm shasum 为 `39c00809ff5531b6552b9ecb2c41f4c3529ec988`；`@earendil-works/pi-ai@0.82.1` npm shasum 为 `02ebdfc2997fd88ca1f51a7b5c01f337a9462f34`。
- [官方 Pi 0.82.1 npm artifact] `openai-codex/gpt-5.6-sol|terra|luna` 均为 `contextWindow:272000`、`maxTokens:128000`，且 cost tier 的 `inputTokensAbove` 为 `272000`。
- [官方 Pi docs] `models.json` 的 `modelOverrides` 是用户显式的部分模型 metadata 覆盖接口；本change不新增package-owned Provider override。
- [本地源码] 旧 0.82.0 tasks/test-plan 的 `@agwab` 路径已被 AILI-owned `task`/`hub`、child SessionManager、permission bridge、sidecar/delivery 和 model/tool policy supersede。

## Boundaries

- 不修改 Pi 本体、`node_modules`、用户 session、auth store 或 `~/.pi/agent/models.json`。
- 不改变 direct `openai/gpt-5.6-*`、Codex GPT-5.6/5.5/5.4/5.3、context window、cost tier threshold、max output、reasoning、tool或auth metadata。
- 不复制、包装或重注册Pi生成模型目录和Provider。
- 不降低 permission ask/deny、sandbox、protected-path、credential guard，且不宣称 OS isolation。
- dependency/lockfile、真实 provider、真实 HOME/TUI、Git、publish/release分别需要精确授权。

## Confirmed Decisions

- **D-001 — Full Pi bash parity:** local/sandboxed wrapped bash完整传递 `ExtensionContext` 和五个当前 `PI_*` 值；AILI不主动读取 Session JSONL。此决定沿用用户此前选择A。
- **D-002 — Exact host floor:** 使用 `0.82.1` 作为开发依赖和 Linux bootstrap 受验证最低版本；保留 wildcard peer dependency；不宣称任意 future Pi 均已验证。
- **D-003 — Persistent-Agent realignment:** 仅验证当前 AILI-owned `task`/`hub` runtime，不恢复或测试已删除的 `@agwab` adapter。
- **D-004 — Upstream model metadata retained:** 不实施372K覆盖；Codex OAuth GPT-5.6继续使用Pi 0.82.1的272K catalog metadata，除版本升级自然带来的上游差异外不改变Provider/model ownership。
- **D-005 — Cache boundary:** native compaction/branch summary的 `cacheRetention:"none"` 请求不进入 AILI Compact eligible warm-repeat分母。

## Remaining Unverified

- **UV-TUI-0821-1:** 真实 Linux terminal 中Zentui/editor fallback行为。

## Downstream Dependency

`add-reversible-context-compression` 已完成本地BUILD但仍含 Pi `0.81.1` host引用；在本change完成后，它应在自己的后续修订中更新host identity和cache相关fixture。本change不替代或授权该change的额外实现。

## Decision-Shaping Sources

- <https://pi.dev/news/releases/0.82.1>
- <https://github.com/earendil-works/pi/releases/tag/v0.82.1>
- <https://github.com/earendil-works/pi/tree/b4f293684bba718d59cc1157679bcf6157b3a7f5>
- <https://github.com/earendil-works/pi/blob/v0.82.1/packages/coding-agent/docs/models.md#per-model-overrides>
- <https://github.com/earendil-works/pi/blob/v0.82.1/packages/coding-agent/docs/custom-provider.md#override-existing-provider>
- <https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.82.1.tgz>
- <https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.82.1.tgz>
