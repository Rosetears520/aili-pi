# Design: reconcile AILI Compact release lineage

## 1. Decision

The release line has two independent facts:

1. `fix-aili-compact-recovery-deadlock` is the mandatory P0 behavioral contract whose REC-001 through REC-008 invariants remain inherited.
2. The rollback predecessor is the latest real published `0.1.x` package immediately before `0.2.0`, not an invented version assigned to that behavioral contract.

The merged implementation targets `@rosetears/aili-pi@0.2.0`. Current local Git evidence identifies `v0.1.16` as the expected predecessor, but release-sensitive code and evidence may bind it only after a fresh approved Git-remote and npm-registry check agrees on package/tag identity.

## 2. Truthful predecessor resolution

Predecessor resolution records the package name, exact version, Git tag/ref, npm dist metadata or tarball integrity, lookup time, and sanitized commands/results. Resolution fails closed when Git and npm disagree, the version is missing, the package identity differs, or the artifact cannot be installed in a disposable environment.

No command may create a missing predecessor, move a tag, republish an old version, or infer `0.1.14` from an OpenSpec directory name. Historical artifacts may retain statements as historical evidence, but active release gates and generated candidate evidence must name only the verified predecessor.

## 3. Migration and rollback

The rehearsal uses copied, sanitized sessions and disposable HOME/package roots:

1. open predecessor-compatible sessions with the verified predecessor;
2. run the `0.2.0` candidate and exercise v1/v2/v3 replay plus current branch/epoch operations;
3. preserve the original JSONL byte prefix and create no raw-conversation sidecar;
4. reopen a copy with the verified predecessor using the documented native-checkpoint/no-new-v3 procedure;
5. record expected old-binary limitations without claiming it can interpret v3 semantics;
6. verify continued work and clean failure boundaries without touching a user's live session.

This proves a real rollback procedure. It does not claim backward semantic understanding that the predecessor does not have.

## 4. Version and license ownership

One current-candidate source of truth must drive package identity consumers. The historical license-disposition boundary remains `0.1.13` and must be represented independently so changing the candidate to `0.2.0` cannot rewrite the README/license claim.

The exact candidate version must agree across package manifest, lock root, SBOM, runtime doctor/registry metadata, local package E2E expectations, focused tests, and every generated release-evidence binding. Directly editing generated evidence is forbidden; owners regenerate it from the accepted source and fresh runs.

## 5. Remaining stable-release blockers

The current release validator's failures split into five owner classes:

- metadata identity: package/lock/SBOM/runtime constants and direct tests;
- compatibility: a real Pi-owned presentation-style adapter for `i-have-adhd`, with behavior tests and generated compatibility evidence;
- stale external-boundary verification: rerun the affected real-provider transport/order and parent-to-persistent-child lifecycle claims instead of replacing implementation hashes;
- deterministic production-path evidence: bind suffix/non-persistence, overflow/checkpoint/retry/later-work, process-owned child sandbox work, and lifecycle/tiering to the exact official-Pi production entry and candidate implementation;
- AILI Compact candidate evidence: migration, performance, fake-provider, real-provider boundary, controlled production-path, provenance, sanitizer, and release index regenerated for the exact candidate implementation hash.

The controlled-production path revealed one compatibility defect and one test-setup constraint. Official Pi `0.82.1` stores the root Session entry with `parentId: null`; Compact's narrower branch-index type rejected that valid root before protocol alignment. The repair widens the boundary type but accepts null only for the actual root during cold build or the first append to an empty index. Mid-branch null, empty-string, non-string, impossible-lineage, and parent-tip mismatches remain fail-closed. Existing `entry.parentId ?? previousId` normalization then records the root without a parent while preserving exact later ancestry.

Permission-mode behavior is not defective and must not be weakened. Headless custom tools correctly deny an unresolved `ask`. Controlled production tests will bind the real extension lifecycle and use a disposable agent-dir permission configuration that allows only `aili_compact_status` and `aili_compact`; all other custom tools remain `ask`, and shipped defaults remain unchanged. A runtime exemption, broad Build-mode bypass, or injectable headless approval is rejected.

The repaired AgentSession path exposed an independent safe-planning defect after the first real T1 transaction. Persisted AILI status/compact assistant calls and tool results intentionally have no public message refs and do not advance recent-tail aging, but they still occupy effective provider ordinals. Current and indexed planners remove those protocol messages before assembling ranges, thereby closing a visible range across a hidden ordinal gap. Exact mutation validation counts the retained protocol and correctly rejects that advertised range as `non-contiguous-source`.

