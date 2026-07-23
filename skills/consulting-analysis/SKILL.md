---
name: consulting-analysis
description: Structure source-grounded consulting-style analysis for strategy, market, product, operations, or decision memos. Use for MECE problem framing, hypotheses, options, tradeoffs, executive recommendations, or "consulting analysis" requests; do not use for legal/financial advice, implementation, data computation, chart rendering, or unsourced business claims.
---

# Consulting Analysis

## Purpose

Convert an ambiguous business or product question into a clear, evidence-backed recommendation with assumptions, options, risks, and next decisions.

## When to Use

Use for:

- strategy memos, product/business case analysis, market-entry framing, operational diagnosis, or option comparison
- MECE issue trees, hypotheses, criteria, tradeoff tables, and executive summaries
- turning research notes into a decision-ready recommendation

Do not use for:

- regulated legal, investment, tax, medical, or HR advice
- numeric analysis of a dataset; use `data-analysis`
- chart design; use `chart-visualization`
- implementing the recommendation

## Workflow

1. Clarify the decision owner, decision deadline, success metric, constraints, and non-goals.
2. Frame the problem as a decision question, then split it into MECE drivers or hypotheses.
3. Inventory evidence by source type and reliability. Mark assumptions separately from facts.
4. Compare options against explicit criteria: impact, cost, speed, risk, reversibility, evidence strength, and strategic fit.
5. Synthesize a recommendation plus alternatives, not just a list of pros/cons.
6. State what would change the recommendation and what evidence should be gathered next.

## Authenticity Rules

- Do not invent market sizes, competitor facts, customer quotes, financial projections, or benchmark numbers.
- If the user supplies estimates, label them user-provided unless independently verified.
- Keep confidence tied to evidence quality; weak evidence can still support a hypothesis, not a final claim.

## Output Contract

```text
STATUS: ANALYZED | PARTIAL | BLOCKED
CONFIDENCE: high | medium | low

DECISION QUESTION:
- <question, owner, timing, constraints>

ISSUE TREE / HYPOTHESES:
- <driver or hypothesis> - Evidence/assumption:

OPTIONS:
- <option> | impact | cost | risk | reversibility | evidence strength

RECOMMENDATION:
- <recommended option and why>

RISKS / WATCHPOINTS:
- <risk and mitigation>

NEXT EVIDENCE:
- <source or experiment that would change confidence>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `consulting-analysis` skill pattern. No upstream skill text, runtime paths, tools, generated assets, or provider assumptions are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
