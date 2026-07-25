# Implementation Tasks — AILI Compact

All tasks belong to the single `add-reversible-context-compression` change. Checked items describe only the bounded behavior actually present in the current tree. A registered name or partial helper is not completion of its user-visible behavior.

## 1. Baseline, provenance and fixtures

- [x] 1.1 Confirm Pi 0.81.1 Session, Extension, context, command and compaction APIs against installed types/source.
  - Acceptance: dependent design statements cite public Pi surfaces rather than private TUI/prototype behavior.
  - Verify: inspect installed `@earendil-works/pi-coding-agent` types/source and focused runtime tests.
- [x] 1.2 Add redacted synthetic fixtures for linear, branched, malformed, protocol-heavy, compacted and cache-telemetry histories under `tests/fixtures/aili-compact/`.
  - Acceptance: fixtures contain no credentials/provider payloads and cover existing base replay/projection paths.
  - Verify: `tests/unit/aili-compact-fixtures.test.ts`.
- [x] 1.3 Record exact ACP source provenance and the approved MIT/reference-only release route without copying external source.
  - Acceptance: exact revision/license attribution is present, no ACP source/prompt/schema/fixture/asset is copied, and release validation enforces the no-copy boundary.
  - Verify: provenance/release validator inspection.
- [x] 1.4 Audit pinned ACP `v1.12.6` at commit `f1a33d9f4ce55af808eb4e050717c914ed16084b` and record portable behavior, intentional Pi adaptations and upstream conflicts.
  - Acceptance: proposal/design do not claim parity with disabled in-place pruning, stale defaults, unused deep search or OpenCode sidecar behavior.
  - Verify: source anchors under `.worktrees/opencode-acp-v1.12.6/` plus `drift-log.md`.

## 2. State, replay and references

- [x] 2.1 Implement the base versioned block, transaction, epoch, control and bounded-diagnostic contracts under `src/runtime/aili-compact/`.
  - Acceptance: existing semantic/prune/cool/control transactions validate and replay deterministically.
  - Verify: reducer unit tests.
- [x] 2.2 Implement pure current-branch replay for successful matching mutation-tool results and permitted custom control/automatic entries.
  - Acceptance: wrong tool name/call ID/kind, failed result and unanchored custom semantic mutation do not commit.
  - Verify: reducer and JSONL reload integration tests.
- [x] 2.3 Cover the implemented base replay cases: restart, crash-before-result, invalid/duplicate/digest-mismatched transaction, one fork-isolation case and base compaction-entry epoch transition.
  - Acceptance: only currently asserted cases are claimed; full tree-navigation, extended lineage and summary-plus-tail epoch behavior remain open below.
  - Verify: existing reducer/session fixture tests.
- [x] 2.4 Add `aili.compact.tx.v2` block/transaction state with compression mode, topic/batch, anchor, run/group, nested child lineage and lifecycle update fields while retaining safe `v1` replay.
  - Acceptance: replay reconstructs identical extended state after reload/fork, rejects inconsistent lineage, and marks non-upgradable legacy blocks query-only.
  - Verify: v1/v2 reducer fixtures for range/message/nesting/deactivate/reactivate.
- [x] 2.5 Derive deterministic branch/epoch-scoped `mNNNNNN`/`bNNNNNN` reference catalogs from current-branch replay.
  - Acceptance: ordinals follow the normative message/block order; the pure catalog pages 1..64 candidates with catalogId/offset/nextOffset and at most 32 blocks; reload keeps refs stable; stale catalog/fork/epoch refs cannot resolve. Runtime status integration remains task 4.11.
  - Verify: reference grammar/collision/paging tests and JSONL reload integration test.
- [x] 2.6 Add replay contracts for manual one-shot triggers, grouped dedupe/purge decisions and explicit human decompress/recompress controls.
  - Acceptance: custom controls may alter only permitted existing state and cannot create semantic/prune blocks or model summaries.
  - Verify: reducer negative/positive transaction matrix.

## 3. Alignment, recap and fail-open projection

- [x] 3.1 Align `buildContextEntries()` source entries to chained context messages without timestamp-only identity or source mutation.
  - Acceptance: base fingerprints align unique messages and ambiguity fails open.
  - Verify: current projector tests.
- [x] 3.2 Implement base protocol-atom grouping and deterministic consumed text-result stubs that retain paired tool calls/content-array shape.
  - Acceptance: partial tool atoms fail open and eligible cool blocks preserve provider protocol shape.
  - Verify: current projector/policy tests.
