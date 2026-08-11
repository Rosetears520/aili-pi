---
name: data-analysis
description: Analyze source data, tables, CSV/XLSX extracts, metrics, or experiment results with explicit data-authenticity checks. Use for profiling, cleaning assumptions, statistical summaries, segmentation, trend analysis, or "analyze this data"; do not use for spreadsheet file surgery, chart design only, database migrations, or claims without data provenance.
---

# Data Analysis

## Purpose

Analyze supplied or approved data while preserving provenance, limitations, and uncertainty. The skill prioritizes data authenticity before insight generation.

## When to Use

Use for:

- CSV/XLSX/table/JSON metric analysis when the user wants findings or interpretation
- experiment result analysis, cohort/segment comparison, anomaly checks, and trend explanations
- deciding what summaries or charts would best answer a question

Do not use for:

- editing spreadsheet internals or preserving XLSX formatting; use `minimax-xlsx`
- chart-only critique or visualization design; use `chart-visualization`
- changing production databases or schemas
- making claims when no data source is available

## Workflow

1. Identify the analysis question, source files, owner, collection window, units, and expected grain.
2. Profile the data before interpreting: row/column counts, schema, missing values, duplicates, outliers, joins, and obvious type issues.
3. Record cleaning choices. Do not silently drop rows, coerce values, or fill gaps without saying why.
4. Analyze with the simplest sufficient method: descriptive stats before models, segments before aggregate-only claims, confidence intervals when relevant.
5. Check whether the result answers the user's question or exposes a better question.
6. Report findings with caveats, source provenance, and recommended next checks.

## Data Authenticity Rules

- Do not invent rows, columns, labels, timestamps, units, denominators, or missing metadata.
- Distinguish observed data, cleaned/derived data, user-provided assumptions, and inference.
- If data is sampled, stale, filtered, synthetic, or incomplete, mark the scope limitation.
- Avoid causal language unless the design supports causality.

## Output Contract

```text
STATUS: ANALYZED | PARTIAL | BLOCKED

QUESTION:
- <analysis question>

EVIDENCE LIMITS:
- <sampling, freshness, missing metadata, or causal limitations>

DATA PROVENANCE:
- Source:
- Rows/columns or scope:
- Time window / grain / units:

QUALITY CHECKS:
- Missingness:
- Duplicates/outliers:
- Cleaning choices:

FINDINGS:
- <finding> - Evidence: <calculation/source field>

LIMITATIONS:
- <data or method limitation>

NEXT CHECKS:
- <follow-up analysis, validation, or chart>
```

## Provenance

Clean-room AILI/OpenCode adaptation inspired by the public DeerFlow `data-analysis` skill pattern. No upstream skill text, runtime paths, tools, generated assets, provider assumptions, or external analysis services are copied. Source family: [bytedance/deer-flow](https://github.com/bytedance/deer-flow), MIT License.
