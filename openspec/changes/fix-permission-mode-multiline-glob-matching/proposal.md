## Why

[已知|会话证据] 在会话 `019f8f59-b8bd-7f7d-b6cd-17ce358bac81` 中，显式 `/perm yolo` 已追加新的 `perm-mode=yolo` 记录，单行 Bash（包括 `cd /tmp` 和读取 `/proc`）可直接执行，但随后一个多行 heredoc Bash 再次触发 `Allow bash? (sandbox disabled; command will run unsandboxed)` 并在拒绝后返回 `bash blocked`。这证明问题不是项目外路径、旧提示或单纯模式未切换，而是命令内容相关。

[源码证据] `pi-permission-modes@2.2.0` 的共享 glob matcher 将 `*` 编译为 `.*`、将 `?` 编译为 `.`，再用未启用 dotAll 的 `RegExp` 匹配。JavaScript 的 `.` 默认不匹配 `\n`、`\r`、U+2028、U+2029，因此文档语义中的通用 `"*"` 对多行 target 失配。YOLO 的 unsandboxed fast path随后从 `allow` 意外回退到默认 `ask`，生成上述精确弹窗。共享 matcher 被所有 pattern-map permission surface 使用，因此缺陷不能只按 Bash 特例修补。

## What Changes

- 以精确的 `pi-permission-modes@2.2.0` / upstream revision `23d65d10a53b67043cae42322acf9044d6edb196` 为适配基线，维护一个可审计、可复现的 AILI 修订，而不是手工修改用户安装目录中的 `node_modules`。
- 修正共享 glob 语义：`*` 匹配包括所有 ECMAScript line terminator 在内的零个或多个字符，`?` 匹配包括 line terminator 在内的恰好一个字符；保留 literal escaping、home expansion、last-match-wins 和 deny > ask > allow 组合规则。
- 保证 YOLO 对单行、多行、heredoc、项目内及项目外 Bash 均遵循其显式 `bash:allow`，不产生 permission-modes 确认。
- 保证自定义 `sandbox.enabled:false + bash:ask/deny`、Default/Plan/Build、项目 tighten-only overlay、无匹配 fail-closed fallback 和 session approval 语义不被放宽。
- 对共享 matcher 的其他 pattern-map surface 增加换行输入覆盖，包括 path/file surfaces、bash token/joined target 及自定义 multiline query/policy target；不得把“只修复 Bash”当作完成。
- 更新 provenance、SBOM/notice、doctor/release evidence 和文档，使其明确声明“基于 2.2.0 的 AILI 适配”，不得继续声称运行的是未经修改的 vanilla upstream。
- 增加真实 Extension dispatcher 回归，证明 YOLO 多行 Bash不会调用确认 UI，并保留自定义 ask/deny 的正反例。

## Capabilities

### New Capabilities

- `permission-mode-pattern-semantics`: 定义基于 `pi-permission-modes@2.2.0` 的 AILI 适配中，多行安全 glob、各 permission surface 和 YOLO dispatcher 的一致行为。

### Modified Capabilities

<!-- 当前 `openspec/specs/` 没有已发布 capability；本变更不修改 subagent 或 UI change-local capability。 -->

## Impact

影响 permission-mode 适配源码/锁定证据、`src/runtime/native-integrations.ts`、permission unit/integration tests、provenance/SBOM/notices、doctor/release validator 与 README/troubleshooting。用户已授权仓库内 BUILD，但仍不修改 dependency/lockfile、不写 `node_modules` 或 `~/.pi/agent`，也不授权 commit、push、publish、release 或安装。若后续需要 dependency/lockfile 变更，仍须取得单独精确批准。
