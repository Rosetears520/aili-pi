# Web 插件面适配盘点（spec 草案）

- 日期：2026-08-15
- 变更：`integrate-pi-web-ui-and-upstream-extensions`（BUILD-P12-R3 之后）
- 状态：待用户评审——本文件只盘点与提议，不含实现授权
- 前提：Web UI 已整体采用上游 `pi-web@0.8.8` 原版应用（用户 2026-08-15 决策）

## 0. 结论摘要

上游 pi-web 的网页会话通过 `createAgentSessionServices({ cwd, agentDir })` 加载 agent 目录中登记的 Pi 包，**aili-pi 扩展在网页会话里已经激活**。命令层实测全通：网页会话的 `get_commands` 返回 131 条命令，其中 27 条扩展命令（含四个权限模式的 `/perm`、`/net`、`/sandbox`）全部在列，另有 94 条技能命令与 10 条 prompt 模板。

真正的缺口不在"能不能用"，而在三类：
1. **一键切换与常驻指示**（TUI 有 `alt+m` 快捷键 + 原生 footer 模式指示，web 只有斜杠菜单）；
2. **专属面板**（BTW / Analytics / Stamp / persistent-agent hub 只有命令入口，无 web 可视化面板——即任务清单里本来就 deferred 的 Web parity）；
3. **待实测项**（权限确认弹窗、交互式命令在浏览器里的实际体验——桥接机制存在，但没有浏览器实测证据）。

## 1. 实测证据（2026-08-15，本机真实环境）

| 探测 | 结果 |
|---|---|
| `POST /api/agent/new`（type=ensure_session，cwd=仓库内一次性目录） | 200；模型解析为用户真实默认 `zai-coding-cn/glm-5.3`、thinking=high；服务端日志 `[pi-web] session_start dispatched to extensions` |
| `POST /api/agent/{id}`（get_commands） | 200；131 条 = extension 27 + skill 94 + prompt 10 |
| 扩展命令清单（网页斜杠菜单可见） | `perm` `net` `sandbox`（四个模式）、`btw` `analytics` `stamp`、`aili-doctor` `aili-agent-model` `codex-fast`、`file-context` `file-context-browse` `file-context-files` `file-context-search`、`mcp` `mcp-auth`、`acp*` `codex-compact` `curator` `cache-optimizer` `quota` `search` `web` `websearch` `google-account` |
| 交互桥 | 上游 `createExtensionUiContext()`（rpc 模式）实现 `select` / `confirm` / `input` / `editor` / `notify` / `setStatus` / `setWidget`，全部转发浏览器渲染 |
| 模式状态指示 | `pi-permission-modes/src/status.ts` 调用 `ctx.ui.setStatus("perm", …)`；上游 `useAgentSession` 处理 `setStatus` 并由 `ExtensionStatusBar` 渲染 → 当前模式应显示在 web 状态栏（**浏览器实测待做**） |

## 2. 适配状态矩阵

图例：✅ 可用（有证据或机制直给）｜🟡 机制在、缺实测或体验降级｜❌ 缺失

### 2.1 四个权限模式（Default / Plan / Build / YOLO）——本次重点

| 表面 | TUI 行为 | Web 现状 | 等级 |
|---|---|---|---|
| `/perm` 模式切换命令 | 菜单选择 | ✅ 命令在斜杠菜单，select 桥接浏览器 | 可用 |
| 模式常驻指示 | 原生 footer（含沙箱降级警告） | 🟡 `setStatus("perm")` → ExtensionStatusBar，浏览器显示效果待实测 | P1 |
| `alt+m` 一键循环切换 | 快捷键 | ❌ 无对应快捷键/按钮，每次要走 `/perm` 菜单 | P1 |
| 权限确认弹窗（bash/edit/write ask） | TUI 内联提示 | 🟡 `askWithSession` 走扩展 UI 桥（confirm/select），未实测 | **P0** |
| 沙箱执行（bash sandbox） | OS sandbox 强制 | ✅ 服务端同一进程执行，与 TUI 同一强制层 | 可用 |
| `/net` 网络白名单 + `alt+n` | 命令+快捷键 | 🟡 命令可用；快捷键无 | P2 |
| `/sandbox` 沙箱状态/策略 | 命令 | 🟡 命令可用，输出呈现待实测 | P2 |
| `permission-mode.json` 自定义模式/覆盖 | 配置文件 | ✅ 同一 config-load 路径，web 会话同样生效 | 可用 |
| Plan 模式 `show_plan` 工具 | 工具 | ✅ 扩展工具经 `withExtensionTools` 保留 | 可用 |

