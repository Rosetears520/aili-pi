# Drift Log — add-herdr-execution-backend

Newest entries last. Actual spec drift, trade-offs, and unresolved assumptions discovered during implementation.

## 2026-08-26 — 拓扑再调整:tab 数 = 峰值并发,空闲子进程可回收(用户实测反馈,DEFINE 已回写)

用户实测:并行两个孩子完成后,串行第三个又开了新 tab——因为成功完成的子 pi 为保持 task_id 续聊而存活,pane 不空闲。用户期望"一个标签页里轮流跑不同会话"。调整(已回写 spec Surface topology):新 Agent 优先**回收**空闲的 AILI pane(关停其 idle 子进程;其 session 文件保留,后续 task_id 续聊经新 run + 回收/新建 pane 恢复同一 session);续聊遇 bridge 失联不再显式失败,改为弃表面 + 稳定 session 重建(对齐设计 §12.4)。由此 tab 数稳定在峰值并发(串行=1)。并发期间的实现竞态也一并修复:runId 分配与 run.created 合并为 journal 原子步(并行曾双双分配 run-1,失败 append 毒化整个 journal 写链);ensureWorkspace memoize;argv 身份直读 process.argv(getFlag 加载期不可用);复用 pane 被跨进程抢占时回退新 tab。

## 2026-08-26 — 表面拓扑:父进程在 Herdr 内时复用父 workspace(用户实测反馈,DEFINE 已回写)

用户实测反馈:其 pi 本身运行在 Herdr pane 内(HERDR_ENV=1),原"每父会话独立 aili- workspace"拓扑把子 Agent 放进用户看不见的后台 workspace,违背可观测目标("不可观测")。调整:检测到父进程位于 Herdr 管理的 pane 时,子 Agent 以**聚焦的新 tab** 直接开在父 workspace;父 workspace 不在 daemon snapshot 时显式失败(不回退隐藏 workspace)。spec `herdr-execution-surface/Surface topology` 已同步修改(新增两场景);父进程不在 Herdr 内时仍为独立 workspace 语义。另:角色系统提示词原经 argv(`--append-system-prompt`)传递,被 herdr 的 shell 编码拒绝(`invalid_agent_argument`),改为并入回合消息经 bridge socket 提交,argv 保持纯 ASCII(测试断言全 argv 可打印 ASCII)。

## 2026-08-26 — Herdr daemon 连接模型与设计假设的三处适配(Phase 2 实测)

Phase 2 实机验证(见 audit/environment-verification.md、audit/live-smoke.md)确认了 socket API 的存在与方法名,但三处细节与设计文档的表述需要适配:

1. **每连接单请求 + 只读订阅流**。设计文档设想"一个长驻连接复用请求+订阅"。实测:命令请求是每连接一次性的(响应后 daemon 关闭);`events.subscribe` 成功后的连接是只收事件流(再写会被 RST)。实现改为:命令走一次性连接、订阅走专用长连接,sync 仍严格保持 subscribe→缓冲→snapshot→回放顺序(无缺口语义不变)。spec 的 Gap-free reconnection 要求未受影响。
2. **Bridge socket 不能放在 sidecar**。Unix socket 路径上限约 108 字节,真实 session sidecar 路径超限(`EINVAL`,单测捕获)。socket 移至 `$XDG_RUNTIME_DIR|tmp` 下按 run 目录哈希寻址的短目录(0700);sidecar 保留 events.jsonl 与 token 文件。spec 中 `<sidecar>/runs/<runId>/bridge.sock` 的字面路径漂移,语义(每 run 独立 socket、0600、token 鉴权)不变。
3. **Metadata 键名**。Herdr token 键约束 `^[A-Za-z0-9_-]{1,32}` 不允许点号,设计文档的 `aili.parentSessionId` 等点分命名实现为 `aili_parent_session_id` 下划线形式;且不含凭证/完整 prompt 的约束保持不变。
4. **官方 herdr pi 集成扩展必须随子进程加载**。`--no-extensions` 会使 daemon 无法识别子 pi(它依赖 `~/.pi/agent/extensions/herdr-agent-state.ts` 上报状态),`agent.start` 永远等不到 ready。实现把该官方扩展作为 herdr 后端 loadout 的一部分显式 `-e` 加载;该扩展本就来自用户批准的官方安装链。

结论:均不改变 specs 的行为要求(无缺口同步、0600 socket、token 鉴权、无凭证 metadata、两步启动),属实现层适配。DEFINE 回写需求:无(spec 未规定 socket 物理路径与连接复用方式)。

## 2026-08-26 — Phase 2 切片的显式裁剪(与 spec 的差距,待 Phase 3 补齐)

- `pane.agent_status_changed`(blocked/working 辅助信号)需逐 pane 订阅,切片未接(Phase 3 随 InteractionBroker 的 unexpected-blocked 一起做)。
- 父进程重启 reconcile 目前:重新 adopt 存活表面(pane+bridge 双活)、pane 消失的 run 标 lost、daemon 不可达的 run 标 failed;**运行中 turn 的 mid-turn 续接**(spec "Reattach after parent restart … the turn settles with bridge-sourced evidence")未实现——现有 storage 恢复语义会先把 running turn 记 interrupted,切片不改该语义。Phase 3 需引入 backend-aware 的 resume 分支。
- abort 语义:`/sub-cancel` 对 herdr Agent 会关闭其 pane(进程终止),run 记 failed;不尝试软中断(ExtensionAPI 无显式 abort 入口)。

## 2026-08-26 — 拓扑终版:并行=同一 AILI tab 内 pane split(用户反馈)

用户澄清:并行不是多 tab,而是"一个标签页里开两个窗口,左右/上下分割"(herdr skill 的 pane split 模型)。最终拓扑:每 workspace 一个 AILI tab;串行回收 pane(空闲已 settle 的子进程才可回收);并行需求在该 tab 内 split(方向交替 right/down,遵循 skill 的可用性经验);表面选择经进程内锁串行化(否则并发首轮各自 snapshot 都为空、各开一 tab);回收判定使用 starting/busy 标志而非 pane 显示状态(agent.start 与首次提交之间 pane 短暂显示 idle,按显示回收会误杀启动中的并发子进程)。spec Surface topology 已按此重写。
