# Requirements Interview

- Change: `integrate-pi-web-ui-and-upstream-extensions`
- Mode: Frontier Batch Mode (user-invoked after D-02)
- Requirements-grilling state: `READY`
- Implementation authorization: granted for the accepted repository-local BUILD scope; exact risky operation gates remain controlling.

## Decision log

### D-01 — AIcss source strategy

- Decision impact: source ownership, public npm/MIT distribution, provenance, implementation scope, and component-level acceptance tests.
- Evidence:
  - AIcss currently lists nine free components and five locked components.
  - The public terms permit use of free components in personal and commercial projects, but the reviewed public material does not provide a conventional open-source license for the complete catalog.
  - Locked component source requires private account access, and the public terms prohibit redistributing or reselling components as-is.
- Options presented:
  1. Treat all fourteen AIcss components as visual/interaction references and implement AILI-owned equivalents.
  2. Adapt the nine free component sources and independently implement AILI-owned equivalents for the five locked components.
  3. Use all official sources only after separate redistribution rights are evidenced.
- User answer: `使用2吧，实现的几个可能我不太常用`
- Classification: confirmed product direction with an unresolved distribution condition.
- Decision state: `conditional`
- Recorded direction:
  - Use and adapt the nine publicly free AIcss component sources where their distribution terms permit inclusion in this public repository and npm package.
  - Do not copy, request, expose, or commit the five locked component sources or any AIcss account token.
  - Independently implement AILI-owned equivalents for Web Search, File Diff, Image Generation, Inline Citations, and Comparison Table.
  - Preserve source attribution and license/provenance evidence for every copied free component.
- Condition still requiring evidence: the nine free component terms must be shown to permit the intended source inclusion and public npm/MIT distribution. Until then, source copying remains unauthorized and the affected implementation path is blocked.
- Write-back targets after the condition and remaining architecture decisions resolve: `context.md`, `design.md`, component requirements, provenance/notices, implementation tasks, and `test-plan.md`.

### D-02 — Web UI package and release boundary

- Decision impact: dependency placement, npm installation UX, package size, CLI ownership, version coupling, and runtime loading behavior.
- Options presented:
  1. Ship the Web UI inside the existing `@rosetears/aili-pi` package.
  2. Publish a separate version-coupled workspace package.
  3. Keep the Web UI repository-only and unpublished.
- User answer: `A，改变了没事，没多大，而且不影响模型效率啥的`
- Classification: confirmed.
- Decision state: `accepted`
- Accepted requirement:
  - Ship and version the Web UI inside the existing `@rosetears/aili-pi` npm package.
  - The larger install footprint is accepted.
  - Bundled Web UI source and assets must not enter model context merely because they are installed.
  - Web runtime activation and process-resource behavior remain a separate decision; package inclusion alone does not authorize eager server startup.
- Write-back targets: package architecture, public installation/startup contract, dependency plan, package tests, and release verification.

### D-03 — Complete upstream absorption

- Decision impact: compatibility surfaces, runtime ownership, Web API design, TUI behavior, and acceptance scope for the four upstream extensions.
- User answer: `1 B`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Preserve the complete relevant behavior, data/privacy boundaries, safety rules, and important TUI public entry points of `pi-analytics`, `pi-btw`, `pi-stamp`, and `pi-worktree`.
  - Rework those capabilities behind AILI-owned runtime modules and versioned APIs rather than mechanically preserving upstream internal architecture.
  - Web UI presentation may be redesigned and does not need pixel or internal-structure parity with the upstream TUI surfaces.

### D-04 — Web UI startup boundary

- Decision impact: background processes, ports, memory use, standalone use, Pi command integration, and remote-access policy.
- User answer: `2 A`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - The same `@rosetears/aili-pi` package provides a standalone `pi-web` entry point and a Pi `/web` entry point that starts the server or reports its current address.
  - The Web server is on-demand and does not start merely because Pi or the npm package is loaded.
  - Default binding remains loopback; non-loopback access is a separately controlled mode.

### D-05 — Analytics retention

