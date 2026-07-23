# Glossary — Predictable Agent Skills

[KNOWN|EXTERNAL] The definitions under Invocation, Information Hierarchy, Steering, and Pruning are selective close adaptations of Matt Pocock's `writing-great-skills` and `GLOSSARY.md` at commit `391a2701dd948f94f56a39f7533f8eea9a859c87`, licensed under MIT. Source: `references/upstream/mattpocock-skills/391a2701dd948f94f56a39f7533f8eea9a859c87/NOTICE.md` and the pinned files beneath that directory.

[FRAME] Terms under AILI Boundaries are local additions. This file is the canonical runtime vocabulary for `write-skills`; the complete pinned upstream glossary is provenance/reference data only.

## Root Virtue

### Predictability

[FRAME] The degree to which a Skill makes the agent follow the same process on comparable runs, even when the output should vary. Invocation, hierarchy, steering, pruning, and AILI boundaries all serve this root virtue.

## Invocation

### Description

[FRAME] The model-facing trigger held in context. It must identify the capability and each genuine invocation branch while spending no words on taglines, duplicated synonyms, or body summaries.

### Branch

[FRAME] A distinct way a Skill is invoked that changes the actions, inputs, output, or completion criterion. Synonyms for one task are not separate branches.

### Context Pointer

[FRAME] Text already in context that names out-of-context material and states when to load it. The pointer's wording determines whether progressive disclosure is reliable.

### Context Load

[FRAME] The tokens and attention permanently or conditionally spent to make Skill material available. Splitting is not free: another model-visible description or weak pointer can cost more predictability than it saves.

### Leading Word

[FRAME] A compact, pretrained concept that anchors invocation or execution behavior, such as Predictability. It earns repetition only when it changes what the model reaches for; a weak slogan is a No-op.

## Information Hierarchy

### Information Hierarchy

[FRAME] The ordering of Skill material by immediacy: common steps and hard boundaries in `SKILL.md`, conditional reference behind a Context Pointer, and deterministic or static resources in scripts/assets only when the workflow needs them.

### Progressive Disclosure

[FRAME] Moving conditional reference down the Information Hierarchy so the common path remains legible. Inline what every branch needs; disclose what only some branches need; sharpen an unreliable pointer before pulling material back inline.

### Co-location

[FRAME] Keeping a concept's definition, rules, and caveats together at the same hierarchy rung. Co-location prevents the agent from seeing a rule without the boundary that makes it safe.

### Sprawl

[FRAME] *Failure mode.* A Skill is too long even when its lines are live and unique, thinning attention across the common path. Cure it by disclosing conditional reference or separating a real branch/owner—not by arbitrary file limits.

## Steering

### Completion Criterion

[FRAME] The observable condition that tells the agent a step or branch is complete. Clarity resists Premature Completion; sufficient demand drives the Legwork needed to support the claim.

### Legwork

[FRAME] The source reading, repository inspection, editing, and evidence gathering performed inside a step. It is demanded by the Completion Criterion rather than expanded into performative process steps.

### Premature Completion

[FRAME] *Failure mode.* The agent leaves a step before its criterion is met because attention shifts to later work. Sharpen the criterion first; split the sequence only when the boundary is real and rushing is observed.

### Negation

[FRAME] *Failure mode.* A prohibition makes the unwanted behavior more salient. State the positive target first; keep a prohibition only for a hard guardrail and pair it with the required alternative.

## Pruning

### Single Source of Truth

[FRAME] The state where one authoritative location owns each behavior or definition. Other locations point to it or remain explicitly inert provenance.

### Duplication

[FRAME] *Failure mode.* The same meaning has more than one active authority, increasing context cost and allowing edits to drift. Collapse it into one Single Source of Truth.

### Relevance

[FRAME] Whether a line still changes or constrains the Skill's active job. A line can be relevant yet still be a No-op; a once-useful line can become Sediment.

### Sediment

[FRAME] *Failure mode.* Stale layers remain because adding feels safer than deleting. Re-check old branches, examples, and caveats against current ownership and remove those no longer relevant.

### No-op

[FRAME] *Failure mode.* An instruction consumes context but does not change model behavior relative to the default. Delete it rather than polishing it; if a Leading Word is too weak to matter, replace or remove it.

## AILI Boundaries — Local Additions

### Routing Boundary

[FRAME] The positive triggers, near misses, and handoff conditions that distinguish one capability from adjacent owners. A boundary is testable only when realistic prompts can fall on both sides.

### Canonical Owner

[FRAME] The one active repository source allowed to define a behavior, schema, artifact, or lifecycle decision. Adapters may point to the owner but do not restate its authority.

### Provenance Closure

[FRAME] The complete record required when external material is copied or closely adapted: source repository, immutable version, license, copyright, adaptation scope, destination, and integrity evidence where applicable.

### Ownership Handoff

[FRAME] A bounded return to ROSE when a task reaches another capability, material decision, permission, or operation gate. It names the need and evidence without invoking the next process skill or implying approval.

### Claim-Matched Verification

[FRAME] The smallest fresh evidence that supports the exact completion claim. It does not grow into a universal suite merely because a Skill or lifecycle phase exists.
