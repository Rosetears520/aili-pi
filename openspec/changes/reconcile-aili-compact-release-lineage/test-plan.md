# Test Plan: reconcile-aili-compact-release-lineage

**Target:** `@rosetears/aili-pi@0.2.0` stable release  
**Status:** Raw-interval gap-proof revision accepted; affected repository-local BUILD resumed  
**Host baseline:** official Pi `0.82.1` on Linux  
**Rollback predecessor:** verified `@rosetears/aili-pi@0.1.16`, bound to the recorded Git/npm/tarball comparison and installed rollback evidence

## 1. Acceptance invariants

| ID | Required outcome |
|---|---|
| REL-A | No active gate fabricates or requires a `v0.1.14` artifact; P0 behavior remains fully inherited |
| REL-B | Git and npm fresh evidence agree on exact predecessor identity before rollback or publication |
| REL-C | Candidate identity is exact `0.2.0` across package, lock root, SBOM, runtime, tests, and release evidence |
| REL-D | AGPL disposition history remains independently anchored at `0.1.13` |
| REL-E | Rollback uses the real installed predecessor and a copied sanitized session in disposable roots |
| REL-F | `i-have-adhd` becomes releasable only through an executable Pi-owned adapter and behavior evidence |
| REL-G | Changed real-provider Persistent Agent transport and parent-to-child lifecycle claims are rerun; process-owned sandbox work is proved separately through the controlled production path; hash replacement alone is insufficient |
| REL-H | Every required Compact artifact is fresh, sanitized, PASS, and bound to the exact candidate implementation hash |
| REL-I | One available supported provider proves the official-Pi transport/protocol/order/parent-child boundary; suffix/overflow/retry/sandbox/lifecycle behavior remains fully automated through deterministic official-Pi production-entry tests; OpenAI/Anthropic/Gemini serializer compatibility remains offline |
| REL-J | No external, credential, version, lockfile, installation, Git, tag, publish, or release operation runs without its exact approval |
| REL-K | Stable release does not require Anthropic or Google Gemini credentials or complete family-specific live matrices; missing cache telemetry is non-blocking `Unverified` optimization evidence |
| REL-L | Default `0.2.0` removes `@narumitw/pi-lsp` and `pi-markdown-preview` completely, retains `pi-cache-optimizer`, and ships no replacement, hidden import, retired tool/command, or unreachable bundled closure |
| REL-M | Real-provider NON_PASS observations for uninduced pressure/overflow/sandbox-marker/tier behavior remain honest limitations and cannot substitute for, or invalidate, exact PASS controlled-production rows |
| REL-N | Official Pi's null root-parent sentinel is accepted only at the true root; controlled test authority is exact and disposable, with no shipped permission weakening |
| REL-O | Safe planning excludes AILI protocol from public refs and tail aging but splits recommendations at every effective-source-ordinal discontinuity; exact mutation contiguity remains fail-closed |
| REL-P | T2/T3 promotion treats only complete AILI-owned planning protocol as transparent between child semantic leaves; T1 source, ordinary messages, third-party tools, malformed protocol, and unknown gaps remain strict |
| REL-Q | Raw branch-message intervals remain authoritative; every non-empty transparent child gap has a bounded versioned proof independently revalidated from the immutable branch by planner, pure replay, and BranchIndex replay |

## 2. Traceability matrix

