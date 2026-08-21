## 1. Schema 与可信通道

- [x] 1.1 task-schema：公开 ItemFields 删除 formal 字段；新增 FORMAL_TASK_REQUEST_SCHEMA 与 validateFormalTaskRequest；交叉校验仅内部作用域可达。
- [x] 1.2 TaskCoordinator.submitTrusted 内部通道；公开 submit 严格拒绝 formal 字段。

## 2. formal_task 适配器

- [x] 2.1 formal-task-tool.ts：{changeId, packageId} schema + buildFormalTaskDispatch（root/pair/v1/ready 校验 + board 构造请求）。
- [x] 2.2 formal-orchestration 导出 exactTaskRequest/buildFormalPackageTaskRequest。
- [x] 2.3 runtime.ts 注册 formal_task；prompt 文案拆分。
- [x] 2.4 子代理：formal 子嵌套 task 用内部 schema/通道；全部子代理获得 formal_task。

## 3. 测试与验证

- [x] 3.1 单测：公开 schema 拒绝 formal 字段；内部 schema 保留校验；公开/内部 JSON 断言更新。
- [x] 3.2 集成：buildFormalTaskDispatch 构造/封闭三例；formal 编排套件切换 submitTrusted；注册断言含 formal_task 与新文案。
- [x] 3.3 typecheck、聚焦套件、npm test、openspec validate --strict、adapter 证据刷新全部通过。
