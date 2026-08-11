# AILI Compact Design

## Objective

AILI Compact is an owned runtime component that preserves Pi-persisted Session JSONL/tree entries while reducing only the provider-time context projection. It adapts the portable user-observable behavior of `ranxianglei/opencode-acp@v1.12.6` to Pi 0.81.1; Pi host/session semantics and the accepted source-fidelity/cache boundaries take precedence whenever they conflict.

The pinned source audit is anchored to `.worktrees/opencode-acp-v1.12.6/` at commit `f1a33d9f4ce55af808eb4e050717c914ed16084b`. The design adopts intended behavior, not known upstream inconsistencies such as disabled in-place tool pruning, stale schema defaults, an unused `deep` search flag or OpenCode sidecar lifecycle.

## Runtime placement

`registerAiliRuntime()` registers AILI Compact immediately after `native-integrations` and before diagnostics. It remains behind `extensions/index.ts`; no additional Extension entry or Package is created. The component registers its tools, `/aili-compact` command, context/compaction handlers, diagnostic provider and optional cache UI integration.

## Model-addressable references

Raw Pi entry IDs remain canonical but are not a usable model interface by themselves. The reducer SHALL derive deterministic references from accepted current-branch replay:

- message references use `m` plus a six-digit 1-based ordinal, for example `m000001`; ordinals follow message-entry order inside the current epoch;
- block references use `b` plus a six-digit 1-based ordinal, for example `b000001`; ordinals follow accepted semantic-block order on the current branch, with transaction array order breaking same-transaction ties;
- references are scoped by current branch and epoch. The same printable reference in another branch/epoch is a different target and cannot be resolved without the current scope;
- each source message receives one reference, but status also reports its protocol-atom membership. A range that would select only part of an atom is rejected rather than silently expanded;
- references are derived replay metadata and are not persisted as an alternative identity. Transactions store exact Pi entry IDs, source digest and anchor ID;
- `aili_compact_status` accepts optional integer `offset >= 0` and `limit` from 1 to 64, returns a `catalogId`, replay-ordered current-epoch message candidates, at most 32 active blocks, and `nextOffset` when more candidates exist;
- `catalogId` is the SHA-256 digest of epoch plus eligible source-entry/block IDs. Mutations that consume printable refs must echo the current `catalogId`; AILI protocol messages are excluded so a status→mutation tool sequence does not invalidate its own catalog;
- search and recap may return references, but a stale catalog, unresolved, ambiguous, off-branch or wrong-epoch reference fails before any mutation result is returned.

New mutations use `aili.compact.tx.v2`. The reducer continues to validate existing `v1` entries and deterministically derives missing mode/topic/anchor metadata where safe; a legacy block that cannot be upgraded safely remains query-only and does not alter provider projection. All `v2` serialized fields are schema-validated; source IDs/content determine `sourceDigest`, while mode/topic/anchor/run/children and lifecycle updates are validated as transaction state rather than folded into source identity.

The model is instructed to call status/search before mutating context. AILI does not inject raw Pi IDs into user prose and does not depend on provider array indexes or timestamps as identity.

## Public surface

### Command

`/aili-compact [context|stats|sweep|manual|compress|decompress|recompress|cache|prompt|on|off|restore-all|doctor]`

Each declared subcommand has distinct behavior:

- `context [offset] [limit]`: show current epoch, replay-ordered references/candidates, active blocks and policy state. `offset` defaults to 0; `limit` defaults to 32 and is bounded to 1..64. Invalid values append no entry and return usage guidance.
- `stats`: show current-session/current-branch transaction/block/source-saving/cache counters without raw content; it does not claim cross-session aggregation because AILI creates no sidecar index.
- `sweep [limit]`: append at most one all-or-nothing grouped transaction containing up to `limit` safely consumed tool-result atoms; default 8, range 1..16. No candidate is not an error and appends nothing.
- `manual [on|off]`: toggle a dedicated manual-mode state; omitted mode reports current state. Manual mode blocks autonomous semantic compression but does not change `autoCooling`.
- `compress [focus...]`: append a one-shot manual trigger and deliberately send one short user-visible turn request. Only that turn may perform one `aili_compact` attempt while manual mode is active. Invalid/busy state appends no trigger and starts no provider request; this is never a hidden request.
- `decompress <block...>`: accept 1..16 block refs and append one all-or-nothing human control that deactivates eligible current-epoch blocks. Unknown, inactive or archived targets append nothing.
- `recompress <block...>`: accept 1..16 block refs and append one all-or-nothing human control that reactivates only current-epoch blocks previously deactivated by explicit decompress/control. It cannot create a summary or revive GC/native-epoch archived blocks.
- `cache`, `prompt`, `on`, `off`, `restore-all`, `doctor`: retain the accepted bounded AILI controls and diagnostics. Unsupported arguments append no state.

