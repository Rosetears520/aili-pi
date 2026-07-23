---
name: chart-visualization
description: Design, critique, or specify honest charts and data visualizations from known data and audience needs. Use for chart selection, misleading-chart audits, accessibility, dashboard visuals, or "make this data easier to understand"; do not use for raw data analysis, PPT deck generation, spreadsheet surgery, or fabricated chart data.
---

# Chart Visualization

## Purpose

Choose or review visualizations so the chart answers the user's question honestly, accessibly, and with clear data provenance.

## When to Use

Use for:

- selecting chart types for a known dataset or analysis result
- auditing charts for misleading axes, bad encodings, clutter, inaccessible color, or unclear labels
- specifying dashboard/chart requirements before implementation
- improving chart titles, annotations, scales, legends, and captions

Do not use for:

- performing the underlying numeric analysis; use `data-analysis`
- generating a full slide deck; use `pptx-generator`
- editing an XLSX file while preserving workbook internals; use `minimax-xlsx`
- inventing sample data to make a chart look good

## Workflow

1. Identify the chart question: comparison, trend, distribution, composition, relationship, geospatial pattern, or ranking.
2. Confirm data provenance, fields, units, denominators, time window, and transformations before choosing encodings.
3. Choose the simplest chart type that answers the question.
4. Specify encodings: x/y, series, grouping, sorting, scale, baseline, annotations, uncertainty, and interaction if needed.
5. Audit for honesty: truncated axes, dual-axis confusion, hidden denominators, misleading aggregation, overplotting, cherry-picked ranges, and omitted uncertainty.
6. Audit for usability: title states the takeaway, labels are readable, color is accessible, legend is close to data, mobile/print context is considered.

## Data Authenticity Rules

- Do not fabricate values, categories, units, totals, or trend direction.
- If the data is unavailable, produce a chart specification or critique checklist, not a rendered claim.
- Label derived metrics and normalized values clearly.
- Prefer annotations that explain source-backed events; mark speculative explanations `[UNVERIFIED]`.

## Output Contract

```text
STATUS: SPECIFIED | REVIEWED | PARTIAL | BLOCKED

QUESTION:
- <what the chart should answer>

DATA BASIS:
- <source fields, units, filters, transformations, or missing provenance>

RECOMMENDED VISUAL:
- Chart type:
- Encodings:
- Title / labels / annotations:
- Accessibility notes:

HONESTY AUDIT:
- <axis, scale, aggregation, uncertainty, denominator, or range concerns>

IMPLEMENTATION NOTES:
- <library-agnostic guidance or project-specific constraints>

UNVERIFIED:
- <missing data/provenance or N/A>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `chart-visualization` skill pattern. No upstream skill text, runtime paths, tools, generated assets, provider assumptions, or chart templates are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
