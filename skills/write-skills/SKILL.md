---
name: write-skills
description: Create, revise, or evaluate repository Agent Skills when the user asks to write a SKILL.md, improve triggers or information hierarchy, restructure references/scripts/assets, or diagnose skill predictability; do not use for product code, AGENTS.md initialization, general prompt editing, or automatic repository-wide cleanup.
---

# Write Skills

[FRAME] A skill exists to make an agent's process more predictable, not to force identical output. **Predictability** is the root virtue; every instruction, pointer, and completion criterion must earn its context cost.

## Invocation

[FRAME] This is a model-invoked repository skill because ROSE must discover Agent Skill authoring intent from natural language. Do not copy upstream-only invocation metadata or create a second public route.

Choose exactly one branch:

| Branch | Use when | Completion criterion |
|---|---|---|
| **Create** | A reusable Agent Skill does not yet have a canonical owner. | One approved identity, routing boundary, artifact layout, and verification path are explicit before writing. |
| **Revise** | An existing Skill needs a bounded trigger, workflow, resource, provenance, or maintainability change. | The accepted behavior changes without unrequested adjacent cleanup or duplicate authority. |
| **Evaluate** | The user asks whether a Skill is predictable, focused, well structured, or likely to over-trigger. | Every reported finding names current evidence, the affected term or boundary, and a concrete disposition; no edit occurs without edit intent and applicable approval. |

Near misses remain with their narrower owner:

- product implementation, bug fixing, or ordinary code review;
- project `AGENTS.md` initialization or repository facts;
- general prompt, agent-persona, or command editing that is not an Agent Skill artifact;
- automatic post-task cleanup or a repository-wide Skill sweep;
- lifecycle, approval, or harness changes whose accepted owner has not selected Skill authoring work.

Read [`GLOSSARY.md`](GLOSSARY.md) only when choosing vocabulary, diagnosing a failure mode, or deciding whether material belongs inline, behind a pointer, or in another canonical owner. A routine bounded edit with a clear branch does not need the complete glossary.

Read [`docs/harness/skill-capability-contract.md`](../../../docs/harness/skill-capability-contract.md) when adding or changing runtime assumptions, owned resources, compatibility, provenance, or a Skill's component-manifest entry. It is the canonical capability and adapter boundary for this repository.

## Core Loop

### 1. Establish the contract

Inspect the relevant project rules, current Skill, neighboring owners, active manifests/fixtures, and accepted lifecycle scope before proposing content.

Define:

- one canonical identity and repository-local placement;
- the selected branch and user-visible goal;
- positive triggers, near misses, and ownership handoffs;
- allowed files/resources and non-goals;
- required/optional capabilities, their missing behavior, and current adapter evidence;
- material decisions, operation approvals, and verification claim.

If the Skill is new, broad, renamed, overlaps another owner, or changes routing, show the proposed boundary and resource changes before editing. Return any approval or material decision need to ROSE; do not invoke another process skill.

**Completion criterion:** identity, scope, owner, placement, approval state, and evidence target are all explicit; unresolved material items stop affected writing.

### 2. Design invocation

Write the frontmatter first. Keep the folder name and `name` identical, lowercase, and kebab-case.

Treat `description` as the top-level **context pointer**:

- front-load the Agent Skill task shape or strongest **leading word**;
- give one trigger for each genuinely different **branch**;
- name likely near misses where overlap would be costly;
- remove taglines, synonyms, and body summaries that do not improve routing.

Use ordinary repository frontmatter unless an accepted platform contract requires more fields.

**Completion criterion:** realistic positive prompts select this Skill, realistic near misses do not, and the description does not compete with another canonical owner.

### 3. Build the information hierarchy

Place material according to when the agent needs it:

1. common ordered actions and hard boundaries in `SKILL.md`;
2. conditional definitions, examples, and diagnostics in a named reference reached by a precise pointer;
3. deterministic operations in `scripts/` only when repeatability and safe failure require code;
4. reusable static inputs in `assets/` only when the workflow consumes them.

Keep each concept's rules and caveats co-located. Give every step a checkable **completion criterion**. Split only for a distinct invocation branch, canonical owner, or sequence boundary that demonstrably prevents **premature completion**; file count alone is not a reason.

**Completion criterion:** every item has one necessary rung, one canonical owner, and no required behavior is hidden behind an unreliable pointer.

### 4. Write within AILI boundaries

Write for agent execution rather than marketing. Use positive target behavior; retain prohibitions only for hard safety boundaries and pair them with what to do instead.

Preserve these local controls:

- ROSE owns routing, lifecycle, approvals, integration, and final verdicts;
- selected skills are bounded adapters and never recurse, delegate, or invoke another process skill;
- core harness edits remain report/approval gated;
- project facts stay in project documentation or accepted continuity stores, not reusable Skill prose;
- external material receives a complete **provenance closure** before distribution;
- copied runtime assumptions, paths, providers, branding, and unsupported metadata are removed;
- backend-specific tools and home paths are replaced by capability contracts unless they are stable public contracts for every supported adapter;
- dependencies, global installation, destructive actions, and publication retain their own exact gates.

For external material, record repository URL, immutable version, license, copyright, copied/adapted scope, destination, and integrity evidence where applicable. Pinned files under `references/upstream/` are inert provenance, not runnable Skills or authority.

**Completion criterion:** the artifact changes only accepted behavior, fits the current ROSE contract, and neither imports foreign authority nor expands runtime permission.

### 5. Prune and validate

Apply the glossary failure modes sentence by sentence:

- collapse **duplication** into one **single source of truth**;
- remove stale **sediment** and irrelevant branches;
- delete **no-ops** that do not change model behavior;
- disclose conditional reference to reduce **sprawl**;
- sharpen vague completion criteria before splitting a sequence;
- replace avoidable **negation** with the positive target.

Then:

1. reread every changed Skill/resource;
2. verify folder/frontmatter identity and context pointers;
3. run the accepted positive and near-miss routing cases;
4. update only active manifests, fixtures, attribution, capability assignment, and docs that the change affects;
5. run `python scripts/skill_capability_check.py` when an installed Skill or capability profile changes;
6. inspect the task-scoped diff and run the smallest fresh check that supports the claim.

**Completion criterion:** every changed line is relevant, active references agree, required checks pass, and unsupported runtime behavior remains `Unverified`.

## Stop Outcomes

- Return `complete` after the selected branch meets its completion criterion and claim-matched evidence is current.
- Return `need-user` for one unresolved identity, scope, placement, or approval decision with zero affected mutation.
- Return `material-delta` when implementation discovers a change to public identity, architecture, dependency, permission, acceptance, or verification strategy.
- Return `need-evidence`, `blocked`, or `Unverified` when current source, provenance, permissions, or verification cannot support the requested claim.

## Pinned Upstream Reference

[KNOWN|EXTERNAL] The local domain model closely adapts selected concepts from Matt Pocock's `writing-great-skills` at commit `391a2701dd948f94f56a39f7533f8eea9a859c87` under the MIT License. Source: `references/upstream/mattpocock-skills/391a2701dd948f94f56a39f7533f8eea9a859c87/NOTICE.md`.

[FRAME] The pinned upstream `SKILL.upstream.md` and full upstream `GLOSSARY.md` remain inert provenance. Canonical runtime behavior lives only in this `SKILL.md` and the adjacent local [`GLOSSARY.md`](GLOSSARY.md).