- Decision impact: local disk growth, privacy, cleanup UX, and long-running aggregate availability.
- Initial user answer: `内存占用大吗？不大的话可以长期试试看，然后这个都是些什么内容大概`.
- Explanation supplied: analytics persist content-free event metadata on disk and use streaming/bounded aggregation rather than retaining all history in memory; representative fields and prohibited content were listed, with exact resource measurements left `Unverified` until profiling.
- Final user answer: `1 a`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Retain analytics locally until explicit user cleanup.
  - Analytics are append-only, content-free metadata on disk, not a permanently in-memory copy of all events.
  - Runtime memory remains bounded through streaming/aggregation rather than loading all historical files.
  - Persist event/category metadata such as timestamps and durations, response/LLM-call counts, provider/model identifiers, reported token/cost totals, tool/skill/Agent/MCP names and outcomes, and categorized provider/tool errors.
  - Never persist prompts, assistant/thinking text, tool arguments/results, raw error bodies, credentials, cwd, or raw Pi session identifiers in analytics records.
  - Provide manual clear by time range/all and report store size; no automatic deletion is selected unless later evidence shows unacceptable growth.
- Verification limit: exact memory and disk figures are `Unverified` until implementation profiling with a long-running fixture. The acceptance requirement is bounded memory and metadata-only disk growth.

### D-06 — Upstream source integration

- Decision impact: runtime ownership, dependency graph, provenance, package reproducibility, and future upstream updates.
- User answer: `4 A`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Import exact locked source revisions of `agegr/pi-web` and the four `narumiruna/pi-extensions` packages into this repository during an authorized BUILD operation.
  - Preserve MIT license, copyright, source URL, source revision, and lock/provenance evidence.
  - Adapt the source into AILI-owned modules; the released runtime must not depend on those five upstream npm packages at runtime.
  - Upstream updates are explicit reviewed imports, never automatic replacement.

## Frontier Batch Round 1

- Status: partially complete.
- Confirmed: D-03, D-04, and D-06.
- Awaiting confirmation after explanation: D-05.
- Permission note: these requirements do not authorize source download/import, dependency or lockfile changes, Git operations, or BUILD.

### D-07 — TUI/Web single-session writer ownership

- Decision impact: message ordering, Steer/Compact/Branch safety, JSONL integrity, and multi-surface UX.
- User answer: `2 a, 谁先谁写，就这样`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - The first TUI or Web client to acquire the session writer lease is the only mutation owner for that shared Pi session.
  - Other connected surfaces receive live state and remain read-only for message send, Steer, Compact, Branch/Fork mutation, and other session-changing operations.
  - The UI must show the current writer and why mutation is unavailable.
  - Mid-turn concurrent writes and silent ownership stealing are forbidden.
- Open dependent detail: clean release and crashed-writer lease recovery.

### D-08 — Non-loopback access boundary

- Decision impact: local trust boundary, password configuration, Origin checks, file/path exposure, and startup failure behavior.
- User answer: `3b`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Default binding is loopback.
  - A non-loopback bind is explicit and fails closed unless password authentication plus Origin and allowed-root/path checks are active.
  - The product does not claim that direct public-Internet exposure is supported; HTTPS/VPN or another trusted outer channel remains operator responsibility.
  - Authentication secrets must never enter logs, analytics, session content, or packaged defaults.

### D-09 — First-release completeness gate

- Decision impact: release slicing, acceptance matrix, regression scope, and whether partial upstream absorption may ship.
- User answer: `4 a`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - The first release cannot ship until `analytics`, `btw`, `stamp`, and `worktree` each provide their important retained TUI entry points, AILI-owned Runtime/API behavior, and corresponding Web UI behavior.
  - Partial hidden absorption or Runtime-only completion is not sufficient for the first release.

## Frontier Batch Round 2

- Status: complete.
- Confirmed: D-05, D-07, D-08, and D-09.
- Permission note: these requirements do not authorize user-home configuration writes, server startup, source import, dependency/lockfile changes, Git operations, or BUILD.

### D-10 — Writer lease release and recovery