- [x] 3.3 Implement semantic recap projection at the original anchor.
  - Acceptance: each active semantic block inserts one deterministic assistant `aili_context_recap` call/result pair containing the persisted summary; selected source and stale compact call/result duplication are absent; list/get ordering and 200-character previews follow the recap contract; repeated projection is canonical-equivalent.
  - Verify: range/message/recap projection and direct retrieval fixtures.
- [x] 3.4 Enforce whole-output role/anchor/call-result/user-message/protected-range/idempotence validation with exact-input fail-open diagnostics.
  - Acceptance: every named invariant failure returns the original event message references with no partial projection.
  - Verify: fault-injection projector matrix.
- [x] 3.5 Add supported-provider serializer fixtures proving transaction `details`, diagnostics, prompt snapshots and hidden raw source do not become provider content.
  - Acceptance: OpenAI completions/responses, Anthropic and Gemini adapters serialize only intended projected content.
  - Verify: provider serializer fixture tests against installed Pi AI adapters.
- [x] 3.6 Add stale compact-call cleanup without removing unrelated tool calls or current mutation results.
  - Acceptance: active recaps do not duplicate summaries through historical `aili_compact` arguments and protocol remains valid.
  - Verify: multi-turn compression regression fixtures.

## 4. Tools, commands and configuration

- [x] 4.1 Register the six owned tool names and enforce successful matching tool-result commit boundaries for implemented model mutations.
  - Acceptance: names are registered once and failed/mismatched tool results do not activate state.
  - Verify: extension-load, runtime and reducer tests.
- [x] 4.2 Replace the current `aili_compact` `{entryIds, summary}` schema with bounded `range`/`message` discriminated modes using model-visible references and add an explicit sole-call/sibling-mutation guard.
  - Acceptance: batch/topic/summary bounds, normalized reversed ranges, split-atom rejection, material benefit after atom validation, non-overlap, protection and nested lineage are validated before transaction creation.
  - Verify: tool schema/execution and sibling-call matrix.
- [x] 4.3 Implement `aili_context_recap` schema `{ blockRef?: string }` as read-only active-block list/get retrieval and projection protocol output.
  - Acceptance: omission lists up to 32 replay-ordered blocks with 200-character previews; active lookup returns the full committed bounded summary; inactive/archived/unknown refs return explicit errors; it never accepts caller-authored recap text or creates state.
  - Verify: direct retrieval plus synthetic recap integration tests.
- [x] 4.4 Complete 1..16 all-or-nothing nested/current-epoch decompression and explicit recompression behavior.
  - Acceptance: model decompression commits through its matching result and returns refs plus at most 2,000 UTF-8 characters of replay-ordered exact preview with truncation flag; direct controls affect only eligible existing blocks; archived/GC blocks remain query-only.
  - Verify: nested/run/epoch/preview decompression-recompression tests.
- [x] 4.5 Redesign `aili_prune` for complete consumed tool-result atoms with tool/ref selection and bounded `keepLatest` semantics.
  - Acceptance: arbitrary user/assistant semantic messages cannot be pruned without a summary; hard protections always win.
  - Verify: prune protection/negative tests.
- [x] 4.6 Implement the normative argument/bound semantics for context, stats, grouped sweep, compress, decompress and recompress.
  - Acceptance: context uses offset/default-32/limit-64 paging; sweep defaults 8 and bounds 1..16; block commands accept 1..16 refs all-or-nothing; invalid args append nothing/start no request; context and stats are distinct.
  - Verify: command grammar/output/failure integration tests.
- [x] 4.7 Separate manual mode from `autoCooling` and implement a one-shot `/aili-compact compress [focus]` trigger.
  - Acceptance: autonomous compact is rejected in manual mode; one trigger permits at most one attempt and is consumed deterministically.
  - Verify: manual command/tool turn matrix.
- [x] 4.8 Implement the normative config key/default/range table and global < project < session merge rules for compression, protection, strategies, nudges, subagents, GC and cache UI.
  - Acceptance: deep object/scalar/array/hard-union semantics match design; unknown JSONC keys, malformed files, invalid types/ranges/cross-thresholds produce named diagnostics and no invalid value; no file is written.
  - Verify: full config defaults/precedence/type/range/unknown-key fixtures.
- [x] 4.9 Replace arbitrary prompt concatenation with six fixed custom-prompt slots and per-purpose bounded guidance.
  - Acceptance: only the six named files are recognized; project overrides global; 4 KiB/file and 8 KiB/snapshot limits hold; immutable schema/safety text remains authoritative; explicit reload changes the fingerprint without writing files.
  - Verify: custom-prompt slot, precedence, limit, unknown-file, reload and redaction tests.
