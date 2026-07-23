---
name: spec-driven-development
description: Create or materially revise a durable specification when the user explicitly requests a spec/new feature contract or a named ambiguity requires formal DEFINE; do not trigger for ordinary bounded edits, implementation, task breakdown alone, review, or documentation of already-settled behavior.
---

# Spec-Driven Development

## Overview

When explicit specification intent or a material ambiguity selects this loop, create the smallest durable contract that defines scope, behavior, boundaries, and acceptance. Ordinary bounded work remains outside this skill and does not require a new formal specification.

## When to Use

- The user explicitly asks for a specification or formal feature/change contract.
- A named material ambiguity requires durable scope, behavior, interface, or acceptance decisions before implementation.
- A new project/feature has no current formal contract and the ordinary/formal classifier selects DEFINE.

**When NOT to use:** Ordinary bounded edits, multi-file work with clear acceptance, task breakdown from an existing spec, implementation, review, or docs-only explanation.

## Canonical loop contract

This skill is a bounded adapter to the ordinary specification or canonical DEFINE loop. ROSE/`aili-delivery-flow` owns change identity, lifecycle state, approvals, progress, and verification. Produce only the next dependency-ready spec artifacts, reread each write once, and stop with `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Do not invoke planning, requirements, research, test-plan, TDD, implementation, review, or another process skill. Return a named need to ROSE. Lifecycle approval and claim-matched verification rules override generic upstream phase/checklist wording.

## The Validated Workflow

Spec-driven development supplies SPECIFY/PLAN/TASKS techniques. Formal AILI work maps them to dependency-ready canonical artifacts through `aili-delivery-flow`; it does not own IMPLEMENT, create upstream task files, public commands, or parallel approval authorities.

```
SPECIFY ──→ PLAN ──→ TASKS ──→ HANDOFF
   │          │        │          │
   ▼          ▼        ▼          ▼
 Validate   Validate Validate   Return to owner
```

🔴 **CHECKPOINT · AILI lifecycle gate:** phase validation may require clarification or revision, but is not a separate mandatory lifecycle approval. Resolve or label material `Open Question` / `Unverified` items, persist/re-read canonical artifacts, and preserve final accepted `test-plan.md` as the sole mandatory pre-BUILD user approval. Silence, inferred intent, drafts, and upstream phase language are never approval.

The pinned Addy file under `references/upstream/` is inert reference data. This existing skill is the only runnable adapter; AILI placement, permissions, lifecycle order, material-delta writeback, final test-plan acceptance, and stop conditions override foreign paths and gates.

### Phase 1: Specify

Within the selected specification loop, start with the current objective and ask only decision-shaped questions needed to make material requirements concrete.

**Surface assumptions immediately.** Before writing any spec content, list what you're assuming:

```
ASSUMPTIONS I'M MAKING:
1. This is a web application (not native mobile)
2. Authentication uses session-based cookies (not JWT)
3. The database is PostgreSQL (based on existing Prisma schema)
4. We're targeting modern browsers only (no IE11)
→ Material assumptions require an explicit decision; otherwise they remain Open Question and block affected work.
```

Don't silently fill in ambiguous requirements. The spec's entire purpose is to surface misunderstandings *before* code gets written — assumptions are the most dangerous form of misunderstanding.

### Ambiguity Fallbacks

| Trigger condition | First response | If still unresolved |
|---|---|---|
| User asks for a broad feature with no success criteria | Draft 2-4 concrete success criteria and return the decision to ROSE | Keep the item as `Open Question`; do not proceed to PLAN |
| Architecture, data model, security, or migration behavior is unclear | List the competing options and tradeoffs for ROSE | Return `need-user` or `material-delta`; stop before implementation |
| Existing code/docs conflict with the user's description | Cite the conflict and return the source-of-truth decision to ROSE | Mark the conflict `Unverified`; do not choose silently |
| The spec would require public API, dependency, schema, or deployment changes | Return the exact material/risky decision or operation to ROSE | Block implementation tasks until the canonical approval is recorded |

Use only the sections needed by the current specification. Objective/success and material boundaries are normally required; commands, structure, style, and testing sections are conditional rather than a six-section completion form:

1. **Objective** — What are we building and why? Who is the user? What does success look like?

2. **Commands, when setup or verification is affected** — Use current project-documented commands with flags, not generic defaults.
   ```
   Build: <project command, if applicable>
   Test: <claim-matched command, if applicable>
   Lint: <project command, if applicable>
   Dev: <project command, if applicable>
   ```

3. **Project Structure, when placement changes** — Where affected source, tests, or docs belong.
   ```
   src/           → Application source code
   src/components → React components
   src/lib        → Shared utilities
   tests/         → Unit and integration tests
   e2e/           → End-to-end tests
   docs/          → Documentation
   ```

4. **Code Style, when a new pattern is introduced** — Prefer one current repository example over generic prose.

5. **Testing Strategy, when acceptance needs it** — Name only the checks and placement needed by the affected behavior.

6. **Material boundaries** — Reference canonical rules for exact dependency, schema, auth/security, external, destructive, Git, and release gates instead of duplicating a generic checklist.

**Spec template:**

```markdown
# Spec: [Project/Feature Name]