### 2.2 其他 AILI 表面

| 表面 | TUI | Web 现状 | 等级 |
|---|---|---|---|
| `/btw` 侧线程 | 命令 + 编辑器带回主 | 🟡 命令+input/editor 桥在，端到端待实测 | P1 |
| `/analytics` | 命令（查询/清理/大小） | 🟡 同上 | P2 |
| `/stamp` | 命令 | 🟡 同上 | P2 |
| BTW/Analytics/Stamp **专属面板** | — | ❌ 上游 UI 无对应面板（任务 7.5/8.4/9.4 deferred Web parity） | P3（等用户 UI 方向） |
| persistent-agents：`/codex-fast`、`/aili-agent-model`、task/hub | 命令 + TUI hub 渲染 | 🟡 命令可用；hub 可视化无 web 面板 | P3 |
| `/aili-doctor` | 命令 | 🟡 命令可用，长输出呈现待实测 | P2 |
| file-context 四命令 | 命令 + TUI 编辑器集成 | 🟡 命令可用；编辑器集成行为待实测 | P1 |
| 技能（94 个，aili-workflows 快照） | skill 命令 | ✅ `skill:*` 在菜单 | 可用 |
| MCP（`/mcp` `/mcp-auth`） | 命令 | 🟡 命令可用 | P2 |
| 通知（notify） | TUI toast | ✅ 桥接渲染 | 可用 |
| rose-theme / 原生 footer / zentui / matrix | TUI 专属 | ❌ 不适用（web 用上游自带主题） | 不做 |
| `/web` 在**网页会话内**被调用 | — | 🟡 会嵌套拉起子服务器；建议在 rpc 模式禁用或提示 | P2 |

## 3. P0 验证清单（实现任何适配前先跑完）

1. 浏览器打开 web → 输入 `/perm` → 菜单出现；切到 Build / YOLO → 状态栏出现模式指示。
2. Default 模式下发一条触发 bash 的消息 → 浏览器出现权限确认弹窗，允许/拒绝均生效。
3. YOLO 模式下发同类消息 → 不弹窗直接执行。
4. `/btw` 完整流：选模型 → 提问 → 预览带回（web 的 editor 桥呈现）。
5. `/analytics`、`/stamp`、`/aili-doctor` 各跑一次看输出呈现。
6. `file-context-search` 搜索并选择文件，确认选择结果回传。

（本会话无浏览器后端，以上需用户或带浏览器环境执行；结果回填本表。）

## 4. 提议需求（评审通过后搬入 `specs/` 正式定稿）

**R1 权限模式 web 一等体验**：状态栏常驻当前模式（含沙箱降级警告色），点击弹出四模式切换；支持快捷键循环（如 `Ctrl+M` 对应 alt+m）。
- 验收：切换后指示即时更新；`permission-mode.json` 自定义模式同样出现。

**R2 权限确认弹窗验证与修复**：P0 清单跑通；若桥接有缺陷（如超时、焦点、并发排队），修复为与 TUI 等价的准入体验。
- 验收：Default/Plan 模式下 bash/edit/write 均先弹窗；YOLO 不弹；会话级授权（"本会话始终允许"）生效。

**R3 `/web` 嵌套防护**：rpc（网页）会话中调用 `/web` 时提示不可用，不拉起子进程。
- 验收：网页会话执行 `/web` 返回 notify 提示；TUI 中行为不变。

**R4（P3，等 UI 方向）BTW/Analytics/Stamp/persistent-agent web 面板**：基于上游 ExtensionWidgets/setWidget 机制做轻量面板，不自建大 UI。
- 验收：对应能力在 web 有非命令入口；与任务 7.5/8.4/9.4 的 deferred parity 对齐。

## 5. 边界

- 不改上游应用主体（`src/web/app|components|hooks|lib`）除非适配点明确需要；改动一律走"最小补丁 + 记录"。
- 四模式本体逻辑归 `pi-permission-modes`（AILI vendor 适配层），web 侧只做呈现与入口，不复制权限逻辑。
- 本文为盘点文档，不构成实现授权；实现按仓库惯例另行记录。
