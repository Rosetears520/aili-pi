# Change Context: AILI SQLite Memory

## Change Identity

- `change_id`: `add-aili-sqlite-memory`
- `backend`: OpenSpec `spec-driven`
- `lifecycle_phase`: DEFINE
- `proposal_state`: drafted; not accepted as BUILD-ready
- `source_reference`: `pi-hermes-memory@0.9.0` / commit `e69b24d2f93f4756ebe905d87b8d4dad33920027` / MIT

## Goal

[已知|用户] 采用 Hermes Memory 的存储思路与整体机制，但由 AILI 拥有最终代码文件、SQLite schema、路径、工具、生命周期和治理合同。Memory 持久化只以 SQLite 为正式数据源，同时支持 global memory 与可选 project memory。

## Confirmed Decisions

- [已知|用户] 不把 `pi-hermes-memory` 作为独立运行时依赖原样加载；采用选择性源码适配和 AILI-owned implementation。
- [已知|用户] SQLite 是唯一 source of truth；不使用 Markdown + SQLite mirror 双写架构。
- [已知|用户] Global store 目标为 `~/.pi/agent/aili-memory/memory.db`。
- [已知|用户] Project store 目标沿用 `<project>/memory/memory.db`；项目 memory 可以存在也可以不存在。缺失时使用 global-only，只有显式初始化才创建。
- [已知|用户] 整体保留 Hermes 风格的 scanner、global/project memory、自动 review、correction、flush、aging、consolidation、session search/indexing、prompt policy/context fencing 与管理能力，但底层文件与运行时所有权归 AILI。
- [已知|源码] Hermes `src/store/content-scanner.ts` 使用 deterministic patterns 检测 prompt injection、role hijack、exfiltration、credential paths、API keys/tokens/private keys、inline secret assignments 和 invisible Unicode；AILI 将选择性适配该机制，而不是让 LLM 承担安全扫描。
- [框架内] AILI scanner 和 memory policy gateway 是所有写路径的唯一入口；被阻断的敏感原文不得进入数据库、日志或 receipt。
- [框架内] Memory 是非权威历史上下文。当前用户、repository、OpenSpec、permission、Git 和 fresh verification 始终优先。
- [框架内] 正式 Pi skills 继续是 `SKILL.md`；Hermes-style skill extraction 只能先落 SQLite candidate，再走 `aili-workflows` canonical governance。
- [已知|用户] `pi-goal` 暂不做。Ponytail 与 `ask_user`/requirements-grilling UI 不进入这个 memory change。

## Source Adoption Boundary

### Adapt

- content/secret scanner patterns and failure semantics;
- global/project memory concepts and retrieval behavior;
- memory/search tool intent;
- background review、correction detection、flush、aging、consolidation;
- session parsing/indexing/search;
- context fencing and memory policy guidance;
- user-visible memory insights/interview/project-switch concepts where compatible.

### Replace with AILI-owned behavior

- Markdown `MemoryStore` and `§` entry encoding;
- SQLite mirror/sync architecture;
- storage paths、schema、migrations、transactions、receipts and authority metadata;
- `better-sqlite3` ABI rebuild path;
- compaction hook ownership;
- automatic global `SKILL.md` creation;
- any startup/load write that bypasses explicit AILI external-write policy.

## Constraints

- Official Pi host baseline remains exact `0.82.1`; Node floor remains `>=22.19.0` unless a later accepted change revises it.
- Preserve the single AILI-owned runtime integration boundary and existing AILI Compact ownership.
- No runtime source fetch or unpinned upstream behavior.
- All third-party reuse requires exact source/hash/license/provenance and focused verification.
- Real global/project filesystem mutation, dependency/lockfile change, `aili-workflows` write, Git action and release operation retain separate exact approvals.
- Current repository worktree already contains extensive unrelated/pre-existing modifications and untracked work; later BUILD must isolate this change's files and evidence rather than treating the whole dirty tree as task output.

## Open Questions / Unverified

- `node:sqlite` exact API, FTS5 availability, WAL/busy timeout, concurrency and corruption-recovery behavior on the supported Pi/Node runtime.
- Exact schema compatibility and migration strategy for existing project `memory/memory.db` files and the legacy Python `rose-memory` CLI.
- Automatic review/correction thresholds, provider/model selection, token/cost accounting, cancellation and no-UI behavior.
- Retention, active-record limits and consolidation invariants after replacing Markdown character limits with SQLite rows.
- Session indexing privacy boundary, default enablement, branch/tree semantics and interaction with AILI persistent Agent sidecar sessions.
- Scanner severity handling for ambiguous medium-risk matches, redaction versus quarantine, and false-positive evidence.
- Explicit legacy `MEMORY.md`/`USER.md`/`failures.md` import behavior and whether a read-only export is required.
- Exact public tool/command names and compatibility aliases; no name is accepted by this proposal alone.
- Live quality and correctness of automatic memory extraction remain Unverified until a separately approved provider-backed probe exists.

## Language

- **AILI SQLite Memory**: AILI-owned Pi runtime whose only durable memory source is SQLite. _Avoid_: “Hermes database copied unchanged”.
- **Global memory**: user-level cross-project memory stored under the AILI-owned Pi agent directory.
- **Project memory**: optional repository-local `<project>/memory/memory.db`; absence is a supported state.
- **Memory record**: historical context with source/scope/verification metadata; never a current instruction or completion proof.
- **Skill candidate**: SQLite record proposing a reusable procedure; not a Pi-discoverable `SKILL.md` until canonical promotion.
- **Adapted source**: selected upstream source/patterns reused under retained MIT attribution with recorded local changes. _Avoid_: “purely original AILI code” when source-derived behavior or code is retained.

## Next Gate

Create the two capability specs and design only after proposal review. Resolve decision-shaping Open Questions through `interview.md`; generate a final repository-local `test-plan.md`, run strict OpenSpec validation, and obtain explicit final test-plan acceptance before any BUILD or production/dependency/global-memory mutation.