The repair keeps the two domains distinct. Public refs, source membership, and tail aging continue to exclude AILI's own protocol. Range assembly additionally receives each retained message's effective source ordinal and flushes before every discontinuity. Current and indexed planning must use the same rule and remain parity-tested. Exact mutation contiguity remains unchanged. This may produce smaller recommendations around AILI protocol, but every returned range is executable and remains one true contiguous provider-source range. Filtered ordinal semantics, mutation-validator weakening, or a protected test separator are rejected because they would bridge or conceal retained protocol.

That strict T1 repair exposes a separate promotion domain. Every production T1 is created by persisted AILI status/compact caller-result protocol, so separately created blocks cannot be adjacent under raw provider ordinals. Promotion adjacency therefore operates on semantic leaves, not by pretending the control protocol is source. For each gap between ordered child leaf intervals, the runtime must prove from an immutable current-epoch snapshot that every intervening provider ordinal belongs to complete, well-formed, attested AILI-owned `aili_compact_status` or `aili_compact` planning protocol. Only such a gap is transparent. The protocol remains persisted, excluded from block source/digests/summaries and recent-tail aging, and visible to audit/replay.

The same classifier must drive lifecycle status recommendations and mutation/reducer validation so status never advertises an uncommittable group. A gap containing a user/assistant message, third-party tool call/result, incomplete sibling set, malformed or permission-denied result, missing/mismatched attestation, unknown ordinal, or mixed ownership is non-transparent and splits the promotion run. T1 exact source contiguity is unchanged.

Dynamic semantic renumbering is rejected because Session visibility and protocol normalization can change between tool execution and durable replay, shifting already-persisted block intervals. Raw epoch-local message ordinals remain authoritative: every Session entry with `type:"message"` consumes exactly one ordinal, including a missing, `null`, scalar, array, or otherwise malformed body. Duplicate IDs are a separate whole-snapshot integrity failure. Public-reference eligibility, semantic-leaf eligibility, and transparent protocol eligibility are independently stricter predicates; malformed raw slots never become public refs or T1 leaves, and a malformed slot in a child gap makes that gap non-transparent.

The source of truth for proof verification is `VerifiedRawEpochSnapshotV1`: a source-digested immutable projection of the current branch/epoch. Its digest includes session ID, branch ID, epoch ID, revision identity, and every canonical raw slot. Each slot contains its raw ordinal, entry ID, source entry index, canonical message digest, malformed classification, protocol-relevant immutable surface, and any canonical planning attestation. BranchIndex may retain Session-owned objects for display, but proof verification reads only this immutable projection. Duplicate entry IDs are an epoch-wide snapshot integrity failure; planner, pure replay, and BranchIndex replay all fail closed rather than falling back to an unaffected subrange.

Planning protocol ownership is a closed replayable attestation, not a tool-name heuristic. The AILI handler emits an attestation bound to `owner:"aili-compact"`, version, exact tool name/call ID, session ID, epoch ID, extension implementation identity, outcome, and canonical result digest. A successful `aili_compact` additionally binds `transactionId === toolCallId` and the canonical v3 transaction digest. Transparency permits only a successful closed `aili_compact_status` envelope, a successful transaction-bound `aili_compact` envelope, or an `aili_compact` closed handler rejection envelope. Rejected status, permission denial, unknown-tool, malformed schemas, a bare `"ok"` result, case/whitespace/Unicode variants, mixed third-party calls, an altered individual binding field, or a result without its matching attestation are non-transparent. The attestation is source binding for deterministic replay, not HMAC authentication or a claim of tamper-proof Session storage.

Each block-source transaction carries at most 15 `transparentGaps`, one per adjacent child pair, with `version:1`, left/right child IDs, left/right boundary leaf entry IDs, exact gap message count, `sourceSnapshotDigest`, and canonical SHA-256 gap digest over raw slots and their required attestation surface. A gap has at most 256 raw message slots. The snapshot digest is recomputed from the transaction's pre-append epoch snapshot; it prevents a source/content change from preserving a proof binding solely through entry IDs. The parent raw hull may therefore be wider than recursive semantic `leafCount`; protocol never contributes to leaf count or `v3ParentLeafDigest`.