| Requirement / risk | Task | Verification / evidence | Coverage before BUILD |
|---|---|---|---|
| REL-A; false release history | 2.1 | strict OpenSpec materialization; release-validator unit tests; active release-doc inspection | planned |
| REL-B; wrong rollback source | 3.1 | approved `git ls-remote`/GitHub tag evidence plus npm registry/dist metadata and integrity comparison | `Unverified` |
| REL-C/D; version/license coupling | 2.2, 3.2 | package/registry/provenance/doctor unit tests; package, lock, SBOM and README/license assertions | planned |
| REL-E; fake rollback | 3.3 | installed predecessor and candidate copied-session matrix; prefix hash; disposable HOME; continued work | `Unverified` |
| REL-F; blocked compatibility | 2.3, 2.4 | adapter unit/integration test; generated compatibility and stable-release validator | planned |
| REL-G; stale boundary evidence | 3.4, 3.5 | fresh real OpenAI transport/order and exact parent-task/child-lifecycle evidence; controlled production sandbox marker evidence; current hashes | real boundary observed / reconciliation planned |
| REL-H; stale candidate artifacts | 4.1 | candidate-bound migration/performance/fake/real-boundary/controlled-production/provenance/sanitizer/index schema and hash checks | planned |
| REL-I/K/M; behavioral regression, evidence-class confusion, or credential overreach | 3.4, 3.5, 4.2, 4.3 | real provider boundary, controlled production AgentSession/Persistent matrices, offline three-family serializer protocol matrix, preserved limitation artifacts, human review | material revision pending acceptance |
| REL-L; unwanted optional product/dependency surface | 2.6, 4.1, 4.2, 4.3 | native-integration and package negatives; lock/SBOM/provenance/generated-owner checks; runtime command/tool inventory; package dry-run | planned |
| REL-N; production entry fails before controlled evidence or test setup weakens permission policy | 2.5, 3.5, 4.2 | branch-index cold/append root-null positives and later-null negatives; real AgentSession healthy-index/provider-pass assertion; exact disposable permission config; shipped-default regression | root cause confirmed / repair planned |
| REL-O; planner advertises a source range that exact mutation validation rejects across omitted persisted protocol | 2.7, 3.5, 4.2 | safe-planning ordinal-gap split tests; current/index parity; unchanged `non-contiguous-source` negatives; repeated production AgentSession status/compact transaction | root cause confirmed / revision pending acceptance |
| REL-P; strict raw-ordinal adjacency makes production promotion unreachable or broad gap skipping loses semantic source | 2.8, 3.5, 4.2 | shared promotion-gap classifier units; status/mutation parity; AILI-only positive; ordinary/third-party/malformed/unknown/mixed negatives; production T1→T2→T3→restill matrix | root cause confirmed / revision pending acceptance |
| REL-Q; dynamic ordinal drift or transaction-authored proof bypass breaks replay integrity | 2.9, 3.5, 4.2 | closed-schema parser negatives; raw endpoint/count/digest recomputation; parent hull-vs-leaf-count checks; legacy strict-adjacent compatibility; pure/index parity; forged/oversized/unknown proof rejection | design selected / revision pending acceptance |
| REL-J; unauthorized operation | all | operation log and stop-before-operation negatives; explicit approval record per class | planned |

## 3. Local contract and implementation checks

