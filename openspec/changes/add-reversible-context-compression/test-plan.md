# 测试文档：AILI Compact

## 0. 元信息与接受状态

- Change：`add-reversible-context-compression`
- 依据：修订后的 `proposal.md`、`context.md`、`design.md`、capability spec、`tasks.md`、当前 runtime/tests、Pi 0.81.1 installed host evidence，以及 pinned ACP `v1.12.6` commit `f1a33d9f4ce55af808eb4e050717c914ed16084b` 的只读源码审计。
- Prior scope/status：2026-07-25仅接受private/local BUILD；该接受不覆盖新的package-wide relicensing/public release scope。
- Revised scope：用户已选择从目标 0.1.13 起将整个Package改为`AGPL-3.0-or-later`并保留AILI Compact；本修订定义license/provenance/tarball/release-gate验收。
- 2026-07-27 material delta：用户选择安装器自动修改用户全局 Pi 配置（选项 B），要求 AILI 成为唯一 threshold/manual/overflow 压缩与 GC owner，不再保留 Pi emergency summary fallback。
- 当前状态：**accepted for exclusive-owner BUILD on 2026-07-27**。用户回复“开始”，明确接受本修订并授权执行 tasks 10.1-10.5；目标 HOME 设置写入仍须在实现与 focused checks 通过后执行。

## 1. 追踪矩阵

| ID | Requirement / risk | Tasks | 主验证 | 当前覆盖 |
|---|---|---|---|---|
| RCC-1 | one owned runtime/namespace | 4.1, 7.1 | runtime registration + extension-load | implemented |
| RCC-2 | JSONL/tree append-only source fidelity | 2, 3, 4, 5 | byte-prefix + reload fixtures | implemented locally; broader real-host tree navigation remains Unverified |
| RCC-3 | deterministic branch/epoch replay | 2.1-2.6 | reducer/fork/reload tests | v2/reference/control replay implemented; broader tree/host evidence open |
| RCC-4 | model-addressable refs | 2.4-2.5, 4.11 | ref catalog + status→tool flow | implemented |
| RCC-5 | range/message compression and material benefit | 3.3, 4.2 | tool schema/execution + projection | implemented |
| RCC-6 | stable recap anchor and stale-call removal | 3.3, 3.6, 4.3 | recap protocol projection | implemented |
| RCC-7 | whole-output fail-open/provider serialization | 3.4-3.5 | fault + provider serializer fixtures | implemented locally |
| RCC-8 | consumed-first grouped cooling | 3.2, 5.1-5.2 | assistant-turn/candidate batch matrix | implemented |
| RCC-9 | protected prune/dedupe/purge | 4.5, 5.3-5.4 | protection/strategy/cache regression | implemented |
| RCC-10 | manual and functional commands | 4.4, 4.6-4.7 | command/tool turn matrix | implemented |
| RCC-11 | branch/nested/epoch search/decompression | 2.4, 4.4, 4.10-4.11 | current-branch/nesting/archive tests | implemented locally |
| RCC-12 | adaptive nudges and six-slot prompts | 4.8-4.9, 5.5 | config/prompt/nudge fixtures | implemented |
| RCC-13 | default-off subagent gating | 5.6 | lineage/in-flight/completion fixtures | implemented for public AILI task evidence; unknown third-party lineage fails protected |
| RCC-14 | generational GC and historical native epoch replay | 5.7-5.9, 6.1-6.2, 10.3 | lifecycle + request-boundary GC + historical compaction replay tests | existing fallback baseline implemented; exclusive request-boundary GC planned |
| RCC-15 | current-Session accounting + full cache identity/truthful telemetry | 6.3-6.8 | replay/incremental/tree/reload + identity/accounting/projection sequence | implemented locally; live hit rate remains UV-LIVE-1 |
| RCC-16 | bounded UI and doctor health | 6.5-6.6, 6.9, 7.2 | default-on left/right aligned-column presentation/runtime widget + health/redaction | doctor/runtime widget implemented; live resize remains Unverified |
| RCC-17 | prospective package-wide AGPL disposition | 1.3-1.4, 7.4, 8, 9 | exact license/provenance/SBOM/tarball/release checks | implemented local candidate evidence retained |
| RCC-18 | exclusive AILI ownership + user-global Pi disablement | 10.1-10.5 | bootstrap fault fixtures + all-reason hook matrix + independent major-GC tests + doctor/settings inspection | implemented; focused/full regression PASS |