The proof is evidence, not authority. Planner preflight, pure replay, and BranchIndex replay independently locate the boundary leaves in the same verified raw epoch snapshot, derive the exclusive raw message slice, enforce the bounded count, recompute the canonical digest, and rerun the pinned strict classifier. Missing proof is valid only when adjacent child raw intervals are already `+1`. Unknown proof versions/fields, missing endpoints, count/digest/attestation mismatch, oversized gaps, ordinary/third-party/malformed/mixed content, or pure/index disagreement fail closed. Existing strict-adjacent v3 transactions remain readable without a proof.

`VerifiedV3ReplaySeedV1` contains the lifecycle state plus source-prefix digest, epoch-boundary identity, replay digest, and projection/replay version. A structurally valid state without the exact prefix binding cannot seed an archived/restarted replay. `deriveV3CatalogId` includes a canonical structural digest for each block covering source snapshot digest, source kind and IDs, transparent proofs and their source snapshot digests, summary/quality/token metadata digests, and its creating transaction digest so altered source/proof content cannot preserve catalog identity.

## 5.1 Active blocks and source-proof compatibility

`PromotionGapIndexV1` and the immutable raw epoch snapshot remain the sole source-proof owner. New compression writes create a source-backed active block or atomically replace an explicit current selection of two to sixteen semantically adjacent active blocks. They carry no authored `T1`, `T2`, `T3`, or restill rank, no fixed lineage topology, and no tier-specific age/source-floor/economics gate. The raw source of every selected block must remain replay-verifiable; only complete attested AILI planning protocol may bridge a raw ordinal gap. Existing v3 tiered records remain readable, source-verifiable, and rollback-compatible, but their tier is not a prerequisite for a new active-block mutation.

The verified source index is built once per immutable epoch snapshot/revision. Planning, mutation, replay, search, recap, and projection query its bounded range verifier; the test-only raw-slot oracle remains independent. A healthy steady request must not replay or align omitted history. Counters record index derivation, source-range verification, recap expansion, and every raw entry visited. Timeout, killed worker, missing artifact, stale source, or hash mismatch is always non-PASS.

## 5.2 MiMo-style checkpoint and rebuild recovery

Pi derives `hardInputLimit` from `ctx.getContextUsage().contextWindow`. Because Pi exposes no separate input-only provider cap, it follows MiMoCode's combined-window branch: `outputReserve` and `recoveryReserve` are each `min(model.maxTokens, 20_000)`, and `safeBudget = hardInputLimit - outputReserve - recoveryReserve`. An invalid, zero, or reserve-exhausted input disables automatic recovery. This delta introduces no user configuration for a smaller working window.

The checkpoint thresholds use MiMoCode's default ladder against `safeBudget`: no writer below 25K; 20/40/60/80% at 25K–200K; 10–90% by 10 above 200K through 500K; and 5–90% by 5 above 500K. Thresholds are capped once at `safeBudget - 13_000`; later over-cap thresholds are omitted. A session permits one active writer, commits a checkpoint and source boundary together, preserves the last successful checkpoint on failure, and resets crossed thresholds after a verified rebuild. A final-threshold retry follows only a settled transient failure after one normal ladder step of progress; it is never an attempt counter.

Pressure classification is independent of recovery: normal below 50% of `safeBudget`, low below 70%, high below 85%, and critical otherwise. Pruning is not enabled by this change until its protected-tool/cache-freshness contract is separately accepted. At the safe budget or provider overflow, Pi first projects a current checkpoint, active-block index, and bounded protected tail through the existing `context` hook. Only a missing, stale, or failed checkpoint may invoke the existing bounded native `ctx.compact()` fallback. If both paths fail, the oversized ordinary request is blocked with a bounded diagnostic. No path restores all raw history or all full summaries.

## 5.3 ACP-style bounded provider frontier

AILI adopts ACP's lifecycle behavior and MiMoCode's recovery behavior, not either implementation: the active session model supplies summaries through Compact tools; a compression mutation creates a source-backed active block or atomically replaces explicitly selected active blocks; and `search_context`/decompression/recap expose older material only when requested. AILI does not copy ACP/MiMoCode code, hooks, configuration, persisted state, prompts, or dependencies.

