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
