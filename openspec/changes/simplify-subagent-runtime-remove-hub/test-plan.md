# Test Plan

## Scope

验证 `sub` 单入口协议、`task_id` 续接、严格 model/thinking、空结果与 history redaction 修复、Hub/formal_task 删除后的注册面，以及自由格式 `progress.txt` 与可选 Board 的非阻塞行为。真实 provider 验收（6.5）需真实环境另行执行。

## Interfaces

- `npm test`（vitest 全量：unit + integration）
- `npm run typecheck`
- `npm run validate:package`
- `npm run validate:generated`
- `node --experimental-strip-types scripts/apply-adapter-evidence.ts --verify`
- `node --test src/web/lib/agent-dispatch.test.mjs`、`node --test src/web/components/MessageView.test.mjs`
- `vitest run tests/integration/persistent-agent-runtime.test.ts tests/integration/formal-orchestration-runtime.test.ts`
- `openspec validate simplify-subagent-runtime-remove-hub --strict --json`（仅因本次修改了 OpenSpec 原生 artifacts，定向执行一次）
- `node --experimental-strip-types scripts/sync-skills.ts --verify`
- `node --experimental-strip-types scripts/sync-roles.ts --verify`
- `node --experimental-strip-types scripts/sync-agent-routing.ts --verify`
- `node --experimental-strip-types scripts/apply-adapter-evidence.ts --verify`

## Deterministic cases

1. Surface：注册工具恰为 `["sub","formal_task"]`；`hub/task/subagent/aili_task` 不存在；`/sub-cancel` 命令存在。
2. Schema：`validateSubRequest` 接受/拒绝清单（缺 description/prompt/未知字段/不安全 task_id/非法 thinking）；公开 schema JSON 不含 tasks/writeScope/formalContext。
3. Foreground 默认：公开调用 default-sync 完成并返回非空 result+task_id；delivery 仅为 background 触发。
4. Background：立即返回 accepted；parent signal abort 不终止；结算后自动投递；并发 32 FIFO。
5. 续接：settled task_id 新 turn 复用同一 Agent/job+turn 递增、executor `continuation:true`、conversation 复用；运行中 SUB_BUSY；selector 不一致 SUB_SELECTOR_MISMATCH；aborted SUB_TERMINAL；formal SUB_FORMAL_CONTINUATION_REFUSED；重启后 idle/parked 均可判。
6. 模型：one-shot 高于 instance（层序）；compact 别名唯一解析/多匹配 SUB_MODEL_AMBIGUOUS 列候选/不可用 SUB_MODEL_UNAVAILABLE；yolo 自动批准并审计 auto-approved-bypass；显式请求失败不 fallback（production 集成）。
7. 空结果：whitespace 输出 → failed + SUB_EMPTY_RESULT（lifecycle job/turn failed）；assistantText tool-only 回退（renderer/单测覆盖路径）。
8. History guard：api_key=<redacted>、<redacted-private-key>、protected-path 整行替换、redactedSensitiveEntries 计数、普通行可读。
9. 嵌套：background 拒绝 SUB_BACKGROUND_NESTED；nested-sync；过期 permit 拒绝；specialized 不可 spawn。
10. 兼容：旧 sidecar 字节不变；adapter-evidence --verify 通过；doctor 文案仅公开 tools=sub。
11. Progress guidance：工具描述要求多步骤工作创建自由格式 `progress.txt`，且明确不做格式校验。
12. Board independence：trusted formal dispatch 在 Board 缺失或内容为任意 Markdown 时不读取、不解析、不因格式阻塞；危险 change id 仍在分配前拒绝。
13. Ownership：Journal 继续记录 Agent/job/turn；worker 对 `progress.txt` 和可选 Board 保持只读边界。
14. Release identity：lock 固定 `rose-aili@0.4.8`、commit/npm gitHead `a5284ee105a084392a944aee04313dcf7c294a64` 与 tarball SHA-256 `cfc3b90e982900dcc17cf841066f6eee022cc2b97f27bb40e39494ac77bed910`。
15. Retired protocol：generated Pi bundle 和 workflow loader 不含 `aili-task-board.v1.schema.json`/`formalTaskBoard` protocol key；formal notes reference 仍被 hash-bound。
16. Doctor：安装态检查报告 references 2/2、protocols 1/1，并拒绝缺失核心 free-form progress 指导的 modified notes。

## Provider-backed acceptance (pending real environment)

- GLM 5.1 / thinking=low 与 GPT-5.6 Luna / thinking=max 经紧凑名唯一解析并实际执行该 canonical model。
- 同 task_id 跨 Turn 切换模型，Session 文件不变、上下文保留、Turn 模型互不污染。
- 两个 background 并发完成并自动投递两条结果。
- foreground 长任务 >300s 正常完成（证明无人为 wait timeout）。

## Non-goals

- 不验证 `hub`/`formal_task`（已删除）；不删除 legacy validator 源码；不修改 canonical `aili-workflows`；不验证 macOS/Windows；不建立 OS-sandbox 通用声明。
