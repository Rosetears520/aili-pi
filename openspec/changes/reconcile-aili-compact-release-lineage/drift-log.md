# Drift Log: reconcile-aili-compact-release-lineage

## 2026-08-02 — Unresolved npm dependency-bundling decision

### Evidence

The current `package.json` declares both `bundledDependencies` and `bundleDependencies` for:

- `@narumitw/pi-lsp`
- `pi-cache-optimizer`
- `pi-markdown-preview`

A fresh `npm pack --dry-run --ignore-scripts --json` reported:

- packed size: 9,863,822 bytes;
- unpacked size: 50,124,522 bytes;
- entries: 5,757;
- bundled `node_modules` entries: 5,578.

The largest portion comes from `pi-markdown-preview`, whose runtime dependency on `puppeteer-core` brings `chromium-bidi`, `devtools-protocol`, source maps, screenshots, and upstream test files into the archive. Repository-local `tests/`, `openspec/`, `artifacts/`, `.pi/`, `.tmp/`, `graphify-out/`, and the root `Zone.Identifier` file are excluded by the package allowlist.

Fresh Git-tag inspection corrects the earlier historical inference: `v0.1.13`, `v0.1.15`, and `v0.1.16` all declared the same three bundled roots, and each committed lockfile marked 228 package entries as `inBundle`. The verified `0.1.16` npm artifact record counted 173 first-party files but did not record the complete dependency-file count or unpacked size. The current 50 MB closure therefore continues an existing packaging policy; it is not newly introduced by `0.2.0`. Exact historical tarball size remains unverified without another registry/tarball operation.

### Options awaiting user decision

1. **Use ordinary npm dependencies (recommended):** remove both bundle-list aliases and the lock-root bundle metadata while retaining the pinned production dependencies. This should substantially reduce the tarball, but installation requires npm to obtain those dependencies.
2. **Keep the complete bundled closure:** accept the approximately 50 MB unpacked archive and the inclusion of transitive upstream source, tests, screenshots, and browser tooling.
3. **Bundle only the lightweight integrations:** keep `@narumitw/pi-lsp` and `pi-cache-optimizer` bundled, but install `pi-markdown-preview` and its Puppeteer closure normally. This reduces most of the archive expansion but creates mixed dependency-delivery semantics.
4. **Remove optional integrations from the product:** remove `@narumitw/pi-lsp` and/or `pi-markdown-preview` from runtime registration, production dependencies, bundle metadata, lockfile, docs, provenance, generated manifests, and public tool/command tests. This removes `lsp_diagnostics`/`lsp_fix`/`/lsp` and/or `/preview*`/`preview_export`, so it is a public capability and dependency-scope change rather than packaging cleanup.

### Current decision and effect

On 2026-08-03 the user selected complete removal of both optional integrations and asked to continue. Because this changes public tools/commands, production dependencies, lock state, generated evidence, and verification scope, affected BUILD work returned to DEFINE. No runtime, dependency, package, or lockfile mutation occurs until the revised final `test-plan.md` is strictly validated and explicitly reaccepted.

## 2026-08-04 — Accepted evidence-class boundary after two OpenAI captures

### Evidence

Two separately authorized OpenAI-only captures used official Pi `0.82.1` and `openai-codex/gpt-5.4-mini`. Both proved real transport and controlled before/AILI/after ordering. The repaired second capture also proved exact synchronous parent task arguments, zero parent Bash calls, and a completed persistent child lifecycle. It did not naturally observe:

- a non-NORMAL pressure-stage suffix;
- a provider context-length error, overflow checkpoint, retry, and later work;
- the exact child sandbox marker;
- four provider-authored T1/T2/T3/T3-restill transactions or a semantic-review candidate.

The second run sent a 1,224,000-character overflow request against model metadata reporting a 272,000-token context window. The provider still completed through `message_end` without a recognized context-length error. Repeating or increasing billable input therefore does not provide a deterministic proof method.

### Decision

The user selected a split evidence model:

