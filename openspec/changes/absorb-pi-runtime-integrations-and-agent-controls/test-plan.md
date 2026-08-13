# 最终候选测试计划：absorb-pi-runtime-integrations-and-agent-controls

## 0. 状态与授权

- **阶段**：SHIP 修复。
- **状态**：用户已要求将候选版本更正为 `0.2.4`；此修复范围在当前已接受的 change 内补充。
- **基线**：`1d321cdcd146d08dcf1940c4e87db3e0a4c25e3c`（当前 checkout 与 `origin/main` 相同）。
- **本计划行为**：只根据此 change 的 `proposal.md`、`context.md`、`design.md`、`tasks.md`、delta specs、当前源码和 `plan-auditor` 审计编写；未将任何代码、测试或 runtime probe 当作已验证。
- **已授权操作**：仓库源码/测试/文档/OpenSpec、依赖/lockfile、第三方 source import/provenance/NOTICE/SBOM、普通本机 MCP config 写入和必要 CLI 安装。
- **仍需逐项批准**：真实 provider request、browser 或外部 MCP-server/process live probe。Git push、publish、release 禁止。

接受本计划仅接受验收与验证边界；它不替代上述 live-operation gate，也不自动授权 push/publish/release。

## 1. 证据类型

| 类型 | 用途 | 不能证明 |
| --- | --- | --- |
| A — automated | 纯函数、fake UI/catalog/provider、fixture session、scheduler、config、footer、source inventory、typecheck | 真实 provider/service tier、真实桌面通知、真实 MCP/CLI/browser 的环境兼容性 |
| L — gated live | 指定本机 CLI、Graphify index/query、MCP startup/reconnect/shutdown、真实 provider request、TUI 观察 | 不证明所有终端、provider、网络或未来 upstream 版本 |
| N — limit | 未授权、不可获得或开放世界证据 | 不得写成 PASS/完成 |

所有日志仅记录时间、命令、exit code、redacted target/version/status；不得记录 prompt、task text、secret、Context7 token、完整 MCP/tool output 或 raw Agent transcript。

## 2. 需求与测试矩阵

