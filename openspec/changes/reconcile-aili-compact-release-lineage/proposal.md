## Why

The accepted AILI Compact release contract names `v0.1.14` as a separately published P0 predecessor, but repository history contains no `v0.1.14` tag, commit, package identity, or recoverable P0-only candidate. The current tree contains the P0 recovery behavior, the complete lifecycle redesign, and the emergency-checkpoint correction together. Creating or relabeling an artifact as `v0.1.14` would fabricate release history and still would not provide trustworthy rollback evidence.

The release path must preserve every P0 safety invariant while grounding migration, rollback, package identity, and release evidence in versions that actually exist. The user accepted on 2026-08-02 that the nonexistent `v0.1.14` will not be manufactured, the merged capability line will target `v0.2.0`, and the latest real published `0.1.x` predecessor—expected from current local Git evidence to be `v0.1.16`—will be verified before it is used for rollback evidence. On 2026-08-03 the user also decided that `@narumitw/pi-lsp` and `pi-markdown-preview` are not part of the intended `0.2.0` product surface and must be removed rather than merely unbundled. On 2026-08-04, after two exact OpenAI captures proved the real transport/order and parent-to-child lifecycle boundary but did not naturally induce pressure, context overflow, sandbox marker work, or provider-authored tier transactions, the user selected a deterministic production-entry verification strategy for those failure/side-effect paths instead of further billable failure induction. BUILD then exposed an official-Pi compatibility defect: Pi represents the root Session entry with `parentId: null`, while the Compact branch index rejected every defined non-string parent. The user selected a bounded production-path repair rather than weakening the accepted evidence class. Controlled production subsequently exposed safe-range and promotion defects: omitted AILI protocol created hidden source gaps, and strict raw-ordinal block adjacency made every separately created T1 ineligible for T2 promotion. The user selected source-ordinal-aware T1 range splitting plus narrowly AILI-protocol-transparent block promotion rather than weakened source contiguity, protocol summarization, or artificial fixtures.

## What Changes

- Reclassify `fix-aili-compact-recovery-deadlock` as the mandatory P0 behavioral predecessor rather than a claim that `v0.1.14` was independently published.
- Keep `@rosetears/aili-pi@0.2.0` as the exact target for the merged P0, lifecycle-redesign, and emergency-checkpoint implementation.
- Resolve the rollback predecessor from fresh Git-remote and npm-registry evidence under separate network approval. The expected value is `0.1.16`; mismatch stops version-sensitive work instead of being guessed around.
- Replace the impossible separately-installed-`v0.1.14` migration row with a copied-session and installed-package rollback rehearsal against that verified predecessor.
- Separate the current package version from the historical `AGPL-3.0-or-later` disposition start at `0.1.13`; a `0.2.0` candidate must not rewrite license history.
- Repair the remaining stable-release blockers through their owners: current package/generated identity, the `i-have-adhd` Pi-owned presentation adapter, stale Persistent Agent live verification, and candidate-bound AILI Compact evidence.
- Preserve fail-closed release validation. Missing, stale, wrong-version, wrong-provider, unsanitized, or wrong-evidence-class evidence remains `NON_PASS`; a real transport result cannot substitute for a controlled failure-path test, and a controlled failure-path test cannot fabricate a real provider transport result.
- Require one fresh representative real-provider/Pi boundary run using an already available configured provider. It proves transport, provider protocol acceptance, controlled extension order, and a real parent-to-persistent-child lifecycle. Deterministic production-entry `AgentSession` tests own suffix/non-persistence, overflow/checkpoint/retry/later-work, process-owned child sandbox work, and lifecycle/tiering behavior. OpenAI/Anthropic/Google Gemini serializer and protocol compatibility remains deterministic and offline. Stable release does not require obtaining Anthropic or Google Gemini credentials or running a complete live matrix for every provider family.
- Treat missing provider cache telemetry as `Unverified` optimization evidence that preserves conservative behavior and does not block compression or stable publication.
- Remove `@narumitw/pi-lsp` and `pi-markdown-preview` from production registration, dependencies, bundle metadata, lock state, docs, provenance/SBOM, generated capability evidence, and public tool/command expectations. Keep `pi-cache-optimizer` as the remaining selected cache integration.
- Require package/runtime negatives proving that `lsp_diagnostics`, `lsp_fix`, `/lsp`, `/preview*`, and `preview_export` are not shipped or registered by `0.2.0`; users may install those upstream Pi extensions separately when wanted.
- Accept official Pi's `parentId: null` only for the actual root Session entry in cold build or the first append to an empty index. Preserve fail-closed rejection of null or malformed parents everywhere else and add exact official-Pi AgentSession regressions.
- Exercise controlled Compact tool calls with a disposable test-only permission configuration that preauthorizes only `aili_compact_status` and `aili_compact`, binds the real extension lifecycle, and leaves shipped permission defaults and headless `ask → deny` behavior unchanged.
- Preserve AILI protocol exclusion from public refs and recent-tail aging, but split every advertised safe source range at an effective-provider-ordinal discontinuity so persisted omitted protocol remains a hard source boundary and every recommendation is executable under exact mutation validation.
- Define T2/T3 promotion adjacency over semantic leaves: an ordinal gap between child blocks is transparent only when every omitted ordinal is proven to be complete AILI-owned `aili_compact_status`/`aili_compact` planning protocol. Ordinary messages, third-party tools, malformed protocol, unknown ordinals, and mixed gaps remain fail-closed.
- Keep raw branch-message intervals authoritative and add bounded versioned gap proofs to block-source transactions. Creation and replay independently resolve the immutable branch slice, verify endpoints/count/digest, and rerun the strict classifier; a transaction claim alone never proves transparency.
- Require rollback, package dry-run, full regression, and human acceptance of the evidence boundary, quality limitations, and remaining `Unverified` claims before stable publication. A provider-authored long-lifecycle review candidate is not required when deterministic production-entry evidence owns that claim.

