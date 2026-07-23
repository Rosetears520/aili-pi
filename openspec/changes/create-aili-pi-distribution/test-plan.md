# Acceptance Test Plan: create-aili-pi-distribution

## Document Status

- [已知|用户] **State:** `DRAFT_GENERIC_SUBAGENT_AND_PI_NATIVE_AGENTS_SYNC_REVISION` on 2026-07-24. The prior `ACCEPTED_WEB_ACCESS_REVISION` does not accept the material public subagent/global-governance delta.
- [工具结果] **Generated from:** `proposal.md`, `design.md`, `tasks.md`, six capability specs, `interview.md`, `context.md`, `upstream-skill-migration.md`, and `subagent-runtime-revision-report.md`.
- [工具结果] **Current execution evidence:** prior product evidence applies only to unaffected historical requirements. The generic subagent and Pi-native global-AGENTS revision has no implementation or verification evidence yet.
- [框架内] **BUILD rule:** user acceptance of this revised final test plan is necessary but does not grant dependency/lockfile, external directory/global-home, external repository attachment/write, commit/push, npm publish, or release permission.

## Scope Under Test

[已知|用户] This plan covers the core v1 contract plus its native-integration revision: official-Pi Package identity, thin Linux-only bootstrap, exact canonical skill snapshot, one owned integration entry, pinned native web search/quota/permission/subagent dependencies, global Pi-safe ROSE/profile resources, capability registry/doctor, provenance, and stable-release gates.

[已知|用户] macOS support, Theme/TUI/font implementation, native Windows, `pi-workflow` integration, automatic global-resource pruning, and any claim of OS isolation are outside this change. `theme-references.md` is input for a later DEFINE, not a current visual acceptance surface.

[框架内] **Current superseding scope:** the web dependency is `pi-web-access@0.13.0`, its complete upstream surface is included, and quota state maintenance is default-enabled. The final WEB-* rows below supersede earlier native-search/quota rows. This draft additionally replaces public `aili_task` with the complete pinned `@agwab/pi-subagent@0.4.8` generic `subagent` lifecycle surface, preserves `aili.<role>` profiles as optional agents, and synchronizes portable governance mechanisms from the pinned upstream global AGENTS template.

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
| SUB-1 | generic `subagent` public contract | 10.1, 10.3 | runtime/tool discovery fixtures | schema/action registration test | `subagent` only; complete pinned action/run surface; `aili_task` absent | planned |
| SUB-2 | optional 19 `aili.<role>` profiles | 10.2 | generated profiles/manifest | global agent resolution fixture | role path works but generic/non-role run does not require it | planned |
| SUB-3 | generic lifecycle and durable artifacts | 10.1, 10.3, 10.5 | disposable run fixtures | run/status/logs/wait/interrupt/mark-background/reconcile | correct existing-run state; no fabricated new run | planned |
| SUB-4 | upstream parallel fan-out | 10.3, 10.5 | concurrency fixtures | default/max/version-bound cap, fail-fast, sibling cancel | no AILI two-child cap; documented upstream cap enforced | planned |
| SUB-5 | worktree and external `cwd` | 10.5 | disposable Git/external fixtures | explicit worktree success/failure/cleanup and non-credential external target | no silent worktree downgrade; permission result visible | planned |
| SUB-6 | credential hard denial | 10.4 | seeded-secret/parsed-bash fixtures | file tools and nested bash against protected paths | denied; no content in output/artifact/telemetry | planned |
| SUB-7 | sandbox and provider domains | 10.6 | sandbox fixtures | false, deny-all, explicit-domain, unavailable paths | effective domains/degradation visible; no isolation claim | planned |
| SUB-8 | structural non-recursion | 10.3 | child tool inventory fixture | generic worker attempts delegation | no child `subagent` tool | planned |
| SUB-9 | representative auth paths | 10.6 | sanitized auth fixtures/log scan | API-key + supported login path test | child works; no copied/logged secret | unverified |
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
- [框架内] No child process orphan, recursive delegation, silent lifecycle-state loss, credential-path disclosure, permission widening, noninteractive ask allow, silent worktree downgrade, misleading sandbox claim, or false doctor PASS is observed. Upstream version-bound concurrency is allowed and verified rather than capped by AILI at two.
- [框架内] Package dry-run contains only intended resources/licenses/notices and no secret, unrelated artifact, semantic skill overlay, or theme implementation.
- [框架内] Final implementation diff, OpenSpec strict validation, documentation, security claims, and current upstream/Pi revisions are reconciled with this plan.