1. **Real configured-provider evidence** owns official-Pi transport, protocol acceptance, controlled extension ordering, and the parent-to-persistent-child lifecycle.
2. **Deterministic controlled-provider production-entry evidence** owns pressure/suffix/non-persistence, context-error overflow/checkpoint/original-request retry/later work, process-owned child sandbox marker work, and lifecycle/tiering.
3. **Offline provider protocol fixtures** continue to cover OpenAI, Anthropic, and Google Gemini serializers without family credentials.
4. **Final human review** accepts this evidence boundary, the two preserved live limitations, and remaining bounded `Unverified` claims; it does not require a real provider-authored semantic-review candidate.

### Trade-off and effect

This removes the stronger claim that each failure/side-effect path was naturally witnessed on a real OpenAI request. It retains exact production-entry behavioral coverage and the real external provider boundary while eliminating a costly, nondeterministic failure-induction gate. This is a material verification-strategy change: BUILD remains stopped until the revised final `test-plan.md` is strictly validated and explicitly reaccepted. No third provider capture is authorized.

## 2026-08-04 — Controlled-production entry gap discovered in BUILD

### Evidence

The existing focused `aili-compact-agent-session` and `persistent-agent-production` tests still pass. They do not, however, produce the newly required controlled-production release evidence. An attempted exact evidence implementation found two blockers on the official Pi AgentSession path:

- headless custom Compact tool calls are denied by the current permission-mode path;
- after interactive test approval, the Compact production path reports an unhealthy branch index with `invalid-entry` and zero provider-message passes, preventing pressure suffix and full production tiering evidence.

The attempted test edits were restored and no PASS artifact was written. Existing direct-handler fake-provider evidence cannot be promoted because the accepted contract explicitly rejects direct event injection and manual promotion.

### Unresolved decision

Preserving the accepted evidence class requires a bounded production runtime/index or permission-integration repair, ideally through an internal testability/compatibility seam with unchanged default user behavior. Avoiding that repair requires a material verification-strategy relaxation. BUILD cannot select between those paths without DEFINE acceptance.

### Resolution selected for DEFINE

The user selected the production-path repair. Repository evidence localized the defect to official Pi's valid root entry representation: `parentId: null` was rejected by Compact's narrower branch-index boundary before protocol alignment. The revised contract permits null only for the true root during cold build or first append to an empty index and retains fail-closed later lineage checks.

The permission denial is expected product behavior, not a defect. Controlled tests will bind the real extension lifecycle and use a disposable exact allowlist for `aili_compact_status` and `aili_compact`; shipped permission defaults and headless `ask → deny` remain unchanged. No runtime permission exemption or headless approval injector is accepted.

## 2026-08-04 — Production safe-range ordinal gap discovered in BUILD

The accepted null-root repair passed its focused branch-index tests and typecheck. The controlled Persistent Agent component also passed. The Compact production AgentSession then persisted one real T1 but rejected the next status-derived mutation as `non-contiguous-source`.

Planning excludes AILI's own persisted status/compact caller and tool-result messages from public refs and tail aging. It currently closes a safe range across that omitted protocol sequence. Mutation validation uses unfiltered effective provider ordinals and correctly rejects the hidden discontinuity. Direct-handler fixtures do not expose the defect because they do not persist the complete status/tool protocol.

The recommended repair is to keep AILI protocol excluded from refs and tail aging but make planning split ranges at every effective-source-ordinal discontinuity. This preserves exact contiguous T1 sources and turns every advertised range into an executable range. Weakening mutation validation or adding protected fixture separators is rejected as evidence concealment. Because this changes production planning behavior, affected BUILD work returned to DEFINE.

## 2026-08-06 — Safe-range ordinal-gap repair selected

The user selected the recommended source-ordinal-aware planning repair and requested continuation. The revision preserves AILI protocol exclusion from public refs and recent-tail aging, makes both current and indexed planning split at every effective-provider-ordinal discontinuity, and leaves exact mutation contiguity unchanged. Filtered ordinal semantics, `non-contiguous-source` weakening, and protected fixture separators remain rejected.

