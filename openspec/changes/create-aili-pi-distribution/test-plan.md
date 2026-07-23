# Acceptance Test Plan: create-aili-pi-distribution

## Document Status

- [已知|用户] **State:** `ACCEPTED_WEB_ACCESS_REVISION` on 2026-07-23. The user explicitly accepted the complete web-access and default quota-state revision and resumed BUILD.
- [工具结果] **Generated from:** `proposal.md`, `design.md`, `tasks.md`, six capability specs, `interview.md`, `context.md`, `upstream-skill-migration.md`.
- [工具结果] **Current execution evidence:** prior product evidence applies only to unchanged historical requirements. No fresh native-integration implementation or verification evidence exists.
- [框架内] **BUILD rule:** user acceptance of this final test plan is necessary but does not grant Git init, dependency/lockfile, external repository attachment/write, commit/push, npm publish, or release permission.

## Scope Under Test

[已知|用户] This plan covers the core v1 contract plus its native-integration revision: official-Pi Package identity, thin Linux-only bootstrap, exact canonical skill snapshot, one owned integration entry, pinned native web search/quota/permission/subagent dependencies, global Pi-safe ROSE/profile resources, capability registry/doctor, provenance, and stable-release gates.

[已知|用户] macOS support, Theme/TUI/font implementation, native Windows, `pi-workflow` integration, automatic global-resource pruning, and any claim of OS isolation are outside this change. `theme-references.md` is input for a later DEFINE, not a current visual acceptance surface.

[框架内] **Current superseding scope:** the web dependency is `pi-web-access@0.13.0`, its complete upstream surface is included, and quota state maintenance is default-enabled. The final WEB-* rows below supersede earlier native-search/quota rows.

## Status Legend

- `planned`: [框架内] test contract is accepted but implementation evidence does not yet exist.
- `passed`: [框架内] fresh command/manual evidence meets the expected result.
- `failed`: [框架内] fresh evidence contradicts the expected result.
- `skipped`: [框架内] an accepted non-applicable or optional check is intentionally not run, with reason.
- `unverified`: [未验证] required evidence is unavailable, stale, or not yet executable; dependent completion claims remain blocked.

## Requirements Traceability Matrix

