---
name: newsletter-generation
description: Generate or edit a source-grounded newsletter issue, digest, or briefing from provided or researched sources. Use for weekly/monthly updates, curated links, executive digests, community newsletters, or "turn these sources into a newsletter"; do not use for UI landing pages, marketing campaign design, unsourced news claims, or long-form research reports.
---

# Newsletter Generation

## Purpose

Turn source material into a concise, useful newsletter that has a clear audience, editorial angle, attribution, and fact boundaries.

## When to Use

Use for:

- weekly/monthly newsletters, digest emails, link roundups, or executive briefings
- summarizing a set of URLs, release notes, issues, papers, meeting notes, or user-provided bullets
- creating an editorial structure: subject line, intro, sections, summaries, calls to action, and source list

Do not use for:

- building the visual landing page or email UI; use frontend/design skills as appropriate
- deep academic/systematic reviews; use `systematic-literature-review`
- unsourced breaking-news claims or fake quotes
- sending email, subscribing users, or managing mailing-list provider configuration

## Workflow

1. Identify audience, purpose, tone, cadence, length, and required sections.
2. Inventory sources and mark their type: official update, primary document, issue/PR, paper, meeting note, user-provided note, or secondary article.
3. Verify key facts against primary sources when practical. Do not turn weak evidence into confident news.
4. Choose an editorial angle that explains why the issue matters to the audience.
5. Synthesize related items into themes; avoid one bullet per source unless the user asked for a link list.
6. Draft with concrete headlines, short summaries, clear attribution, and explicit calls to action.
7. Include an `Unverified / Needs follow-up` section for claims, links, dates, or numbers not checked.

## Quality Rules

- No fabricated quotes, dates, metrics, product names, event details, sponsorships, or endorsements.
- Use realistic copy, not filler text.
- Distinguish editorial interpretation from source facts.
- Keep source links visible unless the user requests a no-link internal memo.

## Output Contract

```text
STATUS: DRAFTED | PARTIAL | BLOCKED

AUDIENCE / GOAL:
- <who this is for and what action/understanding it should create>

ISSUE DRAFT:
- Subject:
- Preview:
- Intro:
- Sections:
- Closing / CTA:

SOURCES USED:
- <source> - <what it supports>

EDITORIAL NOTES:
- <tone, angle, cuts, or assumptions>

UNVERIFIED:
- <unchecked claim/source/date or N/A>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `newsletter-generation` skill pattern. No upstream skill text, runtime paths, tools, generated assets, provider configuration, or mailing-service assumptions are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
