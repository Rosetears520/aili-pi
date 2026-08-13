# 最终测试计划：integrate-pi-web-ui-and-upstream-extensions

## 0. 文档状态与门禁

- **阶段**：BUILD。
- **计划状态**：用户已于 2026-08-13 明确接受本文件。
- **实现授权**：granted，范围为本 change 已接受的 tasks/specs；依赖、源码导入、browser/server/package 等精确操作权限仍按本计划单独记录。
- **本次行为**：依据本 change 的 `proposal.md`、`design.md`、`tasks.md`、`context.md`、`interview.md`、十一份 `specs/**/spec.md`、`AGENTS.md`、当前 `package.json`、锁定的 Pi Web 源码证据和 `DEFINE-E08-R2` plan audit 编写；截至接受时尚未运行本 change 的实现测试、浏览器、server、安装或 package 操作。
- **独立操作门禁**：依赖/lockfile、源码导入、AIcss 源码复制、browser 安装、真实进程/server/provider/browser/WSL2/performance/disposable-Git/tarball/install probe、用户 HOME、Git、publish、release 均需在执行前取得各自精确授权并绑定 task ID、target、command class 与 evidence destination。
- **浏览器落点**：测试源码位于 `tests/browser/`；需持久保留的 browser report/trace/screenshot 位于 `artifacts/test-results/browser/`；临时输出位于 ignored `.tmp/`。

## 1. 测试目标与证据等级

### 1.1 目标

1. 证明发布物仍是一个 `@rosetears/aili-pi` Package、一个 Pi Extension entry、一个按需前台 `pi-web`，普通安装/Pi 启动不拉起 Web、不把 Web 源码放入模型上下文。
2. 证明 `agegr/pi-web` 是唯一 Web code/function base，Codex、`pi-gui`、OpenCode 仅 reference-only。
3. 证明 Pi JSONL 是唯一 conversation truth；浏览不创建 `AgentSession`，mutation 仅由一个官方 Pi `AgentSession` owner 执行。
4. 证明 first-writer lease、authenticated local IPC、TUI writer→Web observer 与 Web writer→stock TUI fail-closed 的不对称合同成立。
5. 证明 snapshot/event/mutation/disposition contracts 在 gap、stale、duplicate、collision、restart、slow-client 情况下不会误写、重放或伪成功。
6. 证明 loopback 默认安全，non-loopback 缺 password/Host-Origin/allowed-root 任一项均在 listen 前失败；所有 mode 都受同一路径边界。
7. 证明 Pi Web baseline workbench、AILI Timeline、Agent/MCP projection、media、responsive/accessibility 行为成立。
8. 证明 Analytics、Stamp、BTW、Worktree 各自具备 retained important TUI entry、AILI Runtime/API、Web UI 三层，并保持隐私/安全/数据完整性边界。
9. 证明十四个 AI process component category 全部存在、license-safe、reduced-motion、bounded animation、无 hidden reasoning 泄露。
10. 证明 exact source locks、notices、licenses、provenance、SBOM、package inventory 和 clean packed install 一致。

### 1.2 证据等级

| 级别 | 含义 | 可支持 | 不可替代 |
|---|---|---|---|
| **A — 自动化** | unit/integration/fixture/typecheck/generated/package/static browser component tests；默认 disposable paths、fake clocks/processes/transports | 确定性 contract、gate、schema、state machine、redaction、package inclusion/exclusion | 真实浏览器安装、真实 TUI/Web 两进程、真实 npm tarball install、实际性能 |
| **B — operation-gated browser/process/package** | 明确获批后的 browser、real process、server、tarball、install、WSL2、performance probe | 批准环境内的真实兼容、UI、lifecycle、package 与测量结果 | 不证明所有主机/浏览器/网络；不授权 publish/release |
| **N — 不可由测试授予** | 用户 acceptance、BUILD/依赖/源码/Git/release 权限、法律最终判断 | 只能记录决定、限制和证据 | 不能被 PASS、Worker 或 checklist 替代 |

## 2. 计划中的测试与 artifact