| ID | 需求 / scenario | 目标测试与证据 | 类型 |
| --- | --- | --- | --- |
| UP-01 | `pi-notify` exact revision、MIT license、inventory、NOTICE/SBOM；Parent 通知保留 OSC 777/9/99、tmux、WT_SESSION/PowerShell、sound；任何失败非致命，Worker 不通知风暴 | `tests/unit/notify.test.ts`：terminal matrix、tmux wrapper、PowerShell spawn/error、sound error、Parent/Worker registration；source inventory/hash/license tests | A |
| UP-02 | `pi-file-context` exact commit/package identity、MIT、inventory；`pi-tui-kit` exact locked dependency/disposition；无 floating range | `tests/unit/file-context-inventory.test.ts`；lock/provenance/package tests verify source tree, license, dependency exact version, no `^` runtime acceptance | A |
| UP-03 | file/context search、preview、line/multi-range/hunk、Git status/diff/blame/history/revision、immutable hash/provenance/token estimate；root/symlink/binary/size limits | upstream-derived focused tests plus `tests/integration/file-context-extension.test.ts`; boundary fixtures cover 5,000 files, 256-char query, 100 results, 1 MiB preview, 5s/1.1 MiB Git, history 20, snapshot 500 lines/50 KiB, 8 items/100 KiB; mutation-after-select proves immutable attachment | A |
| UP-04 | `pi-codex-fast`, Graphify, `pi-tool-display` each has exact reference/distribution disposition; codex-fast source has no observed license declaration and is not copied until resolved | provenance/NOTICE validation asserts `reference-only`, revision, source boundary and explicit license limitation; package inventory proves no copied codex-fast source | A + N |
| MOD-01 | Agent-provided `task.model` is an authorization request, not user authority; confirmation happens before every durable allocation | `tests/unit/persistent-agent-model-selection.test.ts` and `tests/integration/persistent-agent-runtime.test.ts`: Parent=A request=B; denied/no UI/dismissed/expired/unusable each has no B allocation and no request-derived source | A |
| MOD-02 | accepted one-shot B is exact turn-local; direct user instance/project/global override wins even after B confirmation; profile never changes a resolved Parent | model matrix: confirmed B, user-owned precedence, A+profile B→A, no Parent→profile; batch preflight remains atomic | A |
| MOD-03 | direct Parent model, thinking and speed tier inherit through nesting; historical journal remains readable; revival omits old one-shot | unit coordinator/model fixtures assert frozen `{ canonical, thinking, speedTier, source }` in acceptance/audit/hub/settlement/ancestry; nested Parent=A high→Child=A high; revive resolves current policy; legacy records retain old layer text | A |
| MOD-04 | unsupported thinking errors pre-session; no silent downgrade/model change | catalog fixture with incompatible model level asserts zero child-session creation and explicit compatibility classification | A |
| MOD-05 | all new current surfaces expose only `confirmed-one-shot`, `instance-override`, `project-role-override`, `user-role-override`, `inherited-parent`, `profile-fallback`, `runtime-fallback` | structured result/hub/journal renderer assertions; reject `main-agent-selected` | A |
| FAST-01 | Fast is independent `standard|priority`; supported Codex request carries `service_tier:"priority"`; model identity unchanged | `tests/unit/codex-fast.test.ts`: supported/unsupported/toggle/request-payload/frozen-turn cases; inspect captured `before_provider_request` payload | A |
| FAST-02 | Child inherits direct Parent Fast and actual Worker request carries priority; unsupported model remains unmodified and visibly inactive/unsupported | parent/child fake provider request matrix and runtime audit evidence assertions | A |
| FAST-03 | real provider request evidence for Main and Worker | after exact provider approval, bounded harmless request captures redacted request-evidence field and confirms priority injection; no response/token body retained | L |
| SCH-01 | existing top-level scheduler retains capacity/FIFO; records content-free `scheduledAt`, `startedAt`, optional `firstActivityAt`, `completedAt`, outcome | `tests/unit/persistent-agent-task.test.ts`: fake clock, cancellation before activity, no task text/path/prompt/output in journal, nested remains sequential | A |
| SCH-02 | three independent top-level tasks have actual overlapping intervals, not merely running UI | deterministic gate-controlled three-task test calculates overlap from start/activity/completion; later approved runtime probe emits only bounded interval receipt | A + L |
| BOARD-01 | `EXISTING_PAIR_INVALID` stays strict and root cause preserves bounded diagnostics | `tests/unit/formal-task-board-root.test.ts`: invalid pair byte-identical plus diagnostic codes | A |
| BOARD-02 | invalid formal dispatch starts 0 Agent and mutates 0 Agent/job/turn journal, scheduler or workspace | coordinator integration fixture asserts no allocation/enqueue/lease and byte-identical board/progress files | A |
| MCP-01 | five core servers use the existing adapter, one shared config, isolated Parent/Worker adapters, no duplicate registration/leak | expand `tests/unit/mcp-config.test.ts`, `tests/unit/mcp-status.test.ts`, `tests/integration/mcp-session-runtime.test.ts`: exact inventory, separate adapter IDs, same config source, reload/park/release/shutdown exactly-once cleanup | A |
| MCP-02 | after executable preflight success all five use `keep-alive`; one unavailable/failed/reconnect server is isolated | lifecycle fake manager tests cover startup, failure/reconnect, duplicate registration and per-server status; no global false healthy state | A |
| MCP-03 | CodeGraph PATH only at exact `1.5.0`; observed PATH 1.4.1 retains exact npx fallback; Doctor reports strategy/path/actual/expected/status | `tests/unit/codegraph-resolution.test.ts`, `tests/unit/doctor.test.ts` cover absent, 1.4.1, 1.5.0, malformed version; no ungoverned PATH use | A |
| MCP-04 | Graphify is distinct; server receives session cwd; upstream `project_path` resolves `<project>/.graphify-out/graph.json`; missing/corrupt index is unindexed without second config/crash/rebuild | config/command tests with Parent/Worker cwd fixtures and tool argument fixtures; no generated config and no hard-coded path | A |
| MCP-05 | routing is concise and non-redundant: CodeGraph, Graphify, MemPalace, Context7, Playwright, filesystem; indexes are navigation, disk/tests are correctness | guidance snapshot test verifies each direction and forbids mandatory CodeGraph→Graphify→grep chain | A |
| MCP-06 | Context7 only gets env variable reference/local placeholder; no real secret tracked/logged | config redaction fixture and repository negative scan | A |
| MCP-07 | actual core MCP startup/reload/crash-reconnect/shutdown, duplicate and stdio-child leak evidence | after separate server/process approval, capture names/status/pid-count-before-after only; Graphify requires an approved bounded index/read/query separately | L |
| FTR-01 | first line displays actual `<provider/model> <thinking>` and refreshes after model/thinking switch without changing reasoning | `tests/unit/footer-layout.test.ts`, `tests/integration/footer-runtime.test.ts`: Terra high, Sol xhigh, Luna medium, off, and Pi `thinking_level_select` lifecycle | A |
| FTR-02 | only recognized compact Codex 5h input normalizes to `codex <percentage> <MM/DD> <HH:mm>`; unrecognized data omitted | fixtures include `5h 75% 11:38AM (20/08)`→`codex 75% 08/20 11:38`, malformed/missing/non-Codex, and preserve percentage/reset semantics | A |
| FTR-03 | `perm` published state determines permission display, exact right-side order is `Permission Mode · MCP x/y · HH:mm`, and live mode/MCP status refresh | fixture produces `YOLO · MCP 0/4 · 18:31`; Default/Plan/Build matrix; status change causes render request | A |
| FTR-04 | narrow layout keeps permission/MCP/clock before cwd/branch; timer/listeners dispose correctly | display-width matrix, rapid model/thinking/mode switch, reload/shutdown and fake timers | A |
| DOC-01 | README, `docs/persistent-agents.md`, Doctor, Notice/SBOM/provenance accurately distinguish implementation/evidence/limits | documentation and provenance tests plus scoped source/doc consistency inspection | A |
| SHIP-01 | 版本为 `0.2.4` 的公开引用一致；修复后的 candidate tarball 不包含秘密、工作树副产物或未许可的拷贝来源 | affected tests, `npm pack --dry-run --ignore-scripts`, provenance validation and candidate inventory inspection | A |
| FUT-01 | Future Agent Inspector/Context Core are OpenSpec only; existing RuntimeSnapshot/RuntimeEvent is the sole future transport; tool-display reference only | strict OpenSpec validation and source negative assertions for Inspector/Core implementation imports | A |