## Acceptance Record

- [工具结果] **Historical acceptance:** `ACCEPTED_WEB_ACCESS_REVISION` on 2026-07-23 covered the then-current web-access/quota/native-integration contract only; it is not acceptance for the 2026-07-24 generic-subagent/global-AGENTS revision.
- [已知|用户] **Current acceptance:** `ACCEPTED_GENERIC_SUBAGENT_AND_PI_NATIVE_AGENTS_SYNC_REVISION` on 2026-07-23; the user explicitly replied “接受”.
- [工具结果] **Waivers:** none.
- [工具结果] **Named residuals accepted as completion evidence:** none; rows marked `planned`/`unverified` still require fresh BUILD/SHIP evidence and cannot support completion claims.
- [框架内] **Effect of acceptance:** it permits task 10 BUILD contract only. Dependency/lockfile changes and each real external-directory, sandbox, provider, or `~/.pi/agent/` write remain separately governed operations.

## Superseding Native-Integration Acceptance Revision — 2026-07-23

[框架内] All earlier rows concerning the owned child lifecycle, `standard`/`bounded-yolo`, `/aili-mode`, `Ctrl+Shift+Alt+A`, or per-start static ROSE injection are historical and superseded. Their old pass/fail results cannot be used as evidence for this revision.

| ID | Requirement | Expected fresh evidence | Status |
|---|---|---|---|
| INT-1 | One owned Extension plus four exact production dependencies | package/lock/provenance validator proves exact pins; only one AILI extension entry loads | passed |
| INT-2 | Native `pi-web-search` delegation | superseded by the accepted `pi-web-access` WEB-1 through WEB-5 rows | superseded |
| INT-3 | `pi-quota-status` delegation | disposable HOME fixture observes quota registration/config without touching the real Pi home | passed |
| INT-4 | Vendor permission UX | fixture proves only `Default/Plan/Build/YOLO`, `/perm`, `Alt+M`; old AILI mode command/shortcut are absent | passed |
| INT-5 | Sandbox degradation | Linux fixtures cover usable Bubblewrap and missing/incompatible prerequisites; output never asserts isolation | passed |
| INT-6 | Pi-subagent lifecycle ownership | superseded by GSA-1 through GSA-9 generic lifecycle coverage | superseded |
| INT-7 | AILI child policy boundary | superseded by GSA-2 through GSA-6; no former two-child/project-only contract | superseded |
| INT-8 | Global prompt resource | superseded by GSA-10/GSA-11 source-derived adapter and preservation coverage | superseded |
| INT-9 | Global role resources | retained by GSA-2 and requires fresh generic-agent coverage | superseded |
| INT-10 | Pi-safe ROSE adapter | superseded by GSA-10 source pin/mapping/exclusion coverage | superseded |
| INT-11 | Exact provenance and doctor | superseded for changed subagent/global-template records by GSA-12 | superseded |
| INT-12 | Authorized real-global probe | only after a distinct exact approval, a minimal `~/.pi/agent/` installation/update check verifies targets; otherwise this row remains unverified | passed |

### Revised verification sequence

1. [框架内] Run `openspec validate create-aili-pi-distribution --strict` against the revised artifacts before requesting acceptance.
2. [框架内] After acceptance and dependency/lockfile approval, run `npm run typecheck`, focused integration tests, provenance/registry validation, and package dry-run in the repository.
3. [框架内] Run integration tests only with fakes/disposable HOME until an exact real-global write approval exists.
4. [框架内] Treat native provider network tests, real quota/auth state, and real global resource installation as unverified unless their own operation approvals and fresh evidence exist.

### Historical native-integration exit criteria

[框架内] The following criteria are historical for the generic-subagent/global-AGENTS delta; GSA-1 through GSA-12 define the current affected exit criteria.

- [框架内] INT-12 remains passing only for its prior separately approved real-global probe; any changed global-adapter installation claim needs GSA-11 evidence and a fresh exact approval.
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

## Superseding Global Skill Synchronization Revision — 2026-07-23

[已知|用户] The user selected `~/.agents/skills/` as the sole runtime source for AILI skills. A Pi-managed npm package install/update replaces only existing same-name global skill directories from the package's fixed embedded snapshot; it never creates package-only directories or alters differently named user skills. The package retains the snapshot but does not register it through `pi.skills`.