- [x] 4.10 Keep current-branch bounded exact-source search and base current-epoch decompression behavior.
  - Acceptance: search never crosses Pi branches and archived blocks are not restored.
  - Verify: current search/decompression integration tests.
- [x] 4.11 Extend status/search output with model-usable message/block refs, compressible candidates, active recap summaries and bounded policy reasons.
  - Acceptance: a model can discover valid targets without knowing raw Pi entry IDs.
  - Verify: end-to-end status → compact/search tool scenario.

## 5. Automatic policy, nudges, subagents and GC

- [x] 5.1 Establish consumed-first normal/error guards and an at-most-one automatic transaction per assistant turn.
  - Acceptance: current-turn/image/unpaired/context-tool results remain raw in the existing base policy.
  - Verify: current policy tests.
- [x] 5.2 Replace one-candidate cooling with deterministic grouped candidate selection and minimum aggregate gain.
  - Acceptance: one bounded transaction covers the eligible batch; insignificant candidates wait rather than progressively invalidating old prefixes.
  - Verify: candidate ordering/grouping/material-benefit tests.
- [x] 5.3 Implement the normative hard/configurable protection classifier for tools, dependency-free path globs, balanced tags, recent/all user messages, current-turn/consumption and metadata uncertainty.
  - Acceptance: hard protections cannot be removed; normalization/reason codes match design; unresolved metadata fails protected; protected selection fails or remains raw without source leakage.
  - Verify: tool/path/glob/tag/user/current-turn/reason-code matrix.
- [x] 5.4 Implement journaled deduplication and Pi-safe purge-error strategies.
  - Acceptance: strategy state affects only provider projection, respects grace/keepLatest/protection and can be disabled independently.
  - Verify: duplicate/error/protected/cache-regression tests.
- [x] 5.5 Implement adaptive context-limit, turn and iteration guidance.
  - Acceptance: threshold/growth/frequency/emergency defaults are deterministic and config-overridable; guidance tells the model to obtain valid refs; state transitions are marked cache-ineligible.
  - Verify: nudge threshold/override/anchor fixtures.
- [x] 5.6 Implement default-off subagent gating using public Pi lineage/completion evidence.
  - Acceptance: in-flight/ambiguous subagent content remains raw; enabled completed final results are handled without sidecar transcript storage.
  - Verify: parent/subagent/ambiguous lineage fixtures.
- [x] 5.7 Implement nested block lifecycle and generational GC.
  - Acceptance: young/old promotion, survival/age, summary bounds, child deactivation/reactivation and stale block handling replay deterministically.
  - Verify: lifecycle/GC reducer tests.
- [x] 5.8 Keep the deterministic provider-free Pi overflow major-GC helper for a fully covered discard prefix.
  - Acceptance: current focused evidence proves the base helper returns a Pi compaction only when discarded entries are covered by active semantic summaries.
  - Verify: current compaction unit tests.
- [x] 5.9 Integrate generational/nested blocks and complete safety checks into major GC without weakening overflow fail-open fallback.
  - Acceptance: protocol/order, duplicate coverage, previous-summary and merged-summary bounds are validated; merge order is deterministic; incomplete/oversized coverage always allows Pi recovery.
  - Verify: nested/generation/protocol/order/bounds overflow compaction tests.

## 6. Native compaction and cache observability

- [x] 6.1 Keep the implemented base threshold/manual/overflow event handlers and pure decision/major-GC helpers.
  - Acceptance: current synthetic evidence covers safe/unsafe threshold decisions, manual cancellation guidance and a successful fully-covered major-GC path without claiming health/event-order completeness.
  - Verify: current compaction/runtime tests.
- [x] 6.2 Complete health-gated manual cancellation, unsafe-overflow runtime fallback and epoch reconstruction for every completed Pi compaction.
  - Acceptance: unhealthy manual requests are not intercepted; unsafe overflow demonstrably reaches Pi recovery; extension major GC and native recovery each create a new summary-plus-tail epoch while cancelled events do not.
  - Verify: runtime event-order/compaction-entry/epoch integration tests.
- [x] 6.3 Complete SHA-256 canonical cache identity with provider, model, session, branch leaf/source digest, epoch, projection, guidance and sorted active tool metadata.
  - Acceptance: any field change is state-change; equivalent sorted-key inputs remain stable.
  - Verify: cache identity canonicalization matrix.
- [x] 6.4 Implement warm-candidate response classification and the normative cache formula/window/sample gate.
  - Acceptance: both cache fields are required; hit is cacheRead/(input+read+write); last-20 window and minimum-5 sample state are exact; cold/state-change/unavailable are excluded and separately counted.
  - Verify: cache telemetry sequence fixtures.
