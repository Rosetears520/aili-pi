# Change Context: AILI Compact

## Change identity

- `change_id`: `add-reversible-context-compression`
- `capability`: `reversible-context-compression`
- `backend`: OpenSpec `spec-driven`
- `lifecycle_phase`: BUILD
- `acceptance_state`: exclusive-owner/bootstrap-HOME-write final test plan accepted by the user on 2026-07-27; tasks 10.1-10.5 authorized

## Why this returned to DEFINE

A direct source comparison against `ranxianglei/opencode-acp@v1.12.6` at commit `f1a33d9f4ce55af808eb4e050717c914ed16084b` found material gaps between the accepted parity claim, completed task checkmarks and current implementation. The current tree has a valid Pi-native base, but model-addressable references, recap projection, range/message schemas, functional commands/manual semantics, fixed custom-prompt slots, policy/subagent/GC behavior and full cache identity are not complete. The user asked to revise the plan and reopen unfinished work before further implementation.

## Grounded product decisions

- **Name and namespace:** the only user-facing name is **AILI Compact** / `aili-compact`; command `/aili-compact`; model tools `aili_compact`, `aili_decompress`, `aili_prune`, `aili_search_context`, `aili_compact_status`, plus recap protocol/retrieval tool `aili_context_recap`. No ACP/DCP alias.
- **Delivery surface:** one owned runtime component in the existing AILI Extension; no second Package, entry or beta/GA branch.
- **Host precedence:** Pi 0.81.1 owns Session persistence, tree/current-branch behavior, provider-context lineage, lifecycle and native compaction epoch semantics. Pinned ACP informs portable user-observable behavior only.
- **Source fidelity:** Pi-persisted JSONL/tree entries remain append-only and queryable. AILI only appends validated state/control transactions and creates provider-time projections. It creates no raw sidecar.
- **Model addressability:** mutation tools use replay-stable epoch-scoped message/block references exposed by status/search/nudges; persisted transactions remain anchored to real Pi source IDs/digests.
- **Compression:** one `aili_compact` tool provides bounded range/message modes. Active semantic blocks must project a stable recap assistant-tool/result pair at the original anchor; summaries cannot survive only in historical compress arguments.
- **Commands:** declared context/stats/sweep/manual/compress/decompress/recompress commands require distinct functional behavior. Manual mode is independent from automatic cooling; direct human controls cannot create model summaries.
- **Search/decompression:** model search is current-branch only. Current-epoch nested blocks may be decompressed/recompressed under lineage rules; native-epoch/GC archived blocks remain query-only.
- **Policy:** hard/configurable protection, grouped cooling, dedupe, purge-error, adaptive guidance, default-off subagent gating and generational/nested GC are part of the accepted functional target. Known upstream cache regressions are excluded.
- **Compaction:** AILI is the exclusive threshold/manual/overflow compression owner. Bootstrap disables Pi auto-compaction in user-global settings; AILI runs its own provider-free 100% GC before provider context is sent and cancels any native compaction hook that still arrives. No new Pi compaction summary/fallback is permitted; unrecoverable overflow is surfaced as an error.
- **Cache:** eligibility identity includes provider/model/session/branch/epoch/projection/guidance/tool surface. Missing cache fields are unavailable, not zero-hit. Eligible warmed unchanged requests retain the `>=85%` observed live target; local code may prove determinism/accounting but not provider hits.
- **UI:** concise footer, bounded numeric details and the accepted responsive non-capturing below-editor widget fallback remain the Pi 0.81.1 contract.
- **Config:** enabled by default; global `~/.pi/agent/aili-compact.jsonc` < project `.pi/aili-compact.jsonc` < append-only per-session controls. AILI config/prompt files are never auto-written. Separately, the user selected bootstrap-managed user-global Pi settings: atomically merge `compaction.enabled=false` into `~/.pi/agent/settings.json`, preserve unrelated keys, and fail without overwrite on malformed JSON.
- **Custom prompts:** default off and limited to six fixed slots: `system.md`, `compress-range.md`, `compress-message.md`, `context-limit-nudge.md`, `turn-nudge.md`, `iteration-nudge.md`. Project overrides global; Pi injects bounded per-purpose guidance through the public system-prompt hook. Immutable schema/protocol/safety text cannot be overridden.

## Pinned-source audit disposition

### Adopt as portable behavior

- range/message compression, topic/batch summaries and material-benefit checks;
- stable message/block addressing and recap retrieval/projection;
- manual gating, decompression/recompression, protected content, dedupe/purge intent, adaptive guidance, nested/generational block lifecycle and subagent gating;
- bounded status/context visibility and functional command semantics.

### Intentionally adapt for Pi

- Pi JSONL/tree replay replaces ACP sidecar state/fork rebuild;
- current-branch exact-source search remains available even though pinned ACP search primarily walks active summaries;
- Pi Session/tree semantics remain authoritative, but ACP-style exclusive ownership replaces Pi auto-compaction for new work; historical Pi compaction entries remain readable legacy epochs;
- no ACP/DCP aliases, auto-update, legacy migration, cross-session sidecar stats, `toFile` raw export or synthetic ignored user messages;
- custom prompt files use Pi global/project paths and are never auto-created.

