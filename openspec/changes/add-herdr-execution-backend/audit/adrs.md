# ADRs — add-herdr-execution-backend(Phase 0,任务 1.5)

状态:已接受(2026-08-26)。对应 design.md 决策 1/3/6+7/5/4。

## ADR-001 双执行后端(managed/herdr)分层

**背景**:现有持久 Agent 全部经 `session-factory.ts` 在进程内创建 pi SDK AgentSession,控制面(调度/授权/权限/投递)与这一种执行方式硬耦合。
**决策**:引入 ExecutionBackend 抽象与 registry;现实现原样包装为 `managed`(driver `pi-sdk`),零行为变化;新增 `herdr`(driver `pi-cli`)作为第二后端。`production.ts` 不再直连 session-factory,公共预检/分配/调度后经 backend 执行。
**后果**:协调层与执行方式解耦;Phase 1 仅是包装重构,既有测试即回归网。
**否决的备选**:单 backend 字符串编码 driver(无法在预检强制支持矩阵);先大改 production.ts 结构(违反零回归前提)。

## ADR-002 Run 作为独立实体,与 Agent/Job/Turn 分离

**背景**:herdr 后端下,一个 Agent 会有多个进程化身(pane 移动、重启恢复、进程退出后 resume);pane/进程信息塞进 AgentRecord 会破坏身份稳定。
**决策**:新增 RunRecord(runId、backend、driver、backendRef、driverSessionId、loadoutHash、controlMode),权威生命周期 `allocated→starting→live→stopping→stopped` + `lost/failed`,独立于活动 overlay(stalled/recovered 等只作 overlay,不改权威状态、不释放 permit)。pane/process 引用只存在于 backendRef。
**后果**:journal/snapshot 新增 runs(additive);AgentId/DriverSessionId 跨 Run 稳定。
**否决的备选**:AgentRecord 增可选 pane 字段(身份与进程生命周期耦合,pane move 即破坏)。

## ADR-003 Herdr 是 Surface,不是调度器;socket 为主控制路径

**背景**:Herdr 提供 workspace/tab/pane、PTY、agent 生命周期观测(idle/working/blocked/done/unknown),官方明确不跟踪单独 Turn。
**决策**:AILI 保留全部权威(状态、预检、并发、授权、权限、workspace、投递、恢复);Herdr 仅负责持久终端表面与人工进入。控制路径走长驻 socket client(版本守卫、subscribe→缓冲→snapshot→回放防缺口);CLI 只留给 doctor/人工。完成证据唯一来源是 child bridge 的 turn.completed(Herdr idle/终端文本永不作为完成依据)。
**后果**:Herdr 不可用/协议不匹配/能力不足 → 显式失败,绝不静默回退 managed。
**否决的备选**:CLI exec + stdout 解析(无事件流、脆弱);以 Herdr settled 状态结算 Job(不跟踪 Turn,归属不可靠)。
**门禁**:socket API 形态未经实机确认(任务 1.2);若缺失/差异大,本 ADR 的 socket 部分须与用户重议。

## ADR-004 Driver 能力矩阵;"能启动"≠"正式支持"

**背景**:Herdr 可识别多种 agent CLI;若把"Herdr 能启动某 CLI"当作"AILI 支持",安全与结果契约不可兑现。
**决策**:Backend × Driver 两轴;首版正式支持仅 `managed/pi-sdk` 与 `herdr/pi-cli`。DriverCapabilities(structuredEvents、exactTurnCompletion、exactSessionResume、toolPolicy、permissionBroker、sandbox、formalResult 等)声明能力;任务所需能力超出声明 → 批量预检显式失败,不运行时降级。herdr 首版先只开放 read-only 角色,安全等价验收后再开 write/bash。
**后果**:未来扩展只需新 driver adapter + 能力声明 + 验收。
**否决的备选**:按 CLI 名义白名单(无法表达安全等价要求)。

## ADR-005 backend 只由用户选择,按 Agent 冻结,禁止静默回退

**背景**:backend 改变安全、恢复与进程语义;模型自行选择会造成不可审计的执行面切换。
**决策**:解析优先级 session 覆盖 > 项目设置 > 全局设置 > 默认 managed;`sub` schema 不暴露 backend(含显式拒绝);role profile 只能声明 supportedBackends;已有 Agent 冻结创建时 backend(continuation/resume 沿用);切换提示"New Agents: X / Existing Agents: unchanged";任何 backend 失败显式报错,不自动换后端。
**后果**:切换影响面可预测;预检阶段即可失败(零分配、零 surface)。
**否决的备选**:model-facing backend 参数(语义/安全漂移);不可用时静默 fallback(不可审计)。

## 第三方许可证处置(本 change)

- **herdrdev/herdr(Apache-2.0)**:外部运行时,经其官方 socket/CLI 集成,不 vendor 源码、不分发其二进制;安装走官方三连命令(curl install.sh / herdr integration install pi / npx skills add herdrdev/herdr),由用户机器执行。NOTICE 无需新增分发义务,记录集成边界即可。
- **amosblomqvist/pi-interactive-subagents、pi-observational-memory(MIT)**:仅作行为/设计参考(clean-room);若未来吸收代码,须保留版权与许可声明并更新 THIRD_PARTY_NOTICES.md——本 change 不吸收。
- **amosblomqvist/pi-config(仓库根无 LICENSE)**:README 鼓励复制个人配置片段,但不构成对可分发软件包的授权。Browser/Prompt Snippets/ask UI 相关行为一律 clean-room 重写;禁止复制其源码进入本仓库。
- 本 change 不新增 npm 运行时依赖,不改 lockfile。
