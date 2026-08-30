# Phase 0 环境验证:Herdr 协议 / 安装链 / pi 启动(add-herdr-execution-backend)

> 任务 1.2/1.3/1.4 产物。验证时间:2026-08-26;实机:herdr 0.8.2、pi 0.84.3、Node 24.16.0。
> 附加证据:`herdr-api-schema.json`(本目录,`herdr api schema --json` 原样导出)。

## 1. Herdr server 与 socket API(任务 1.2)——设计假设全部确认

**服务器**:本机有正在运行的用户主会话 server(pid 见 `herdr status server`),**只做了只读探测,未干扰**。

```text
$ herdr status server
status: running
version: 0.8.2
protocol: 20
compatible: yes
socket: /home/rosetears/.config/herdr/herdr.sock
```

**线格式(实测,自写 Node 客户端向运行中 server 发起一次只读请求)**:

```text
连接:Unix socket /home/rosetears/.config/herdr/herdr.sock
请求:{"id":"aili-audit-probe","method":"session.snapshot","params":{}}\n   ← 换行分隔 JSON
响应:{"id":"aili-audit-probe","result":{"type":"session_snapshot","snapshot":{
        "version":"0.8.2","protocol":20,"focused_workspace_id":"w4",
        "workspaces":[...]}}}                    ← id 关联的请求/响应
```

**协议版本守卫可用数据**:响应 snapshot 内嵌 `protocol: 20`;schema 自述 `protocol: 20, schema_version: 1`。版本不匹配可显式判失败。

**方法清单**(`herdr api schema --json`,完整清单见 herdr-api-schema.json;schema 五部分:`error_response, event, request, subscription_event, success_response`):

| 设计假设(ADR-003) | 实测 | 备注 |
|---|---|---|
| `session.snapshot` | ✅ `session.snapshot` | CLI `herdr api snapshot` 同源;snapshot 含 workspaces/tabs/panes/agents、`agent_session`(pi session jsonl 路径!)、`agent_status` |
| `events.subscribe` | ✅ `events.subscribe` + `events.wait` | `subscription_event` schema:`{event, data}` |
| workspace/tab/pane 操作 | ✅ `workspace.create/list/get/close/focus/rename/report_metadata`、`tab.*`、`pane.split/close/focus/move/process_info/read/send_*/wait_for_output` 等 | `report_metadata` 在 workspace/pane 两级都有 |
| `agent.start/prompt/wait/read/focus` | ✅ 另有 `agent.get/list/send_keys/rename/explain/view.set` | |
| `pane.report_metadata` / `report_agent_session` | ✅ 两者都在 | resume/reconcile 身份挂靠点 |
| 事件(订阅) | ✅ `pane.created/closed/focused/moved/agent_detected/agent_status_changed/exited`、`workspace.*`、`tab.*`、`layout.updated` 等 | |

**关键意外收获**:`herdr integration install pi` 装的是 `~/.pi/agent/extensions/herdr-agent-state.ts`(v8)——即 **Herdr 官方 pi 集成会在 pi 里上报 agent 状态与 session 路径**,snapshot 的 `agent_session.value` 直接给出 pi session jsonl 路径(`source: "herdr:pi"`)。这为 reconcile 时发现 DriverSessionId 提供了官方通道;AILI 自身 metadata(`aili.*` 经 `pane.report_metadata`)仍按 spec 叠加。

**对 Phase 2 的结论**:ADR-003 的 socket 路线成立,无需重议。剩余实现期细节:订阅事件的缓冲/去重序号字段(在 `subscription_event.data` 内,实现时读 schema)、重连语义。

## 2. 官方安装链三组件检测(任务 1.3)——全部已装,零安装执行

检测(幂等路径实测):

| 组件 | 检测方式 | 状态 |
|---|---|---|
| herdr 二进制 | `which herdr` + `herdr --version` | ✅ 已装(0.8.2)→ 跳过 `curl -fsSL https://herdr.dev/install.sh \| sh` |
| Herdr–Pi 集成 | `herdr integration status` | ✅ `pi: current (v8)`(`~/.pi/agent/extensions/herdr-agent-state.ts`)→ 跳过 `herdr integration install pi` |
| pi 侧 herdr skill | `ls ~/.pi/agent/skills` | ✅ `herdr` 在位(另有 `~/.agents/skills/herdr/SKILL.md`)→ 跳过 `npx skills add herdrdev/herdr --skill herdr -g -a pi` |

**未执行任何安装命令**(三组件齐备,与 spec 的"already-present components are skipped"一致)。`herdr integration status` 同时给出全部支持的目标(pi/omp/claude/codex/copilot/kimi/opencode/…),可作为 doctor 的检测原语。注意:`herdr integration` 组还有 `integration.install/uninstall` **socket 方法**——doctor 可走 CLI 或 socket,二选一在 Phase 2 定。

## 3. pi 0.84.3 headless 启动配方(任务 1.4)——所需旗标全部存在

`pi --help`(0.84.3)确认:

| 设计需求 | 旗标 |
|---|---|
| 禁用默认扩展发现,仅显式加载 | ✅ `--no-extensions, -ne`(显式 `-e` 仍生效)+ `--extension, -e <path>`(可重复) |
| 只加载 loadout 允许的 skills | ✅ `--no-skills, -ns` + `--skill <path>` |
| 关闭 context files / prompt templates / themes | ✅ `--no-context-files, -nc` / `--no-prompt-templates, -np` / `--no-themes` |
| 指定 model/thinking | ✅ `--model <provider/id[:thinking]>`、`--thinking <off..max>` |
| 新建或恢复指定 session | ✅ `--session <path\|id>`、`--session-id <id>`、`--resume, -r`、`--continue, -c`、`--session-dir <dir>` |
| 工具白名单/黑名单 | ✅ `--tools, -t` / `--exclude-tools, -xt` / `--no-builtin-tools` / `--no-tools` |
| 非交互 | ✅ `--print, -p`;`--mode text\|json\|rpc` |
| 权限模式 | ✅ `--perm <default\|plan\|build\|yolo>`(扩展注册)+ `--no-sandbox` |
| 系统提示 | ✅ `--system-prompt` / `--append-system-prompt` |

**结论**:Child Bootstrap 启动纪律(禁发现、只加载 bootstrap、冻结 model/thinking/session/cwd)在 0.84.3 全部可表达。补充发现:`--mode rpc` 提供进程级 RPC 模式——本 change 不改用(执行面按 spec 走 Herdr PTY + child bridge),记录为未来备选。

## 4. 差异与门禁结论

- **无阻断差异**。设计决策 6(socket 优先)、7/8(表面拓扑与命名)、child 启动纪律的假设全部实机确认。
- protocol 20 / schema_version 1 已记录;版本守卫将按此显式失败。
- 快照中出现的用户真实会话数据已最小化引用(仅结构字段),不含内容。

## 5. 验证过程安全性声明

- 未运行裸 `herdr`(TUI);未 stop/reload 任何 server;未创建/关闭任何 workspace/tab/pane。
- 唯一自定义 socket 请求为一次只读 `session.snapshot`(与 `herdr api snapshot` 等价)。
- 未执行任何安装命令;未写任何仓库外文件。
