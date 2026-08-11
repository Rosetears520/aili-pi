# ACP Compression Route Comparison

## Purpose

This is a design comparison, not an implementation approval. It evaluates how `@rosetears/aili-pi` can use the compression route of [opencode-acp v1.14.13](https://github.com/ranxianglei/opencode-acp/tree/35a0400a1456ed1b51fb1235d78cc3775edbb267) as prior art while retaining the Pi Extension runtime and the `pi` CLI.

No ACP source code, prompts, configuration, state schema, or assets are copied by this document or its proposed follow-up. The ACP source is AGPL-3.0-or-later; its license and attribution implications must be assessed before any literal reuse is proposed.

## Source boundary

- Reference project: [`ranxianglei/opencode-acp`](https://github.com/ranxianglei/opencode-acp)
- Reviewed reference: `v1.14.13`, commit `35a0400a1456ed1b51fb1235d78cc3775edbb267`
- Relevant upstream areas: `index.ts`, `lib/hooks.ts`, `lib/compress/`, `lib/messages/`, `lib/state/`, and `lib/gc/merge.ts`
- Host difference: ACP is an OpenCode plugin. AILI is a Pi Extension. Its OpenCode hooks and SDK types are not portable APIs for this repository.

## ACP route in plain terms

ACP is model-driven range compression with persistent block state:

1. Before a model request, it assigns stable visible message references and exposes active compression-block references.
2. It preserves a protected tail, the first user message, protected tool content, and complete tool-call/result pairs.
3. The model chooses one or more ranges by message or block reference and supplies a summary through the `compress` tool.
4. The runtime validates ranges, expands references to any consumed active blocks, applies quality checks, records one new active block, and deactivates consumed children.
5. The next provider request omits messages covered by active blocks and keeps the block summaries as the durable compressed representation.
6. The model can search summaries, recap an active summary, or decompress a block/range when needed.
7. At a true context-limit fallback, ACP merges eligible old blocks into a bounded replacement instead of requiring a fixed multi-tier transaction topology.

The important property is that hierarchy follows the model's selected ranges and the active block graph. It is not an externally imposed `T1 → T2 → T3 → restill` quota.

## Current AILI route

AILI already has several compatible building blocks:

- `aili_compact` accepts model-authored summaries and persists semantic blocks.
- `aili_context_recap` and `aili_decompress` provide explicit retrieval paths.
- The provider projection protects source integrity and can replace compacted source with a recap representation.
- Quality evaluation, source binding, block consumption, and replay validation exist as separate runtime concerns.

However, the active release contract adds a different policy layer:

- summaries target 15,000 characters with an 18,000-character ceiling;
- T2, T3, and restill must each pass conservative immediate-child token-economics thresholds;
- the controlled evidence requires an exact 28 T1 → 14 T2 → 7 T3 → one restill, 50-transaction topology;
- provider context defaults to block descriptors, and full summaries enter only through a bounded explicit selection;
- source-proof and promotion-gap verification are much stricter than ACP's block-state model.

That combination caused the current blocker: the fixed hierarchy requires upper tiers to be both short enough to pass local economics and large enough to satisfy the final restill source floor.

## Detailed comparison

| Concern | ACP route | Current AILI route | Design implication for Pi |
|---|---|---|---|
| Compression trigger | Model receives references and a nudge, then chooses useful ranges. | Status recommends constrained safe ranges and promotion groups. | Keep explicit Pi tools, but expose a model-usable reference catalog rather than requiring a fixed hierarchy. |
| Unit of compression | One or more selected message/block ranges in a tool call. | T1 source ranges or same-tier block groups. | Permit a range to cover visible messages and active block boundaries under Pi-safe validation. |
| Summary author | Model writes the summary submitted to the compression tool. | Model writes the summary, then AILI applies quality and economics gates. | Preserve model authorship and quality checks; do not impose a fixed summary size or parent benefit topology unless measurement justifies it. |
| Block hierarchy | A message boundary creates a first-tier block; a block boundary produces a higher tier and consumes matching child blocks. | Explicit T1/T2/T3/restill rules and child-count/economics policies. | Use an active block graph with bounded nesting; make promotion a result of selected boundaries, not a release-test quota. |
| Context projection | Covered raw messages are removed from the request; retained summaries represent them. | Source is replaced by recap protocol or descriptors; selected full summaries are separately expanded. | Project active summaries into the Pi request in a bounded, provider-valid form while retaining a protected raw tail. |
| Protection | Preserves first user message, recent content, configured protected tools/content, and tool-call/result integrity. | Protects recent user content and enforces source/protocol constraints. | Make first-user preservation, recent-tail preservation, and tool-pair integrity explicit Pi invariants. |
| Retrieval | Search active summaries, recap one summary, or decompress a block/range. | Explicit recap/decompression with source-proof validation and selection bounds. | Keep Pi's explicit recap/decompression tools; add summary search and recovery-oriented reference discovery if current status is insufficient. |
| Quality handling | Pre-commit quality gate can reject a proposed summary before state mutation. | Quality gate plus source-bound evidence and replay checks. | Preserve pre-commit rejection and source integrity. ACP is prior art for flow, not a reason to weaken AILI proof requirements. |
| State | Persistent active/inactive blocks track direct and effective messages, tools, consumed children, and parent links. | Transactions, source proofs, recursive leaves, catalog identities, and replay views. | Retain AILI's stronger ledger if it can back the active-block view without forcing a separate economics topology. |
| Context-limit fallback | Merge eligible old blocks to a bounded summary when the context is actually full. | Native checkpoint recovery plus an economic T3 restill gate. | Replace the fixed restill economics requirement with a separately bounded last-resort merge policy, subject to Pi's recovery contract. |
| Performance objective | Prune the request path; search/decompress only when needed. | Bounded descriptor frontier plus high-cost hierarchy and replay evidence. | Measure the actual Pi request projection and avoid full-history reconstruction on ordinary requests. |

## Recommended Pi adaptation route

The following is a proposed design direction, not accepted implementation scope.

### 1. Treat references as the model's compression control surface

Give the model stable message references and active-block references in status/context guidance. The model should select a range or a group of blocks by those references and submit its own summary. The Pi adapter remains the only authority that validates the selection and persists state.

### 2. Store an active block graph, not a mandatory tier schedule

Each block needs a stable ID, summary, selected raw coverage, effective inherited coverage, active/inactive status, child links, parent link, creation order, and topic. A block-range compression consumes compatible active children. The graph may cap nesting for predictability, but it should not require 50 transactions or a predetermined number of children per tier.

### 3. Build the provider request from protected raw plus active summaries

For each Pi provider request:

1. retain the original first user message and a configured recent raw tail;
2. retain complete tool-call/result pairs and explicitly protected content;
3. remove raw entries covered by active blocks;
4. insert active summary representations at deterministic anchors;
5. hide obsolete compact control records; and
6. validate provider message order and tool-pair completeness before dispatch.

This is the central ACP pattern missing from a descriptor-only default projection: summaries should be the normal compressed representation, not merely metadata requiring a separate parent-recap maneuver.

### 4. Make retrieval explicit and bounded

Keep these separate operations:

- **search:** locate relevant active summaries and visible messages by query;
- **recap:** return a selected active summary without restoring its full raw source;
- **decompress:** reactivate selected raw coverage or one block generation, then refresh references.

Retrieval must have request-size bounds and preserve Pi provider validity. It must not silently repopulate the full historical conversation.

### 5. Separate ordinary compression from emergency cleanup

Ordinary model-selected compression should not require an artificial immediate-child savings proof at every tier. A distinct last-resort cleanup can merge old active summaries only when the actual context budget requires it. That fallback needs its own size bound, source/quality preservation policy, and visible diagnostic; it should not masquerade as a model-authored semantic compression.

### 6. Keep AILI-specific safety where it adds value

The ACP route does not require abandoning:

- exact Pi tool-call/result ordering;
- protected recent content and first-user preservation;
- pre-commit quality rejection;
- persistent replayable block state;
- stale-reference rejection;
- source provenance for user-visible recovery; or
- bounded provider context and recovery operations.

The design decision is to remove the fixed hierarchy as the proof of compression quality, not to remove safety validation.

## What this would retire or rewrite

If this route is accepted later, DEFINE must explicitly decide whether to retire or rewrite:

1. the mandatory 28 → 14 → 7 → 1 / 50-transaction acceptance row;
2. mandatory T2/T3/restill immediate-child economics as a creation precondition;
3. the seven-child restill `minSourceTokens=8000` requirement;
4. descriptor-only provider projection as the default representation for every active summary; and
5. tests whose goal is satisfying a synthetic tier count rather than proving normal Pi request pruning, retrieval, and recovery behavior.

No item above is retired by this comparison alone.

## Proposed verification plan

A replacement test plan should prove observable Pi behavior rather than a fixed block count:

1. Stable message and block references remain valid across ordinary turns and persisted sessions.
2. A model-selected raw range produces one active block and removes exactly its covered raw entries from the next provider request.
3. A block-boundary compression consumes the expected active children and exposes one replacement summary.
4. First user message, protected tail, protected tool content, and complete tool-call/result pairs remain provider-valid.
5. A rejected quality or stale-range submission leaves active state and provider projection unchanged.
6. Search identifies relevant active summaries; recap returns only the selected summary; decompression restores only the requested coverage.
7. Context-limit cleanup is separately bounded, observable, and non-destructive to recovery provenance.
8. Ordinary long sessions remain bounded without full-history provider projection or synthetic 50-transaction requirements.

## Open decisions

Before implementation, DEFINE must resolve:

1. Should the existing source-proof ledger remain authoritative for all active blocks, or only for decompression/recovery-critical blocks?
2. What Pi extension hook owns provider-request pruning and summary insertion without changing Pi's native checkpoint semantics?
3. What is the allowed nesting limit and how is an incompatible block selection rejected?
4. What exact token/context budget bounds search, recap, decompression, and emergency merge output?
5. Which existing strict checks remain mandatory, and which were introduced solely to support the rejected 50-transaction hierarchy?

## Recommendation

Adopt ACP's **route**—model-selected ranges, durable consumable blocks, request-time pruning, explicit retrieval, and a separate true-limit cleanup path—while keeping Pi ownership and implementing it independently. Do not copy ACP code or prompts. Do not resume the current 50-transaction BUILD until a revised design and test plan resolve the decisions above.