| 领域 | 计划文件 / artifact |
|---|---|
| Package/process | `tests/unit/web-package.test.ts`、`tests/integration/web-process-lifecycle.test.ts`、更新 `tests/unit/package.test.ts` 与 package-runtime tests |
| Runtime contracts | `tests/unit/runtime-web-contracts.test.ts`、`tests/unit/runtime-event-hub.test.ts`、`tests/unit/mutation-disposition.test.ts` |
| Lease/IPC | `tests/unit/session-writer-lease.test.ts`、`tests/integration/session-writer-processes.test.ts`、`tests/integration/tui-web-projection.test.ts` |
| Access security | `tests/unit/web-request-security.test.ts`、`tests/unit/web-path-security.test.ts`、`tests/integration/web-bind-policy.test.ts`、`tests/integration/web-auth-session.test.ts` |
| Workbench/API | `tests/integration/web-session-runtime.test.ts`、`tests/integration/web-runtime-projections.test.ts`、component tests under imported/adapted Web source |
| Analytics | `tests/unit/analytics-schema.test.ts`、`tests/integration/analytics-store.test.ts`、`tests/integration/analytics-profile.test.ts` |
| Stamp | `tests/unit/stamp-timing.test.ts`、`tests/integration/stamp-session-entries.test.ts` |
| BTW | `tests/unit/btw-side-thread.test.ts`、`tests/integration/btw-runtime.test.ts` |
| Worktree | `tests/unit/worktree-policy.test.ts`、`tests/integration/worktree-runtime.test.ts` |
| AI components | component tests plus `tests/browser/ai-process-components.spec.ts` |
| Browser workbench | `tests/browser/pi-web-baseline.spec.ts`、`runtime-writer.spec.ts`、`absorbed-capabilities.spec.ts`、`responsive-accessibility.spec.ts`、`security-errors.spec.ts` |
| Durable browser evidence | `artifacts/test-results/browser/` only for selected reports/traces/screenshots/performance evidence |
| Source/provenance/package | source lock/provenance/package tests; exact tarball inventory and clean install receipts |
| Fixtures | `tests/fixtures/web-runtime/`、`tests/fixtures/analytics/`、`tests/fixtures/stamp/`、`tests/fixtures/worktrees/`、`tests/fixtures/package-inventory/`; no credentials or raw private sessions |

Exact filenames may be adjusted to the imported Pi Web source layout, but `progress.txt` must record one-to-one mapping without dropping scenarios.

## 3. Traceability matrix

状态：`PLANNED-A` 自动化，`GATED-B` 独立操作批准后执行，`LIMIT-N` 测试不可授予。当前均未执行。

### 3.1 Package、process 与 source boundary

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| PKG-01 | 单 Package、单 Extension、Web 不 eager 启动/入 context | 2.2–2.5, 13.5 | package assertions、extension-load、no-listener process fixture | install/load 0 Web process；one extension；assets 仅按需 | PLANNED-A |
| PKG-02 | foreground `pi-web`、Pi-owned `/web`、无 daemon | 2.4–2.5, 13.5 | signal/exit/repeated command/parent death tests | exactly one child；clean shutdown；无 orphan | PLANNED-A + GATED-B real process |
| PKG-03 | readiness failure、port collision、stale address、startup failure | 2.4–2.5, 13.5 | disposable ports/processes | 不报告 false ready；stale state 被清理 | PLANNED-A + GATED-B |
| PKG-04 | exact Pi 0.84.1 runtime compatibility，peer wildcard 仅 host exception | 2.2, 2.3 | package/lock/`npm ls`/runtime mismatch fixture | exact dev/resolved Pi；mismatch before mutation | PLANNED-A |
| SRC-01 | Pi Web sole base；四扩展 exact source；reference-only exclusions | 1.1, 2.1, 7.1, 8.1, 9.1, 10.1 | source lock/inventory/negative scans | URL/version/revision/archive/license/symbol mapping | PLANNED-A；source import GATED-B |
| SRC-02 | imported behavior inventory gate | 2.1a, 7.5, 8.4, 9.4, 10.4, 13.6 | source command/symbol matrix | retained/safely modified/excluded disposition before adaptation | PLANNED-A after authorized import |