| ID | Requirement / source | Task package | Expected files / artifacts | Verification | Expected evidence | Status |
|---|---|---|---|---|---|---|
| PI-1 | `pi-distribution-installation`: official Pi/CLI | 1.4, 7.3, 8.2 | `package.json`, README, npm tarball | `npm run validate:package`; tarball inspection | Package identity; no replacement agent CLI | planned |
| PI-2 | thin Unix bootstrap | 7.1-7.5 | setup core, `install.sh`, tests | `npm run test:bootstrap` | clean/existing/update paths | planned |
| PI-3 | latest preflight fail-closed | 7.2, 7.5 | compatibility metadata/probes | incompatible-Pi fixture | no AILI mutation; non-zero diagnostic | planned |
| PI-4 | preserve user-owned Pi state | 7.3-7.5, 8.3 | disposable HOME fixtures | before/after hash diff | unrelated settings/auth/session/packages unchanged | planned |
| PI-5 | delegate Package lifecycle to Pi | 7.3-7.5, 8.2 | Pi package source/config fixtures | `pi install/list/remove` E2E | no duplicate ownership/receipt | planned |
| PI-6 | Linux-only scope | 7.1, 7.5, 8.3 | platform fixtures/CI | native Linux positive + macOS/Windows negative fixtures | Linux PASS; macOS/Windows explicit unsupported before mutation | planned |
| SK-1 | canonical source only | 2.1-2.7 | upstream change evidence, lock | overlay detector; upstream path inspection | no semantic Pi overlay | planned |
| SK-2 | fixed reproducible snapshot | 2.7 | lock, snapshot, hashes | `npm run validate:skills` | exact SHA/count/tree/content hashes | planned |
| SK-3 | no runtime moving-source fetch | 2.7, 8.2 | packaged snapshot | offline runtime/package test | full discovery without GitHub | planned |
| SK-4 | one compatibility row per skill | 2.2, 4.2 | inventory/compat manifest | schema + bijection validator | no missing/duplicate/stale row | planned |
| SK-5 | evidence-driven neutral migration | 2.2-2.6 | upstream inventory/reports/tests | anchor scan + OpenCode focused regressions | all anchors dispositioned | planned |
| SK-6 | drift blocks release | 2.7, 4.6 | generated snapshot/lock | deliberate edit negative test | deterministic failure, no auto-rewrite | planned |
| ROSE-1 | single owned Extension | 3.1 | one entry + helpers | local load/resource listing | exactly one AILI Extension entry | planned |
| ROSE-2 | append, do not replace system prompt | 3.2 | ROSE adapter tests | captured `before_agent_start` fixture | Pi base + appended ROSE/runtime | planned |
| ROSE-3 | five lifecycle entrypoints | 3.3 | five prompt files | Package discovery + content assertions | exact four modes + local review | planned |
| ROSE-4 | natural-language intent/gates | 3.2-3.3 | routing fixtures | prompt/evaluator tests | correct mode; slash grants no authority | planned |
| ROSE-5 | project rules precedence | 3.5 | project-rule fixtures | with/without `AGENTS.md` tests | rules narrow; facts not fabricated | planned |
| ROSE-6 | resource conflict visibility | 3.4, 4.4 | conflict fixture | doctor conflict test | non-pass + exact source | planned |
| SUB-1 | exactly 19 Pi profiles | 5.2 | generated profiles/manifest | role generator validator | 19 expected, no unexpected/missing semantics | planned |
| SUB-2 | fresh/single-use/terminal | 5.3, 5.7 | orchestrator/process fixtures | repeated role + stale-ID tests | distinct UUID/PID; resume rejected | planned |
| SUB-3 | concurrency two | 5.3, 5.7 | semaphore tests | three-task concurrency fixture | active never exceeds 2 | planned |
| SUB-4 | no recursive delegation | 5.4, 5.7 | child resource fixture | child tool inventory/invocation | no `aili_task`; explicit limitation | planned |
| SUB-5 | authority intersection | 5.4, 5.7, 6.4 | policy fixtures | parent/role/mode matrix | no widening path | planned |
| SUB-6 | bounded stream/result protocol | 5.5, 5.7 | protocol schema/limits | normal/oversize/malformed fixtures | 50 KiB final cap; explicit error/truncation | planned |
| SUB-7 | Unix process-tree cancellation | 5.6-5.7 | process-tree fixture | AbortSignal/Ctrl+C test | no orphan; exactly-once cancelled result | planned |
| SUB-8 | representative auth paths | 5.8 | sanitized auth fixtures/log scan | API-key + supported login path test | child works; no copied/logged secret | unverified |
| PERM-1 | standard starts each session | 6.1 | mode-state tests | two-session reset fixture | each starts standard | planned |
| PERM-2 | bounded project-local automation | 6.2-6.3, 6.6 | policy fixtures | ordinary local read/write/command cases | mode-level prompt omitted only when all ceilings allow | planned |
| PERM-3 | policy intersection | 5.4, 6.2-6.4 | policy matrix | allow/ask/deny cross-product | deny/narrow wins | planned |
| PERM-4 | unknown/headless fail-closed | 6.3-6.4, 6.6 | command/headless fixtures | ambiguous shell + no-UI ask | ask/deny; never default allow | planned |
| PERM-5 | canonical path/secret boundary | 6.2, 6.6 | path/symlink/secret fixtures | realpath/symlink/credential tests | external/secret blocked and redacted | planned |
| PERM-6 | shortcut + slash fallback | 6.5 | keybinding/command/status tests | direct event + terminal/manual matrix | session toggle; visible; fallback works | planned |
| PERM-7 | redacted permission audit | 6.2, 6.6 | audit fixtures | seeded-secret scan | rule/decision retained; secret absent | planned |
| CAP-1 | complete registry schema | 4.1 | `manifests/capabilities.json` | schema/reference validator | no duplicate/dangling/missing fields | planned |
| CAP-2 | exclusive compatibility states | 4.2 | skill compatibility manifest | state/evidence validator | one valid state per skill | planned |
| CAP-3 | explicit optional packs | 4.3 | pack metadata/runtime behavior | absent-pack/side-effect tests | SKIP/WARN; no default install | planned |
| CAP-4 | human + JSON doctor | 4.4-4.5 | doctor implementation/schema | healthy/failure snapshots | versions/hashes/status; non-pass failures | planned |
| CAP-5 | blocked prevents stable release | 4.6, 8.4 | release validator | seeded blocked/missing fixture | stable gate fails with exact record | planned |
| CAP-6 | provenance gates reuse | 5.1, 8.1 | notices/SBOM/audit records | provenance validator | exact source/license/change or reference-only | planned |
| CAP-7 | no silent doctor success | 4.5 | timeout/malformed/unavailable fixtures | fault injection | ERROR/UNVERIFIED, never PASS | planned |