`implemented` 表示当前 tree 已有直接证据，但仍会参加最终 regression；`partial/open` 不得用于完成声明。

## 2. Focused automated checks

| Claim | Command / check | Evidence supported | Does not prove |
|---|---|---|---|
| reducer/reference correctness | `npx vitest run tests/unit/aili-compact-reducer.test.ts tests/unit/aili-compact-reference.test.ts` | matching commit boundary, extended block state, replay-stable refs, fork/epoch/control/lineage | host event ordering |
| range/message tools | focused tool integration tests | schema bounds, target resolution, overlap/atom/protection/material-benefit/nesting validation | summary quality from a live model |
| recap/projection/fidelity | `npx vitest run tests/unit/aili-compact-projector.test.ts` plus recap fixtures | stable anchor pair, stale-call removal, idempotence, fail-open and source isolation | every future provider/extension |
| provider serialization | focused adapter fixture test using installed Pi AI serializers | details/diagnostics/prompts/raw source absent from provider content | live provider server behavior |
| command/manual behavior | focused integration command tests | distinct context/stats/sweep/compress/decompress/recompress/manual semantics | interactive TUI ergonomics |
| policy/subagent/GC | focused policy, lineage, request-boundary GC and compaction-hook tests | grouped cooling, protection, dedupe/purge, nudge, subagent fail-open, nested/generational GC, all-reason native cancellation | unknown external subagent providers and live overflow ordering |
| cache identity/accounting/UI | Session replay/incremental/tree/reload + cache identity + telemetry + presentation tests | current-branch totals recover without hot-path replay; full identity transitions, missing-field unavailable, numeric-only UI | provider-side cache hit target |
| bootstrap/settings | focused bootstrap tests with disposable HOME | atomic/idempotent user-global merge, malformed preservation, no project rewrite | actual user HOME mutation until post-check task 10.5 |
| whole repo contracts | `npm run typecheck && npm test` | TypeScript and existing/new regression coverage | public release or live provider quality |
| packaging/contracts | `npm run validate:capabilities && npm run validate:release && npm run validate:package && npm pack --dry-run --json && git diff --check` | capability/package integrity and named release non-pass evidence | publish authorization |
| OpenSpec integrity | `CI=true OPENSPEC_TELEMETRY=0 OPEN_SPEC_INTERACTIVE=0 openspec validate add-reversible-context-compression --strict` | coherent contract structure | implementation behavior |

Exact new test filenames may be merged into existing focused suites when one owner is clearer; tests SHALL remain under the project-defined `tests/unit/`, `tests/integration/` and `tests/fixtures/` paths.

## 3. Required scenarios

### Source, replay and references

- Existing JSONL lines remain byte-identical after every compression, prune, search, decompression, recompression, control and automatic action.
- Valid matching tool-result/custom transactions replay after reload; incomplete, failed, wrong-tool, wrong-kind, duplicate, off-branch, digest-mismatched and wrong-epoch transactions do not activate.
- Fork-before/fork-after and tree navigation never leak state or model references across branches.
- `mNNNNNN`/`bNNNNNN` references follow exact replay ordinals, remain stable on same branch/epoch, page through catalogId/offset/limit/nextOffset, resolve exact source, and reject stale-catalog/collision/unknown/ambiguous/archived targets.
- New `v2` transactions replay extended fields; safe legacy `v1` blocks upgrade deterministically and non-upgradable blocks remain query-only.
- Custom human controls cannot create semantic/prune blocks or model-authored summaries.