The affected runtime BUILD remains paused until this final `test-plan.md` revision passes strict validation and receives explicit acceptance. The decision grants no provider, network, installation, dependency/lock/version, Git, commit, push, tag, publish, or release authority.

## 2026-08-06 — Persisted AILI protocol prevents strict-ordinal tier promotion

After the accepted safe-range repair, controlled production created T1 blocks successfully beyond the former branch-wide quality-identity limit. The quality identity was scoped to the exact selected message/anchor entries, and focused unit/type checks passed. The production lifecycle then exposed a contract contradiction: every T1 is created by a persisted status/compact tool sequence, but lifecycle grouping requires the next block's `firstLeafOrdinal` to equal the previous block's `lastLeafOrdinal + 1`. Because AILI protocol occupies effective provider ordinals and is intentionally excluded from semantic source, no two separately created T1 blocks can be strict-ordinal adjacent. Consequently no production T2 promotion group can be advertised, regardless of fixture width or economics.

This cannot be repaired as test tuning. The product contract must choose whether AILI-owned planning protocol is transparent only for block-to-block semantic promotion adjacency, whether one call may create multiple T1 blocks before protocol persistence, or whether AILI protocol becomes semantic source. The recommended option is narrowly transparent promotion adjacency: each T1 remains an exact contiguous provider-source range; promotion may bridge only gaps proven to contain AILI-owned planning protocol and must still reject every ordinary message/protocol gap. Affected BUILD stops for DEFINE acceptance.

## 2026-08-06 — Raw interval and replay-proof design selected

The first implementation attempt dynamically removed AILI protocol from a second ordinal domain. Controlled production proved that Session visibility/normalization timing can shift those derived ordinals after persistence, producing overlap between an existing block interval and later source despite disjoint entry IDs. The implementation was reverted.

The user selected authoritative raw intervals plus bounded gap proofs. Each non-empty adjacent-child gap will bind child IDs, boundary leaf IDs, count, proof version, and canonical digest. Planner, pure replay, and BranchIndex replay must independently derive and classify the immutable gap; the transaction declaration cannot authorize itself. This adds closed-schema/replay semantics and therefore returns affected work to DEFINE for final test-plan acceptance.

## 2026-08-07 — Raw-domain, ownership, source-binding, and replay-performance correction

The release review found four coupled gaps in the partial raw-gap implementation: it derived raw ordinals from record-shaped messages in some paths but not others; it treated a complete same-name tool pair as AILI-owned without handler provenance; BranchIndex proof replay read mutable Session-owned message bodies and accepted structure-only replay seeds; and controlled official-Pi AgentSession lineage timed out with CPU-bound repeated full-history replay while its counters did not record every traversal.

The user selected a complete hardening revision. The replacement contract makes every `type:"message"` entry consume one raw epoch ordinal, introduces closed replayable handler attestations without secrets/HMAC, verifies gaps through immutable source-digested epoch snapshots and source-bound replay seeds, binds structural block content into catalog identity, and requires revision-scoped indexed/bounded replay with truthful counters and atomic non-PASS timeout artifacts. The only transparent outcomes are successful closed status, successful transaction-bound compact, and a closed handler-attested compact rejection; rejected status, permission denial, unknown-tool, and every other result remain non-transparent. This changes persistent/replay and verification boundaries, so BUILD remains stopped until the revised final test plan is strictly validated and explicitly accepted.

## 2026-08-08 — Controlled hierarchy economics correction

The repaired controlled AgentSession path completed all 16 T1 and four T2 transactions, then the first T3 was rejected by the ordinary strict token-benefit gate. The fixture had selected two 512-character T2 summaries and proposed an 8,000-character T3 summary. Production economics correctly prices the immediate projected child recap pairs that Pi would send in the next context; it does not and must not credit recursive raw leaves or historical tool-result text.