## Decision and Risk Traceability Matrix

| ID | Decision / risk | Source | Tasks | Verification / inspection | Required evidence | Status |
|---|---|---|---|---|---|---|
| D-1 | Official Pi, no fork/OMP/rebrand | `context.md`, `proposal.md` | 1.4, 3.1, 8.2 | package/bin/dependency inspection | no alternate runtime/CLI | planned |
| D-2 | Canonical正文 changes upstream only | `interview.md` Q14; `design.md` §2-3 | 2.1-2.7 | overlay detector + upstream commit evidence | one正文 owner | planned |
| D-3 | Owned child-process adapter | `design.md` §5 | 5.1-5.8 | architecture/source/provenance inspection + E2E | official pattern + bounded AILI semantics | planned |
| D-4 | Session-only bounded YOLO | `interview.md` F2; `design.md` §6 | 6.1-6.6 | mode/security matrix | no persistence or high-risk auto-approval | planned |
| D-5 | Thin bootstrap | `interview.md` F3; `design.md` §8 | 7.1-7.5 | ownership/state diffs | no settings/receipt duplication | planned |
| D-6 | Theme/TUI/font deferred | `interview.md` F4 | 1.4, 8.5 | manifest/scope inspection | no theme implementation/resource in current Package | planned |
| R-1 | Pi latest breaks API | `design.md` Risks | 7.2, 7.5, 8.3 | incompatible/latest fixture + scheduled CI | pre-mutation fail-closed | planned |
| R-2 | Skill false compatibility | `design.md` Risks | 2.2-2.7, 4.2, 8.4 | full inventory/anchor/behavior matrix | no discovery-only PASS | planned |
| R-3 | Child orphan/unbounded output | `design.md` Risks | 5.5-5.7 | process/protocol fault injection | no orphan; all caps explicit | planned |
| R-4 | Child auth leaks credentials | `design.md` Risks | 5.8, 8.3 | seeded-secret scan/sanitized auth E2E | zero credential exposure | unverified |
| R-5 | Shortcut unavailable | `design.md` Risks | 6.5, 8.3 | terminal/tmux/manual matrix | `/aili-mode` always usable | failed — 2026-07-23 user-reported Linux terminal check did not observe the shortcut toggle |
| R-6 | Bootstrap partial failure | `design.md` Risks | 7.4-7.5 | forced AILI install failure | Pi retained; states/repair clear | planned |
| R-7 | Cross-repo drift | `design.md` Risks | 2.1-2.7 | lock/hash/upstream commit checks | reproducible snapshot | planned |
| R-8 | Third-party provenance gap | `design.md` Risks | 5.1, 8.1 | notice/SBOM/license audit | unresolved code not copied | planned |

## Focused Test Cases

