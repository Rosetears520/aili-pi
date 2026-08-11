## Why

[已知|用户] AILI 需要在官方 Pi 内提供原生的跨会话持久记忆：整体沿用 `pi-hermes-memory` 的 global/project memory、自动学习、纠错、检索、consolidation、session indexing 与安全扫描思路，但最终文件、schema、生命周期和治理合同由 AILI 拥有，并以现有 AILI SQLite 体系作为唯一数据源。

[已知|本地] 当前 `rose-memory` 仅提供 legacy/pre-runtime 的项目本地 `memory/memory.db` CLI 合同，`memory.project` 在 capability registry 中仍是 optional；AILI 还没有一个可由 Pi Extension 原生注册、同时覆盖 global memory 与可选 project memory 的运行时。直接加载 `pi-hermes-memory@0.9.0` 又会引入 Markdown 主存储、`better-sqlite3`/ABI rebuild、Extension-load/Session lifecycle HOME 写入、自动 skill 文件创建及与 AILI Compact 不一致的 compaction hook。

## What Changes

- 在现有 AILI Extension 中新增 AILI-owned memory runtime，不新增独立 Package、替代 CLI 或第二个 memory authority。
- 以 SQLite 作为唯一 source of truth：global store 使用 `~/.pi/agent/aili-memory/memory.db` 并在首次真实 memory 操作时惰性创建；project store 使用现有 `<project>/memory/memory.db` 合同，仅在已存在或用户显式初始化后启用。项目 memory 缺失时正常退化为 global-only。
- 选择性适配 `pi-hermes-memory@0.9.0`（commit `e69b24d2f93f4756ebe905d87b8d4dad33920027`）的可移植机制，包括 content/secret scanner、global/project scope、memory/search tools、background review、correction detection、session flush、memory aging、consolidation、session indexing/search、context fencing 以及对应状态/管理命令；AILI 拥有最终公开接口和行为边界。
- 用 AILI SQLite repository、versioned schema/migrations、事务、receipt、scope/source/verification metadata 和联合检索替换 Hermes 的 `MEMORY.md`、`USER.md`、`failures.md` 主存储及 SQLite mirror。Markdown 不再是并行可写数据源；如支持旧 Markdown，只提供显式、非破坏的一次性 import 或只读 export。
- 所有显式写入、后台提取、纠错、导入和 consolidation 写回都必须经过同一个 AILI deterministic scanner 与 memory policy gateway；LLM 只提取候选内容，不拥有安全放行权。确定的 secret、credential、注入或外传载荷不得进入数据库、日志或 receipt。
- 保留 Hermes 风格的自动 review/correction/flush 行为，但为每条记录保存 `source`、`scope` 与 verification/authority metadata。Memory 始终只是历史上下文，不得成为当前用户指令、OpenSpec contract、permission、Git truth、review verdict 或 completion evidence。
- `memory_search`/session retrieval 同时查询当前 project（存在时）与 global store，结果必须标注 scope、project、category、status、source/evidence 与时间；当前项目结果优先，但不得静默删除或覆盖 global 记录。
- 让 memory checkpoint/flush 与 AILI Compact 的 owned lifecycle 协作，不复用 Hermes 对 Pi native `session_before_compact` 的假设，也不创建第二个 compaction owner。
- Hermes 的 procedural-skill extraction 只能先生成 SQLite skill candidate；正式 Pi skill 仍由 `aili-workflows` canonical ownership 与 `SKILL.md` 发现合同管理，不允许 memory runtime 任意写入或覆盖 shared skill 正文。
- 对适配来源增加 exact revision/hash、MIT license、文件/符号/local-change provenance、NOTICE、SBOM、doctor 与 drift verification。默认不保留 `better-sqlite3` 自动 rebuild 行为；具体 SQLite driver/API 由 design 和 Pi `0.82.1`/Node `>=22.19.0` 证据决定。
- 本 change 不包含 Ponytail、`ask_user`/requirements-grilling UI、`pi-goal`、发布操作或对 `aili-workflows` 的跨仓库写入；这些保持独立 change/approval 边界。

## Capabilities

### New Capabilities

- `sqlite-memory-storage`: AILI-owned global + optional project SQLite source of truth、兼容 schema/migration、统一写入 gateway、scanner、receipt、联合检索、导入/导出和 fail-closed 存储合同。
- `memory-learning-runtime`: Hermes-inspired Pi memory lifecycle，包括 prompt policy、自动 review、correction/flush、aging/consolidation、session indexing/search、管理命令以及与 AILI Compact/skill governance 的边界。

### Modified Capabilities

<!-- 当前 openspec/specs/ 为空；本 change 不声明已发布 capability delta。 -->

## Impact

预计影响 `src/runtime/index.ts`、新的 AILI memory runtime/storage/scanner modules、`src/runtime/registry.ts`、doctor、capability/compatibility/provenance/SBOM manifests、README、`skills/rose-memory` 的运行时映射证据，以及 `tests/unit/`、`tests/integration/`、`tests/fixtures/` 中的 disposable HOME、global/project scope、scanner、migration、concurrency、session search、learning lifecycle 和 AILI Compact seam tests。

该方向优先复用现有 AILI SQLite schema/receipt 语义，并需要证明现有 `<project>/memory/memory.db` 与 legacy `rose-memory` CLI 不会成为不兼容的双 writer。`node:sqlite`、FTS5、WAL/locking、corruption recovery、后台 provider 调用和 legacy Markdown/DB migration 仍需在 design/spec/test-plan 中形成可执行合同。

本 proposal 不授权 production code、dependency/lockfile、真实 `~/.pi/agent` 或项目 memory 写入、外部 repository 写入、Git commit/push、publish 或 release。后续必须完成 design、capability specs、tasks、`interview.md`/`test-plan.md`、strict validation，并由用户明确接受最终 `test-plan.md` 后才能进入 BUILD。
