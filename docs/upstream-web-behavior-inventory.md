# Pi Web 与四个上游扩展的行为吸收清单

本清单是 `integrate-pi-web-ui-and-upstream-extensions` 的 BUILD-P01-R2 证据。`upstream/web-source-locks.json` 冻结机器可读身份；本文件决定后续适配前每项公共行为的去向。

状态：

- **保留**：保持公开能力和关键语义，由 AILI 单 Package 提供。
- **安全修改**：保留用户目标，但必须经过已接受的 AILI Runtime/API、安全、写者租约或隐私边界。
- **排除**：与已接受范围冲突，不进入生产界面或 API。

## 1. Pi Web 0.8.8

Pi Web 是唯一 Web code/function base。Codex UI、`minghinmatthewlam/pi-gui` 与 OpenCode 仅作视觉/交互参考，不贡献源码、协议、数据模型或运行时。

| 上游行为/入口 | 证据锚点 | 去向 | AILI 处理 |
|---|---|---|---|
| 前台 `pi-web` CLI、Node/Next 启动、ready 后开浏览器、信号退出 | `bin/pi-web.js`, `bin/pi-web-options.js` | 安全修改 | 保留前台生命周期；增加 packaged-build 检查、父 Pi `/web` 非 detached child、私密 bootstrap channel、false-ready/parent-death/port-collision 处理。 |
| session/project 分组、浏览、resume、rename、export、安全删除 | `components/SessionSidebar.tsx`, `app/api/sessions/**` | 保留 | 路由改接 AILI Browser BFF；Pi JSONL 仍是唯一 conversation truth。 |
| 不创建 AgentSession 的 JSONL 历史读取 | `lib/session-reader.ts`, session GET routes | 保留 | 作为浏览路径；读取投影不得创建 writer 或激活 lazy MCP。 |
| lazy 官方 Pi AgentSession、send/steer/follow-up/compact/model/thinking/branch/fork | `lib/rpc-manager.ts`, `hooks/useAgentSession.ts`, `app/api/agent/**` | 安全修改 | 只能由持有 first-writer lease 的 AILI Runtime Host 执行；所有 mutation 使用 epoch/generation/request ID 和 disposition journal。 |
| SSE、readiness、heartbeat、reconnect、browser reconciliation | `lib/agent-event-*.ts`, event routes | 安全修改 | 增加 schema version、epoch、sequence、cursor、bounded replay、gap reset、slow-client backpressure 与 stale response 拒绝。连接本身不得创建 AgentSession。 |
| Branch 与 Fork 的不同语义 | `components/BranchNavigator.tsx`, fork/session routes | 保留 | UI 必须继续区分当前 JSONL 内分支与独立 session file。 |
| model/provider/thinking/context/commands/skills/plugins 配置面 | `hooks/useAgentSession.ts`, `components/ModelsConfig.tsx`, `SkillsConfig.tsx`, `PluginsConfig.tsx` | 安全修改 | 只通过 AILI capability/permission/path gateway；不得绕过已有 provider/context/retry owner。 |
| file browser/upload、Git diff、Markdown/image/audio/PDF/DOCX preview | `components/FileExplorer.tsx`, `FileViewer.tsx`, file/git routes | 安全修改 | 同一 canonical allowed-root 规则适用于 loopback/non-loopback；每次 mutation 前 lexical + realpath 重验。 |
| media paste/drop/picker/preview | `hooks/useDragDrop.ts`, `lib/image-attachments.ts`, upload routes | 安全修改 | 限制 bytes/type/target/model capability，最终仅产生官方 Pi image content；不替换 Pi-native WSL clipboard owner。 |
| Worktree sidebar 切换与创建 | `components/SessionSidebar.tsx`, `lib/worktree.ts`, Worktree routes | 安全修改 | 与吸收的 `pi-worktree` 合并到单一 AILI service，必须通过 repo/session/Agent preflight 与 revalidation。 |
| dirty Worktree 后提供 `force` retry | `components/SessionSidebar.tsx:791-805,1350-1357`, DELETE Worktree route | 排除 | 生产 UI/API 不提供 force removal；不删除 branch；dirty/unknown/current/main/active-session/active-Agent 目标均 fail closed。 |
| loopback 默认 + non-loopback 仅警告/Basic Auth | CLI/proxy/request-security | 安全修改 | non-loopback 在 listen 前必须同时具备 password、exact Host/Origin 与 canonical allowed roots；缺一即零 listener。 |
| Provider credential/API-key Web 管理 | models/provider routes | 安全修改 | secrets 不得进入 argv、日志、Analytics、session、browser persistent storage 或默认包；现有 AILI permission owner 不被扩大。 |
| PWA、responsive、i18n、keyboard、extension widget/status UI | `public/`, `components/AppShell.tsx`, i18n hooks | 保留 | 与 AILI Timeline、runtime bar、独立侧栏和 reduced-motion contract 合并。 |
| Pi Web 自更新检查/独立发布身份 | `app/api/app-update`, `lib/app-update.ts` | 排除 | `aili-pi` 是唯一发布物；Web 不检查或更新 `@agegr/pi-web`。 |

