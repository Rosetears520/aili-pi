# 最终测试计划：add-webui-coding-workspace

## 0. 文档状态与门禁

- **阶段**：BUILD（准备中；受 task 0.1 排序门约束）。
- **计划状态**：用户已于 2026-08-19 明确接受本文件。
- **实现授权**：granted，范围为本 change 已接受的 tasks/specs；task 0.1 排序门（前一个变更收尾、工作区干净）与 Phase 5 依赖精确授权仍单独生效。
- **本次行为**：依据本 change 的 `proposal.md`、`design.md`、`tasks.md`、`context.md`、`interview.md`、六份 `specs/**/spec.md`、`AGENTS.md` 与 2026-08-19 的代码证据（edit 工具带 `details.patch`、write 无 details、无 apply_patch、双 diff 渲染器、SSE-only 传输）编写；截至编写时尚未运行本 change 的任何实现测试。
- **独立操作门禁**：Phase 5 的依赖添加（`node-pty`、`ws`、`@xterm/xterm` + fit addon 或批准的替代品）各自需要精确授权并绑定 task 5.1；Phases 1–4 不新增依赖。浏览器验证遵循既有落点：纯逻辑单测在 `tests/unit/`，Web 组件测试与组件同目录 `.test.mjs`，集成测试在 `tests/integration/`，持久 browser 报告/截图在 `artifacts/test-results/browser/`，临时输出在 ignored `.tmp/`。

## 1. 测试目标与证据等级

### 1.1 目标

1. **Interaction Shelf 呈现层**：questionnaire、权限模式批准（Allow once / Allow for session / Allow forever / Deny）、confirm、select、input、task/hub 澄清全部 dock 在 composer 上方的 shelf；`respondToExtensionUi`、超时、abort、generic/headless 回退行为不变。
2. **InteractionHost 映射**：每个 `ExtensionUiRequest` 方法恰有一个 presentation mode；`editor`/`custom` 是显式 modal 例外；未知方法安全回退；shelf 渲染失败回退 modal，不搁浅 runtime Promise；同屏至多一个主卡且队列可见。
3. **FileChangeEvent 只来自真实工具结果**：edit 取 `details.patch`；write 以输入行数为 additions 并在 git worktree 内 lazy `/api/git/diff` 兜底；通用 `details.patch`/`details.diff` 携带者（含 MCP 装饰名）同样成事件；bash 输出与 assistant 推理永不产生事件；失败/取消/无数据调用不产生卡片。
4. **Inline change card 契约**：默认折叠行包含操作 icon/类型、文件 icon、文件名（主权重）、父路径（次权重）、`+N −M`、chevron；展开体在固定 header 之下；行数/高度封顶 + "Show full diff" 跳转；工具 JSON 仅经显式披露可见；文件名点击打开 CodeView 标签页。
5. **共享 ChangeDiffView**：inline 变体仅 unified 且封顶；full 变体支持 unified/split 并保持 `localStorage("aili-diff-view")` 偏好与既有渲染上限；`MessageView`、`FileViewer` diff 模式、Changes 页、inline card 四个消费面全部迁移，重复实现删除。
6. **Workspace 渐进整合**：CodeView 控件集补齐（copy、go-to-line、当前路径）；树文件→源码标签、changed→diff 标签、inline 卡 "Show full diff"→`/changes`、卡文件名→CodeView 四条导航箭头成立且不丢聊天上下文；FileTree 显式刷新与 cwd 显示；一切文件访问仍走 `/api/files` + allowed-roots。
8. **Terminal**：标注 "Terminal · User controlled"；初始 cwd = 会话 cwd（allowed-roots 校验）；ANSI/Ctrl+C/resize 可用；断连/关页/停服后无孤儿 PTY；重连干净不重放；non-loopback fail-closed 同样关闭终端传输；与 agent 工具授权、权限模式、questionnaire 不变量零耦合。
9. **阶段独立性**：Phases 1–4 在 Phase 5（及其依赖批准）之前完整可交付。
10. **非目标负向断言**：无第二 filesystem/git/skill/permission/subagent/runtime；除批准的终端依赖集外无新增依赖；权限模式语义与「YOLO 不放宽用户问题」不变。

### 1.2 证据等级

| 级别 | 含义 | 可支持 | 不可替代 |
|---|---|---|---|
| **A — 自动化** | `tests/unit/` 纯逻辑、组件同目录 `.test.mjs`、typecheck、`build:web` | 确定性 contract：映射完备性、事件推导表、卡片解剖、封顶、导航接线、PATCH 载荷、i18n 键存在性 | 真实浏览器交互、真实 PTY 行为 |
| **B — operation-gated** | 批准后的真实浏览器验证与 `tests/integration/` 真实 PTY/server 生命周期 | 批准环境内的真实 UI/交互/终端生命周期/清理 | 证明所有主机/shell/网络组合 |
| **N — 不可由测试授予** | 用户 acceptance、依赖/Git/release 权限 | 只能记录决定与证据 | 不能被 PASS 或 checklist 替代 |

## 2. 计划中的测试与 artifact

