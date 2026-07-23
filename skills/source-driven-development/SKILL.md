---
name: source-driven-development
description: Resolve one exact official/current documentation gap when the user requests source verification or a version-sensitive API/SDK/provider/framework question can materially change the current decision; do not trigger for every implementation decision, ordinary framework code, local business logic, or broad research.
---

# Source-Driven Development

## Overview

Use a narrow official source to resolve the named version-sensitive question. This is evidence for the current primary loop, not a second implementation or acceptance workflow.

## When to Use

- The user explicitly asks to verify or cite current official/API behavior.
- One unresolved version-sensitive API, SDK, provider, framework, packaging, runtime, platform, or changelog question can materially change the current design or implementation.
- Existing official docs and installed types/source conflict on the exact behavior being used.

**When NOT to use:**

- Correctness does not depend on a specific version (renaming variables, fixing typos, moving files)
- Pure logic that works the same across all versions (loops, conditionals, data structures)
- The user explicitly wants speed over verification ("just do it quickly") and the task does not involve version-sensitive framework/API/library behavior
- The task merely uses a library/framework and local evidence already establishes the needed API.
- The user asks for mature-project prior art, local repository facts, implementation, or review rather than one official-source answer.

## Planning Evidence Gate Ownership

ROSE/`aili-delivery-flow` owns lifecycle timing, local evidence, material questions, approvals, implementation, and verification. This skill performs one bounded lookup, cites the exact source, and returns `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. It must not invoke local/prior-art/requirements/test-plan/review skills or turn a source summary into scheme acceptance. Use external web or Context7 only when current policy allows the exact lookup; never send secrets or sensitive context. Lifecycle approval and verification rules win conflicts.

## The Process

```
DETECT ──→ FETCH ──→ RETURN ──→ CITE
  │          │           │            │
  ▼          ▼           ▼            ▼
 What       Get the    Return the   Show the
 gap?       relevant   bounded      exact source
            docs       answer
```

### Step 1: Detect Stack and Versions

Read the project's dependency file to identify exact versions:

```
package.json    → Node/React/Vue/Angular/Svelte
composer.json   → PHP/Symfony/Laravel
requirements.txt / pyproject.toml → Python/Django/Flask
go.mod          → Go
Cargo.toml      → Rust
Gemfile         → Ruby/Rails
```

State what you found explicitly:

```
STACK DETECTED:
- React 19.1.0 (from package.json)
- Vite 6.2.0
- Tailwind CSS 4.0.3
→ Fetching official docs for the relevant patterns.
```

If the version is missing or materially ambiguous, return that exact decision/evidence gap to ROSE. Do not guess or ask a second workflow-owned question here.

### Step 2: Fetch Official Documentation

Fetch the specific documentation page for the feature you're implementing. Not the homepage, not the full docs — the relevant page.

For library/API documentation, setup commands, framework examples, provider behavior such as DeepSeek APIs, SDK references, packaging/runtime/platform constraints, changelog-sensitive behavior, or version-sensitive code, prefer Context7 when it is installed in the current OpenCode environment. Do not require the user to manually say "use context7" each time. Do not assume Context7 is installed; if it is unavailable, fall back to official docs, package documentation, and source references. Do not add or rely on a repository-local Context7 skill.

Speed requests may reduce citation verbosity, but they do not remove the required source/evidence check for version-sensitive framework, API, or library behavior. If correctness depends on the detected version, verify the source first and then summarize citations briefly.

**Source-fetch fallback ladder:**

| Trigger | Next source | If still unavailable |
|---|---|---|
| Context7 is unavailable or has no matching library/version | Fetch the official documentation URL directly | Use the package's official README/changelog/release notes from the upstream repository |
| Official docs page is unavailable, moved, or lacks the needed pattern | Check official blog, migration guide, API reference, or versioned docs | Mark the pattern `UNVERIFIED` and return the dependent implementation decision to ROSE |
| Package docs and source disagree | Prefer versioned docs, then inspect installed package types/source for the detected version | Surface the discrepancy as a conflict; do not silently choose |
| Network/tooling prevents source access | Use only already-present local docs/types/package files | Report `BLOCKED_VERIFICATION` or `NEEDS_REVIEW` for framework-specific code that cannot be sourced |

🔴 CHECKPOINT / 🛑 STOP: If no authoritative source can confirm a version-sensitive API, return `need-user` or `need-evidence` to ROSE before dependent coding. Only ROSE records explicit acceptance of an `UNVERIFIED` implementation.

**Source hierarchy (in order of authority):**

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Official documentation | react.dev, docs.djangoproject.com, symfony.com/doc |
| 2 | Official blog / changelog | react.dev/blog, nextjs.org/blog |
| 3 | Web standards references | MDN, web.dev, html.spec.whatwg.org |
| 4 | Browser/runtime compatibility | caniuse.com, node.green |

**Not authoritative — never cite as primary sources:**

- Stack Overflow answers
- Blog posts or tutorials (even popular ones)
- AI-generated documentation or summaries
- Your own training data (that is the whole point — verify it)

**Be precise with what you fetch:**

```
BAD:  Fetch the React homepage
GOOD: Fetch react.dev/reference/react/useActionState