Pi `/compact` is not repurposed: while AILI is enabled, every manual compaction event is cancelled with bounded guidance to the AILI Compact command.

### Model tools

- `aili_compact`: sequential, sole-call mutator with a bounded discriminated schema:
  - `mode: "range"`: `topic` plus one or more `{ startRef, endRef, summary }` ranges;
  - `mode: "message"`: batch `topic` plus one or more `{ messageRef, topic, summary }` items;
  - optional bounded `summaryMaxChars` may raise the normal summary limit but never the hard limit.
- `aili_decompress`: sequential, sole-call mutator that deactivates 1..16 eligible current-epoch block references all-or-nothing. It returns source refs plus at most 2,000 UTF-8 characters of restored exact source excerpts in replay order and a `truncated` flag. Archived/native/GC blocks are query-only.
- `aili_prune`: sequential, sole-call mutator for qualified consumed tool-result atoms. It uses tool/ref selection plus `keepLatest`; arbitrary user/assistant semantic messages must use `aili_compact` with a summary instead of prune.
- `aili_search_context`: bounded read-only search over exact source on the current active Pi branch, including query-only archived blocks in that branch.
- `aili_compact_status`: bounded read-only state, message/block references, candidates, policy, diagnostics and cacheability status.
- `aili_context_recap`: read-only protocol/retrieval tool with schema `{ blockRef?: string }`. With no ref it lists at most 32 active blocks in replay order with a 200-character summary preview; with one active ref it returns the full persisted summary (already bounded at commit) plus block/range/topic metadata. Unknown/inactive/archived refs return explicit query-only/not-active errors and never state details or raw source. It is not a separate user command or ACP/DCP alias.

All model mutators commit only through a successful matching tool result whose ID, tool name and transaction kind agree. Human command controls may deactivate/reactivate already-existing blocks but cannot create semantic/prune blocks or model-authored summaries. Exact limits/defaults are constants covered by fixtures and surfaced by status/config diagnostics. No hidden model call is allowed.

## State and source fidelity

Pi Session JSONL/tree is the source of truth. Existing lines are never rewritten, deleted or replaced.

- Model-anchored successful mutations persist one versioned transaction envelope in `toolResult.details`; replay requires its `toolCallId` and tool name to match transaction ID/kind.
- Automatic cooling and direct human controls append one versioned plain custom entry through Pi. Custom entries cannot create semantic/prune blocks or commit model decompression.
- `v2` compact blocks record mode, topic/batch, epoch, source IDs/digest, anchor source ID, summary, run/group ID and nested child block IDs. Lifecycle transactions record promotion/survival/deactivation reason updates. Printable message/block references are derived replay metadata and are not persisted as an alternative source index.
- The reducer replays only `sessionManager.getBranch()` and accepts transactions only when schema, anchor, source identity/digest, protocol pairing, reference resolution and epoch are valid.
- Cached state is an optimization only; reload/restart/fork/tree navigation must reconstruct identical current-branch state from persisted entries.
- Diagnostics may store IDs, counts, hashes and bounded error names only. They must not persist or render raw source/tool bodies or custom prompt text.

## Alignment, compression and recap projection

The context handler obtains current branch context entries from Pi and aligns them to chained event messages using entry identity plus canonical role/content/tool fingerprints. Timestamp is supplemental only. It treats a tool-calling assistant message and all matching results as one protocol atom.

For `range` mode, boundaries resolve in current replay order, automatically normalize a reversed pair, reject overlaps within one call and reject any boundary/selection that splits a protocol atom. Material benefit is calculated only after reversed-boundary normalization and complete-atom validation. For `message` mode, each selected complete non-protocol message or complete explicitly named protocol atom receives its own summary while sharing one run/group ID. Both modes:

- reject current-turn/recent protected content, unknown references, duplicate source coverage and wrong epochs;
- require estimated source removal to exceed recap/protocol overhead by the configured minimum benefit;
- preserve configured user/tool/tag/file-protected content through explicit structured retention, not copied magic marker syntax;
- may consume active child blocks only when lineage and summary inclusion are explicit and all-or-nothing;
- enforce normal and hard summary bounds without making a hidden summarization request.