### 3.2 Shared session、lease、IPC 与 versioned API

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| SES-01 | Pi JSONL sole truth；browse no AgentSession；one official mutation runtime | 3.2–3.3 | SessionManager fixtures、creation counters、real JSONL | browse count=0；writer count≤1；JSONL authoritative | PLANNED-A |
| SES-02 | first-acquired writer exactly one | 4.1–4.2 | concurrency property/multi-process fixture | one atomic winner；loser 0 mutation | PLANNED-A + GATED-B real process |
| SES-03 | release/grace/liveness/PID reuse/interruption/no steal | 4.1, 4.3 | fake clocks/process identity + crash fixtures | live owner never stolen；dead active turn interrupted before transfer | PLANNED-A + GATED-B |
| SES-04 | TUI writer→authenticated Web observer | 3.2, 4.4, 13.3 | IPC auth/spoof/read-only matrix | valid peer receives projection；mutation denied；spoof 0 data | PLANNED-A + GATED-B |
| SES-05 | Web writer→stock TUI fail closed at `session_start` | 4.4, 13.3 | extension startup/real Pi fixture | graceful shutdown/block before user mutation；visible owner reason | PLANNED-A + GATED-B |
| API-01 | snapshot/event version/epoch/sequence/cursor/gap/reset/stale | 3.1, 3.4 | contract/event state-machine tests | snapshot first；gap reset；old state ignored | PLANNED-A |
| API-02 | bounded replay/backpressure/heartbeat/reconnect | 3.4 | slow-client, visibility, disconnect fixtures | no unbounded queue；reset-required when lagged | PLANNED-A |
| API-03 | browser/TUI origin-specific gates | 3.2, 4.2, 5.2 | origin×command matrix | Browser Host/Origin；TUI private identity；all common gates | PLANNED-A |
| API-04 | general idempotency/disposition | 3.5 | duplicate/collision/in-flight/expiry/restart matrix | one execution；collision deny；unknown destructive state no blind replay | PLANNED-A |

### 3.3 Web access security 与 filesystem boundary

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| SEC-01 | loopback default；non-loopback fail before listen | 5.1 | bind matrix | 缺 password/Host-Origin/root 任一项 0 listener | PLANNED-A |
| SEC-02 | Host/Origin/same-site/auth/content/size/login | 5.2 | API request matrix | cross-site/untrusted/expired/malformed/oversize 0 route effect | PLANNED-A |
| SEC-03 | cookie rotation/expiry/logout/restart/password change | 5.2, 5.4 | auth lifecycle | old cookie rejected；no browser persistent secret | PLANNED-A |
| SEC-04 | same allowed-root policy on loopback/non-loopback；empty root=no general access | 5.1, 5.3 | lexical/realpath/traversal/symlink/empty-root matrix | protected target never accessed | PLANNED-A |
| SEC-05 | secret/IPC/bootstrap lifecycle | 2.5, 3.2, 5.4 | argv/log/storage/permission/replay/cleanup scans | mode-restricted artifact；one-use identity；redacted diagnostics | PLANNED-A |
| SEC-06 | raw Pi session path forbidden；allowed Worktree/file path permitted only in explicit capability view | 3.1, 5.3, 6.1, 10.4 | projection/UI/storage redaction fixtures | no session JSONL path；authorized exact Worktree path only in scoped view | PLANNED-A |

