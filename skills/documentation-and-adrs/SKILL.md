---
name: documentation-and-adrs
description: Create or update source-grounded documentation when the user explicitly asks for docs/ADR/onboarding material, a public contract change requires docs, or an accepted hard-to-reverse decision meets the ADR gate; do not trigger for every feature, architecture discussion, implementation, review, or SHIP request.
---

# Documentation and ADRs

## Overview

Document decisions, not just code. The most valuable documentation captures the *why* — the context, constraints, and trade-offs that led to a decision. Code shows *what* was built; documentation explains *why it was built this way* and *what alternatives were considered*. This context is essential for future humans and agents working in the codebase.

When documenting code or architecture, synthesize the system behavior from source evidence instead of listing files. A good document explains entry points, responsibilities, flows, invariants, and boundaries, with paths or symbols as evidence anchors.

## When to Use

- The user explicitly requests documentation, an ADR, architecture notes, API docs, or onboarding material.
- An accepted public API/config/workflow change requires its existing documentation to stay accurate.
- A settled decision is hard to reverse, surprising without context, and has a real trade-off.

**When NOT to use:** Ordinary implementation, an unresolved architecture choice, SHIP alone, obvious code, comments that restate code, or throwaway prototypes.

ROSE/`aili-delivery-flow` owns lifecycle state, material decisions, artifact placement, approvals, and verification. This skill performs one bounded documentation/ADR loop and returns `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. It does not invoke requirements, planning, source research, review, release, or another process skill. Canonical exact-operation and claim-matched verification rules win.

## Source-Grounded Documentation Reports

Use this pattern for code documentation, architecture notes, or onboarding docs:

1. Define the reader and the decision/action the document should support.
2. Inspect authoritative sources first: code, tests, schemas, configs, ADRs, release notes, and existing docs.
3. Summarize responsibilities and flows in your own words; cite paths, symbols, commands, or docs for each non-obvious claim.
4. Mark stale/conflicting docs explicitly and avoid resolving product or architecture questions by writing around them.
5. Prefer diagrams/tables only when they clarify ownership, data flow, lifecycle, or constraints.
6. Include verification or freshness notes: command run, files inspected, date/version, and remaining `Unverified` gaps.

## Architecture Decision Records (ADRs)

ADRs capture the reasoning behind significant technical decisions. They're the highest-value documentation you can write.

### When to Write an ADR

- Choosing a framework, library, or major dependency
- Designing a data model or database schema
- Selecting an authentication strategy
- Deciding on an API architecture (REST vs. GraphQL vs. tRPC)
- Choosing between build tools, hosting platforms, or infrastructure
- Any decision that would be expensive to reverse

Offer an ADR only when all are true:
1. **Hard to reverse** — changing later has meaningful cost.
2. **Surprising without context** — a future maintainer would ask why.
3. **Real trade-off** — credible alternatives existed and one was chosen for a reason.

Skip ADRs for obvious choices, temporary decisions, minor implementation details, or choices with no real alternatives.

### 🔴 CHECKPOINT · ADR Decision Gate

🛑 STOP before writing an ADR as accepted when the decision changes architecture, data model, authentication, infrastructure, public API, or a hard-to-reverse dependency. Confirm the decision owner, accepted option, rejected alternatives, and reversal cost first.

If those facts are missing, write a proposed ADR or an interview packet instead of inventing rationale.

### ADR Template

Store ADRs in `docs/decisions/` with sequential numbering:

```markdown
# ADR-001: Use PostgreSQL for primary database

## Status
Accepted | Superseded by ADR-XXX | Deprecated

## Date
2025-01-15

## Context
We need a primary database for the task management application. Key requirements:
- Relational data model (users, tasks, teams with relationships)
- ACID transactions for task state changes
- Support for full-text search on task content
- Managed hosting available (for small team, limited ops capacity)

## Decision
Use PostgreSQL with Prisma ORM.

## Alternatives Considered

### MongoDB
- Pros: Flexible schema, easy to start with
- Cons: Our data is inherently relational; would need to manage relationships manually
- Rejected: Relational data in a document store leads to complex joins or data duplication

### SQLite
- Pros: Zero configuration, embedded, fast for reads
- Cons: Limited concurrent write support, no managed hosting for production
- Rejected: Not suitable for multi-user web application in production

### MySQL
- Pros: Mature, widely supported
- Cons: PostgreSQL has better JSON support, full-text search, and ecosystem tooling
- Rejected: PostgreSQL is the better fit for our feature requirements

## Consequences
- Prisma provides type-safe database access and migration management
- We can use PostgreSQL's full-text search instead of adding Elasticsearch
- Team needs PostgreSQL knowledge (standard skill, low risk)
- Hosting on managed service (Supabase, Neon, or RDS)
```

### ADR Lifecycle

```
PROPOSED → ACCEPTED → (SUPERSEDED or DEPRECATED)
```

- **Don't delete old ADRs.** They capture historical context.
- When a decision changes, write a new ADR that references and supersedes the old one.

## Inline Documentation

### When to Comment

Comment the *why*, not the *what*:

```typescript
// BAD: Restates the code
// Increment counter by 1
counter += 1;

// GOOD: Explains non-obvious intent
// Rate limit uses a sliding window — reset counter at window boundary,
// not on a fixed schedule, to prevent burst attacks at window edges
if (now - windowStart > WINDOW_SIZE_MS) {
  counter = 0;
  windowStart = now;
}
```

### When NOT to Comment

```typescript
// Don't comment self-explanatory code
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Don't leave TODO comments for things you should just do now
// TODO: add error handling  ← Just add it