For each active semantic block, projection removes complete selected atoms and inserts at the original anchor a deterministic assistant tool-call plus successful `aili_context_recap` tool-result pair. The result contains the persisted block summary and bounded block/range/topic metadata. Stable IDs are derived from block identity. The original historical `aili_compact` call/result is removed from later provider projections once its recap is active so summaries are not duplicated through tool arguments. Projection remains idempotent and never persists the synthetic provider-time pair.

Cooling may replace qualified consumed text-only tool-result payloads with deterministic stubs while retaining their original paired tool call and Pi content-array shape. It validates whole-output role order, call/result pairing, at least one real user message, recap anchor presence, protected ranges, digest, idempotence and cache hash. If it cannot prove any invariant, it returns the untouched event messages and emits a bounded diagnostic: no partial projection or false success.

## Compression, pruning and automatic policy

Automatic cooling is consumed-first: a normal result requires at least one later persisted assistant message; an error requires the configured grace period. Current-turn results, images/mixed results, context-management tools, unpaired results and hard-protected content remain raw.

A policy pass computes a deterministic candidate set for deduplication, purge-error and ordinary cooling. It appends at most one grouped transaction at a turn boundary and only when the aggregate projected saving exceeds configured minimum gain. It must not progressively rewrite one arbitrary old prefix per turn when no material batch exists. State-change requests are excluded from cache-rate eligibility and reported separately.

`aili_prune` and automatic strategies operate only on complete consumed tool-result atoms. Because the pinned ACP version disables historical tool-output mutation after a prefix-cache regression, AILI uses journaled provider projection and must prove cache stability with focused fixtures before enabling each automatic strategy.

## Manual mode and adaptive guidance

Manual mode is separate from `autoCooling`:

- while manual mode is active, model-originated `aili_compact` calls fail unless the current turn holds an unused explicit manual trigger;
- one `/aili-compact compress [focus]` trigger permits at most one successful compact transaction and is consumed on success/failure/turn end;
- auto-cooling remains governed by its own config and can be independently disabled.

Adaptive guidance uses configured context thresholds, growth floor/ratio, frequency and emergency threshold. Guidance is bounded and tells the model to inspect `aili_compact_status` for references before compressing. It is inserted through Pi's public system-prompt hook, not a synthetic hidden user message. Threshold or prompt-slot changes create an explicit cache-input state transition.

## Protected content and subagents

Hard protections are evaluated before configurable policy and cannot be removed. They include every `aili_*` state/protocol atom, incomplete/unpaired atoms, image or mixed binary results, all entries at or after the most recent user message until a later assistant message proves consumption, the two most recent user messages, and any tool/file atom whose metadata cannot be parsed safely. A configured `protectUserMessages: true` protects every user message; `protectTags: true` protects source containing a balanced `<protect>...</protect>` region.

Tool names are normalized to lowercase. Candidate file paths are extracted only from known string path/file arguments, normalized to `/`, resolved lexically against `cwd` without filesystem access, and matched against hard basename patterns for `.env*`, credential/secret/key files plus configured glob patterns. Glob syntax is the documented dependency-free subset: `*` excludes `/`, `**` crosses directories and `?` matches one non-`/` character. Invalid path metadata fails protected. Configurable protected arrays may add/replace their configurable layer, but the hard set is always unioned after merge. Status exposes bounded reason codes such as `current-turn`, `recent-user`, `protocol`, `binary`, `protected-tool`, `protected-file`, `protected-tag` and `metadata-unknown`.

Subagent compression/cooling is disabled by default. When explicitly enabled, AILI detects Pi parent/subagent lineage through public session/runtime metadata, protects in-flight subagent tool calls/results, and only exposes bounded final-result summaries after completion. If lineage cannot be proven, AILI fails open and leaves the content raw. No subagent transcript is copied into a sidecar.

## Generational block GC

Blocks begin in a young generation, track deterministic survival/use counters and may be promoted to old generation. Nested compression deactivates child blocks while preserving lineage. GC may deactivate stale blocks or truncate only summaries under configured bounds; it never deletes source entries.

Before each provider request, AILI independently evaluates projected usage and runs provider-free major GC at the configured emergency boundary. GC may truncate or merge eligible old-generation summaries only through an append-only AILI control transaction; it never requests a Pi `CompactionEntry`, never deletes raw Session entries and never calls a model. If coverage, order, bounded output or protocol safety cannot be proven, it makes no destructive claim and allows the provider request to fail with its real overflow error.