### Package and bootstrap

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| INST-01 | Inspect Package manifest/resources/files allowlist | One Extension, fixed skills, five prompts, no theme, no replacement agent CLI | `npm run validate:package`; `npm pack --dry-run --json` | planned |
| INST-02 | Clean disposable Linux HOME with no Pi | Official latest Pi installed; preflight passes; AILI installed; `pi` starts | `npm run test:e2e:linux-clean` | planned |
| INST-03 | macOS invocation | Explicit unsupported result before Pi/AILI mutation | platform bootstrap fixture | planned |
| INST-04 | Existing compatible Pi, no update flag | Pi version unchanged; AILI installed | bootstrap integration fixture + before/after version | planned |
| INST-05 | Existing Pi with `--update-pi` | Official update path runs, observed version reported | bootstrap integration fixture | planned |
| INST-06 | Incompatible Pi/API fixture | Exit non-zero before AILI Package mutation | `npm run test:bootstrap -- incompatible` | planned |
| INST-07 | Force Package install failure after clean Pi install | Pi remains; AILI failure/repair command reported | fault-injection E2E | planned |
| INST-08 | Re-run setup | No duplicate resources; Pi reports installed/updated state | disposable HOME repeat test | planned |
| INST-09 | Existing settings/auth/session/other package | Unrelated hashes/content unchanged | before/after manifest diff + secret-safe inspection | planned |
| INST-10 | Native Windows fixture | Explicit unsupported result; no success claim | platform unit/integration fixture | planned |
| INST-11 | `pi list` then `pi remove` | Package visible/removable; Pi/user state retained | disposable HOME Pi commands | planned |

### Canonical skills and compatibility

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| SKILL-01 | Run full migration inventory against exact upstream SHA | Every skill/asset row includes hashes, anchors, capabilities, changes, owner, verification, status | upstream report + `upstream-skill-migration.md` checklist | unverified |
| SKILL-02 | Sync clean exact revision | Exact original snapshot and deterministic lock/hashes produced | `npm run sync:skills -- --source <approved-path>` | planned |
| SKILL-03 | Sync dirty/wrong/incomplete revision | Refused; prior accepted snapshot/lock unchanged | sync negative fixtures | planned |
| SKILL-04 | Manually edit generated snapshot | Drift validator fails with canonical remediation | `npm run validate:generated` | planned |
| SKILL-05 | Run without upstream network | All embedded skills discoverable; no runtime fetch | offline Pi load test | planned |
| SKILL-06 | Add skill without inventory row | Treated blocked; stable gate fails | manifest fault injection | planned |
| SKILL-07 | Duplicate/stale inventory row | Validator fails exact rows | schema/bijection test | planned |
| SKILL-08 | OpenCode regression after canonical neutralization | Existing focused OpenCode behavior remains passing or blocks migration | upstream-owned test evidence | unverified |
| SKILL-09 | Search all正文/scripts/references/assets for backend anchors | Every hit dispositioned; no unclassified hit | pinned-tree scan report | unverified |

### ROSE and lifecycle

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| ROSE-01 | Load Package locally | One owned Extension entry; helpers not auto-loaded | Pi resource listing/local load harness | planned |
| ROSE-02 | Capture `before_agent_start` | Pi base prompt retained, ROSE/runtime appended | Extension event unit test | planned |
| ROSE-03 | Discover five prompts | Exact five names and intended separation | Pi prompt discovery test | planned |
| ROSE-04 | Natural-language DEFINE/BUILD routing | Correct mode; missing BUILD gate blocks | prompt/evaluator fixture | planned |
| ROSE-05 | Project rules narrow behavior | Rules retained and passed to task context | project fixture | planned |
| ROSE-06 | No project rules | Absence reported where material; no fabricated commands/facts | empty-project fixture | planned |
| ROSE-07 | Prompt/command/shortcut collision | Doctor reports source and non-pass | conflict fixture | planned |