// Don't leave commented-out code
// const oldImplementation = () => { ... }  ← Delete it, git has history
```

### Document Known Gotchas

```typescript
/**
 * IMPORTANT: This function must be called before the first render.
 * If called after hydration, it causes a flash of unstyled content
 * because the theme context isn't available during SSR.
 *
 * See ADR-003 for the full design rationale.
 */
export function initializeTheme(theme: Theme): void {
  // ...
}
```

## API Documentation

For public APIs (REST, GraphQL, library interfaces):

### 🔴 CHECKPOINT · Public API Documentation Gate

🛑 STOP before publishing API docs when the docs would define or imply new public behavior, compatibility promises, auth requirements, error codes, rate limits, or versioning policy that the implementation or owner has not confirmed.

Document the implemented contract exactly. If code, tests, OpenAPI schemas, and existing docs disagree, resolve the conflict before updating user-facing docs.

### Inline with Types (Preferred for TypeScript)

```typescript
/**
 * Creates a new task.
 *
 * @param input - Task creation data (title required, description optional)
 * @returns The created task with server-generated ID and timestamps
 * @throws {ValidationError} If title is empty or exceeds 200 characters
 * @throws {AuthenticationError} If the user is not authenticated
 *
 * @example
 * const task = await createTask({ title: 'Buy groceries' });
 * console.log(task.id); // "task_abc123"
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  // ...
}
```

### OpenAPI / Swagger for REST APIs

```yaml
paths:
  /api/tasks:
    post:
      summary: Create a task
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTaskInput'
      responses:
        '201':
          description: Task created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '422':
          description: Validation error
```

## README Structure

Every project should have a README that covers:

```markdown
# Project Name

One-paragraph description of what this project does.

## Quick Start
1. Clone the repo
2. Install dependencies: `npm install`
3. Set up environment: `cp .env.example .env`
4. Run the dev server: `npm run dev`

## Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm test` | Run tests |
| `npm run build` | Production build |
| `npm run lint` | Run linter |

## Architecture
Brief overview of the project structure and key design decisions.
Link to ADRs for details.

## Contributing
How to contribute, coding standards, PR process.
```

## Domain Glossary and CONTEXT.md

Use `CONTEXT.md` for shared domain language:
- canonical terms
- meanings understood by domain experts
- boundaries between similar concepts
- terms that reduce repeated explanation

Do not put implementation details in `CONTEXT.md` unless they are part of the domain language.

When terms conflict between user language, docs, and code, surface the mismatch before writing new docs. Prefer one canonical term and record aliases only when they help readers map old language to current language.

## Documentation Conflict Fallbacks

| Trigger | First response | If still unresolved |
|---|---|---|
| Existing docs conflict with code or tests | Treat code/tests as evidence and label docs as stale | Ask the owner which source is authoritative before editing |
| Two docs make incompatible claims | Identify both paths and the exact conflicting statements | Update only after the canonical source is confirmed |
| Public API behavior is unclear | Inspect implementation, schemas, tests, and release notes | Stop; do not create compatibility promises from inference |
| ADR rationale is missing | Record known context and alternatives as `Proposed` or `Draft` | Ask decision makers for the missing rationale |
| A doc update would require product or architecture decisions | Separate the decision from the documentation task | Do not decide by writing docs |
| The requested doc would expose secrets or internal-only data | Remove sensitive content and document safe operational guidance | Escalate instead of publishing the unsafe detail |

## Changelog Maintenance

For shipped features:

```markdown
# Changelog

## [1.2.0] - 2025-01-20
### Added
- Task sharing: users can share tasks with team members (#123)
- Email notifications for task assignments (#124)

### Fixed
- Duplicate tasks appearing when rapidly clicking create button (#125)

### Changed
- Task list now loads 50 items per page (was 20) for better UX (#126)
```

## Documentation for Agents

Special consideration for AI agent context:

- **CLAUDE.md / rules files** — Document project conventions so agents follow them
- **Spec files** — Keep specs updated so agents build the right thing
- **ADRs** — Help agents understand why past decisions were made (prevents re-deciding)
- **Inline gotchas** — Prevent agents from falling into known traps

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The code is self-documenting" | Code shows what. It doesn't show why, what alternatives were rejected, or what constraints apply. |
| "We'll write docs when the API stabilizes" | APIs stabilize faster when you document them. The doc is the first test of the design. |
| "Nobody reads docs" | Agents do. Future engineers do. Your 3-months-later self does. |
| "ADRs are overhead" | A 10-minute ADR prevents a 2-hour debate about the same decision six months later. |
| "Comments get outdated" | Comments on *why* are stable. Comments on *what* get outdated — that's why you only write the former. |

## Red Flags

- Architectural decisions with no written rationale
- Public APIs with no documentation or types
- README that doesn't explain how to run the project
- Commented-out code instead of deletion
- TODO comments that have been there for weeks
- No ADRs in a project with significant architectural choices
- Documentation that restates the code instead of explaining intent

## Verification

For the selected documentation artifact:

- [ ] Claims are anchored to current source/contract evidence
- [ ] The requested audience, decision, and affected behavior are covered
- [ ] Conflicts and stale or `Unverified` content remain explicit
- [ ] The canonical owner selects the smallest freshness/structure check for this artifact