## Native compaction ownership and historical epochs

- **installed default:** Linux bootstrap atomically merges `compaction.enabled=false` into user-global `~/.pi/agent/settings.json`. Existing unrelated keys are preserved. Missing files may be created with restrictive normal user permissions; malformed/non-object JSON causes a non-zero failure with the original bytes unchanged.
- **project overrides:** bootstrap does not scan or rewrite project `.pi/settings.json`. Runtime therefore treats every manual/threshold/overflow `session_before_compact` event as a forbidden native fallback while AILI is enabled and cancels it after attempting only the already-planned AILI GC path.
- **manual:** Pi `/compact` is cancelled and the user is directed to `/aili-compact manual|compress|sweep`.
- **threshold/overflow:** no Pi-generated summary, retained-tail checkpoint or compact-and-retry is allowed. AILI GC is independent of Pi compaction events; failure to recover budget surfaces the provider overflow error.
- **AILI disabled:** the bootstrap-owned Pi setting remains disabled until explicitly changed by the user; `/aili-compact off` does not silently re-enable Pi native compaction.
- **historical sessions:** pre-existing Pi compaction entries remain valid read-only ancestry. Their summary-plus-tail epoch semantics still govern replay, but no new native epoch is expected after the exclusive-owner configuration is installed.

## Cache identity, accounting and UI

The user-facing surface separates ordinary Pi Session accounting from AILI's stricter repeated-request diagnostic. Current-branch Session totals are reconstructed once from assistant `usage` in `SessionManager.getBranch()` at `session_start`/reload and after explicit `session_tree` navigation, then updated in O(1) from finalized assistant `message_end` events. The hot `context` hook, widget render and cache command never rescan Session JSONL for these totals. The displayed Session rate is `cacheRead / (input + cacheRead + cacheWrite) * 100`, with input/output/read/write/response/unavailable counts kept numeric-only.

The component keeps static tool schemas/safety metadata and canonicalizes equivalent projection output. A cache-input identity contains provider, model, session, epoch/current-branch identity, projection hash, effective system/custom-prompt fingerprint and active tool-surface fingerprint.

Before a request, identity classification is `cold` when the session has no completed prior request, `state-change` when the immediately prior completed identity differs, and `warm-candidate` when it matches. After the response, a warm candidate becomes eligible only if numeric `cacheRead` and `cacheWrite` fields are both present; otherwise it becomes telemetry-unavailable. Cold/state-change requests remain excluded even if usage is present.

For each eligible response, prompt tokens are `input + cacheRead + cacheWrite` and hit rate is `cacheRead / promptTokens * 100`; a zero prompt-token response is unavailable. The displayed/gated rate uses the last 20 eligible responses and requires at least 5 eligible samples before it can be OK/PASS; fewer samples are `insufficient-sample`. The target is `>=85%`. Canonical identity is SHA-256 over canonical sorted-key JSON containing provider ID, model ID, Pi session ID, epoch ID, branch leaf/source digest, projection hash, effective system/custom-guidance fingerprint and a sorted active-tool fingerprint. The tool fingerprint covers each active tool's name, description, parameter schema and immutable prompt snippet/guidelines. The component guarantees deterministic inputs and truthful observed telemetry, never provider cache hits.

Footer state is concise. `/aili-compact cache` opens bounded two-section numeric details. The accepted Pi 0.81.1 fallback is a persistent responsive below-editor widget: enabled by default, user-toggleable, rendered as paired rows with current Session accounting left-aligned and AILI stability right-aligned, hidden in narrow terminals and rerendered only when numeric usage/compression state changes. It never renders prompt/tool/source bodies.

## Configuration and custom prompts

Runtime defaults to enabled. Config precedence is global `~/.pi/agent/aili-compact.jsonc` < project `.pi/aili-compact.jsonc` < append-only session controls. Config validation reports unknown keys/types as bounded diagnostics; it never silently treats malformed values as valid.

Objects deep-merge global then project; session controls override only their named runtime fields. Scalars replace earlier values. Configurable arrays are replaced by the project value when present, then deduplicated; immutable hard protections are unioned afterward. The accepted keys/defaults are:

| Key | Type / bounds | Default |
|---|---|---|
| `enabled` | boolean | `true` |
| `manualMode` | boolean | `false` |
| `autoCooling` | boolean | `true` |
| `cachePanel` | boolean | `true` |
| `compress.mode` | `range | message` | `range` |
| `compress.summaryMaxChars` | integer 256..10000 | `6000` |
| `compress.summaryHardMaxChars` | integer 1000..12000 | `10000` |
| `compress.minSourceChars` | integer 0..100000 | `5000` |
| `compress.minSavingsChars` | integer 0..50000 | `1000` |
| `protection.recentUserMessages` | integer 2..20 | `2` |
| `protection.protectUserMessages` | boolean | `false` |
| `protection.protectTags` | boolean | `false` |
| `protection.tools` | string array, max 64 | `[]` plus hard set |
| `protection.fileGlobs` | string array, max 64 | `[]` plus hard set |
| `strategies.dedupe.enabled` | boolean | `true` |
| `strategies.purgeErrors.enabled` | boolean | `true` |
| `strategies.purgeErrors.graceTurns` | integer 1..50 | `4` |
| `nudges.minContextPercent` | integer 1..99 | `45` |
| `nudges.maxContextPercent` | integer 1..99, >= min | `55` |
| `nudges.emergencyPercent` | integer 50..100, >= max | `98` |
| `nudges.frequencyTurns` | integer 1..50 | `5` |
| `nudges.iterationThreshold` | integer 1..100 | `15` |
| `nudges.minGrowthRatio` | number 0..1 | `0.45` |
| `nudges.minGrowthChars` | integer 0..100000 | `5000` |
| `subagents.enabled` | boolean | `false` |
| `gc.promotionSurvivals` | integer 1..100 | `5` |
| `gc.maxBlockAge` | integer 1..1000 | `15` |
| `gc.maxOldSummaryChars` | integer 256..10000 | `3000` |
| `gc.majorThresholdPercent` | integer 90..100 | `100` |
| `experimental.customPrompts` | boolean | `false` |

Unknown keys, invalid JSONC, invalid types/ranges and invalid cross-field thresholds produce `config-unknown-key`, `config-invalid-jsonc`, `config-invalid-type`, `config-out-of-range` or `config-invalid-thresholds`; the affected file contributes no invalid value.

Custom prompts are opt-in and fixed to six slots. Global files are read from `~/.pi/agent/aili-compact-prompts/` and project files from `<cwd>/.pi/aili-compact-prompts/`:

1. `system.md`
2. `compress-range.md`
3. `compress-message.md`
4. `context-limit-nudge.md`
5. `turn-nudge.md`
6. `iteration-nudge.md`

Global files load first and project files override the same slot. Unknown Markdown files are ignored with `prompt-unknown-slot`. Each file is limited to 4 KiB and the final snapshot to 8 KiB. Pi cannot vary registered TypeBox schemas per session, so slot text is placed in the corresponding system-guidance section while immutable schema/protocol/safety text remains authoritative. The session retains only the bounded slot snapshot and fingerprint. `/aili-compact prompt reload` explicitly refreshes it and starts a new cache-input state.

AILI never creates, migrates or mutates AILI config/custom prompt files. The Linux bootstrap separately performs the explicitly authorized atomic merge into Pi's user-global `settings.json`; runtime commands do not mutate that file. `off` makes context projection return input unchanged and suppresses all AILI guidance without deleting journal state or re-enabling Pi compaction. `restore-all` deactivates current-epoch blocks and disables auto cooling. Prompt text never appears in JSONL state entries, diagnostics, widget or tool results.

## Diagnostics and health

Doctor health is not satisfied merely because `/aili-compact` is registered. It reports bounded component status for reducer/replay schema, reference catalog, projection/recap invariants, exclusive native-compaction cancellation, independently triggered major GC, effective user-global Pi auto-compaction disablement, cache telemetry availability, prompt slot count/hash and release blockers. A known projection/replay invariant failure is `ERROR`; missing optional/live evidence is `WARN`/`Unverified`. The former unconditional AGPL/MIT blocker may become resolved only when exact AGPL package metadata, LICENSE, packaged attribution, generated SBOM/notices and tarball checks all pass.

## Private-source and release boundary

The reference source is AGPL-3.0-or-later. The user selected a package-wide `AGPL-3.0-or-later` route beginning with target `0.1.13`. Implementation uses the complete standard AGPL text, synchronizes root package/lock/README metadata, records the exact upstream repository/tag/commit and no-direct-copy boundary in packaged provenance/notices, regenerates the root SBOM identity from `package.json`, and preserves every third-party license declaration. This change is prospective: prior releases retain licenses already granted. Any future direct source copy or source-derived asset/prompt/schema/fixture still needs exact approval and file-level provenance. Git, provider/TUI, publish and release operations remain separately gated.