The user initially selected a fixture-data correction, not an economics-policy change. Further capacity review showed that neither the 16/23 nor the intermediate 29-transaction topology can meet the unchanged 8,000-token restill source floor under conservative lower/upper token bounds. The selected revision therefore raises the semantic-summary target/hard ceiling to 15,000/18,000 characters and uses a 28 T1 → 14 T2 → 7 T3 → one seven-child restill hierarchy. It preserves the existing economics thresholds, immediate-child representation, watchdog/budget rules, and the 512-to-8,000 higher-tier rejection. This changes product capacity and controlled release evidence, so affected BUILD remains stopped until strict validation and explicit final test-plan acceptance.

## 2026-08-09 — ACP-style bounded provider-frontier revision

### Evidence

The accepted 28 → 14 → 7 → 1 controlled AgentSession hierarchy retains roughly 8.96 million raw characters through 224 provider/context transformations before parent tiers. A bounded descriptor-cache repair passed focused BranchIndex/indexed-projector/performance checks but the full controlled worker did not complete inside its 120-second matrix contract. A temporary trace reached only T1 14 after 60 seconds. The exact dominant frame remains unverified, but repeated projection of a growing provider-facing history is sufficient evidence that another local cache adjustment cannot establish the current architectural contract.

Public prior-art review found that DCP expands earlier summaries and protected output into later compression requests, while ACP keeps active T1/T2/T3 blocks, consumes children at parent creation, and exposes recap/search/decompression. Both use the active agent model to supply a tool summary rather than a dedicated summary model. Upstream code, hooks, prompts, state, configuration, runtime compatibility, and license reuse remain out of scope and unverified for AILI.

### Decision

The user selected ACP-style compression behavior for an AILI-owned provider frontier. AILI will retain its complete source-bound proof ledger, but provider requests will contain protected recent raw content and bounded block descriptors by default. Full summaries are resolved only through explicit current recap/decompression selections that fit the model request budget. T1/T2/T3/restill continue to use the current agent model, existing Compact tools, atomic child consumption, immediate-child economics, and on-demand exact source recovery. DCP-style recursive summary/protected-output expansion is rejected.

### Effect

This changes projection architecture and verification strategy. BUILD is paused as `BUILD_MATERIAL_DISCOVERY` until the revised proposal, design, specifications, tasks, and final test plan pass strict validation and receive explicit user acceptance. The 15k/18k limits, 28 → 14 → 7 → 1 topology, source-proof/attestation invariants, 10-second phase and 120-second total budgets, and all external-operation gates remain unchanged.

## 2026-08-09 — MiMo dynamic checkpoint and active-block revision

The user rejected the remaining fixed AILI route and selected MiMoCode's dynamic checkpoint/rebuild-first behavior. The accepted design direction is not a direct 90-percent semantic summary or a custom 70/80/90 ladder: it uses MiMo's effective-window thresholds, explicit combined-window reserves, a checkpoint ceiling, one-writer coordination, checkpoint rebuild before native compaction, and threshold reset after rebuild. ACP remains the source for architectural comparison of bounded active-block projection only.

Pi exposes a combined `contextWindow`, not MiMoCode's distinct provider input-capability field. The Pi adaptation therefore uses separate `min(maxTokens, 20_000)` output and recovery reserves and caps checkpoints at an additional 13K below the safe working budget. This delta intentionally introduces no MiMoCode configuration syntax or new user configuration surface. An invalid or reserve-exhausted context disables automatic recovery rather than guessing.

This supersedes fixed T1/T2/T3/restill new writes, tier-specific economics, and the exact 50-transaction release fixture. Those records remain readable only for rollback and source-proof compatibility. The source-bound ledger, protocol attestation, immutable epoch snapshots, bounded retrieval, protected tail, and exact Pi external-operation gates remain unchanged. BUILD stays paused until the rewritten contract strict-validates and the user accepts the final test plan.

## 2026-08-09 — Full-candidate release-gate reconciliation

The user selected the complete current working tree as the `0.2.0` release candidate after safe-local readiness checks found a compatibility-evidence hash drift and fifteen stale or non-pass release/live rows. This is a verification-scope change: the earlier targeted MiMo/ACP test plan remains valid implementation evidence but cannot establish stable release readiness.