### Compression and recap protocol

- Range mode handles multiple non-overlapping ranges, normalizes reversed boundaries, rejects split-atom boundaries, and calculates material benefit only after atom validation.
- Message mode handles a bounded batch of individual message summaries under one run/group.
- Below-minimum benefit, duplicate coverage, recent/protected content, incomplete atom and invalid nested lineage commit no transaction.
- Active semantic blocks insert exactly one stable assistant `aili_context_recap` call/result pair at the original anchor.
- Recap contains persisted summary plus bounded metadata; source atoms and stale historical compact call/result duplication are absent.
- Direct recap omission lists at most 32 replay-ordered blocks with 200-character previews; active lookup returns the committed summary; inactive/archived/unknown refs error without mutation/raw source.
- Model decompression accepts 1..16 refs all-or-nothing and returns refs plus at most 2,000 UTF-8 characters of replay-ordered exact preview with truncation flag.
- Parent decompression/reactivation follows child lineage without duplicated source/summary.

### Whole-output projection and provider boundary

- Unmatched/ambiguous external messages remain intact; any alignment, role, anchor, user-message, pair, digest or idempotence failure returns exact input without partial projection.
- Complete tool-call/result atoms hide/restore together; cooling keeps the original paired tool call and Pi content-array shape.
- OpenAI completions/responses, Anthropic and Gemini serialization fixtures contain only intended projected content; transaction `details`, diagnostics, prompt text and hidden source do not leak.
- Repeating projection with unchanged state produces equivalent output/hash/earliest-change evidence.

### Automatic policy and protection

- Immediate follow-up observes raw current-turn tool results.
- Normal/error grace periods, image/mixed, context-management, unpaired, protected tools/file globs/tags/user-message policy are covered.
- Multiple eligible results form one deterministic bounded transaction only after aggregate gain; insignificant candidates wait.
- Deduplication and purge-error respect keepLatest/grace/protection and can be independently disabled.
- No automatic policy rewrites persisted history or adopts the pinned ACP in-place pruning regression.

### Tools and commands

- All six `aili_*` tools are registered once; model mutators reject sibling/conflicting calls and manual-mode violations.
- `context [offset] [limit]` uses defaults 0/32 and max 64; `stats` exposes distinct counters; they are not aliases.
- `sweep [limit]` defaults to 8, accepts 1..16 and groups safe candidates in one all-or-nothing transaction.
- `/aili-compact compress [focus]` starts one explicit agent turn, grants at most one compact attempt, and does not become a hidden provider call.
- Direct `decompress`/`recompress` commands accept 1..16 refs all-or-nothing and mutate only eligible existing current-epoch blocks; invalid args append nothing; model decompression still commits through a matching result.
- Search remains bounded to current branch; archived blocks are query-only.

### Configuration, prompts, nudges and subagents

- Config precedence and deep/scalar/array/hard-union merge semantics match the normative key/default/range table; unknown JSONC keys, malformed files, invalid types/ranges/cross-thresholds produce named diagnostics and contribute no invalid value.
- Custom prompts default off. Only the six named slots load from `~/.pi/agent/aili-compact-prompts/` and `<cwd>/.pi/aili-compact-prompts/`; project overrides global; unknown files produce `prompt-unknown-slot`; 4 KiB/file and 8 KiB/snapshot limits apply.
- Slot text appears only in its corresponding bounded system-guidance section and cannot override immutable schema/protocol/safety guidance.
- Reload or nudge threshold transition changes the cache-input fingerprint; prompt body never appears in JSONL, diagnostics, widget or tool results.
- Manual mode is independent from `autoCooling`.
- Subagent handling defaults off; in-flight/ambiguous lineage remains raw; enabled completed-result handling uses only public Pi evidence and no sidecar transcript.

### Exclusive compaction ownership, GC and cache

