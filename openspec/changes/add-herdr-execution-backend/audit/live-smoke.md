# Phase 2 真实环境冒烟结果(2026-08-26)

脚本:`live-smoke-script.mjs`(本目录,自包含)。对**正在运行的真实 herdr daemon**(用户主会话,protocol 20)执行,只创建并清理自己拥有的表面。

```text
SYNC ok, protocol 20
WORKSPACE w8
TAB w8:t2 PANE w8:p2
AGENT.START ok: {"type":"agent_started","agent":{"name":"ap-smoke-child","agent_status":"unknown",...}}
BRIDGE STATUS: {"ok":true,"result":{"runId":"run-1","agentId":"SmokeWorker","phase":"ready","controlMode":"aili","lastSeq":2}}
BRIDGE EVENTS: bridge.ready, session.ready
CLEANUP ok (workspace closed, child exited)
SMOKE PASS
```

验证内容:
1. 真实 daemon 接受我们的 socket 调用(workspace.create / tab.create(env) / agent.start / workspace.close);
2. **真实 pi 子进程**(0.84.3,`--no-extensions -e <aili bootstrap> -e <herdr 官方 pi 集成> --no-skills/... --tools read,ls`)在 pane 内启动;
3. **AILI Child Bootstrap 在真实 pi 内加载**,bridge socket 建立、token 鉴权通过、status 握手返回正确身份;
4. 事件双写(`bridge.ready`、`session.ready` 均经 socket 推送且 events.jsonl 落盘);
5. `shutdown` 令子进程退出,自建表面清理干净,未触碰用户其他表面。

未覆盖(留作用户实测/后续):submit_turn → 真实模型回合 → turn.completed 全链路(避免真实 API 花费;该路径已在 fake daemon + 真实 bridge 的单测中验证)。

## 期间确认的 daemon 连接模型(写入 drift-log)

- **每连接单请求**:命令请求在一根连接上发出、收到一个响应后 daemon 关闭连接;错误响应同样关闭。
- **订阅连接只读**:`events.subscribe` 成功后连接保持为事件流,再写入会被 RST。
- 因此 client 采用:命令 = 一次性连接;订阅 = 专用长连接;sync = 订阅→缓冲→snapshot→回放。
- `pane.agent_status_changed` 等订阅需要逐 pane 的 `pane_id`(Phase 3 按表面追加订阅)。