The canonical source-proof ledger remains the complete current-branch evidence. It owns raw source, immutable raw epoch snapshots, attestations, block sources, gap proofs, recursive leaf identity, replay seeds, catalog identity, status eligibility, mutation validation, and search/decompression. The provider-facing frontier is a separately derived, disposable view. It cannot create source facts, alter proof classification, change raw ordinals, or authorize a mutation.

For every provider request, the derived frontier contains only:

1. protected recent raw content under the existing protection policy;
2. no more than 32 active-block descriptors, ordered by current semantic-leaf order and containing only the stable block reference, bounded topic/preview, source revision, and non-source identity metadata; and
3. full summary text only for 1–16 current blocks explicitly requested through the existing recap/decompression surface for that request.

Older raw messages and non-selected full block summaries are absent from the provider request by default, but remain readable from the source-proof ledger. A composition request first obtains its explicitly selected current block summaries, then submits the ordinary active-block replacement mutation. Successful replacement deactivates the selected blocks in the ledger and immediately replaces their descriptors in the next derived frontier; it never expands child summaries back into an ancestor summary or appends protected historical tool output.

Expansion is bounded by the active model's declared context window and current request reserve using the same conservative token estimator that prices Compact. If the model window is unavailable, the requested children cannot be safely fitted, or a source/view binding is stale, AILI returns a bounded no-expansion/stale diagnostic and preserves the ledger unchanged. The pure source-backed projection remains the fail-closed diagnostic fallback; it must not silently restore the unbounded historical frontier on a healthy request.

The frontier cache is revision, branch, epoch, model-context, config, descriptor, and selected-child-set scoped. A source/proof/index invalidation invalidates the frontier with it. A cache miss may derive one bounded descriptor/frontier view from the verified index; a healthy steady request must not re-align or canonicalize omitted historical raw provider messages. Counters separately record descriptor derivation, selected-recap expansion, omitted raw bytes/messages, bounded provider messages, invalidations, and fallback reason.

## 5.4 Frontier verification

The controlled production matrix proves that provider-facing message count and conservative token upper bound remain bounded as the active-block ledger grows, all ledger blocks remain available to planning/search even when absent from the frontier, selected two-to-sixteen block recap retrieval supports a subsequent ordinary replacement mutation, and search/decompression recover the exact ledger source without provider-frontier leakage. A malformed descriptor, stale selected block, unknown model budget, over-budget expansion, branch/epoch switch, source/proof mismatch, or cache invalidation must produce no replacement transaction and no silent raw-history projection.

## 5.5 Review-driven simplification and release-gate correction

The active release validator is owned by this change, not by the retired `redesign-aili-compact-lifecycle` proposal. Its absence must produce one bounded current-contract `NON_PASS` diagnostic; it must never disable validation or return an empty error list. Candidate review is a separate current reviewed-artifact schema bound to a validated live capture, candidate identity, and human verdict. It retains the human evidence-boundary gate but has no tier candidate, tier transaction, or restill requirement.

The unified legacy/v3 runtime catalog must be sorted by the first verified effective semantic-leaf ordinal before public block refs are assigned and before descriptor truncation. A v3 block uses its verified `firstLeafOrdinal`; a legacy block uses its first source entry's current effective ordinal. A block without a verifiable current semantic source remains readable from the ledger but is absent from the default provider frontier rather than being assigned a guessed position. Ties use stable creation/identity ordering only after source order. This prevents later v3 blocks from hiding earlier legacy blocks behind the 32-descriptor limit.

Provider-frontier selections bind the verified branch key, epoch, source revision, proof revision, descriptor identity, configuration identity, model profile, context window, reserve, and selected references. Every binding change, branch switch, cache replacement, malformed persisted recap pair, non-active selected block, or budget failure drops both retained recap messages atomically, records an invalidation/fallback as applicable, and never restores omitted historical raw content.

The independent raw-gap oracle remains required because planner, direct mutation, pure replay, cold BranchIndex replay, and append BranchIndex replay are separate validation paths. Its coverage is bounded to exact gap limits (`0`, `1`, `2`, `255`, `256`, `257`) crossed explicitly with the minimum and maximum child cardinalities (`2`, `16`) and each ordinary/valid-attested/third-party/malformed/mixed protocol classification. Focused active-block tests retain ordinary two-to-sixteen behavior coverage. The oracle may not correlate dimensions through a modulo loop or increase the timeout to conceal repeated work.

