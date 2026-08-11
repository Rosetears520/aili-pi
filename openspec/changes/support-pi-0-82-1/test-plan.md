# 测试文档：support-pi-0-82-1

## 0. 文档元信息与状态

- 来源：本change的proposal/context/interview/design/tasks/spec、当前package/runtime/permission/persistent-Agent/bootstrap/tests、Pi `v0.82.1` release/tag和官方npm artifacts。
- 目标与当前本地实现：精确 `@earendil-works/pi-{coding-agent,agent-core,ai,tui}@0.82.1`；dependency/lockfile已按两次明确批准完成对齐。
- 状态：`accepted / locally implemented / deterministic verification passed`。
- 本版已完成persistent `task`/`hub` realignment；不存在legacy `@agwab` BUILD任务。

## 1. 被测对象、完成claim与边界

- **被测对象：** exact0.82.1 baseline/lock/bootstrap/evidence、wrapped bash context、parent/persistent-child host/model resolution、0.82.1 Extension/runtime/catalog/Zentui兼容性。
- **本地完成claim：** AILI在deterministic local evidence层支持精确Pi0.82.1；bootstrap拒绝0.82.0及更低版本；wrapped bash保留当前Pi environment；parent和persistent child继续使用Pi registry metadata且AILI不注入372K覆盖；旧host/live evidence不伪装为current pass。
- **不支持的claim：** 未授权前不声称真实TUI/release-ready。
- **禁止路径：** Pi fork、node_modules/catalog手改、用户models/auth/session写入、legacy subagent恢复、其他dependency升级、commit/push/publish/release。

## 2. 需求 / 决策 / 风险追踪

| ID | Requirement / decision / risk | Source | Tasks | Files / artifacts | Verification | Status |
|---|---|---|---|---|---|---|
| BASE-0821 | exact0.82.1 dependency/bootstrap/evidence | spec Req1; D1 | 2.1-2.4 | package/lock/bootstrap/registry/manifests/docs | installed identity + bootstrap + generated evidence | passed |
| BASH-0821 | local/sandboxed full ExtensionContext parity | spec Req2-3; retained A | 3.1-3.3 | permission wrapper + integration fixtures + README | persistent/ephemeral five-variable matrix | passed |
| MODEL-UPSTREAM | parent/child preserve Pi registry metadata; no AILI372K override | spec Req4; D3 | 4.1 | persistent production/model fixtures | one-shot/profile/fallback model checks + no-provider-wrapper inspection | passed |
| INTEG-0821 | package runtime loads on actual0.82.1 | spec Req5 | 4.2-4.3 | extension/runtime/permission/Zentui tests | actual dependency load and handler inventory | passed (real TUI remains Unverified) |
| LIVE-STALE | 0.81.1 live evidence cannot pass0.82.1 | D5 | 2.3,5.3,6.4 | live manifest/registry/release validator | current identity rejection | passed / fresh live evidence Unverified |
| CACHE-0821 | native summary excluded from eligible cache denominator | spec Req6 | 5.2 | docs/direct downstream references | source + contract inspection | passed |
| SCOPE-0821 | no prohibited mutation/claim | boundaries | 6.3 | final diff/tarball/status | scoped inspection | passed |

## 3. Selected automated and inspection checks

| Claim | Command / inspection | Expected evidence | Does not prove |
|---|---|---|---|
| Exact dependency graph | `npm ls @earendil-works/pi-coding-agent @earendil-works/pi-ai @earendil-works/pi-agent-core @earendil-works/pi-tui`; scoped package/lock inspection | declared/installed graph resolves0.82.1-compatible exact identities | provider/TUI behavior |
| Bootstrap floor | `npx vitest run tests/bootstrap/bootstrap.test.ts` | 0.82.0 rejected before mutation;0.82.1 accepted | real installer network |
| Parent/persistent child | persistent-Agent model-selection/runtime focus plus source inspection | current/one-shot/profile/fallback use Pi registry metadata; no AILI Provider wrapper/context map exists | external provider success |
| Bash parity/security | `npx vitest run tests/integration/permission-modes.test.ts tests/integration/permission-sandbox.test.ts tests/integration/generic-permission.test.ts tests/unit/persistent-agent-permission.test.ts` | five variables/current context; stale removal; controls unchanged | OS isolation or raw-session secrecy |
| Actual host loading | extension-load/package-runtime/persistent-agent-host-seams focus under installed0.82.1 | one AILI entry; no import/duplicate handler error | interactive visuals |
| Provenance/evidence | package/provenance tests; `npm run validate:provenance`; `npm run validate:compatibility`; `npm run validate:capabilities` | no stale active host identity; generated outputs match canonical owners | release approval |
| Full local regression | `npm run typecheck`; `npm test`; generated/roles/package validators | project behavior remains green | live provider/TUI |
| Release fail closed | `npm run validate:release` | before separately approved probes, non-pass names only current unresolved evidence plus independent license blocker | release-ready |
| Package/text integrity | `npm pack --dry-run --json`; `git diff --check`; `openspec validate support-pi-0-82-1 --strict` | package excludes forbidden paths; strict spec valid; no whitespace errors | publish/commit authority |

## 4. Conditional and negative scenarios

| ID | Condition | Expected | Status |
|---|---|---|---|
| MODEL-01 | each exact `openai-codex/gpt-5.6-{sol,terra,luna}` without user override | Pi 0.82.1 effective metadata remains272K; no AILI substitution | passed |
| MODEL-02 | valid user `models.json` context override exists | documented Pi user layer wins without an AILI Provider wrapper | passed by no-wrapper/source boundary |
| CHILD-01 | one-shot/profile/parent fallback selects target | child session receives the same Pi registry model metadata | passed |
| ENV-01 | persistent local/sandboxed bash | five `PI_*` values match context | passed |
| ENV-02 | ephemeral bash with stale ambient values | no stale values; no `PI_SESSION_FILE` | passed |
| TUI-01 | no authorized real0.82.1 terminal | retain `UV-TUI-0821-1` | manual/live-gated |

## 5. False-PASS checks

| Injection | Expected failure |
|---|---|
| package changes but lock/bootstrap/evidence remain0.81.1/0.82.0 | BASE-0821 fails |
| wrapper omits `ctx` on either local or sandbox path | ENV matrix fails |
| any package-owned272K→372K override or `openai-codex` Provider re-registration appears | MODEL-UPSTREAM/source inspection fails |
| parent and child resolve different registry metadata without a user override | MODEL-UPSTREAM fails |
| old0.81.1 live manifest markedcurrent | release/evidence validator fails |

## 6. Open Questions / Unverified

| Type | Item | Impact | Handling |
|---|---|---|---|
| Unverified | real Linux TUI/editor behavior on0.82.1 | TUI/release claim | bounded manual smoke or `UV-TUI-0821-1` |
| Resolved | GPT-5.6 context metadata | implementation/test scope | retainPi 0.82.1 upstream272K; no AILI Provider/model override |

## 7. Final acceptance gate

- [x] 用户已明确接受本修订后的最终测试计划并授权开始BUILD；dependency/lockfile操作另获同轮明确批准。该接受不授权用户HOME/TUI、Git、publish或release操作。
