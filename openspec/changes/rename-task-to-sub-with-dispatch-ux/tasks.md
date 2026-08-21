## 1. YOLO 自动通过
- [x] 1.1 resolveCurrentMode 暴露模式名；导出 resolveCurrentPermissionModeName/isBypassPermissionMode。
- [x] 1.2 preallocate 与 modelHub 确认在 yolo 下直接通过（含 headless）；overrideDecision 增加 auto-approved-bypass；同步结算附带 modelDecision。
- [x] 1.3 单测（模式解析三来源）+ production 集成（yolo 下覆盖生效且审计）。

## 2. task → sub 更名
- [x] 2.1 注册守卫/查找/isCanonicalAiliTaskActive、runtime 注册与文案、native-integrations 旁路、policy 桥、production 子工具面、rose-context、doctor 证据、live-release-support 观察器。
- [x] 2.2 测试断言（runtime/registration/collision/production/policy/package-runtime/formal-orchestration/doctor）与 docs/README/roles 文案。
- [x] 2.3 清单刷新：roles.json（profileHash/sourceHash）、live-verification（20 文件）、adapter-evidence（10 工件）。

## 3. Web 渲染对齐
- [x] 3.1 lib/agent-dispatch.ts 字段选择 + ToolCallBlock 折叠预览/结构明细/原始 JSON 披露。
- [x] 3.2 tool-execution-progress 优先解析 TaskLiveSnapshot；useAgentSession 传工具名。
- [x] 3.3 AiliAgentResultCard 渲染 aili.agent-result。
- [x] 3.4 colocated 测试（agent-dispatch 7、卡片 2、MessageView +2）与 npm run build:web。

## 4. 验证
- [x] 4.1 typecheck、npm test、validate:capabilities、validate:compatibility、openspec validate --strict 全部通过。
