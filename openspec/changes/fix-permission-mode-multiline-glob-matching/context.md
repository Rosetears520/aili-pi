# Change Context: Permission Mode Multiline Glob Matching

## Goal

[已知|用户] 在 `pi-permission-modes@2.2.0` 基础上定义并实施一个 AILI 可维护修订，修复共享 pattern matcher 对多行 target 的错误处理。用户于 2026-07-24 接受测试计划并授权仓库内 BUILD 与重复本地测试；dependency/lockfile、全局安装、Git 和发布仍未授权。

## Confirmed Evidence

- [会话证据] 当前会话 ID 为 `019f8f59-b8bd-7f7d-b6cd-17ce358bac81`。
- [会话证据] 2026-07-23T15:42:34.644Z 新增 `perm-mode=yolo` entry（ID `be354878`），因此后续测试不是仅依赖旧 footer 或环境变量。
- [会话证据] 显式重设后，单行 `printf`、`cd /tmp && printf ...`、读取 `/proc`、`stat`/`ps` 和 `pi list` 均直接返回。
- [会话证据] 随后包含 heredoc 的多行 Bash 触发精确提示 `Allow bash? (sandbox disabled; command will run unsandboxed)`，拒绝后 tool result 为 `bash blocked`。
- [最小复现] `/^.*$/.test("a") === true`，而 `/^.*$/.test("a\nb") === false`。
- [源码证据] `pi-permission-modes@2.2.0/src/resolve.ts:40-45` 将 `*`/`?` 生成为 `.*`/`.`，并使用无 `s` flag 的 `new RegExp(re)`。
- [源码证据] `src/resolve.ts:107` 在没有规则匹配时 fail-closed 回退为 `ask`。
- [源码证据] `src/index.ts:595-603` 的 unsandboxed fast path对完整 Bash 文本调用 `decide(...)`；prompt approval 按完整命令文本记忆。
- [源码证据] `src/bash-enforce.ts:69-73` 在 `sandboxEnabled=false` 且 action 为 `ask` 时生成用户看到的精确提示。
- [基线证据] AILI pin 为 `pi-permission-modes@2.2.0`，provenance revision 为 `23d65d10a53b67043cae42322acf9044d6edb196`，Pi 基线为 0.81.1。

## Confirmed Decisions

- 根因是共享 glob matcher 的 line-terminator 语义，不是项目外路径、YOLO 产品定义、provider、subagent 或 permission-mode 配置文件。
- 修复 SHALL 位于共享 pattern semantics；不得通过 YOLO 特判、把 fallback 改为 allow、删除自定义 ask/deny 或仅把 Bash 换行替换掉来绕过。
- `*` 和 `?` 都必须符合其已声明的任意字符语义，并覆盖 `\n`、`\r`、U+2028、U+2029。
- AILI SHALL 以精确 2.2.0 revision 为来源维护可审计适配；不得在运行时或安装后静默手改共享/全局 `node_modules`。
- 适配必须更新 provenance/localChanges 和验证证据；不能继续使用“无 upstream source copied / unmodified dependency”的旧声明。
- 本 change 与 `fix-subagent-inline-sdk-compatibility`、quota/theme UI、`/sandbox` 通知不可见问题相互独立。

## Boundaries

- 不改变四个 mode 的默认 policy、cycle order、label、shortcut、sandbox profile 或 network allowlist。
- 不改变 last-match-wins、most-restrictive composition、project tighten-only、protected-path backstop、headless fail-closed 或 session approval 的权限强度。
- 不把 YOLO 扩展成绕过 AILI subagent credential guard；该 guard 是独立边界。
- 当前 BUILD 不授权 dependency/lockfile、真实全局 Pi 安装、`node_modules` 写入、外部仓库写入、Git 或发布操作；实施必须保持这些路径无 task-owned mutation。
- 不声称 `/sandbox` 无可见通知已修复；那是单独 UI/notification 证据。

## Open Questions

- **Unverified:** upstream 在 2.2.0 之后是否已接受等价 dotAll 修复；该信息只影响未来去除本地适配的迁移，不阻塞当前 exact-baseline DEFINE。
- **Resolved in BUILD:** 当前采用 generated two-file adaptation（Package-owned `index.ts` + `resolve.ts`），其余 unchanged sibling modules继续来自 exact 2.2.0 dependency；未升级 dependency，也未复制无关 upstream docs/tests。