`projectIndexedProviderMessages` is not removed by assumption. Its owner must first establish whether a supported external compatibility surface exists. If none exists, delete the private-only full-history path and its private-only tests; if one exists, document its owner and real caller and keep it outside the provider-frontier healthy path.

For `i-have-adhd`, the Pi-owned adapter is official Pi `0.82.1` native discovery of the `rose-aili`-installed `~/.agents/skills/<name>/SKILL.md` plus progressive disclosure into the model prompt. It is not a duplicated `pi-skills` resource or an AILI response-rewriter. Skill-scoped evidence must bind the exact snapshot and native discovery behavior; it must not edit the canonical shared skill body or mark a record `native` without focused evidence.

## 6. Optional integration removal

The `0.1.13`–`0.1.16` line bundled `@narumitw/pi-lsp`, `pi-cache-optimizer`, and `pi-markdown-preview`. For `0.2.0`, only `pi-cache-optimizer` remains selected. `@narumitw/pi-lsp` and `pi-markdown-preview` are optional upstream developer/preview utilities, not dependencies of AILI Compact, Persistent Agents, permission modes, quota, web access, or cache correctness.

Removal is complete only when all owners agree:

1. the single native-integration entry no longer imports or identifies either package;
2. package manifest, both bundle-list aliases, and lockfile contain neither package nor their now-unreachable dependency closure;
3. runtime/package/integration tests prove the retired tools and commands are absent while remaining integrations still load;
4. README, notices, provenance, SBOM, capabilities, adapter evidence, doctor output, and package inventory stop advertising or binding them;
5. no compatibility alias, replacement implementation, conditional hidden import, or automatic install path is added.

This intentionally removes `lsp_diagnostics`, `lsp_fix`, `/lsp`, `/preview*`, and `preview_export` from the default AILI distribution. Users who need them can install their upstream Pi packages independently. The installed-predecessor rollback proof may observe that `0.1.16` included those packages, but candidate success must not depend on preserving their public surface.

## 7. Verification and publication boundary

Local BUILD may change task-scoped source, tests, OpenSpec artifacts, and non-version generated outputs when their generation is safe and already authorized. Network lookup, use of an already configured real provider and billable calls, version/lockfile mutation, package installation, commit, push, tag, npm publish, and GitHub release are separate operations and require exact approval at the point of execution.

Stable publication requires one fresh sanitized representative live run through official Pi using any already available supported provider. The live run proves transport, provider protocol acceptance, controlled before/AILI/after ordering, and a real parent-to-persistent-child lifecycle. It is not required to naturally induce a context-length error, pressure-stage suffix, child Bash marker, or four provider-authored semantic tiers.

Those failure and side-effect paths are release-blocking only in their deterministic evidence class: official-Pi production-entry `AgentSession` tests with controlled providers must prove suffix/non-persistence, context-error overflow/checkpoint/original-request retry/later work, tierless active-block projection/replacement, and MiMo checkpoint rebuild; the production Persistent Agent controlled test must prove exact task policy plus process-owned sandbox marker work. Static inspection, direct event injection, and manually relabeled live artifacts cannot substitute. The two exact 2026-08-04 OpenAI captures remain candidate-bound evidence that these behaviors were not naturally observed in those runs; they are accepted limitations rather than prerequisites for another billable failure-induction attempt.

Production AgentSession evidence must additionally prove that a real root entry with `parentId: null` yields a healthy branch index and reaches provider-message alignment. Cold-build and empty-index append tests cover both entry points; negative tests retain rejection for null beyond the root. The controlled test permission file is evidence setup only and is excluded from package/runtime configuration.

The same production matrix must prove that a second status-derived active-block recommendation after persisted AILI status/compact protocol is split at every effective-source-ordinal gap, accepted by exact mutation validation, and consistent between current and indexed planning. AILI protocol remains absent from public source refs and recent-tail aging.

It must also prove that two to sixteen current active blocks separated only by complete handler-attested AILI planning protocol can compose atomically through production block mode, while an otherwise identical gap containing one ordinary, third-party, malformed, permission-denied, or unattested name-shaped provider message is not recommended and is rejected if submitted. Legacy T1/T2/T3/restill records remain readable, but no controlled release row requires a new tiered write.

### 7.2 Full-candidate release-evidence reconciliation