## 3. Planned focused command order

These commands are planned only; run the smallest affected subset first after BUILD begins.

```text
npx vitest run tests/unit/notify.test.ts tests/unit/file-context-inventory.test.ts tests/integration/file-context-extension.test.ts
npx vitest run tests/unit/persistent-agent-model-selection.test.ts tests/unit/persistent-agent-task.test.ts tests/integration/persistent-agent-runtime.test.ts
npx vitest run tests/unit/formal-task-board-root.test.ts tests/unit/codex-fast.test.ts
npx vitest run tests/unit/mcp-config.test.ts tests/unit/mcp-status.test.ts tests/unit/codegraph-resolution.test.ts tests/integration/mcp-session-runtime.test.ts
npx vitest run tests/unit/footer-layout.test.ts tests/unit/footer-lifecycle.test.ts tests/integration/footer-runtime.test.ts
npx vitest run tests/unit/doctor.test.ts tests/unit/provenance.test.ts tests/unit/package.test.ts
npm run typecheck
npm run validate:provenance
npm run validate:generated
npm run validate:package
openspec validate absorb-pi-runtime-integrations-and-agent-controls --strict --no-interactive
```

Full `npm test` is only a later widening step if focused evidence leaves a material integration gap.

## 4. Live probe contracts

| Probe | Required approval | Minimal evidence | Explicit limit |
| --- | --- | --- | --- |
| CodeGraph PATH/CLI | local process use after exact installation decision | path, actual/expected version, selected strategy | not proof of indexing/query correctness |
| Graphify | bounded index/build then one read/query for this cwd | version, graph path, server status, bounded query receipt | does not permit automatic rebuild or other repositories |
| Core MCP | per-server external process/server probe | startup/reload/reconnect/shutdown status and bounded child-process cleanup counts | no generic tool approval or external writes |
| Real TUI/WSL notification | terminal and PowerShell process probe | terminal/WSL environment and success/non-fatal-failure observation | not all terminal emulators |
| Main/Worker Codex Fast | provider request | provider/model/tier evidence only, redacted | no cost/performance guarantee |
| Three top-level Agents | local runtime process probe | scheduled/start/activity/completed timestamps and calculated overlap | does not change nested synchronous design |

## 5. Completion limits

- A source lock, test plan, render snapshot, scheduler code inspection, timeout, or UI status does **not** prove real runtime behavior.
- A missing Graphify index, unavailable CLI, unavailable MCP server, provider denial, or unapproved live probe remains `BLOCKED`/`NOT_RUN_GATED`, not PASS.
- `pi-codex-fast` remains reference-only while its pinned revision lacks an established distributable license; the AILI implementation may use Pi public APIs but must not copy its code.
- No test result authorizes Git mutation, publication or release.

## 6. Acceptance request

Accepting this final test plan authorizes its verification contract and enables the separate BUILD decision for the scoped implementation. It does not authorize unlisted scope or any still-gated live probe.
