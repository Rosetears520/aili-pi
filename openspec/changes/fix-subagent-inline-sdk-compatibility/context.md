# Change Context: Subagent Inline SDK Compatibility

## Goal

[已知|用户] 为当前 subagent 启动失败建立并实施独立 OpenSpec 变更；本 change 只修复 subagent backend 兼容问题，permission-mode matcher 由独立 change 管理。用户于 2026-07-24 接受测试计划并授权仓库内 BUILD 与重复本地测试；dependency/lockfile、真实 provider probe、全局安装和 Git/release 操作仍未授权。

## Confirmed Decisions

- [会话证据] 会话 `019f8eff-9eb1-7c70-b18e-184006882500` 两次 parallel subagent 均实际启动两个 run，但四个 attempt 都在 16–29 ms 内失败，`backend:inline`、空 output、`contextLengthExceeded:false`，stderr 均为 `Cannot read properties of undefined (reading 'create')`。
- [源码证据] pinned `@agwab/pi-subagent@0.4.8` 的正常 omitted/`auto` run 解析为 inline；inline runner 调用 `piSdk.AuthStorage.create()` 与 `piSdk.ModelRegistry.create()`。
- [官方本机 SDK 证据] Pi 0.81.1 主入口不导出 `AuthStorage`，`ModelRegistry` 无 static `create`；官方 `docs/sdk.md` 与 examples 使用 `ModelRuntime.create()`。
- [测试证据] 当前 AILI generic/live tests 显式使用 `backend:"headless"`，所以现有 passed evidence 没有覆盖用户默认 omitted-backend 路径。
- [设计结论] 不 fork/copy upstream runner，不手改 `node_modules`；在 AILI wrapper 做 exact-version compatibility routing：普通 omitted/auto 改走 headless，显式 inline 给出确定诊断，其他 backend/lifecycle 保持 upstream。
- [设计结论] default-path live evidence 必须省略 backend，并记录实际 backend；显式 headless probe 不再单独代表 generic default readiness。
- [BUILD 证据] parallel auto 支持 task-level `visible`/`sandbox` override；若 visible task 与普通无 sandbox task混用，单一 top-level backend 无法同时保持 tmux 意图并避开 inline。适配对此组合 fail closed并要求拆分或显式选择兼容 backend。
- [BUILD 证据] 两个显式 `backend:headless, sandbox:true` 的只读审计 worker 均在模型前因 deny-all sandbox/凭据环境无法建立 provider auth而失败；这不再触发 inline `reading 'create'`，但证明 sandboxed model success需要独立 provider endpoint/auth条件，不能由 backend routing声称。

## Boundaries

- 不改变 public `subagent` 名称/schema、Agent 解析、并发、async/actions、worktree/sandbox、artifact/result envelope 或取消行为。
- 不削弱 credential guard、Agent/call tool ceiling、`PI_PERMISSION_MODE` 转发或 child non-recursion。
- 不修改 dependency/lockfile；若必须升级 dependency，停止并请求单独批准。
- 不授权真实 provider probe、外部写、commit、push、publish、release 或安装。
- 不把 YOLO 主会话确认问题归因或修复写入本 change，除非后续证据证明它由本 backend 适配直接造成并经 DEFINE 重新接受。

## Open Questions

- **Unverified:** upstream 未发布分支是否已有 Pi 0.81.1 inline 修复；只影响未来 dependency 选择，不阻塞当前无依赖 adapter。
- **Unverified:** 实现后的真实 omitted-backend provider run与显式-headless credential probe；须单独授权后才能把 schema-v2 live evidence从 non-pass更新为 passed。
- **Unverified:** model-backed `sandbox:true` 在当前 OAuth/provider环境中的可用配置；deny-all sandbox失败是可见且 fail-closed的，不作为默认无 sandbox backend修复的完成条件。