- Decision impact: safe ownership transfer after clean disconnect, connection loss, or process crash.
- User answer: `1 a`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Explicit release is immediate.
  - Unexpected disconnect receives a short bounded recovery grace period.
  - An active turn retains ownership until it settles or is durably marked interrupted.
  - A waiting surface may acquire only after liveness validation establishes that the prior owner is dead or released.
  - No force-steal action may transfer ownership mid-turn.

### D-11 — `/web`-started server lifetime

- Decision impact: hidden background processes, resource lifetime, port ownership, and shutdown behavior.
- Initial user answer: `2 b`.
- Superseding user answer: `2 a` in the immediately following complete Round 3 response.
- Initial decision state: `superseded`.
- Current classification: confirmed.
- Current decision state: `accepted`.
- Accepted requirement:
  - A server launched through Pi `/web` is owned by that Pi process and stops on its clean exit.
  - Standalone `pi-web` remains alive only while its foreground shell process remains alive.
  - No hidden daemon or detached singleton is created.

### D-12 — Analytics attribution granularity

- Decision impact: current-session analytics, local linkability, privacy, cleanup, and stamp/custom-entry integration.
- User answer: `3 a`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Generate an independent opaque analytics scope ID for each Pi session.
  - Store the mapping as a Pi custom entry outside model context.
  - Use the opaque scope for per-session aggregates without deriving it from or persisting raw Pi session IDs, paths, cwd, project labels, or session titles.

### D-13 — AIcss no-license fallback

- Decision impact: source ownership, license safety, first-release scope, and implementation effort.
- User answer: `4 a`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - If explicit public source-redistribution rights are not evidenced before implementation, copy none of the nine free component sources.
  - Independently implement AILI-owned equivalents for all fourteen AIcss component categories using public behavior and visual references only.
  - Missing AIcss redistribution rights do not block the release and do not reduce the complete component-category scope.

## Frontier Batch Round 3

- Status: complete.
- Confirmed: D-10, D-12, and D-13.
- Corrected and confirmed: D-11 uses Option A; the earlier Option B answer is superseded.
- Permission note: these requirements do not authorize server startup, source import, dependency/lockfile changes, user-home writes, Git operations, or BUILD.

## Shared-understanding confirmation

- User answer: `确认`
- Classification: confirmed.
- Decision state: `accepted`.
- Confirmation scope: the consolidated material product understanding below.
- Authorization boundary: this confirmation does not authorize BUILD, dependency/lockfile changes, source import, user-home writes, server startup, Git operations, publish, or release.

The material product frontier is empty based on current evidence. The user explicitly confirmed this consolidated understanding:

1. `@rosetears/aili-pi` remains one package and contains the complete Web UI, while Web source/assets do not enter model context merely because they are installed.
2. `agegr/pi-web` is the sole code/function base; Codex/pi-gui/OpenCode are reference-only and contribute no source, runtime, protocol, or data model.
3. The four upstream extensions retain their important TUI behavior and full capability/privacy/safety boundaries behind AILI-owned Runtime/API modules, with corresponding Web UI behavior required before first release.
4. Web startup is on demand through foreground `pi-web` or Pi `/web`; `/web` is Pi-process-owned, no hidden daemon exists, and loopback is the default.
5. Non-loopback bind is explicit and fails closed without password authentication, Origin validation, and allowed-root/path checks; direct public-Internet exposure is not claimed as supported.
6. One shared Pi session has one first-acquired writer lease. Other surfaces are live read-only; transfer occurs only after release or validated death/interruption, never through mid-turn force stealing.
7. Analytics store metadata only, retain it until explicit cleanup, keep memory bounded, use opaque per-session scopes outside model context, and expose size plus time-range/all cleanup.
8. Exact locked MIT upstream sources are imported only during separately authorized BUILD, adapted into AILI-owned modules, provenance-retained, and not used as five runtime npm dependencies.
9. AIcss strategy remains conditional for the nine public free sources; absent proven redistribution rights, all fourteen categories are independently implemented by AILI and no locked/private source or token is used.
10. Final acceptance and verification details will be made executable in the formal specs and `test-plan.md`; accepting this shared understanding still does not authorize BUILD or risky operations.

