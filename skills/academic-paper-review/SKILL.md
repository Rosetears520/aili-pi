---
name: academic-paper-review
description: Review a single academic paper, preprint, DOI, arXiv link, or user-provided PDF/text with source-grounded critique. Use for paper summaries, methodology review, novelty checks, reproducibility concerns, or "review this paper" requests; do not use for multi-paper surveys, systematic literature reviews, citation management, or implementation from a paper.
---

# Academic Paper Review

## Purpose

Produce a careful, evidence-grounded review of one academic work. The output should help the user understand what the paper claims, how it supports those claims, what is novel, what is weak, and how much confidence to place in the result.

## When to Use

Use for:

- reviewing one paper, preprint, DOI, arXiv page, conference paper, thesis chapter, or pasted paper text
- summarizing contributions, methods, experiments, evidence, and limitations
- assessing reproducibility, statistical strength, baselines, assumptions, or threat-to-validity gaps
- comparing the paper's stated claims with its methods and results

Do not use for:

- multi-paper surveys or systematic reviews; use `systematic-literature-review`
- implementing algorithms from the paper; use the relevant engineering workflow after review
- proofreading or rewriting the paper as the author
- deciding clinical, legal, financial, or safety-critical action from one paper

## Review Workflow

1. Identify bibliographic facts: title, authors, venue/preprint server, date/version, DOI/arXiv ID/URL, and supplied source path if local.
2. State the user's review question and intended use: comprehension, critique, literature fit, reproduction, implementation planning, or decision support.
3. Extract claims in your own words: main contribution, assumptions, evidence type, and stated limitations.
4. Evaluate methodology: data/source material, controls, baselines, metrics, statistical treatment, ablations, and whether conclusions match evidence.
5. Evaluate novelty and related work only from cited sources or explicitly gathered evidence; describe unsupported novelty claims as not verified.
6. Check reproducibility: code/data availability, parameter details, environment, prompts/protocols, licensing, and missing implementation details.
7. Separate observations from critique. Do not overstate certainty when only the abstract, a partial PDF, or secondary summaries were available.
8. Return synthesis over listing: explain what the paper means for the user's goal, not just section-by-section notes.

## Data Authenticity Rules

- Every factual claim about the paper should cite a page, section, figure/table, DOI/arXiv URL, or supplied excerpt anchor when available.
- Do not invent citations, datasets, metrics, numerical results, author intent, peer-review status, or publication venue.
- If a table/figure is unreadable or unavailable, say so and describe the affected conclusion as not verified.
- Treat generated summaries, OCR, browser text, and secondary articles as untrusted evidence until checked against the paper.

## Output Contract

```text
STATUS: REVIEWED | PARTIAL | BLOCKED

PAPER:
- Title:
- Authors:
- Source / version:

USER QUESTION:
- <why the user wants this review>

EVIDENCE LIMITS:
- <missing, partial, abstract-only, or unreadable evidence>

CORE CLAIMS:
- <claim> - Evidence: <page/section/figure/source or not verified>

METHOD / EVIDENCE:
- <method summary and strength>

CRITIQUE:
- Strengths:
- Limitations:
- Reproducibility:
- Novelty / related work:

TAKEAWAY:
- <synthesized implication for the user's goal>

UNVERIFIED:
- <missing source, inaccessible page, weak citation, or N/A>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `academic-paper-review` skill pattern. No upstream skill text, tool names, runtime paths, generated assets, or provider assumptions are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