1. Strict-validate this change and materialize the sequence base → P0 → lifecycle redesign → emergency checkpoint → release-lineage reconciliation.
2. Assert active validators and generated candidate evidence do not require or emit a separately-installed `v0.1.14` row.
3. Keep historical files intact where they serve as superseded evidence; active release summaries must clearly point to this reconciliation.
4. Exercise predecessor mismatch, missing registry result, missing tag, package-name mismatch, integrity mismatch, and lookup failure as fail-closed cases.
5. Prove package version and license-since version are separate constants/fields and test both values.
6. Prove the `i-have-adhd` adapter owns real Pi presentation behavior, stays bounded to response shaping, does not alter the shared skill body, and cannot be promoted by a manual manifest edit.
7. Prove `@narumitw/pi-lsp` and `pi-markdown-preview` are absent from native registration, dependencies, both bundle-list aliases, lock packages, docs, provenance/SBOM, generated manifests, runtime tool/command inventory, and the npm archive.
8. Prove `pi-cache-optimizer` and every other retained integration still load through the single AILI entry; do not replace or alias the removed surfaces.
9. Prove official Pi root entries with `parentId: null` pass cold build and the first append to an empty index, while later null, empty, non-string, parent-tip, and impossible-lineage cases remain rejected.
10. Bind the real AgentSession extension lifecycle before controlled prompts; use a disposable agent-dir permission file that allows only `aili_compact_status` and `aili_compact`, keeps wildcard custom tools at `ask`, and does not modify generated/shipped permission owners.
11. Prove current and indexed planners split retained source at every effective-provider-ordinal discontinuity while AILI status/compact caller/result messages remain excluded from public refs and recent-tail aging; preserve exact mutation rejection for any caller-supplied bridging range.
12. Prove lifecycle status and mutation validation share one exact promotion-gap classifier: complete AILI-owned planning caller/result atoms are transparent only between child blocks, remain absent from semantic source/digests, and every ordinary, third-party, incomplete, malformed, unknown, or mixed gap splits/rejects promotion.
13. Prove every non-empty transparent gap writes one closed `version:1` proof binding adjacent child IDs, boundary leaf IDs, message count, and canonical digest; planner, pure replay, and BranchIndex replay each resolve and reclassify the immutable raw slice. Parent raw hull may exceed semantic `leafCount`, but recursive leaf order/count/digest must remain exact. Missing proofs pass only for raw-`+1` legacy adjacency.

## 4. Installed predecessor migration and rollback

Under separate network and installation approvals:

1. resolve and fetch exact predecessor package metadata/tarball plus corresponding Git tag;
2. use disposable package roots and HOME; never touch a user's live Pi settings or Session;
3. verify predecessor opens the sanitized predecessor fixture and continues work;
4. copy the session, run the `0.2.0` candidate through v1/v2 replay, v3 operations, branch/epoch changes, checkpoint, restart, and continued work;
5. preserve the original JSONL byte prefix and verify no raw-conversation sidecar;
6. reopen another copy with the predecessor using the documented native-checkpoint/no-new-v3 rollback procedure;
7. record expected old-binary v3 limitations as limitations, not failures hidden by synthetic state.

Any renamed local tree, source-only simulation, direct hook, synthetic `CompactionEntry`, or missing installed binary leaves REL-E `Unverified`.

## 5. Real-provider boundary and controlled production evidence

One separately approved configured-provider run must establish only the external boundary that deterministic providers cannot prove:

- official Pi loads the exact production extension and completes a real provider request;
- bounded provider/model/API/context/usage and response-digest evidence is current and sanitized;
- controlled third-party context handlers execute before and after AILI in the expected order;
- one exact synchronous parent `task` call reaches a completed persistent child lifecycle with exact task arguments and zero parent Bash calls;
- no credentials, raw conversations, provider payloads, private paths, or full logs enter durable evidence.

The current candidate already has two exact OpenAI captures. The latest proves transport, ordering, exact parent task arguments, zero parent Bash calls, completed child lifecycle, and external workspace lifecycle. It also truthfully records that pressure suffix, provider context overflow, child sandbox marker work, and four semantic tiers were not naturally observed. Those absent observations remain bounded limitations and do not require another billable provider attempt.

The following claims must instead pass through deterministic controlled-provider tests using the official Pi production extension and `AgentSession`/Persistent Agent seams:

- non-NORMAL pressure eligibility, transient suffix protocol validity, complete real tool-result ordering, and suffix non-persistence;
- actual provider-class context error delivered by the controlled provider, overflow checkpoint persistence, Pi original-request retry, and later work;
- exact task policy, completed child lifecycle, zero parent Bash calls, one process-owned child sandbox operation, and exact marker bytes;
- P0 recovery, lifecycle/tiering, rejection, deterministic/native checkpoint, copied-session migration, PTY status, and continued work.

Before those rows can pass, the production AgentSession matrix must prove a healthy Compact branch index from an actual official Pi root entry carrying `parentId: null` and at least one provider-message alignment pass. Null is valid only for that root in cold build or the first append to an empty index; later null parents remain invalid. The controlled tool path must call `session.bindExtensions(...)` and use exact test-only permission preauthorization for `aili_compact_status` and `aili_compact`; it must not exempt Compact in production or inject a headless approval callback.