### 3.4 Pi Web workbench、Agent/MCP、media 与 browser

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| WEB-01 | locked Pi Web baseline features | 6.1, 13.2 | component/API + browser baseline flows | session/project/resume/branch/fork/model/files/Git/PWA behavior | PLANNED-A + GATED-B browser |
| WEB-02 | AILI Timeline、sidebars、runtime bar、Queue vs Steer | 6.2 | component + responsive browser | controls semantic distinct；material status accessible | PLANNED-A + GATED-B |
| WEB-03 | Agent/MCP truthful projection、不 connect lazy MCP、不 widen authority | 6.3 | projection/empty/error/permission fixtures | inspect start count=0；no raw config/secret | PLANNED-A |
| WEB-04 | Web media；不改变 WSL clipboard owner | 6.4 | bytes/bounds/model-capability + browser paste/drop/picker | invalid 0 attach；official Pi image content | PLANNED-A + GATED-B browser；WSL2 only if separately approved |
| WEB-05 | accessibility | 6.1–6.4, 11, 13.2 | keyboard, focus, names, contrast, reduced motion, DOM/accessibility tree | no keyboard trap；state not color/motion-only；critical automated accessibility violations=0 | PLANNED-A + GATED-B |
| WEB-06 | supported browser matrix | 13.2 | Chromium baseline required；other browsers only if explicitly added before BUILD | exact browser/version/environment receipt | GATED-B；current first-release matrix = installed Playwright Chromium on Linux/WSL2-compatible filesystem |

### 3.5 Analytics

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| ANA-01 | allowed metadata only；forbidden content reject | 7.2 | exhaustive schema/marker tests | no prompt/reply/thinking/args/results/raw error/secret/path/session ID | PLANNED-A |
| ANA-02 | normalized bounded names/cardinality | 7.2, 7.4 | long/random/high-cardinality fixtures | field length/key count bounded；unknown bucket deterministic | PLANNED-A |
| ANA-03 | opaque session scope outside model context | 7.3 | context and attribution fixtures | random scope；raw identity absent | PLANNED-A |
| ANA-04 | concurrent append、atomic segment、cleanup、crash、corruption、migration | 7.4 | multi-process/fault-injection fixtures | no lost unrelated record；corrupt segment quarantined；no false aggregate | PLANNED-A |
| ANA-05 | retention/size/time-range/all cleanup | 7.4–7.5 | store query/cleanup/browser dashboard | no automatic delete；exact outcome visible | PLANNED-A + GATED-B browser |
| ANA-06 | long-running resource bounds | 7.6 | fixed event-volume profile | peak RSS and bytes/event reported; acceptance requires no history-proportional retained heap and no unbounded category growth | GATED-B performance; numeric baseline established on candidate and recorded before release verdict |

### 3.6 Stamp、BTW、Worktree 三层 parity

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| STP-01 | versioned out-of-context entries；observable lifecycle timing | 8.2–8.3 | timing/context/retry/compact/cancel/interruption | no tool payload/raw error；no fabricated cost | PLANNED-A |
| STP-02 | serialized append、invalid/partial entry、migration | 8.2 | concurrent/crash/corrupt/version fixtures | unrelated JSONL preserved；invalid ignored visibly | PLANNED-A |
| BTW-01 | ephemeral independent thread/model/thinking/steering | 9.2 | isolation/concurrency/process-loss | main session unchanged；no false recovery | PLANNED-A |
| BTW-02 | previewed writer-gated bring-to-main/idempotency | 9.3, 3.5 | preview/deny/duplicate/restart fixtures | preview 0 mutation；writer gate；one insertion | PLANNED-A |
| WT-01 | status/add/switch/remove/prune/configure/session transition | 10.1–10.4 | disposable repos + browser/TUI parity | complete accepted inventory | PLANNED-A + GATED-B disposable Git/browser |
| WT-02 | preflight/revalidation/repo serialization | 10.2 | TOCTOU/active session/Agent matrix | changed precondition 0 mutation | PLANNED-A |
| WT-03 | no force、no branch delete、no main/dirty/unknown/active remove | 10.3 | route/UI/source negative + Git counters | forbidden option absent；repo unchanged | PLANNED-A |
| PAR-01 | Analytics/Stamp/BTW/Worktree TUI+Runtime/API+Web | 2.1a, 7.5, 8.4, 9.4, 10.4, 13.6 | three-column convergence matrix | any missing required layer = release blocker | PLANNED-A + GATED-B browser/TUI |