| 领域 | 计划文件 / artifact |
|---|---|
| InteractionHost 映射 | `tests/unit/web-interaction-host.test.ts` |
| Shelf 宿主与迁移 | `src/web/components/ChatWindow.interaction-shelf.test.mjs`（含 questionnaire 回归） |
| FileChangeEvent 推导 | `tests/unit/web-file-change-events.test.ts` |
| Inline change card | `src/web/components/MessageView.file-change-card.test.mjs` |
| Diff 表征 + 共享渲染器 | `src/web/components/aili/ChangeDiffView.test.mjs`（先对现存两套渲染器写表征，再迁移） |
| CodeView 补齐与导航 | `src/web/components/FileViewer.codeview.test.mjs`、`FileExplorer.tree-header.test.mjs` |
| Terminal 生命周期/安全 | `tests/integration/web-terminal-lifecycle.test.ts`、`tests/integration/web-terminal-security.test.ts`、`src/web/components/TerminalPanel.test.mjs` |
| 全局回归 | `npm run typecheck`、`npm test`、`npm run build:web` |

## 3. 选定验证

| 条件 / Claim | 命令或直接检查 | 为什么足够 | 不支持的结论 |
|---|---|---|---|
| 映射完备 + 未知方法回退（目标 2） | `node --test tests/unit/web-interaction-host.test.ts` 内的枚举与 fallback 用例 | 方法集合是封闭枚举，纯函数可全覆盖 | 不证明浏览器渲染正确 |
| 权限询问/confirm 进 shelf 且响应通道不变（目标 1） | `ChatWindow.interaction-shelf.test.mjs` 断言 shelf 渲染与 `respondToExtensionUi` 调用路径；手动浏览器触发一次权限询问 | 组件测试锁呈现，手动锁端到端 | 不证明所有 extension 的自定义行为 |
| edit/write/通用/负面推导表（目标 3） | `node --test tests/unit/web-file-change-events.test.ts`：`details.patch`、输入行数、git 兜底降级、bash/推理负面、失败/取消 | 推导是纯函数，证据表可直接枚举 | 不证明 pi 未来工具变更后的覆盖 |
| 折叠行字段与封顶跳转（目标 4） | `MessageView.file-change-card.test.mjs` 断言行解剖、chevron 切换、封顶时 "Show full diff" 存在、披露默认隐藏 | DOM 契约可静态断言 | 不证明视觉效果（以 ASCII 契约 + 手工验收） |
| 单一渲染器 + 四消费面迁移（目标 5） | `ChangeDiffView.test.mjs` 表征用例 + 仓库内 `SplitPatchView`/`AiliFileDiff` 旧路径 grep 为零 | 表征先行防回归，grep 锁删除 | 不证明极端大 diff 的性能上限 |
| 导航箭头（目标 6） | `FileViewer.codeview.test.mjs` + `file-tab-state` 既有测试的 modeHint 断言 | openFileTab 是唯一入口，接线可枚举 | 不证明移动端布局体验 |
| PTY 清理与 fail-closed（目标 8） | `tests/integration/web-terminal-*.test.ts`：真实 spawn/断连/停服后进程清点；非回环无认证时升级被拒 | 生命周期与安全是服务器侧可观测行为 | 不证明所有 shell/平台组合 |
| 阶段独立 + 负向断言（目标 9、10） | Phase 5 未实施时 Phases 1–4 全套通过；依赖/第二 runtime 的 grep 负向检查 | 契约性检查可直接执行 | — |

## 4. Open Questions / Unverified

| 类型 | 内容 | 影响 | 处理方式 |
|---|---|---|---|
| 操作门禁 | 终端依赖集（node-pty/ws/@xterm）选型与安装 | Phase 5 无法开始 | task 5.1 逐项精确批准；批准时可替换包 |
| Unverified | `node-pty` 在 WSL2 的原生构建可用性 | Phase 5 安装步骤 | 批准后先做一次性 disposable 安装 probe（task 5.1）再动 lockfile |
| 非阻塞 | 用户原文引用的截图不在仓库内 | 仅视觉细节 | ASCII 示意图为 DEFINE 级视觉契约；设计/验收阶段可补充截图细化 |

## 5. 手工验收（用户浏览器清单）

1. **Phase 1**：触发一次权限询问、一次 confirm、一次 questionnaire —— 均出现在 composer 上方 shelf，transcript 保持可滚动/可复制，回答后 runtime 正常继续。
2. **Phase 2**：让 agent 真实修改一个文件 —— timeline 出现默认折叠的「✎ 已编辑 … +N −M」行，展开为 unified diff，长 diff 封顶并可跳全量；raw 工具 JSON 仅在显式点开后可见。
3. **Phase 3**：从树点击文件开 CodeView、点击 changed 文件开 diff、从 timeline 文件名跳 CodeView、从 "Show full diff" 进 Changes 页，往返不丢聊天上下文；copy 与 go-to-line 可用。
4. **Phase 5**：终端可交互（ANSI、Ctrl+C、resize），标注 User controlled，关闭页面后服务器无孤儿 PTY。

## 6. Final acceptance gate

- [ ] 用户明确接受最终测试计划（仅正式 lifecycle 需要；接受后 BUILD 仍受 task 0.1 排序与实现授权约束）
