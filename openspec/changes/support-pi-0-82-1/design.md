## Context

当前仓库以官方 Pi `0.81.1` 为开发、bootstrap、runtime evidence 和 persistent-Agent host-seam基线。原 0.82.0 草案已被本次用户决定替换为精确 `0.82.1`，并必须移除所有已 supersede 的 `@agwab/pi-subagent` 设计/测试路径。

Pi `v0.82.1` 的官方 release identity为 `b4f293684bba718d59cc1157679bcf6157b3a7f5`。其 npm model catalog把 Codex OAuth GPT-5.6 Sol、Terra、Luna设为272K；用户已决定保留该上游值，不新增AILI model metadata覆盖。

## Goals / Non-Goals

**Goals**

- 精确 Pi `0.82.1` 成为revision-bound开发依赖与Linux bootstrap最低版本。
- wrapped local/sandboxed bash保留Pi完整session environment。
- current AILI-owned persistent `task`/`hub` parent/child host seams在0.82.1上通过deterministic验证。
- 保留Pi 0.82.1上游Provider/model metadata与用户 `models.json` override行为。

**Non-Goals**

- 不fork Pi、不改 `node_modules`、不生成或复制完整上游模型目录。
- 不自动写 `~/.pi/agent/models.json` 或 auth/session文件。
- 不恢复legacy `subagent` runtime，不升级其他community dependencies。
- 不新增或推广任何GPT-5.6 context-window覆盖，也不发起为该已取消需求服务的真实provider probe。

## Decisions

### D1. 0.82.1是tested floor

将 exact dev dependency/lock graph、bootstrap floor、doctor/release/provenance/SBOM/tests/docs统一到 `0.82.1`。保留 peer dependency `*`，由bootstrap和revision-bound evidence负责“已测试最低版本”语义。

### D2. wrapped bash完整转发ExtensionContext

local与sandboxed wrapper分别调用底层 `execute(id, params, signal, onUpdate, ctx)`。不增加AILI spawnHook、不主动读session file、不设置 `exposeSessionEnvironment:false`。Pi负责清理继承的五个陈旧 `PI_*` 值并派生当前值。

### D3. 保留Pi上游Provider/model metadata

不实现package-owned `openai-codex` Provider wrapper，不修改生成的 `node_modules` catalog，不自动patch用户 `models.json`，也不在persistent runtime维护第二份model-ID/context映射。parent和child继续从Pi registry取得上游272K metadata；用户自行配置的合法 `models.json` override仍由Pi处理。

### D4. 0.82.1 release-specific compatibility

除existing host seams外，验证startup context-file discovery、scoped model可见性、Extension load不因AILI package出现新错误；不重新实现Claude Opus 5、Radius、llama.cpp或catalog ETag逻辑。

### D5. evidence fail closed

依赖升级后，0.81.1 live evidence立即stale。deterministic tests、provenance和SBOM可更新；provider/TUI evidence在单独授权前保持Unverified。release validator不得把旧pass继承为0.82.1 pass。

## Risks / Trade-offs

- **dependency upgrade破坏private/prototype seams。** 使用actual 0.82.1 extension-load、permission、persistent-Agent和Zentui fixtures；TUI-specific claim保留manual gate。
- **脏工作树中existing evidence混杂。** BUILD只改tasks列出的owner/generated output，不清理或覆盖无关状态。

## Migration Plan

1. 严格验证并接受本次修订后的OpenSpec/test plan。
2. 取得 `@earendil-works/pi-coding-agent@0.82.1` 与 `package-lock.json` mutation的单独精确批准。
3. 更新dependency/lock、bootstrap和version-bound evidence；生成而非手改SBOM/NOTICE/compatibility outputs。
4. 实现bash context forwarding并覆盖0.82.1 parent/persistent-child host regressions。
5. 运行focused checks、typecheck/full tests、validators、strict OpenSpec、package dry-run和diff inspection。
6. 未授权时保持TUI/live release evidence为Unverified；授权后仅运行约定的bounded probes。
7. rollback必须同时恢复dependency/lock、bootstrap、evidence和generated outputs，不能只回退版本字符串。

## Open Questions

无阻塞性产品问题。真实TUI仍是 `Unverified` 运行证据，不替代最终test-plan接受或exact-operation批准。