### 3.7 AI process components

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| AIC-01 | exact 14 categories | 11.1 | exact inventory test | Thinking State; Thinking and Reasoning; Orbs; Web Search; File Diff; Image Generation; Text Response; Streaming Text; Inline Citations; Code Block; To-do List; Data Table; Comparison Table; AI Agent Input | PLANNED-A |
| AIC-02 | license fallback | 1.3, 11.2, 12.1 | source/provenance/package scans | no unlicensed/private source/token；scope unchanged | PLANNED-A + LIMIT-N final rights judgment |
| AIC-03 | one Orb、reduced motion、offscreen/background pause | 11.3, 13.2 | component + browser visibility/reduced-motion | meaning preserved static；background work reduced | PLANNED-A + GATED-B |
| AIC-04 | no hidden reasoning/private payload | 11.4 | adversarial projection/browser state | disallowed fields unavailable in DOM/state/expansion | PLANNED-A |
| AIC-05 | animation cost | 11.5 | fixed viewport/component stress profile | no long task >50ms attributable to continuous decorative animation in selected trace; background/offscreen continuous animation task rate approaches zero; exact environment recorded | GATED-B performance |

### 3.8 Provenance、package 与 migration

| ID | Requirements / risks | Tasks | Checks | Expected evidence | Status |
|---|---|---|---|---|---|
| PROV-01 | five exact locks、MIT texts、notices、SBOM、adaptation | 1, 12.1 | provenance/generated validators | missing/mixed/stale source fails | PLANNED-A |
| PROV-02 | no five upstream runtime deps；no reference-only source | 2.2, 12.1, 13.5 | package/lock/tarball scans | only AILI adaptations + declared runtime deps | PLANNED-A |
| PROV-03 | exact tarball clean startup | 13.5 | pack/hash/extract/disposable install/start/stop | no repository-only read/download；one extension；Web ready/cleanup | GATED-B |
| MIG-01 | existing JSONL/custom entries/Agent sidecars/Analytics preserved | 12.4, 13.5 | disposable migration/rollback | no automatic user-HOME rewrite/destructive cleanup | PLANNED-A + GATED-B install |
| DOC-01 | README/doctor/detailed design consistent | 12.2–12.3 | docs/terminology/claim assertions | no daemon/symmetric observer/unsafe force/copied reference claim | PLANNED-A |

## 4. Browser acceptance matrix

Browser operation requires separate approval. Initial supported execution target is **Playwright Chromium on the current Linux environment**; WSL2 file/browser integration is a separate named probe when required. Native Windows and public Internet remain out of scope.

Minimum flows:

1. Load workbench; browse JSONL without AgentSession activation.
2. Start one Web-owned session; verify writer badge and stock-TUI conflict state.
3. Attach Web to a TUI-owned fixture through authenticated private IPC; controls remain read-only.
4. Disconnect/reconnect/gap/reset/slow-client and stale-run reconciliation.
5. Session group/resume/rename/export/safe delete; Branch versus Fork.
6. Model/provider/thinking/context status and Queue Next versus Steer.
7. Agent/MCP inspection with lazy MCP start count unchanged.
8. File, Diff, media paste/drop/picker, Worktree safe flows.
9. Analytics dashboard/store size/range cleanup; Stamp timings; BTW preview/bring-to-main.
10. All fourteen AI component categories, reduced motion, offscreen/background behavior, no private DOM/state.
11. Empty/loading/error/auth/path-denied/lease-denied/corrupt-store states.
12. Keyboard navigation, focus restoration, accessible names, responsive narrow/wide layout.

Durable trace/screenshot is collected only for a failing or acceptance-critical claim; passing every UI check does not require a screenshot swarm.

## 5. Operation authorization map

Before executing, task 1.2 must bind at least these operations separately:

| Operation | Tasks | Target/evidence |
|---|---|---|
| source import | 2.1, 7.1, 8.1, 9.1, 10.1 | exact repository paths + source-lock artifact |
| dependency/lockfile | 2.2 | `package.json`/`package-lock.json` + install/typecheck receipt |
| AIcss source copy if any | 1.3, 11.2 | exact component paths + rights/provenance |
| browser install/run | 13.2 | exact Playwright browser/version + `tests/browser/` results |
| real process/server | 13.3, 13.5 | disposable sessions/ports/IPC + process evidence |
| disposable Git | 10.2–10.4 | exact fixture repos only |
| performance | 7.6, 11.5 | fixed workloads + durable measurements |
| WSL2 | 6.4, 13.2 if needed | exact environment/probe; never implied |
| tarball creation/install | 13.5 | exact `.tgz`, hash, inventory, disposable HOME |
| final repository inspection | 14.1 where operation policy requires | task-scoped diff/source/artifact evidence |
| Git/publish/release/real user install | 14.2/later SHIP | each remains separately absent until explicitly granted |