### Subagent runtime

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| SUB-01 | Validate role generation | Exactly 19 complete Pi profiles | `npm run validate:roles` | planned |
| SUB-02 | Invoke same role twice | Distinct UUID/PID; no resumable context | orchestrator integration test | planned |
| SUB-03 | Submit old task ID | Rejected without child spawn | stale-ID negative test | planned |
| SUB-04 | Submit two tasks | Both may run; active `2/2` | concurrency fixture | planned |
| SUB-05 | Request third task | Queue/reject explicit; active never >2 | concurrency fixture | planned |
| SUB-06 | Child attempts delegation | No `aili_task`; limitation returned | child tool inventory/negative prompt | planned |
| SUB-07 | Parent/role/mode ceiling matrix | Narrowest policy wins | generated policy matrix | planned |
| SUB-08 | Valid streamed child result | Safe status + schema-valid final result | JSONL fixture | planned |
| SUB-09 | Oversize line/stderr/details/final result | Explicit bounded failure/truncation; no false PASS | protocol limit fixtures | planned |
| SUB-10 | Malformed JSONL/result | Bounded protocol error | malformed fixtures | planned |
| SUB-11 | Ctrl+C with descendant process | Process group gone; one cancelled result; no orphan | Unix process-tree fixture | planned |
| SUB-12 | Non-zero exit with stderr | Redacted bounded failure; no AILI task retry | child failure fixture | planned |
| SUB-13 | Representative auth paths | Child works without credential copy/logging | sanitized API-key/login E2E + secret scan | unverified |

### Permission modes

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| PERM-01 | Start two sessions | Each begins `standard`; no persisted YOLO | mode unit/integration test | planned |
| PERM-02 | Toggle shortcut | One session-only transition and visible status | Extension shortcut event test | planned |
| PERM-03 | Use `/aili-mode` fallback | Same transition when shortcut unavailable | command integration test | planned |
| PERM-04 | Ordinary project edit in bounded YOLO | Allowed only if all policy ceilings allow | policy matrix | planned |
| PERM-05 | Role denies otherwise ordinary action | Denied despite mode | policy matrix | planned |
| PERM-06 | External/symlink-escaped path | Exact ask/deny; never auto-approved | path fixtures | planned |
| PERM-07 | Credential/auth target | Hard deny and redacted audit | seeded-secret fixtures | planned |
| PERM-08 | Destructive/push/publish/release | Exact ask/deny remains | operation fixtures | planned |
| PERM-09 | Ambiguous complex shell | Ask/deny, not default allow | parser/classifier corpus | planned |
| PERM-10 | Headless ask | Denied with approval-required reason | no-UI fixture | planned |
| PERM-11 | Audit output secret scan | Required metadata present; sensitive values absent | `npm run test:audit-redaction` | planned |
| PERM-12 | Terminal/tmux shortcut matrix | Shortcut works where supported; fallback always works | manual matrix + terminal docs | failed — shortcut did not visibly switch from standard to bounded-yolo in the user’s Linux terminal; slash fallback displayed standard |

### Registry, doctor, and release

| Case | Test | Expected result | Command / evidence source | Status |
|---|---|---|---|---|
| DOC-01 | Validate capability registry | No duplicate/dangling/missing fields | `npm run validate:capabilities` | planned |
| DOC-02 | Validate skill compatibility bijection/status | Exactly one valid evidence-backed row per skill | `npm run validate:compatibility` | planned |
| DOC-03 | Optional pack absent | Runtime/doctor `SKIP/WARN` + guidance; no claimed execution | optional-pack fixture | planned |
| DOC-04 | Optional pack requests external state | Core refuses automatic side effect absent separate contract/approval | side-effect fixture | planned |
| DOC-05 | Healthy doctor human/JSON | PASS core + versions/hashes; optional separated | `npm run test:doctor -- healthy` | planned |
| DOC-06 | Required probe missing/fails/times out/malformed | Non-pass ERROR/UNVERIFIED with bounded diagnostic | doctor fault injection | planned |
| DOC-07 | Seed unexplained blocked item | Stable release validation fails exact item | `npm run validate:release` | planned |
| DOC-08 | Audited third-party adaptation | Notice/SBOM source/license/files/changes/tests present | `npm run validate:provenance` | planned |
| DOC-09 | Unclear license source | Code remains reference-only | provenance negative fixture + diff inspection | planned |