| ID | Test | Expected result | Evidence | Status |
|---|---|---|---|---|
| GSK-1 | Existing same-name global directory | Replaced exactly from the embedded snapshot; no stale file remains | disposable-HOME sync test | planned |
| GSK-2 | Global-only and package-only names | Both remain absent/unmodified as applicable | disposable-HOME sync test | planned |
| GSK-3 | Unsafe same-name non-directory/symlink | No replacement occurs | negative sync fixture | planned |
| GSK-4 | Ordinary repository npm install | Synchronizer skips all global mutation outside Pi-managed npm roots | managed-root predicate fixture | planned |
| GSK-5 | Package resource manifest | Snapshot remains packaged; Pi declares only `pi-web-access`'s bundled `librarian` skill | package/integration/E2E checks | planned |

## Superseding Generic Subagent and Pi-native Global AGENTS Revision — 2026-07-24

[已知|用户] This draft reflects the approved direction only: public `subagent` replaces `aili_task`; 19 `aili.<role>` profiles remain optional; the pinned upstream lifecycle, async/actions, broad bounded fan-out, explicit worktree/external `cwd`, and configurable sandbox are exposed; credential paths remain hard-denied; external writes use active vendor permission confirmation; and portable global-AGENTS governance is synchronized through a pinned Pi-native adapter. All earlier `SUB-*`, `INT-6`, `INT-7`, and former bounded-child exit criteria are historical where they require AILI two-child/project-only/terminal behavior.

| ID | Requirement / risk | Task | Focused verification | Expected evidence | Status |
|---|---|---|---|---|---|
| GSA-1 | `subagent` replaces `aili_task` | 10.1 | extension discovery plus parameter/action schema fixture | exactly one generic tool; no legacy tool; all pinned actions accepted | passed |
| GSA-2 | Optional AILI role / generic agent / agentless path | 10.2 | disposable global-profile and fake-run fixtures | `aili.code-scout`, non-AILI named agent, and valid agentless/role-context paths are distinguishable | passed |
| GSA-3 | Durable async lifecycle | 10.3, 10.5 | fake process/artifact fixture | async run can be statused/logged/waited/interrupted/marked/reconciled without re-launch | passed |
| GSA-4 | Version-bounded broad fan-out | 10.3, 10.5 | upstream-cap fixture | documented max tasks/concurrency plus fail-fast/cancel-sibling behavior are retained; no AILI 2-cap | passed |
| GSA-5 | External non-credential access and writes | 10.5 | disposable external-root + no-UI fixtures | explicit external `cwd` accepted; vendor allow/ask/deny is visible; headless ask denies | passed |
| GSA-6 | Credential hard denial including bash | 10.4 | protected-file and nested `bash -c` fixture in each relevant permission mode | file content never reaches child output, run log, artifact, telemetry, or result | passed |
| GSA-7 | Explicit worktree | 10.5 | Git and non-Git fixtures | requested isolation creates/captures/cleans or fails loudly; no silent shared fallback | passed |
| GSA-8 | Sandbox controls | 10.6 | deny-all, explicit provider-domain, unavailable sandbox fixtures | input validation, effective domain record, visible degradation; no universal isolation claim | passed |
| GSA-9 | Child non-recursion | 10.3 | generic worker tool-inventory fixture | child excludes `subagent` under all supported backends | passed |
| GSA-10 | Pi-native AGENTS source pin/derivation | 10.7 | source-hash, generated-template, excluded-control scan | source revision/hash recorded; portable mappings present; OpenCode-only controls absent | passed |
| GSA-11 | User global prompt preservation | 10.7 | disposable-HOME marker install/update/conflict fixture | only marker-owned block mutates; unrelated content survives; no real HOME mutation | passed |
| GSA-12 | Public docs/doctor/provenance | 10.8 | package, doctor JSON, README, provenance validation | generic capability, risks, source mapping and operational limits are visible | passed |

### Revised acceptance prerequisites

1. [框架内] Run `openspec validate create-aili-pi-distribution --strict` after the revised artifacts are coherent.
2. [已知|用户] The user explicitly accepts this final revised test plan before any task 10 runtime implementation.
3. [框架内] Dependency/lockfile modification is not expected for this revision because `@agwab/pi-subagent@0.4.8` is already pinned; any discovered package change remains separately approved.
4. [框架内] Real provider, sandbox, external-directory, or `~/.pi/agent/` test operations each require separate exact approval; disposable fixtures may cover their non-production behavior.
