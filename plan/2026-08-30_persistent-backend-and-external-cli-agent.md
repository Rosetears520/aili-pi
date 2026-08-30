# 实施方案：持久 Subagent 后端与外部 CLI Agent

## 状态与范围

**状态：待你评审；本文件不授权实现。**

目标有两项：

1. 让用户用一条命令把新建 subagent 的默认后端永久设为 `managed` 或 `herdr`。
2. 把 `cli: claude-code|gemini-cli|codex-cli|opencode|grok-cli` 做成真正的 **Herdr 外部 CLI Agent**：沿用普通 Pi subagent 的标签页/窗格分配、可追踪的正式启动/退出证据，以及一致的 Job/Turn/取消/结果语义。

不做：让模型自行选择后端或 CLI、自动安装/登录 vendor CLI、放宽凭据/私钥硬拒绝、静默将不支持 YOLO 的 CLI 伪装成 YOLO、修改既有 Agent 的冻结后端。

## 已确认的现状

- `/aili-agent-backend h|m` 只写当前 Parent 会话内存覆盖；后端的解析已支持 `session > trusted project > global > managed`，但没有命令写全局文件。见 `src/runtime/persistent-agents/production.ts` 的 `directBackend` 与 `backends/settings.ts`。
- 全局配置位置已存在：`~/.pi/agent/aili/agent-backend.json`；既有 `BackendConfigFile` 还允许保留 `herdr.maxLiveSurfaces`。
- 当前外部 CLI 路径是 Herdr 内 Pi child 再由模型以 Bash 间接调用 vendor CLI；它没有 vendor PID/退出码作为完成证据。见 `external-cli.ts`、`production.ts`、`backends/herdr/adapter.ts`。
- 普通 Herdr Agent 仅以 Child Bridge 的匹配 `turn.completed`/`turn.failed` 结算，不能用 Herdr idle 或终端文本判定完成；新 driver 必须保留这一原则。
- 本地 `main` 的已提交 3 个提交已推送至 `origin/main`（`0190dad..1ff57b2`）。工作树仍有大量未提交混合变更；任何实现前必须先明确其提交范围或改用隔离工作树。

## 决策

### D1 — 增加全局持久后端命令

新增：

```text
/aili-agent-backend global herdr
/aili-agent-backend global managed
/aili-agent-backend global clear
```

语义：

- `global <backend>` 原子更新 `~/.pi/agent/aili/agent-backend.json` 中的 `backend` 字段，保留合法的 `herdr` 配置。
- 同时更新当前 Parent 会话覆盖，使**后续新建** Agent 立即采用所选后端；已有 Agent 不迁移。
- `clear` 删除全局 `backend` 字段并清除当前会话覆盖，回到可信项目设置或 `managed` 默认。
- 可信项目的 `.pi/aili/agent-backend.json` 在未来会话仍可有意覆盖全局默认；这符合已存在的优先级，而不是新增“强制全局”层。
- 原 `/aili-agent-backend s|h|m` 保持 session-only 兼容行为。

### D2 — 外部 CLI 使用独立 driver，而非 Pi child + 模型 Bash

当当前用户消息已经精确授权 `cli` 产品且 `sub` 选择该 CLI 时：

1. 分配一个 `external-cli` driver 的 Herdr Run，并复用普通 Pi subagent 的 surface allocator：活跃 CLI Agent 有自己的 pane，但可与 Pi Agent 位于同一 AILI tab；仅在既有分配策略需要时才新开 tab。
2. 由 AILI 控制的无 shell runner 启动已验证的 vendor executable，记录 run identity、子进程/Herdr identity、开始时间、受限输出摘要与最终退出状态。
3. runner 只在外部 CLI 真实退出并写入匹配的桥接终态证据后，才允许该 Turn 结算。
4. 前台 `sub` 等待这个终态；`background:true` 保持现有 sub 语义——只在用户明确后台时立即返回 accepted，之后仍由 `hub` 读取同一 Job 的完成证据。
5. 取消、父级关闭、失联与重启 reconcile 使用普通 Herdr Run 的显式 `cancelled/lost/failed` 路径，不重放外部 CLI。

### D3 — YOLO 是“尽力且可验证”的 vendor-runner 策略

- 每个 CLI 仅在它自己的已验证 `--help` 输出明确列出非交互/YOLO/跳过确认选项时，才加入固定 argv。
- 不支持、版本不匹配或 help 探测失败时，runner 标记 `yolo-unavailable`，以普通受控模式运行或在任务要求必须 YOLO 时显式拒绝；绝不静默声称已启用。
- vendor runner 不通过 shell 拼接命令，不接受模型生成的 bypass/install/login 参数。
- AILI 仍保留用户对 `cli` 产品的当前消息授权、凭据/私钥硬拒绝、工作区边界、取消与可见审计；YOLO 仅影响已授权 external CLI 的自身确认策略。

## 实施包与顺序

### P0 — 契约与 Herdr 可行性验证（HITL）

**目的：** 在实现前确认 Herdr 可否承载并观测独立外部进程，而不假设其 API。

- 检查 Herdr 当前协议中为新 Agent 分配普通 AILI tab/pane、启动命令/runner、关联 metadata、等待进程退出、读取退出码、取消和重连的精确接口。
- 若 Herdr 没有可验证的进程退出接口，设计最小 AILI bridge runner：runner 在 Herdr tab 内启动 vendor CLI、监控 PID/退出码并向 Parent bridge 发固定 schema 的终态事件。
- 固化五个已支持 CLI 的 `--version`/`--help` 识别、YOLO 选项检测与不支持行为；不执行真实任务、安装或登录。

**验收：** 能给出一个 vendor-neutral 的 `ExternalCliLaunchPlan` 与 `ExternalCliTerminalEvidence` 契约；无 exit evidence 时不允许进入实现。