## 2. pi-analytics 0.49.6

关键 TUI 入口固定为 `/analytics`。公共菜单包括 Overview、时间范围、Skills、Tools、Provider reliability、Response cycles、Data & privacy 与清理确认。

| 上游行为/入口 | 证据锚点 | 去向 | AILI 处理 |
|---|---|---|---|
| `/analytics` TUI/RPC dashboard | `src/analytics.ts`, `src/menu.ts` | 保留 | 作为 AILI TUI 入口，并复用同一 Runtime/API 查询语义提供 Web dashboard。 |
| settled response cycles、logical LLM calls、skill/tool/provider-error 统计 | `src/collector.ts`, `src/errors.ts`, `src/skills.ts` | 安全修改 | 仅 schema allow-list 元数据；禁止 prompt/reply/thinking/args/results/raw errors/secrets/cwd/path/title/label/raw session ID。 |
| Today/7d/30d/all streaming aggregates | `src/storage/queries.ts` | 保留 | 增加明确 time-range 查询与清理；bounded cardinality 和未知桶。 |
| 每 runtime writer JSONL、private generations、atomic Clear | `src/storage/files.ts`, `src/storage/format.ts` | 安全修改 | 保留 append/generation 思路；增加 multi-process serialization、atomic segment finalization、corruption quarantine、migration、store-size 和 coordinated cleanup。 |
| opaque writer/generation identity | `src/storage/files.ts` | 保留 | 新增随机 opaque per-session scope custom entry，仍不保存 Pi raw identity，且不得进入 model context。 |
| no server/no telemetry | README, `src/analytics.ts` | 保留 | Analytics 本身不联网；Web 只读同一本地 service。 |
| clear all only | `AnalyticsStore.clearAll()` | 安全修改 | 扩展为精确 time-range/all cleanup，需 idempotency disposition，部分物理清理失败必须可见。 |
| legacy SQLite 不迁移/不删除 | README | 保留 | 不自动改写用户旧库；migration/rollback 文档只说明人工处理。 |
| Prometheus/CSV/cloud/project attribution | README limitations | 排除 | 不在本 change 范围。 |

## 3. pi-stamp 0.49.3

关键 TUI 入口固定为 `/stamp`，并保留 transcript timestamp/timing/usage/tool outcome 的设置、状态和帮助语义。

| 上游行为/入口 | 证据锚点 | 去向 | AILI 处理 |
|---|---|---|---|
| `/stamp` 设置/状态/帮助 | `src/stamp.ts`, `src/menu.ts`, `src/settings.ts` | 保留 | TUI 与 Web 使用同一版本化投影；个人显示设置仍不成为模型上下文。 |
| user/assistant timestamp、date/locale/timezone/12h/24h | `src/format.ts`, `src/stamp.ts` | 保留 | 兼容读取旧 v1-v4 entries；展示变化不得重写无关 JSONL。 |
| response first-content/total timing | message/turn lifecycle handlers | 保留 | 明确为本地 Pi 观察，不冒充 provider latency。 |
| model/provider/stop/usage/estimated cost | `src/metadata.ts` | 安全修改 | 仅保存 Pi/provider 已报告字段；缺失保持缺失，estimated 明示，不推导虚假 total/cost。 |
| tool duration/outcome、最多 256 个 observation | tool lifecycle handlers | 保留 | 不保存 tool arguments/results/raw errors/IDs；并行按内部 call identity 配对。 |
| versioned custom entries outside LLM context | `STAMP_ENTRY_TYPE`, renderer/custom entry | 安全修改 | 所有 append 必须经过拥有者的 serialized Pi session mutation path；invalid/partial entry 可见忽略，迁移不重写无关 JSONL。 |
| response ID 与 bounded diagnostics expansion | metadata/stamp renderer | 安全修改 | 生产 Web/TUI 只渲染 schema-approved bounded diagnostics；不含 raw message/stack/signature/private payload。 |
| relative-time background refresh | README limitation | 排除 | 不引入 timer/watcher。 |

## 4. pi-btw 0.50.0

关键 TUI 入口固定为 `/btw` 和 `/btw <question>`，包括 Start/Resume/Settings、独立 model/thinking、steering queue、preview 与 bring-to-main。