- [x] 6.5 Keep the pure numeric cache presentation and below-editor widget registration baseline.
  - Acceptance: existing evidence covers numeric-only data, width classification and stable render keys without claiming live resize behavior.
  - Verify: current presentation/runtime registration tests.
- [ ] 6.6 Add runtime widget resize/visibility, numeric-change rerender and Zentui/`pi-cache-optimizer` peer-surface evidence.
  - Current evidence: public `setWidget` integration, width visibility helpers, numeric-only render keys and non-numeric rerender suppression are implemented; Pi 0.81.1 exposes no public resize event, so live hide/reappear-on-resize remains explicitly Unverified rather than using private TUI patches.
  - Acceptance: the widget hides/reappears without focus capture and does not rerender on non-numeric changes.
  - Verify: focused Extension UI-context integration fixture plus future public host resize evidence.
- [x] 6.7 Add cache-safe projection regression evidence for grouped cooling, recap insertion and stale-call cleanup.
  - Acceptance: deterministic unchanged inputs are stable and deliberate state transitions expose earliest-change evidence.
  - Verify: warmed synthetic sequence fixtures; live hit rate remains `UV-LIVE-1` unless separately authorized.
- [x] 6.8 Separate current-branch Pi Session cache accounting from AILI repeated-request stability diagnostics without adding provider-path replay work.
  - Acceptance: session start/reload and tree navigation replay assistant usage once; finalized assistant messages update totals incrementally; the panel presents both bounded numeric sections and recovers totals after reload.
  - Verify: cache aggregation/presentation unit tests plus runtime replay/incremental/tree/reload integration tests.
- [x] 6.9 Enable the cache widget by default and present its two detailed sections as aligned columns.
  - Acceptance: a new Session without panel controls shows current Session statistics left-aligned and AILI stability right-aligned across paired rows; `/aili-compact cache` retains its sequential detailed sections and panel controls still override the default.
  - Verify: aligned-column presentation fixture with large counters plus default-on runtime widget integration.

## 7. Runtime, diagnostics and docs

- [x] 7.1 Register the component after native integrations in `src/runtime/index.ts` while retaining one owned Extension entry.
  - Acceptance: no second entry/package exists.
  - Verify: runtime/extension-load tests.
- [x] 7.2 Replace PASS-by-command-registration doctor health with reducer/reference/projection/recap/cache/prompt/native-hook evidence.
  - Acceptance: current invariant failure is ERROR; missing optional/live evidence is WARN/Unverified; no raw content is emitted.
  - Verify: doctor status/redaction tests.
- [x] 7.3 Reconcile README/troubleshooting with the final implemented command, reference, compression, prompt, policy, cache, recovery and release behavior.
  - Acceptance: docs distinguish implemented behavior, unavailable/live-unverified evidence and the resolved MIT/reference-only boundary.
  - Verify: docs-to-runtime command/config surface inspection.
- [x] 7.4 Make capability/release validation pass only for exact MIT/reference-only provenance/no-copy evidence plus inherited persistent-Agent live evidence.
  - Acceptance: registration alone cannot convert release readiness to PASS.
  - Verify: `npm run validate:release` and focused doctor/provenance tests.

## 8. Verification and acceptance closeout

- [x] 8.1 Run focused reducer/reference, range/message/recap projection, command/tool, policy/subagent/GC, compaction, cache and JSONL byte-prefix tests.
- [x] 8.2 Run `npm run typecheck` and `npm test` after implementation reconciliation.
- [x] 8.3 Run `npm run validate:capabilities`, `npm run validate:release`, `npm run validate:package`, `npm pack --dry-run --json`, strict OpenSpec validation and `git diff --check`.
- [x] 8.4 Confirm the previously named license/live blockers are resolved by exact reference-only provenance and inherited `origin/main` live evidence; never relabel unresolved host/provider gaps as PASS.
- [x] 8.5 Keep `UV-LIVE-1` unverified unless a separately approved named provider/model probe is run.
- [x] 8.6 Record broader real-host event-order/internal-request evidence or leave `UV-EXT-ORDER-1` / `UV-PI-INTERNAL-1` explicitly Unverified.
- [ ] 8.7 Correct the incomplete 0.1.11 tarball with a fail-closed bundled-dependency prepublish gate; run fresh 0.1.12 release/tar-install checks, then commit, push, publish, deprecate 0.1.11, verify npm latest, install locally and smoke-load the installed package.