The release contract therefore replaces the retired controlled 50-transaction/tier evidence requirement with current candidate-bound controlled active-block and MiMo recovery evidence. Fresh predecessor lookup, installed rollback, representative-provider boundary capture, human review, commit, push, tag, publication, and release retain their separate exact approval gates. No historical artifact may be relabelled or hash-edited to satisfy the new candidate.

## 2026-08-10 — Review-driven simplicity and release-gate correction proposed

### Evidence

A bounded read-only review of the active AILI Compact scope found that release validation returns an empty error list when the retired `redesign-aili-compact-lifecycle` proposal is absent, despite this change owning the active candidate contract. It also found that the combined legacy/v3 catalog appends every v3 block before every legacy block, contradicting the required semantic-leaf ordering before the provider frontier caps descriptors at 32. The frontier's incomplete selection identity/counter work is already task 2.15 scope and remains required hardening.

The review also found a stale human-review wrapper incompatible with the current live-artifact validator and retaining retired tier evidence, plus a 0–256 promotion-oracle loop that repeatedly exercises the same five replay paths while correlating child count and protocol kind. The independent raw-gap oracle itself remains necessary. The existing full-history indexed projector appears private-test-only, but external compatibility is unverified.

### Proposal status and effect

The user requested that these findings first be recorded as a proposal, then accepted that remediation direction for DEFINE write-back. The proposal preserves source-proof, attestation, snapshot, and independent replay defenses; it proposes current-contract release gating, semantic-order correction, current human-review evidence, explicit oracle boundary/table coverage, and a consumer audit before any legacy projector removal.

This changes release-validation behavior and the verification strategy, so the previous full-candidate test-plan acceptance is no longer current for affected work. No runtime, test, validator, generated-artifact, dependency, external/provider, installation, Git, or publication mutation is authorized by this proposal alone.

### Oracle matrix refinement

The first 2.15a implementation expanded the prior correlated 257-row loop into a 450-row all-cardinality cross product. Although it made dimensions explicit, it increased repeated replay work and contradicted the remediation goal. The user selected the recommended 60-row matrix: child cardinalities `2` and `16`, six bounded gap lengths, and all five protocol classifications. Minimum/maximum cardinalities exercise one and fifteen adjacent gaps; focused active-block coverage retains ordinary two-to-sixteen behavior. This does not weaken independent planner/direct/pure/cold-index/append-index agreement.

## 2026-08-11 — Default Compact ownership returned to Pi

The user selected Pi native compaction as the default and made AILI Compact an explicit opt-in experiment. The runtime default is now `enabled=false`; the current user-global AILI config is also disabled, while Pi `compaction.enabled` is explicitly true. Disabled AILI continues to return original provider messages and exact `undefined` from compaction hooks, leaving native threshold, overflow recovery, retry, and manual `/compact` ownership with Pi.

This supersedes the older default-enabled/exclusive-owner assumptions in the historical reversible-context-compression contract. The current release candidate cannot be declared contract-complete until the active specification and release evidence are reconciled with this opt-in boundary. No commit, tag, publish, or release operation was authorized.

## 2026-08-11 — AILI Compact removed from the 0.2.0 runtime

The user selected complete removal of AILI Compact from the supported 0.2.0 distribution and authorized the stable release. `registerAiliCompact` is no longer reachable from the single Extension entry; `/aili-compact`, all `aili_compact*`/restore/search tools, provider projection, Session/compaction hooks, widgets, and Compact Doctor evidence are absent. Pi native compaction is the sole supported context-compaction path.

The historical implementation and focused tests remain in the repository for a possible future redesign, but they are frozen and are not active release evidence. Compact-specific live, migration, rollback, quality, performance, sanitizer, and human-review evidence no longer block `validate:release`. The old live manifest remains diagnostic-only because its harness was owned by the removed Compact feature; deterministic current-source evidence continues to gate the persistent Agent adapter through compatibility hashes and focused tests.