The full current working tree is the single `0.2.0` candidate selected by the user. Every candidate-bound validator, artifact, and package inventory must either be regenerated through its owning safe-local command or remain `NON_PASS`; changing a stored hash or reclassifying old tiered evidence is not remediation. The release validator and harness must retire the 50-transaction/tier-specific requirement in favor of current controlled active-block and MiMo evidence. Fresh predecessor, installed rollback, representative-provider, and human-review rows remain distinct later operations with their own approvals.

Release validation additionally proves that a missing retired OpenSpec directory cannot suppress the active candidate gate, that the current reviewed-artifact schema rejects tier-shaped/forged/foreign evidence, and that only its validated capture/verdict binding satisfies the human-review row.

The live boundary does not require maintainers to obtain Anthropic or Google Gemini credentials. OpenAI, Anthropic, and Google Gemini remain covered by deterministic offline serializer/protocol fixtures. A missing family-specific live run stays `Unverified` and does not block stable publication.

Provider cache telemetry is optimization evidence, not a correctness prerequisite. Missing or zero cache telemetry produces no cache-hit claim, preserves conservative bounds, and does not block compression, recovery, or publication.

## 8. Rejected alternatives

- Fabricate or relabel `v0.1.14`: rejected because no corresponding historical candidate exists.
- Release the merged tree as `0.1.17`: rejected because the accepted merged capability line and release validator already define the breaking architectural completion as `0.2.0`.
- Reuse old hashes, direct event injection, or source-only overflow evidence: rejected because it would disconnect evidence from the candidate and official Pi production path.
- Permit null parents everywhere or strip them by cloning Session entries: rejected because either weakens lineage checks or disconnects the index from exact Session-owned entries.
- Exempt Compact tools from permission modes or inject headless approvals: rejected because it would weaken a security boundary to make a test pass; exact disposable test configuration already provides the needed authority.
- Treat the filtered public catalog as a new ordinal domain or weaken `non-contiguous-source`: rejected because persisted AILI protocol remains provider-visible source and exact blocks may not bridge it.
- Require block promotion raw ordinals to be `+1` across AILI's own persisted planning calls: rejected because it makes production T2/T3 unreachable while adding no semantic-source protection.
- Include AILI planning protocol in semantic block source or summaries: rejected because control records are not user/model content and would pollute quality/economics.
- Allow every ordinal gap during promotion: rejected because ordinary conversation and third-party protocol must remain protected and fail-closed.
- Persist dynamic semantic ordinals or trust transaction-authored gap declarations: rejected because ordinals drift across persistence boundaries and declarations do not independently prove replay source.
- Give T3/restill recursive raw-leaf token credit or relax parent benefit thresholds: rejected because neither reflects the immediate recap representation Pi sends to the provider and either would let an oversized parent claim savings it does not create.
- Retain the 23-transaction hierarchy by assuming larger summary text alone makes it viable: rejected because the conservative lower/upper token bounds and restill source floor make that shape capacity-infeasible even at the 18,000-character ceiling.
- Insert a protected separator only in the controlled fixture: rejected because it would hide the production planner defect rather than prove executable recommendations.
- Expand all historical summaries or protected output into later parent/provider requests: rejected because it preserves the unbounded provider-facing surface that blocks the controlled topology and differs from the selected ACP-style active-frontier behavior.
- Copy ACP/DCP source, hooks, configuration, persistence, or prompts: rejected because AILI must preserve its own Pi/runtime/proof contract and upstream runtime/license compatibility is not established by prior-art review.
- Require natural real-provider pressure, overflow, sandbox-marker work, and four-tier semantic transactions: rejected after two exact OpenAI runs because the induction is costly and nondeterministic; deterministic production-entry tests prove those code paths while the real provider remains responsible for the external transport/order/lifecycle boundary.
- Drop every representative provider boundary, rollback, adapter, or final human limitation review to publish faster: rejected because it would remove evidence for the affected production boundary.
- Require complete live matrices or new credentials for every supported provider family: rejected because serializer support does not imply a maintainer account requirement and provider-neutral behavior is already covered by deterministic and representative-live evidence.
- Merely stop bundling LSP/preview while retaining them as default dependencies: rejected because it shrinks the tarball but preserves the unwanted install, startup, tool, and maintenance surface.
- Replace either upstream integration with AILI-owned LSP or preview code: rejected because the user requested removal, not a fork or substitute.
