---
name: systematic-literature-review
description: Plan and synthesize a source-grounded multi-paper literature review. Use for systematic literature reviews, survey matrices, inclusion/exclusion criteria, research gaps, or "review the literature on X" requests; do not use for reviewing one paper, ordinary web summaries, citation formatting only, or medical/legal conclusions.
---

# Systematic Literature Review

## Purpose

Create a transparent, reproducible literature-review workflow that records how sources were found, screened, compared, and synthesized. The goal is a defensible synthesis, not a pile of paper summaries.

## When to Use

Use for:

- "do a literature review on ..."
- survey, systematic review, scoping review, related-work map, or research-gap analysis
- comparing multiple academic papers across methods, datasets, findings, and limitations
- building an evidence matrix for a DEFINE/design decision

Do not use for:

- one paper only; return the narrower paper-review mismatch to ROSE
- broad industry/prior-art project research; return the mature-project research mismatch to ROSE
- medical, legal, policy, or safety-critical recommendations without domain review
- generating fake citations or filling missing bibliography details from memory

## Workflow

1. Define the review question, scope, time range, disciplines, source types, and exclusion boundaries.
2. Define search strategy before collecting results: keywords, databases/search surfaces, filters, and minimum source metadata.
3. Screen sources with explicit inclusion/exclusion reasons. Keep a concise matrix even if the final output is chat-only.
4. Extract comparable fields: question, method, data/sample, baseline, metric, key finding, limitation, venue/date, and relevance.
5. Cluster sources by theme, method, evidence quality, and disagreement. Prefer synthesis, trends, and gaps over chronological listing.
6. Mark evidence strength: replicated finding, single-study signal, conflicting evidence, weak/indirect evidence, or `[UNVERIFIED]`.
7. Produce implications for the user's goal plus open questions that require more search or expert review.

## Authenticity and Citation Rules

- Every included paper needs a stable identifier when available: DOI, arXiv ID, PMID, ISBN, repository URL, venue URL, or local file path.
- Do not invent titles, authors, publication years, datasets, sample sizes, quotes, or findings.
- If only abstracts were inspected, mark conclusions as abstract-only and lower confidence.
- Keep excluded-but-relevant sources visible when they could change interpretation.

## Output Contract

```text
STATUS: SYNTHESIZED | PARTIAL | BLOCKED
CONFIDENCE: high | medium | low

REVIEW QUESTION:
- <question and scope>

SEARCH STRATEGY:
- Sources searched:
- Keywords / filters:
- Inclusion / exclusion criteria:

EVIDENCE MATRIX:
- <paper/source> | <method> | <finding> | <limitation> | <relevance> | <identifier>

SYNTHESIS:
- Themes:
- Agreements:
- Disagreements:
- Gaps:

IMPLICATIONS:
- <what the literature suggests for the user's decision>

UNVERIFIED / LIMITATIONS:
- <missing full text, limited database access, abstract-only evidence, or N/A>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `systematic-literature-review` skill pattern. No upstream skill text, runtime paths, tools, generated assets, or provider assumptions are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