### Explicitly reject as parity targets

- disabled in-place tool output/input/error pruning in pinned `lib/messages/prune.ts`;
- `search_context.deep` behavior not implemented by the pinned execute path;
- stale schema/default mismatches and batch-cleanup thresholds that do not drive runtime below 100%;
- any direct AGPL source/prompt/schema/fixture/asset copy without new exact approval.

## Existing implementation baseline

Grounded current base behavior:

- owned runtime registration and fixed namespace;
- versioned transactions/controls, current-branch replay and successful matching mutation-tool commit boundary;
- synthetic linear/branch/malformed/protocol/epoch/cache fixtures and JSONL append-prefix/reload evidence;
- unique-fingerprint alignment, protocol atom checks, fail-open base projection and deterministic consumed-result stubs;
- current-branch search, base current-epoch decompression and one-candidate consumed-first cooling guard;
- base config precedence, arbitrary bounded opt-in prompt snapshot, cache telemetry/presentation and accepted widget;
- threshold/manual/overflow handlers, historical epoch replay and deterministic provider-free major-GC helper for fully covered discard prefixes;
- one owned Extension entry and release validator non-pass.

The above is not evidence for the reopened functional work listed in `tasks.md`.

## Reopened implementation frontier

1. extended block/lineage/reference state and replay;
2. model-usable reference catalog;
3. range/message tool schema and material/protection/nesting validation;
4. deterministic recap projection plus stale compact-call removal;
5. whole-output and provider serializer leakage fixtures;
6. functional commands, dedicated manual state and one-shot trigger;
7. nested decompress/recompress and safer prune semantics;
8. complete config validation and six-slot prompts;
9. grouped cache-safe cooling, protection, dedupe/purge-error, adaptive nudges and subagent gating;
10. generational/nested GC integration plus protocol/order/summary-bound safety;
11. exclusive all-reason compaction cancellation, independent request-boundary major GC and historical completed-compaction epoch reconstruction;
12. full cache identity, exact formula/window/sample gate, missing-field telemetry and projection/cache regressions;
13. runtime widget resize/rerender evidence;
14. evidence-backed doctor health and final docs/verification;
15. atomic/idempotent bootstrap merge of user-global Pi auto-compaction disablement;
16. post-check execution of the exact authorized HOME settings mutation.

## Boundaries

- No Pi fork, `node_modules` mutation, alternate agent CLI, replacement built-in tools, raw-content sidecar, prior Session entry rewrite, hidden nested provider call, dependency/lockfile change, Git action, version, publish or release. The only authorized HOME mutation is the exact bootstrap merge of `compaction.enabled=false` into `~/.pi/agent/settings.json`; malformed JSON, unrelated keys and project-local overrides must not be silently rewritten.
- Superseding user decision: target `0.1.13` relicenses the entire Package to `AGPL-3.0-or-later`; third-party license declarations/notices remain unchanged and prior releases retain their previously granted licenses.
- Direct copying or adaptation of a specific AGPL source file/prompt/schema/fixture/asset still requires a new exact copy/provenance/license approval. Reading pinned behavior and package relicensing do not by themselves authorize copying.
- The revised exclusive-owner/bootstrap-write test plan was accepted on 2026-07-27. Production runtime/bootstrap/settings/docs edits and the exact post-check HOME merge are authorized; Git/provider/TUI/publish operations remain separately gated.

## Remaining Unverified

- `UV-LIVE-1`: real provider tool use, summary quality and eligible warm-session cache rate require separately approved named provider/model evidence.
- `UV-EXT-ORDER-1`: unknown later context extensions are not universally compatible; AILI guarantees unmatched preservation, fail-open projection and bounded diagnostics.
- `UV-PI-INTERNAL-1`: real-host title/summary/native-compaction internal-request event ordering and any required explicit gate remain unverified.
- `UV-ACP-RUNTIME-1`: pinned source and tests were inspected but the ACP test suite was not executed because dependency installation was not approved.
- `UV-LICENSE-1` is superseded by the user's AGPL-3.0-or-later decision, but implementation remains incomplete until package metadata, complete LICENSE text, packaged upstream attribution, generated SBOM/notices and release validation agree.

## Evidence and placement

- `.worktrees/opencode-acp-v1.12.6/`: ignored clean detached checkout at exact tag/commit; `LICENSE` is AGPL-3.0-or-later.
- `src/runtime/aili-compact/`: current Pi-native implementation evidence.
- `tests/unit/*aili-compact*`, `tests/integration/aili-compact*`, `tests/fixtures/aili-compact/`: current automated evidence and identified gaps.
- `proposal.md`, `design.md`, capability spec, `tasks.md` and `test-plan.md`: revised DEFINE contract.
- `drift-log.md`: records accepted UI fallback and this source-audit-driven contract reconciliation.
