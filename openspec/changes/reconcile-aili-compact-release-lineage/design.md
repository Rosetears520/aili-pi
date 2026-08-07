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

That strict T1 repair exposes a separate promotion domain. Every production T1 is created by persisted AILI status/compact caller-result protocol, so separately created blocks cannot be adjacent under raw provider ordinals. Promotion adjacency therefore operates on semantic leaves, not by pretending the control protocol is source. For each gap between ordered child leaf intervals, the runtime must prove from the immutable current branch that every intervening provider ordinal belongs to complete, well-formed AILI-owned `aili_compact_status` or `aili_compact` planning protocol. Only such a gap is transparent. The protocol remains persisted, excluded from block source/digests/summaries and recent-tail aging, and visible to audit/replay.

The same classifier must drive lifecycle status recommendations and mutation/reducer validation so status never advertises an uncommittable group. A gap containing a user/assistant message, third-party tool call/result, incomplete sibling set, malformed result, unknown ordinal, or mixed ownership is non-transparent and splits the promotion run. T1 exact source contiguity is unchanged.

Dynamic semantic renumbering is rejected because Session visibility and protocol normalization can change between tool execution and durable replay, shifting already-persisted block intervals. Raw epoch-local provider-message ordinals remain authoritative. Each block-source transaction carries at most 15 `transparentGaps`, one per adjacent child pair, with `version:1`, left/right child IDs, left/right boundary leaf entry IDs, exact gap message count, and canonical SHA-256 gap digest. The parent raw hull may therefore be wider than recursive semantic `leafCount`; protocol never contributes to leaf count or `v3ParentLeafDigest`.

The proof is evidence, not authority. Planner preflight, pure replay, and BranchIndex replay independently locate the boundary leaves in the immutable current-epoch branch, derive the exclusive raw message slice, enforce the bounded count, recompute the canonical digest, and rerun the pinned strict classifier. Missing proof is valid only when adjacent child raw intervals are already `+1`. Unknown proof versions/fields, missing endpoints, count/digest mismatch, oversized gaps, ordinary/third-party/malformed/mixed content, or pure/index disagreement fail closed. Existing strict-adjacent v3 transactions remain readable without a proof.

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

Those failure and side-effect paths are release-blocking only in their deterministic evidence class: official-Pi production-entry `AgentSession` tests with controlled providers must prove suffix/non-persistence, context-error overflow/checkpoint/original-request retry/later work, and lifecycle/tiering; the production Persistent Agent controlled test must prove exact task policy plus process-owned sandbox marker work. Static inspection, direct event injection, and manually relabeled live artifacts cannot substitute. The two exact 2026-08-04 OpenAI captures remain candidate-bound evidence that these behaviors were not naturally observed in those runs; they are accepted limitations rather than prerequisites for another billable failure-induction attempt.

Production AgentSession evidence must additionally prove that a real root entry with `parentId: null` yields a healthy branch index and reaches provider-message alignment. Cold-build and empty-index append tests cover both entry points; negative tests retain rejection for null beyond the root. The controlled test permission file is evidence setup only and is excluded from package/runtime configuration.

The same production matrix must prove that a second status-derived T1 recommendation after persisted AILI status/compact protocol is split at every effective-source-ordinal gap, accepted by unchanged exact mutation validation, and consistent between current and indexed planning. AILI protocol remains absent from public source refs and recent-tail aging.

It must also prove that multiple exact T1 blocks separated only by complete AILI-owned planning protocol form a T2 promotion group and commit through production block mode, while an otherwise identical gap containing one ordinary or third-party provider message is not recommended and is rejected if submitted. T2/T3/restill recursive leaf order and digest/count remain exact and contain no protocol entries.

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
- Insert a protected separator only in the controlled fixture: rejected because it would hide the production planner defect rather than prove executable recommendations.
- Require natural real-provider pressure, overflow, sandbox-marker work, and four-tier semantic transactions: rejected after two exact OpenAI runs because the induction is costly and nondeterministic; deterministic production-entry tests prove those code paths while the real provider remains responsible for the external transport/order/lifecycle boundary.
- Drop every representative provider boundary, rollback, adapter, or final human limitation review to publish faster: rejected because it would remove evidence for the affected production boundary.
- Require complete live matrices or new credentials for every supported provider family: rejected because serializer support does not imply a maintainer account requirement and provider-neutral behavior is already covered by deterministic and representative-live evidence.
- Merely stop bundling LSP/preview while retaining them as default dependencies: rejected because it shrinks the tarball but preserves the unwanted install, startup, tool, and maintenance surface.
- Replace either upstream integration with AILI-owned LSP or preview code: rejected because the user requested removal, not a fork or substitute.