After one real T1 persists, the next status-derived recommendation must not bridge the omitted status/compact caller-result protocol. Current and indexed planning must split at the same effective-source-ordinal discontinuities, leave AILI protocol outside public refs and recent-tail aging, and return a range accepted by unchanged exact mutation validation. A caller-supplied bridging range must still fail `non-contiguous-source` with no appended transaction.

Block promotion uses a separate semantic-adjacency rule. Two ordered child blocks may be promotion-adjacent across a raw ordinal gap only when the immutable branch proves that every intervening provider message forms complete AILI-owned `aili_compact_status`/`aili_compact` planning protocol. Status must advertise that group and block mutation must accept the same group. Injecting one ordinary message, third-party tool atom, incomplete/malformed AILI atom, missing ordinal, or mixed gap must remove the recommendation and cause direct submission to fail without append. Parent recursive leaf order/digest/count excludes all transparent protocol entries.

For each accepted non-empty child gap, the block-source transaction records at most one bounded proof per adjacent pair and at most 15 total. Unknown fields/version, duplicate or non-adjacent child bindings, missing boundary leaves, more than the configured bounded gap messages, count/digest mismatch, classifier mismatch, or pure/index replay disagreement rejects the transaction. The raw parent interval spans its children and transparent protocol; only recursive semantic leaves contribute to `leafCount` and `leafDigest`. Previously valid raw-`+1` v3 parents require no proof and remain readable.

Direct hook calls, direct event injection, source-only simulation, or manual artifact promotion cannot satisfy these rows. OpenAI, Anthropic, and Google Gemini serializer/protocol compatibility remains deterministic and offline without credentials or provider requests. Anthropic and Google Gemini credentials, transport availability, and complete family-specific live matrices are not stable-release requirements. Missing, zero, or ambiguous cache telemetry makes no cache-hit claim and remains bounded `Unverified`; it does not block compression or release.

Final human review accepts the evidence-class boundary, the two preserved real-live limitations, quality/recovery wording, and remaining bounded unknowns. It does not require a provider-authored four-tier semantic-review candidate.

## 6. Verification order

Run the smallest affected checks first and stop for root-cause repair on failure:

```bash
openspec validate reconcile-aili-compact-release-lineage --strict
npx vitest run tests/unit/aili-compact-release-evidence.test.ts tests/unit/doctor.test.ts tests/unit/package.test.ts tests/unit/provenance.test.ts tests/integration/i-have-adhd-compatibility.test.ts
npm run typecheck
npm run validate:generated
npm run validate:compatibility
npm run validate:package
npm run validate:provenance
node scripts/validate-aili-compact-openspec-sequence.mjs --json
npx vitest run tests/integration/aili-compact-migration.test.ts tests/integration/aili-compact-performance.test.ts tests/integration/aili-compact-fake-provider.test.ts
npx vitest run tests/unit/aili-compact-branch-index.test.ts tests/unit/aili-compact-safe-planning.test.ts tests/integration/aili-compact-agent-session.test.ts tests/integration/persistent-agent-production.test.ts tests/unit/aili-compact-provider-suffix.test.ts tests/unit/live-release-support.test.ts
npm test
npm run validate:release
git diff --check
npm pack --dry-run --json
```

Commands with network, credentials, installation, version/lockfile mutation, or publication side effects run only under their own approvals and are not made safe by appearing in this plan.

## 7. Stable candidate acceptance

The candidate is ready for publication only when:

1. REL-A through REL-Q are PASS with fresh evidence;
2. every command in section 6 passes against the final candidate tree;
3. predecessor and migration pass; the real configured-provider transport/order/parent-child boundary passes; controlled-production suffix/overflow/retry/sandbox/lifecycle rows pass;
4. generated release index and sanitizer bind exact package `0.2.0`, Pi `0.82.1`, current implementation hash, and all artifact hashes;
5. deterministic offline serializer/protocol compatibility passes for OpenAI, Anthropic, and Google Gemini without requiring family credentials;
6. missing cache telemetry is reported without a cache-hit claim and is not treated as a correctness failure;
7. package dry-run contains only intended files and correct license/SBOM/notices/provenance;
8. package/runtime/generated evidence proves both retired integrations and their tools, commands, and unreachable bundle closure are absent while retained integrations still pass;
9. human review accepts the real-vs-controlled evidence boundary, preserved live limitations, quality/recovery, rollback, cache/performance wording, package contents, and remaining bounded `Unverified` claims;
10. publication still waits for separate commit, push, tag, npm publish, and GitHub release approvals.

## 8. Acceptance record

- [x] 2026-08-02: user accepted the release-lineage decision: do not manufacture `v0.1.14`; target merged capability at `v0.2.0`; verify the expected real predecessor before rollback.
- [x] 2026-08-02: user accepted the earlier final `test-plan.md` and authorized repository-local BUILD; this acceptance is historical and does not cover the later material verification-strategy revision.
- [x] 2026-08-02: user explicitly decided that Anthropic and Google Gemini authentication and complete all-family live matrices are not required.
- [x] 2026-08-02: user explicitly accepted this revised final `test-plan.md` and authorized repository-local BUILD to implement the corrected validator/harness/tests; provider calls and publication operations remain separately gated.
- [x] 2026-08-03: user explicitly decided to remove `@narumitw/pi-lsp` and `pi-markdown-preview` completely and continue the delivery flow; this material product/dependency delta returned affected work to DEFINE.
- [x] 2026-08-03: user accepted this dependency-removal revision of the final `test-plan.md` and resumed repository-local BUILD; provider/live and publication operations remain separately gated.
- [x] 2026-08-04: after two exact OpenAI captures, the user selected deterministic production-entry verification for suffix/overflow/retry/sandbox/lifecycle while retaining the real OpenAI transport/order/parent-child boundary; this material verification-strategy change returned BUILD to DEFINE.
- [x] 2026-08-04: user explicitly accepted this verification-strategy revision of the final `test-plan.md` and resumed repository-local BUILD; no provider/network or publication authority was granted.
- [x] 2026-08-04: after BUILD exposed official Pi null-root incompatibility and exact permission setup constraints, the user selected a bounded production-path repair and rejected weakening the controlled-production evidence class.
- [x] 2026-08-04: user explicitly accepted this production-entry compatibility revision of the final `test-plan.md` and resumed repository-local BUILD; no provider/network or publication authority was granted.
- [x] 2026-08-06: after the controlled AgentSession exposed a hidden effective-ordinal gap across persisted AILI protocol, the user selected source-ordinal-aware safe-range splitting and rejected weakening exact mutation contiguity.
- [x] 2026-08-06: user explicitly accepted this safe-range ordinal-gap revision of the final `test-plan.md` and resumed repository-local BUILD; no provider/network or publication authority was granted.
- [x] 2026-08-06: after BUILD proved strict raw-ordinal adjacency makes production T2/T3 unreachable, the user selected promotion transparency only for complete AILI-owned planning protocol and kept all semantic/third-party gaps strict.
- [x] 2026-08-06: user explicitly accepted this promotion-adjacency revision of the final `test-plan.md` and resumed repository-local BUILD; no provider/network or publication authority was granted.
- [x] 2026-08-06: after dynamic semantic ordinals drifted across persistence/replay, the user selected authoritative raw intervals plus bounded replay-verified gap proofs instead of a semantic-ordinal registry.
- [x] 2026-08-07: user explicitly accepted this raw-interval gap-proof revision of the final `test-plan.md` and resumed affected repository-local BUILD; no provider/network, dependency/lock/version, Git, or publication authority was granted.