## Manual and Environment Checks

| ID | Check | Expected result | Evidence | Status |
|---|---|---|---|---|
| MAN-1 | Linux terminal install/start/remove | User can run one bootstrap, then `pi`; removal preserves user state | sanitized command log | unverified |
| MAN-2 | macOS bootstrap invocation | Explicit unsupported result before mutation; no support claim | sanitized command log or platform fixture | planned |
| MAN-3 | tmux/terminal shortcut and `/aili-mode` | Mode state visible; command fallback always usable | terminal/version matrix | failed — current-session user evidence showed `AILI: standard` and no observed shortcut transition |
| MAN-4 | Real provider child task | Fresh child completes; no secret in logs/artifacts | redacted evidence bundle | unverified |
| MAN-5 | Package docs/security claims | No claim of sandbox, official endorsement, Windows support, or verified optional capability without evidence | human diff inspection | planned |

## Planned Verification Commands

```bash
npm run typecheck
npm test
npm run validate:generated
npm run validate:package
npm run validate:skills
npm run validate:roles
npm run validate:capabilities
npm run validate:compatibility
npm run validate:provenance
npm run validate:release
npm run test:bootstrap
npm run test:integration
npm run test:audit-redaction
npm run test:doctor
npm run test:e2e:linux-clean
npm pack --dry-run --json
openspec validate create-aili-pi-distribution --strict
```

[框架内] These commands are expected interfaces to be created by tasks; until they exist and run freshly, their rows remain `planned`/`unverified` rather than passed.

## Exit Criteria

- [框架内] All six capability specs are covered by fresh test evidence; no required matrix row is failed or unverified at SHIP.
- [框架内] Every embedded skill and all 19 roles have complete compatibility/provenance/verification records; stable candidate has no unexplained `blocked`.
- [框架内] Linux clean/repeat/failure flows pass; macOS and native Windows are documented unsupported, fail before mutation, and are never reported verified.
- [框架内] No child process orphan, recursive delegation, stale-context reuse, concurrency >2, silent output loss, permission widening, noninteractive ask allow, secret leakage, or false doctor PASS is observed.
- [框架内] Package dry-run contains only intended resources/licenses/notices and no secret, unrelated artifact, semantic skill overlay, or theme implementation.
- [框架内] Final implementation diff, OpenSpec strict validation, documentation, security claims, and current upstream/Pi revisions are reconciled with this plan.

## Acceptance Record

- [已知|用户] **Current acceptance:** `ACCEPTED_WEB_ACCESS_REVISION` on 2026-07-23; the user selected “接受并恢复 BUILD” after the full web-access surface, side effects, default quota state, test plan, and replacement-dependency approval effect were presented.
- [工具结果] **Waivers:** none.
- [工具结果] **Named residuals accepted as completion evidence:** none; rows marked `planned`/`unverified` still require fresh BUILD/SHIP evidence and cannot support completion claims.
- [框架内] **Effect of acceptance:** it permits the revised BUILD contract only. Dependency/lockfile changes and each real `~/.pi/agent/` write remain separately governed operations.

## Superseding Native-Integration Acceptance Revision — 2026-07-23

[框架内] All earlier rows concerning the owned child lifecycle, `standard`/`bounded-yolo`, `/aili-mode`, `Ctrl+Shift+Alt+A`, or per-start static ROSE injection are historical and superseded. Their old pass/fail results cannot be used as evidence for this revision.