| 上游行为/入口 | 证据锚点 | 去向 | AILI 处理 |
|---|---|---|---|
| `/btw` Start/Resume/Settings 与 direct fast path | `src/btw.ts`, `src/menu.ts` | 保留 | AILI TUI 和 Web 都可创建/恢复当前进程内 thread。 |
| 当前 session branch 作为 bounded context | `buildConversationContext`, `src/side-thread.ts` | 安全修改 | 通过 Runtime Gateway 生成只读 context snapshot；side-thread 不获得主 writer。 |
| 独立 model/thinking 与 thinking shortcut | `src/settings.ts`, `src/fullscreen-ui.ts` | 保留 | 不改变主 session model/thinking；复用 AILI model selection/auth gates。 |
| follow-up + FIFO steering queue + cancellation | `src/side-thread.ts`, fullscreen UI | 保留 | 每 thread 独立 queue；失败不丢后续 queue；process loss 后明确不可恢复。 |
| fullscreen TUI、scroll/copy、background main agent | `src/fullscreen-ui.ts`, `src/transcript-pager.ts` | 保留 | 重要 TUI 入口保留；Web 使用对应独立 thread panel，不要求像素一致。 |
| latest/suffix/range/all preview 与 bring-to-main | `src/bring-to-main.ts` | 安全修改 | Preview 零 mutation；最终插入必须通过主 session lease、permission 和 idempotency journal；不自动发送。 |
| in-memory resume within extension instance | `resumableThreads` in `src/btw.ts` | 保留 | 明确 ephemeral；new/resume/reload/process exit 后不虚假恢复。 |
| user-home `pi-btw.json` settings | `src/settings.ts` | 安全修改 | 后续实现只在精确用户操作权限下写；BUILD deterministic tests 使用 disposable paths。 |

## 5. pi-worktree 0.50.0

关键 TUI 入口固定为 `/worktree`，包括 Status、Add、Switch、Remove、Prune stale metadata、Configure root。

| 上游行为/入口 | 证据锚点 | 去向 | AILI 处理 |
|---|---|---|---|
| `/worktree` 六个菜单动作 | `src/command.ts`, `src/worktree.ts` | 保留 | TUI、Runtime/API、Web 三层使用一个 AILI-owned service。 |
| local status snapshot，main/current/detached/locked/prunable/dirty/upstream/last commit | `src/status.ts`, `src/git.ts` | 保留 | 只读状态不授权 mutation，不 fetch remote。 |
| Add new/existing branch、exact base OID/target preview | `src/command.ts`, `src/git.ts` | 安全修改 | canonical allowed root、argv-safe Git、repo serialization、target/ref/session/Agent immediate revalidation。 |
| switch Pi session into worktree | `src/session.ts` | 安全修改 | 通过官方 SessionManager/switchSession 和 accepted first-writer lease；保持 active branch truth。 |
| non-current linked Worktree safe remove | `src/command.ts`, `src/git.ts` | 安全修改 | 继续禁止 main/current/locked/stale/dirty/untracked/submodule/unknown/unreachable/active session/active Agent；不删 branch。 |
| ignored-only inventory confirmation | remove flow | 保留 | exact inventory 在确认后重验；无 force fallback。 |
| prune dry-run preview + exact revalidation | prune flow | 保留 | 保留默认 expiry；无 custom expiry、force、repair/move/lock/unlock。 |
| configure machine-local root | `src/settings.ts` | 安全修改 | malformed settings fail closed；真实 user-home write 仍需单独权限。 |
| force removal、branch deletion、shell/rm fallback | README safety + source negative | 排除 | TUI/API/Web 均不提供；Git 只接收 argv。 |

## 6. AIcss 与参考 UI

AIcss 完整目录没有可支持公开 MIT npm 源码再分发的证据，且付费条款禁止按原样再分发组件。因此本仓库复制 **零 AIcss 源码**，后续 BUILD 独立实现已冻结的十四类语义组件：Thinking State、Thinking and Reasoning、Orbs、Web Search、File Diff、Image Generation、Text Response、Streaming Text、Inline Citations、Code Block、To-do List、Data Table、Comparison Table、AI Agent Input。

这些实现可参考公开视觉效果，但不得复制 private/locked/free component source，也不得展示 hidden chain-of-thought、credentials、prompts 或 private tool payloads。

## 7. 后续 package gate

BUILD-P02 及后续适配只有在以下事实保持为真时可继续：

1. `upstream/web-source-locks.json` 的五个 exact identity 全部通过校验；
2. 生产 `package.json` 不把五个上游包加为 runtime dependency；
3. Pi Web 是唯一 Web code/function base；
4. 上述“安全修改”行为全部经过正式 spec 的 gateway/lease/security/privacy 边界；
5. 上述“排除”行为在 source、route、UI 和 package 负向检查中均不可达。