**证据：** fake Herdr 协议/runner fixture；必要时单独取得真实 Herdr/CLI 探测授权。

### P1 — 全局后端配置命令（AFK）

**文件：**
- `src/runtime/persistent-agents/backends/settings.ts`
- `src/runtime/persistent-agents/production.ts`
- `src/runtime/persistent-agents/runtime.ts`
- `tests/unit/persistent-agent-backends.test.ts`
- `docs/persistent-agents.md`

**工作：**
- 为现有严格 schema 增加锁定、0600、原子临时文件替换的全局配置写入器。
- 扩展 command parser 支持 `global herdr|managed|clear`，保留既有短命令。
- 写后重读/解析，并在当前会话设置或清除 session override。

**验收：** 新会话从全局文件解析；当前会话的后续新 Agent 立即切换；原 session-only 命令、项目优先级、已有 Agent 冻结与 `herdr` 其他设置不回归。

**验证：** 纯单元 fixture 覆盖正常写入、`clear`、非法值、锁冲突、损坏 JSON、原子替换失败、项目覆盖和状态显示。

### P2 — 外部 CLI driver 与严格启动契约（AFK，依赖 P0）

**文件（预计）：**
- `src/runtime/persistent-agents/external-cli.ts`
- `src/runtime/persistent-agents/types.ts`
- `src/runtime/persistent-agents/sub-coordinator.ts`
- `src/runtime/persistent-agents/production.ts`
- `src/runtime/persistent-agents/backends/herdr/adapter.ts`
- 相关 CLI/backend 单元测试

**工作：**
- 定义 `external-cli` driver、启动计划、YOLO 探测结果与桥接终态 schema。
- 用直接 argv、固定环境和受限输出启动外部 CLI；删除 external-CLI 路径对模型 Bash 的依赖。
- 保留当前产品名授权、可用性探测、凭据拦截与 fail-closed 行为。

**验收：** 每个已注册 CLI 只能从当前用户精确授权触发；final argv 由 registry/探测结果构造而非模型文本；不可用/不兼容/不支持 YOLO 有明确状态。

**验证：** fake executable 测试 argv、环境、YOLO present/absent、非零退出、取消、超时、凭据/安装/登录 flag 拒绝。

### P3 — 生命周期、普通标签页/窗格拓扑与恢复（AFK，依赖 P2）

**文件（预计）：**
- `src/runtime/persistent-agents/backends/herdr/adapter.ts`
- `src/runtime/persistent-agents/herdr-child/**` 或 P0 定义的独立 runner bridge
- `src/runtime/persistent-agents/sub-coordinator.ts`
- `tests/unit/herdr-backends.test.ts`
- `tests/unit/persistent-agent-sub.test.ts`
- `tests/integration/persistent-agent-production.test.ts`

**工作：**
- 外部 CLI 复用普通 Pi Agent 的 Herdr tab/pane 分配与回收策略；活跃 CLI Agent 不与其他活跃 Agent 共用 pane。
- 仅匹配 run/turn 的 runner terminal evidence 才结算；Herdr idle、tab 关闭或文字输出都不足够。
- 前台等待、显式后台 accepted、取消、父结束、桥接失联、重启 reattach/lost 均写入既有 Run/Job 状态。

**验收：** 主 Agent 不会在前台外部 CLI 的正式终态前继续；外部 CLI 按普通 Pi subagent 规则获得独立活跃 pane（可共享 AILI tab）；background 行为与普通 sub 一致；失败不自动 fallback 为 managed/Pi child，也不 auto-replay。

**验证：** fake Herdr/bridge 覆盖同一 AILI tab 内的 pane 分配/分割、退出前 idle、精确 exit、取消、断连、重启、background 与 foreground；必要时独立授权的真实 Herdr + 一个已登录 CLI 手工 smoke。

### P4 — 文档、回归与收尾（AFK + HITL）

**文件：**
- `docs/persistent-agents.md`
- `README.md`（仅当命令总览发生变化）
- 变更的 OpenSpec artifacts 与针对性测试

**工作：**
- 说明 global 命令、配置优先级、与普通 Pi subagent 相同的 tab/pane 分配、foreground/background 语义、YOLO 可用/不可用状态和现有 Agent 冻结规则。
- 修正外部 CLI / tab 行为的陈旧文档断言。

**验证：** P1/P2/P3 聚焦测试、`npm run typecheck`；真实 Herdr/vendor CLI smoke 只在你的精确运行授权后执行。

## 风险与边界

| 风险 | 处理 |
|---|---|
| Herdr 没有可信的外部进程 exit API | P0 先验证；不成立则使用受控 bridge runner，仍没有证据则不发布该 driver。 |
| CLI YOLO flags 随版本变化 | 按本机 `--help` 探测并记录能力；缺失即显式降级/拒绝。 |
| 外部 CLI 可绕过普通 Pi tool 边界 | 直接 argv、无 shell、最小环境、固定 cwd/工作区和硬拒绝项；不让模型自由拼命令。 |
| 主 Agent 误判完成 | 只承认带 run/turn identity 的外部 runner 终态；不采信 Herdr idle/文本。 |
| 当前工作树混有其他改动 | 在 code package 前明确 commit 范围或获准建立隔离 worktree。 |

## 评审后需要的门

1. 你接受本方案与 P0 的“先证明 Herdr 进程观测能力”前置条件。
2. 明确当前脏工作树：提交哪些路径，或单独授权创建隔离 worktree。
3. 接受最终的 OpenSpec spec/design/tasks/test-plan 后，才开始实现。
4. 真实 Herdr / 外部 CLI 探测、真实 YOLO 运行、Git commit/push 各自需要独立精确授权。