| ID | Requirement | Expected fresh evidence | Status |
|---|---|---|---|
| INT-1 | One owned Extension plus four exact production dependencies | package/lock/provenance validator proves exact pins; only one AILI extension entry loads | passed |
| INT-2 | Native `pi-web-search` delegation | superseded by the accepted `pi-web-access` WEB-1 through WEB-5 rows | superseded |
| INT-3 | `pi-quota-status` delegation | disposable HOME fixture observes quota registration/config without touching the real Pi home | passed |
| INT-4 | Vendor permission UX | fixture proves only `Default/Plan/Build/YOLO`, `/perm`, `Alt+M`; old AILI mode command/shortcut are absent | passed |
| INT-5 | Sandbox degradation | Linux fixtures cover usable Bubblewrap and missing/incompatible prerequisites; output never asserts isolation | passed |
| INT-6 | Pi-subagent lifecycle ownership | adapter API test proves spawn/cancel/artifact call path; old owned lifecycle is absent from runtime composition | passed |
| INT-7 | AILI child policy boundary | role/tool/path/headless matrix proves max two, no recursion/resume/background/worktree/retry, and non-empty write boundaries | passed |
| INT-8 | Global prompt resource | disposable HOME tests create/update only marker-bounded AILI block; preserve unrelated content; malformed markers fail without mutation | passed |
| INT-9 | Global role resources | disposable HOME tests install exactly 19 namespaced profiles; unowned collision fails; stale profiles are reported but not removed | passed |
| INT-10 | Pi-safe ROSE adapter | template/content test proves retained ROSE principles and excluded OpenCode-only protocol | passed |
| INT-11 | Exact provenance and doctor | NOTICE/SBOM/registry/doctor identify four integrations, global state, sandbox state and missing-resource state | passed |
| INT-12 | Authorized real-global probe | only after a distinct exact approval, a minimal `~/.pi/agent/` installation/update check verifies targets; otherwise this row remains unverified | passed |

### Revised verification sequence

1. [框架内] Run `openspec validate create-aili-pi-distribution --strict` against the revised artifacts before requesting acceptance.
2. [框架内] After acceptance and dependency/lockfile approval, run `npm run typecheck`, focused integration tests, provenance/registry validation, and package dry-run in the repository.
3. [框架内] Run integration tests only with fakes/disposable HOME until an exact real-global write approval exists.
4. [框架内] Treat native provider network tests, real quota/auth state, and real global resource installation as unverified unless their own operation approvals and fresh evidence exist.

### Revised exit criteria

- [框架内] INT-1 through INT-11 have fresh passing evidence, with no old owned mode/lifecycle surface left active.
- [框架内] INT-12 is passing only after a separately approved real-global probe; otherwise no global-installation completion claim is permitted.
- [框架内] No test, doctor, README, or package claim describes vendor sandbox availability as OS isolation or claims unperformed external writes.

## Superseding Web-Access and Quota Revision — 2026-07-23

[已知|用户] The revised integration uses the complete `pi-web-access` upstream surface and default `pi-quota-status` state maintenance. Earlier `pi-web-search` and quota rows are historical only.

| ID | Requirement | Expected fresh evidence | Status |
|---|---|---|---|
| WEB-1 | Exact replacement dependency | package/lock/provenance validation proves `pi-web-access@0.13.0` replaced `pi-web-search@1.3.1`; the other three pins remain exact | passed |
| WEB-2 | Complete web-access surface | fixture observes `web_search`, `fetch_content`, `get_search_content`, curator commands, and bundled skill discovery under the single AILI entry | passed |
| WEB-3 | Visible fallback and side effects | doctor/docs identify auto provider order, config/credential paths, clone cache, PDF/video, temporary curator, and browser-cookie opt-in; no false provider/boundary claim | passed |
| WEB-4 | Default quota state | disposable HOME observes registration/config behavior; an separately approved real AILI session confirms only that the declared global state file is maintained, without reading its content | passed |
| WEB-5 | Permission/provenance coverage | permission fixtures and provenance cover web-access custom tools and side effects without reimplementing them | passed |

[框架内] Acceptance permits this revised BUILD contract only. A subsequent exact dependency operation must remove the installed `pi-web-search` dependency and add `pi-web-access`; no production integration edit may begin before that separate operation is approved.