## Capabilities

### New Capabilities

- `aili-compact-release-lineage`: truthful predecessor resolution, P0 behavioral inheritance, rollback rehearsal, candidate identity, and release-evidence binding for `v0.2.0`.

### Modified Capabilities

- `aili-compact-branch-index`: accept official Pi's null parent sentinel only for the actual Session root while preserving strict later ancestry validation.
- `aili-compact-safe-planning`: keep omitted AILI protocol out of source refs and tail aging while splitting recommendations at its effective-provider-ordinal gaps.
- `aili-compact-tiered-lifecycle`: preserve exact T1 source contiguity while treating only complete, replay-proven AILI-owned planning protocol as transparent for block-to-block promotion adjacency.
- `aili-compact-checkpoint-recovery`: preserve P0 recovery as a behavioral prerequisite without asserting a nonexistent `v0.1.14` publication.
- `reversible-context-compression`: bind migration and rollback evidence to the verified real published predecessor and the exact `0.2.0` candidate.

## Impact

- Contract and validation: active AILI Compact release docs, migration rows, release-evidence validator, sequence checks, and focused tests.
- Runtime metadata: package/candidate version ownership and license-since ownership in `src/runtime/registry.ts` and direct consumers.
- Compatibility: a Pi-owned `i-have-adhd` presentation adapter plus generated compatibility/provenance evidence; no shared skill-body edit.
- Candidate metadata: `package.json`, lock root, SBOM, notices/provenance, release artifacts, and package dry-run output only under their applicable operation approvals.
- Live evidence: one current configured-provider official-Pi boundary for transport, provider protocol acceptance, controlled extension order, and parent-to-persistent-child lifecycle. The two 2026-08-04 OpenAI captures remain honest limitation evidence for real pressure/overflow/sandbox-marker/tier observations and are not relabeled as those claims.
- Controlled production evidence: suffix/non-persistence, overflow/checkpoint/original-request retry/later work, process-owned child sandbox marker work, and lifecycle/tiering run through official Pi production `AgentSession`/entry seams with deterministic providers and exact negative cases.
- Production compatibility: strictly normalize official Pi's null root-parent sentinel at the branch-index boundary; test-only exact Compact tool permission preauthorization must not alter shipped permission policy; safe planning must not advertise ranges that bridge omitted persisted AILI protocol; promotion may bridge only fully classified AILI-owned planning protocol.
- Offline compatibility: deterministic provider serializer/protocol fixtures cover OpenAI, Anthropic, and Google Gemini without provider authentication or requests.
- Package surface: remove the two optional upstream integrations through their runtime/package/generated owners; retain normal independent installation as the user opt-in path rather than an AILI compatibility shim.
- Non-goals: no dependency addition, no replacement LSP/preview implementation, no fabricated `v0.1.14`, no Pi fork, no broad Compact permission exemption, no headless approval injector, no filtered-ordinal mutation semantics, no protected fixture separator that conceals a planning defect, no Anthropic/Google Gemini credential requirement, and no implicit network, credential, Git, tag, publish, or release authority.