- Bootstrap writes exact `compaction.enabled=false` into a missing or valid object-valued user-global Pi settings file, preserves unrelated nested keys, is idempotent, and never scans or rewrites project `.pi/settings.json`.
- Malformed/non-object settings and injected pre-rename failures return non-zero and preserve the original bytes; successful replacement is atomic.
- Every manual/threshold/overflow native event is cancelled while AILI is enabled, independent of projection health or estimated savings; no handler returns a Pi compaction envelope.
- Manual Pi `/compact` receives bounded AILI guidance. `/aili-compact off` does not silently re-enable Pi auto-compaction.
- Young/old promotion, survival/age, nested child lifecycle and bounded summary handling replay deterministically.
- Provider-free major GC runs independently before provider projection at the configured emergency boundary, commits only append-only AILI control state and never creates a Pi compaction entry or hidden model request.
- If independent GC cannot recover sufficient budget, no native summary/retry occurs and the provider overflow remains visible.
- Historical completed Pi compactions still replay as summary-plus-kept-tail epochs; older blocks remain archived/query-only.
- Current-branch assistant usage replays once on session start/reload or tree navigation, survives restart, and thereafter updates in O(1) from finalized assistant messages without provider-context/widget replay scans.
- Cache identity changes on provider, model, session, branch leaf/source digest, epoch, projection, prompt/guidance or sorted tool name/description/schema/immutable-prompt surface change.
- Only a warm identity match with numeric cache-read/write is eligible. Hit is `cacheRead/(input+read+write)` over the last 20 eligible responses; fewer than 5 samples are insufficient; cold/state-change/unavailable are excluded and separately shown.
- Grouped cooling, recap insertion and stale-call cleanup expose deliberate state transitions; unchanged warmed synthetic sequences remain stable.
- Footer/details/widget contain numeric data only; the widget defaults on and presents current Session totals left-aligned beside right-aligned AILI stability across paired rows, hides when narrow and rerenders only after numeric state change.

### Diagnostics and release boundary

- Doctor reports reducer/reference/projection/recap invariant failure as ERROR and never PASS solely from command registration.
- Missing optional/live evidence remains WARN/Unverified; diagnostics contain only bounded IDs/counts/hashes/error names.
- Before implementation, release validation remains non-pass for the named AGPL/MIT disposition.
- After implementation, the unconditional license blocker disappears only when root package/lock/LICENSE/README/provenance/notice/SBOM/tarball evidence agrees on `AGPL-3.0-or-later`; stale live evidence remains non-pass.

## 4. Fault-injection / false-PASS cases

| ID | Injected failure | Expected result |
|---|---|---|
| FI-01 | mutate an existing persisted source line | JSONL byte-prefix test fails |
| FI-02 | accept semantic state from custom entry or failed/wrong tool result | reducer activates no state |
| FI-03 | use stale/off-branch message or block ref | tool returns error without transaction |
| FI-04 | split a tool protocol atom or overlap range batches | no committed transaction/projection |
| FI-05 | omit recap anchor or duplicate summary through stale compact call | projection fails open / regression test fails |
| FI-06 | continue after ambiguous alignment or whole-output invalidity | exact input is returned with bounded diagnostic |
| FI-07 | leak tool-result `details`, diagnostics or prompt body through a provider serializer | serializer fixture fails |
| FI-08 | cool one insignificant old result every turn | grouping/minimum-gain regression fails |
| FI-09 | prune protected/current/unconsumed/image/subagent-in-flight content | policy rejects it |
| FI-10 | allow autonomous compact in manual mode or reuse one-shot trigger | command/tool matrix fails |
| FI-11 | reinsert archived/GC block or break nested child lineage | decompression/recompress test fails |
| FI-12 | permit any manual/threshold/overflow path to generate or accept a Pi compaction | exclusive-owner hook test fails |
| FI-12A | independent AILI GC cannot recover budget | no native summary/retry; provider overflow remains visible and state is not falsely marked recovered |
| FI-12B | bootstrap receives malformed/non-object settings or fails before rename | non-zero result and byte-identical original settings |
| FI-13 | treat missing cache fields as zero hit, use the wrong cache formula/window/sample minimum, or omit provider/model/branch/tool surface from identity | cache test fails |
| FI-14 | doctor passes from command registration while projection is unhealthy | doctor test fails |
| FI-15 | release validator passes before exact AGPL metadata/provenance/tarball consistency or required live evidence | release test fails |
| FI-16 | blanket MIT→AGPL replacement rewrites a third-party license declaration | provenance/notice/SBOM preservation test fails |
| FI-17 | target 0.1.13 tarball includes `.pi`, graphify, OpenSpec, tests, artifacts, logs, secrets or local absolute paths | package sanitizer fails |