## 6. Planned command order

These commands are a plan only. Exact scripts may be added during authorized BUILD; each final command must be written back here or to `progress.txt` before its gate is claimed.

Focused automated order:

```text
npx vitest run tests/unit/runtime-web-contracts.test.ts tests/unit/runtime-event-hub.test.ts tests/unit/mutation-disposition.test.ts
npx vitest run tests/unit/session-writer-lease.test.ts tests/integration/tui-web-projection.test.ts
npx vitest run tests/unit/web-request-security.test.ts tests/unit/web-path-security.test.ts tests/integration/web-bind-policy.test.ts tests/integration/web-auth-session.test.ts
npx vitest run tests/unit/analytics-schema.test.ts tests/integration/analytics-store.test.ts
npx vitest run tests/unit/stamp-timing.test.ts tests/integration/stamp-session-entries.test.ts tests/unit/btw-side-thread.test.ts tests/integration/btw-runtime.test.ts
npx vitest run tests/unit/worktree-policy.test.ts tests/integration/worktree-runtime.test.ts
npx vitest run tests/integration/web-session-runtime.test.ts tests/integration/web-runtime-projections.test.ts
npm run typecheck
npm run validate:provenance
npm run validate:generated
npm run validate:package
npm test
openspec validate integrate-pi-web-ui-and-upstream-extensions --strict
```

Browser command must be established in `package.json` during BUILD; accepted target shape:

```text
npm run test:browser
```

Operation-gated package/process sequence:

```text
npm pack --dry-run --json
npm pack --json
sha256sum <exact-candidate.tgz>
tar -tf <exact-candidate.tgz>
# install exact candidate into disposable HOME
# start bounded pi-web on a disposable loopback port
# verify readiness, repeated /web, shutdown, parent death, stale address, and no orphan
```

A command name does not make an operation authorized. Any failure remains a blocker or explicitly `Unverified`.

## 7. Acceptance criteria

The plan supports a BUILD/first-release completion claim only when:

1. All eleven specs remain strict-valid and task traceability is current.
2. All four absorbed capabilities pass the three-layer convergence matrix.
3. Exactly one writer is observed in automated and approved real-process evidence.
4. Both asymmetric ownership directions match the accepted contract.
5. Security/path/secret/idempotency negative cases have zero unauthorized side effects.
6. Analytics/Stamp crash, corruption, concurrency, cleanup, and migration cases are resolved.
7. All fourteen component categories pass semantic, accessibility, privacy, reduced-motion, and selected performance checks.
8. Exact candidate tarball provenance, inventory, clean install, foreground startup, and cleanup pass.
9. Remaining environment/legal/measurement limits are explicit and are not reported as PASS.
10. Completion remains separate from commit, push, publish, release, deprecation, or installation into the user's real Pi home.

## 8. Remaining `Unverified` items before BUILD execution

- Exact Analytics peak RSS and disk bytes/event under the final implementation.
- Exact animation performance on the selected candidate browser/environment.
- AIcss redistribution rights; fallback remains all fourteen independent AILI implementations.
- Exact imported-file and retained TUI command inventory until authorized source import and task 2.1a disposition.
- Real stock-Pi `session_start` shutdown/block and authenticated projection behavior until the approved process probe.
- Exact candidate package size, startup latency, and clean packed-install behavior.

These are planned verification targets, not accepted current facts.

## 9. Acceptance record

- **Final test-plan acceptance**：accepted by the user on 2026-08-13 for this exact file.
- **BUILD authorization**：granted by the user on 2026-08-13 for the accepted change scope.
- **Dependency/source/browser/server/package permissions**：remain operation-gated and must be recorded against task 1.2 before execution.
- **Git/publish/release/real user-home installation permissions**：absent.