BAD:  Search "django authentication best practices"
GOOD: Fetch docs.djangoproject.com/en/6.0/topics/auth/
```

After fetching, extract the key patterns and note any deprecation warnings or migration guidance.

When official sources conflict with each other (e.g. a migration guide contradicts the API reference), surface the discrepancy to the user and verify which pattern actually works against the detected version.

### Step 3: Return the Documented Pattern

Return the exact supported pattern and constraints to the primary owner. If implementation is already in scope, ROSE may apply it directly; this skill does not start another implementation loop.

- Use the API signatures from the docs, not from memory
- If the docs show a new way to do something, use the new way
- If the docs deprecate a pattern, don't use the deprecated version
- If the docs don't cover something, flag it as unverified

**When docs conflict with existing project code:**

```
CONFLICT DETECTED:
The existing codebase uses useState for form loading state,
but React 19 docs recommend useActionState for this pattern.
(Source: react.dev/reference/react/useActionState)

Options:
A) Use the modern pattern (useActionState) — consistent with current docs
B) Match existing code (useState) — consistent with codebase
→ Which approach do you prefer?
```

Surface the conflict. Don't silently pick one.

🔴 CHECKPOINT / 🛑 STOP: If documented best practice conflicts with existing project conventions, compatibility constraints, or tests, pause with options before editing. The user must choose whether to follow current docs, preserve local patterns, or defer the change.

### Step 4: Cite Your Sources

Every framework-specific pattern gets a citation. The user must be able to verify every decision.

**In code comments:**

```typescript
// React 19 form handling with useActionState
// Source: https://react.dev/reference/react/useActionState#usage
const [state, formAction, isPending] = useActionState(submitOrder, initialState);
```

**In conversation:**

```
I'm using useActionState instead of manual useState for the
form submission state. React 19 replaced the manual
isPending/setIsPending pattern with this hook.

Source: https://react.dev/blog/2024/12/05/react-19#actions
"useTransition now supports async functions [...] to handle
pending states automatically"
```

**Citation rules:**

- Full URLs, not shortened
- Prefer deep links with anchors where possible (e.g. `/useActionState#usage` over `/useActionState`) — anchors survive doc restructuring better than top-level pages
- Quote the relevant passage when it supports a non-obvious decision
- Include browser/runtime support data when recommending platform features
- If you cannot find documentation for a pattern, say so explicitly:

```
UNVERIFIED: I could not find official documentation for this
pattern. This is based on training data and may be outdated.
Verify before using in production.
```

Honesty about what you couldn't verify is more valuable than false confidence.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'm confident about this API" | Confidence is not evidence. Training data contains outdated patterns that look correct but break against current versions. Verify. |
| "Fetching docs wastes tokens" | Hallucinating an API wastes more. The user debugs for an hour, then discovers the function signature changed. One fetch prevents hours of rework. |
| "The docs won't have what I need" | If the docs don't cover it, that's valuable information — the pattern may not be officially recommended. |
| "I'll just mention it might be outdated" | A disclaimer doesn't help. Either verify and cite, or clearly flag it as unverified. Hedging is the worst option. |
| "This is a simple task, no need to check" | Simple tasks with wrong patterns become templates. The user copies your deprecated form handler into ten components before discovering the modern approach exists. |

## Red Flags

- Answering the selected version-sensitive gap without checking the applicable official source
- Using "I believe" or "I think" about the selected API instead of citing the source
- Returning a pattern without knowing which applicable version it describes
- Citing Stack Overflow or blog posts instead of official documentation
- Using deprecated APIs because they appear in training data
- Ignoring the current dependency/version evidence when it controls the selected question
- Returning a non-trivial framework/API conclusion without its source citation
- Fetching an entire docs site when only one page is relevant

## Do Not Do

- Do not use Stack Overflow, tutorials, AI summaries, or memory as the primary authority for framework-specific code.
- Do not hide missing docs behind hedging language like "probably" or "should work"; label it `UNVERIFIED`.
- Do not keep coding through a docs/code conflict without a visible checkpoint and user decision.
- Do not add a repository-local docs tool or Context7 skill as a workaround for unavailable documentation tooling.
- Do not cite a source you did not actually read for the detected version or feature.

## Verification

Before returning the bounded source result:

- [ ] The applicable version was identified when the question is version-sensitive
- [ ] The smallest relevant official/API source was read for the selected gap
- [ ] Primary authority is official documentation rather than a blog post, tutorial, or training-memory claim
- [ ] The exact decision/source gap is answered or marked `UNVERIFIED`
- [ ] Any implementation need is returned to ROSE without an extra scheme approval
- [ ] Non-trivial decisions include source citations with full URLs
- [ ] Deprecation/migration guidance was checked when the selected gap involves an API transition
- [ ] Conflicts between docs and existing code were surfaced to the user
- [ ] Anything that could not be verified is explicitly flagged as unverified