## Objective
[What we're building and why. User stories or acceptance criteria.]

## Tech Stack
[Framework, language, key dependencies with versions]

## Commands
[Build, test, lint, dev — full commands]

## Project Structure
[Directory layout with descriptions]

## Code Style
[Example snippet + key conventions]

## Testing Strategy
[Framework, test locations, coverage requirements, test levels]

## Boundaries
- Always: [...]
- Ask first: [...]
- Never: [...]

## Success Criteria
[How we'll know this is done — specific, testable conditions]

## Open Questions
[Anything unresolved that needs human input]
```

**Reframe instructions as success criteria.** When receiving vague requirements, translate them into concrete conditions:

```
REQUIREMENT: "Make the dashboard faster"

REFRAMED SUCCESS CRITERIA:
- Dashboard LCP < 2.5s on 4G connection
- Initial data load completes in < 500ms
- No layout shift during load (CLS < 0.1)
→ Are these the right targets?
```

This lets you loop, retry, and problem-solve toward a clear goal rather than guessing what "faster" means.

### Spec Loophole Pass

After the first SPECIFY draft, run the following direct loophole checklist. Invoke no separate stress-test unless the user explicitly requested it or ROSE identified a concrete material loophole.

Check whether:

- success criteria are executable and measurable
- scope and non-goals are explicit
- Always / Ask First / Never boundaries cover high-risk areas
- user-facing terms are not overloaded
- architecture-sensitive assumptions are marked
- security, privacy, reliability, migration, compatibility, and rollback concerns are either covered or explicitly out of scope
- unresolved items are listed as `Open Question`
- unverifiable claims are marked `Unverified`

Do not proceed to PLAN until material loopholes are fixed, accepted by the user, or explicitly recorded as `Open Question` / `Unverified`.

🛑 **STOP before PLAN:** if any material loophole remains neither accepted nor recorded, return a clarification request instead of drafting a plan.

### Phase 2: Plan

With the validated spec, generate a technical implementation plan:

1. Identify the major components and their dependencies
2. Determine the implementation order (what must be built first)
3. Note risks and mitigation strategies
4. Identify what can be built in parallel vs. what must be sequential
5. Define verification checkpoints between phases

The plan should be reviewable: the human should be able to read it and say "yes, that's the right approach" or "no, change X."

🛑 **STOP before TASKS:** do not break work into tasks until the plan is coherent and material open risks are resolved or explicitly recorded under the AILI contract. This validation creates no extra approval gate.

### Phase 3: Tasks

Break the plan into discrete, implementable tasks:

- Each task should cover one coherent behavior or dependency boundary
- Each task has explicit acceptance criteria
- Each task names the smallest evidence needed for its affected claim, when any package-local evidence is needed
- Tasks are ordered by dependency, not by perceived importance
- Task boundaries follow behavior, dependencies, ownership, risk, and reversibility rather than a fixed file count

🛑 **STOP before IMPLEMENT:** do not start coding until tasks have acceptance criteria and any claim-matched evidence targets they need, canonical artifacts are coherent/validated, and final `test-plan.md` has explicit user acceptance under the AILI lifecycle.

**Task template:**
```markdown
- [ ] Task: [Description]
  - Acceptance: [What must be true when done]
  - Verify: [How to confirm — test command, build, manual check]
  - Files: [Which files will be touched]
```

### Phase 4: Implementation Handoff

Return implementation readiness and the next dependency to ROSE. Implementation uses the canonical ordinary/BUILD owner; this skill does not invoke incremental, TDD, context, or other process skills.

## Keeping the Spec Alive

The spec is a living document, not a one-time artifact:

- **Update when decisions change** — If you discover the data model needs to change, update the spec first, then implement.
- **Update when scope changes** — Features added or cut should be reflected in the spec.
- **Version the spec when authorized** — The spec belongs in version control, but commit remains an exact Git operation approval.
- **Reference the spec in PRs** — Link back to the spec section that each PR implements.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is simple, I don't need a spec" | Ordinary bounded work may remain ordinary; use this skill only when explicit spec intent or a material ambiguity selects it. |
| "I'll write the spec after I code it" | That's documentation, not specification. The spec's value is in forcing clarity *before* code. |
| "The spec will slow us down" | Once formal specification is selected, keep it dependency-ready and no larger than the decisions it must preserve. |
| "Requirements will change anyway" | That's why the spec is a living document. An outdated spec is still better than no spec. |
| "The user knows what they want" | Surface only assumptions that can materially change the selected formal contract; do not manufacture questions for settled ordinary work. |

## Red Flags

- Treating every implementation as formal specification work
- Proceeding inside a selected formal change while material acceptance remains unresolved
- Inferring acceptance from silence or an uncorrected assumption
- Implementing behavior outside the accepted formal scope
- Making a material architecture/public-contract decision without returning it to the lifecycle owner

## Verification

Before proceeding to implementation, confirm:

- [ ] The directly applicable behavior, acceptance, and material boundaries are specified
- [ ] Only dependency-ready canonical artifacts were written and reread
- [ ] Success criteria are specific and testable
- [ ] Open questions and `Unverified` items remain explicit
- [ ] The lifecycle owner selected any required structural validation
- [ ] For formal AILI work, the final `test-plan.md` has explicit user acceptance before implementation