## Post-confirmation material evidence

### D-15 — TUI-first plugin delivery sequence

- Decision impact: BUILD dependency order, milestone acceptance, and deferred Web integration; it does not weaken source, privacy, safety, operation, or release gates.
- User answer: `pi web后面再做，这个是最后的；worktree如果不麻烦就和其他的一起；btw先做吧，剩下的俩都行` followed by confirmation `ok` for retained Pi TUI usability as the current acceptance standard.
- Classification: accepted material BUILD delta.
- Accepted requirement:
  - Prioritize a usable retained Pi TUI entry point and deterministic local tests for the absorbed capabilities.
  - Implement BTW first; Analytics and Stamp follow in either order; Worktree may accompany them only without delaying those paths.
  - Defer foreground Pi Web composition, Runtime/API/Web parity, browser/process/package probes, and first-release completion claims until after the TUI-first milestone.
  - Foreground Pi Web composition and all deferred Pi Web parity work remain blocked until the user gives fresh explicit approval to resume them.
  - Retain all privacy and safety boundaries, including no Worktree force removal or branch deletion.
  - TUI-first availability is not first-release acceptance and must not be reported as complete Web integration.

### D-16 — Three-plugin TUI release-preparation focus

- User answer: `先做btw、analytics、stamp这三个吧，我想尽量做完了然后发版，web的那个先只代码存在就可以了，npm安装不要。`
- Classification: accepted material BUILD delta.
- Accepted requirement:
  - Complete only BTW, Analytics, and Stamp retained Pi TUI capabilities now; Worktree is held.
  - Retain existing Pi Web source but perform no further Pi Web composition, adaptation, Runtime/API/Web parity, or browser/process work without new explicit approval.
  - Do not run `npm install`, mutate dependencies or `package-lock.json`, publish to npm, or take any Git/release action.
  - The user may later separately authorize local Analytics runtime persistence beneath Pi's agent directory and a release/publish operation; neither is implied by this delivery focus.

### D-17 — Analytics persistence, typecheck repair, and TUI-only package boundary

- User answer: `允许` authorizes the pending Analytics content-free local persistence and the one existing Web typecheck repair. The user then confirmed the proposed TUI-only package boundary: retain Web source in the repository but remove it from the published npm package, remove its installation/runtime residues, and regenerate the lock with `npm install --ignore-scripts`.
- Classification: accepted material BUILD delta and exact operation approval.
- Accepted requirement:
  - Analytics may persist only content-free metadata beneath `getAgentDir()/aili-analytics`; tests must prefer repository-local fixtures. Prompts, replies, thinking, tool arguments/results, credentials, raw session IDs, paths, and raw errors remain forbidden.
  - Repair only `src/runtime/web/process-liveness.ts` line 156 to restore typecheck; do not develop or execute Web functionality.
  - The published package excludes Web source, `/web`, `pi-web`, Web build/prepack hooks, Web output, and Web-exclusive runtime/build dependencies. Web source remains repository-only and no Web build or runtime execution occurs.
  - `npm install --ignore-scripts` is authorized exactly to regenerate `package-lock.json` for that dependency removal. No other dependency changes, Git operations, npm publication, or release actions are authorized.

### D-18 — Retain the Pi TUI web-retrieval capability

- User answer: `1 这个需要回复，这个不移除` in response to the release-readiness blocker that the D-17 dependency removal had also removed `pi-web-access`.
- Classification: accepted correction to the D-17 TUI-only package boundary and exact dependency/lockfile operation approval.
- Accepted requirement:
  - Restore and retain exactly `pi-web-access@0.13.0` as a direct runtime dependency and retain its Pi skill resource at `./node_modules/pi-web-access/skills`.
  - This package remains distinct from the paused foreground Pi Web application: it retains `web_search`, `fetch_content`, and related upstream TUI tool capability but does not restore `/web`, `pi-web`, Next/React, Web build hooks, or any Web source to the npm artifact.
  - Run exactly `npm install --ignore-scripts` to regenerate `package-lock.json` for this restoration; do not run Web build/runtime, Git, publication, or release operations.