## 5. Unverified and excluded evidence

- `UV-LIVE-1`: real provider tool use, summary quality and eligible warm-session `>=85%` cache rate require a separately approved named provider/model probe. Local deterministic/accounting evidence does not claim live performance.
- `UV-EXT-ORDER-1`: unknown later third-party context handlers remain unverified. AILI promises unmatched preservation/fail-open diagnostics, not universal hook compatibility.
- `UV-PI-INTERNAL-1`: Pi real-host title/summary/native-compaction internal request ordering remains unverified; deterministic tests must nevertheless prove that any delivered manual/threshold/overflow event is cancelled and that independent GC does not depend on native event delivery.
- `UV-ACP-RUNTIME-1`: pinned ACP source/tests were inspected, but its test suite was not executed because no dependency-install approval was granted. The source audit informs behavior, not an upstream runtime PASS claim.
- `UV-LICENSE-1` is resolved at the decision level by selecting package-wide `AGPL-3.0-or-later`, but remains implementation-pending until exact metadata, complete license text, packaged attribution, generated evidence and tarball checks pass.
- `UV-RELEASE-TREE-1`: the exact clean Git commit/tag for 0.1.13 is not yet assembled; the current dirty 0.1.9-based workspace and clean origin/main 0.1.12 worktree must not be conflated.
- `UV-LIVE-1` plus persistent-Agent provider/sandbox/external-workspace and real TUI evidence remain separate release gates. No source copy, provider/TUI, Git or publish operation is authorized by this test-plan draft.

## 6. Package-wide AGPL and candidate scenarios

- Root `package.json` and root package-lock metadata identify exact 0.1.13 and `AGPL-3.0-or-later`; dependency license fields remain unchanged.
- Root `LICENSE` contains the complete standard GNU Affero General Public License v3 text; required package metadata/tarball includes it.
- README states 0.1.13+ licensing prospectively and does not claim prior grants are revoked.
- Packaged provenance and generated notice identify exact opencode-acp repository/tag/commit/license and no-direct-copy reference boundary.
- Generated root SBOM takes name/version/license from package metadata instead of hard-coded development/MIT values.
- Doctor/release tests fail on any license drift and no longer emit `AGPL-MIT-DISPOSITION` when all license evidence passes.
- Third-party MIT/OFL/Apache and other license records/notices survive generation byte/semantic checks.
- Exact candidate pack includes required license/provenance surfaces and excludes internal state/evidence paths; bounded scans find no credentials or local absolute paths.
- Release validation may remain non-pass only for still-applicable named live/provider/sandbox/external-workspace/TUI evidence until separately authorized and satisfied.

## 7. Acceptance gate

- [x] Historical: 用户于2026-07-26接受package-wide AGPL与0.1.13 candidate计划；该 acceptance 已完成其原范围，但不覆盖本次 material delta。
- [x] 用户于2026-07-27回复“开始”，明确接受 exclusive-owner/bootstrap-HOME-write 修订后的最终测试计划并授权 BUILD。
- 本 acceptance 已授权并完成本地 runtime/bootstrap/tests/docs/doctor 实现及对精确 `/home/rosetears/.pi/agent/settings.json` 的结构化合并；不授权direct source copy、provider/TUI、commit、push、tag、publish或GitHub release。