### Q4-01 — Pi 0.84.1 stock-TUI observer asymmetry

- Evidence discovered after confirmation: official Pi `0.84.1` exposes no universal public pre-mutation veto for direct Steer/Follow-up, manual Compact, Model, Thinking, direct tree/session-manager operations, labels, and several other stock-TUI mutation paths. It also exposes no live external-JSONL reload seam for a stock TUI acting as a read-only observer. Evidence: `artifact:DEFINE-E06-pi-observer-feasibility`.
- Why material: the accepted first-writer contract said the other connected surface remains live read-only. That is fully enforceable when TUI owns and Web observes, but not when Web owns and an unmodified stock Pi TUI attaches to the same session.
- Recommendation: Option A.
- Options:
  - A. Keep official Pi `0.84.1` and no Pi fork. TUI may own while Web observes read-only. While Web owns a session, stock TUI attachment to that same session fails closed until Web releases/exits; it cannot masquerade as a safe read-only observer.
  - B. Expand scope to a replacement/gateway-mediated TUI client so both directions are symmetric. This conflicts with the current official-Pi-TUI/no-replacement boundary and materially enlarges the product.
  - C. Require an upstream Pi capability that adds a universal mutation gate and observer reload mode; block this change until such a supported host exists.
  - Custom answer.
- Trade-off: A preserves official Pi, the single-writer invariant, and current package scope with one asymmetric limitation. B or C can provide symmetric observation but changes architecture, dependency, schedule, and acceptance materially.
- User answer: `A，就这样，你可以看看pi web 这个项目怎么做的？如果做不出来，可以参考他的做法，也是不错的选择`
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Keep official Pi `0.84.1`; do not fork Pi or build a replacement TUI.
  - When stock Pi TUI owns the session writer lease, Web may attach as a live read-only observer.
  - When Web owns the session writer lease, stock Pi TUI attachment to the same session fails closed until Web releases or exits; stock Pi must not be presented as a safe read-only observer.
  - Use the locked `agegr/pi-web` implementation as the concrete source baseline and inspect its supported session/server patterns during DEFINE. Where direct reuse conflicts with the accepted AILI ownership, security, or single-writer contract, adapt its approach rather than inventing an unrelated second base.
- Write-back targets: `context.md`, `design.md`, shared-session specs, tasks, and `test-plan.md`.

## Readiness

- State: `READY`
- Detailed reason: Q4-01 is resolved with the fail-closed official-Pi asymmetric attachment contract; no material product decision remains open.
- Open material decisions: none.
- Unverified implementation evidence: exact Analytics memory/disk measurements remain pending implementation profiling and are acceptance targets rather than current facts.
- Next action: inspect the locked `agegr/pi-web` source patterns, then continue formal design, delta specs, tasks, and final test-plan definition.

## Post-readiness placement decision

### D-14 — Browser and E2E artifact placement

- Decision impact: repository rules, planned browser test files, durable reports, traces, and screenshots.
- Options presented:
  - A. Browser/Playwright tests under `tests/browser/`; durable browser evidence under `artifacts/test-results/browser/`.
  - B. Tests under `tests/e2e/`; evidence under `artifacts/test-results/e2e/`.
  - C. A custom repository-local path.
- User answer: `A`.
- Classification: confirmed.
- Decision state: `accepted`.
- Accepted requirement:
  - Place browser and Playwright test source under `tests/browser/`.
  - Place durable browser reports, traces, and screenshots under `artifacts/test-results/browser/`.
  - Temporary browser output remains under ignored repository-local `.tmp/` unless promoted as accepted durable evidence.
- Write-back targets: `AGENTS.md`, `tasks.md`, and `test-plan.md`.
- Authorization boundary: this placement decision does not authorize adding dependencies, installing browsers, starting a server, running browser tests, BUILD, Git, publish, or release.
