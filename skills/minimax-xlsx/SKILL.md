---
name: minimax-xlsx
description: "Create, edit, analyze, format, or validate Excel/XLSX/CSV spreadsheets with managed OfficeCLI first and pandas/XML preservation-aware fallbacks."
---

# MiniMax XLSX Skill

Within an already-owned XLSX artifact task, handle the request directly and do not spawn sub-agents yourself. This does not override ROSE/user-assigned subagent ownership or `parallel-subagent-dispatch` routing. Always write the output file the user requests.

## Routing Boundary

Use this skill for Excel, `.xlsx`, `.xlsm`, `.csv`, `.tsv`, spreadsheets, formulas, pivot-like tables, financial models, tabular modeling, workbook formatting, or zero-format-loss workbook edits. Use `minimax-docx` for editable Word documents, `minimax-pdf` for final PDF/page-fidelity output, and `pptx-generator` for slides.

| Trigger | Use this skill? | Why |
|---|---:|---|
| "Add formulas to this workbook" | Yes | Spreadsheet formula edit |
| "Analyze this CSV and produce an XLSX" | Yes | Tabular workbook workflow |
| "Draft a Word report" | No | Route to `minimax-docx` |
| "Make a slide deck" | No | Route to `pptx-generator` |

`minimax-xlsx` is the sole spreadsheet artifact owner. OfficeCLI is an internal non-routable tool, not a Skill, MCP, command owner, or substitute workflow.

## Capability Boundary

- Required: `artifact.transform` to create or mutate a workbook.
- Optional: `repo.read` for source workbooks/data, `artifact.store` for the requested output, and image inspection for render-based layout claims.
- If no safe transform path exists, return `blocked`. If formula, preservation, render, or target-viewer evidence needed for a claim is unavailable, return `need-evidence` or name that claim `Unverified`.
- Do not install dependencies, write outside the owning repository, or invoke another process Skill. Return any missing capability, approval, or routing need to ROSE.

## OfficeCLI-First Selection

1. Establish the exact input, distinct output, target sheet/range/table/chart/pivot, formula intent, and preservation surface. Preserve every input original unless replacement was explicitly approved.
2. Resolve only the AILI installer-managed OfficeCLI binary. Set `OFFICECLI_SKIP_UPDATE=1`, confirm the expected installed version, and query the applicable read-only `officecli help xlsx ...` family. Installed-version help is the authority for exact argv, properties, enums, and output behavior.
3. Use OfficeCLI first only for a `.xlsx` operation whose complete behavior and explicit output are confirmed by installed help and whose preservation risk is bounded. Candidate operations include create; read/get/query; simple cell, formula, style, table, chart, or pivot edits; batch; validate/issues; and render.
4. If OfficeCLI is absent or drifted, recover through `rose-aili install` or `rose-aili update` without `--skip-officecli`. Never run npm, a full OfficeCLI installer, `officecli install`, an OfficeCLI Skill, or OfficeCLI MCP from this skill.
5. Use pandas for CSV/TSV analysis. Use the direct XML path for `.xlsm`, VBA or unsupported extensions, high-fidelity/preservation-sensitive workbooks, unsupported installed help, unclear output semantics, or insufficient OfficeCLI round-trip evidence. Return `need-user` or `need-evidence` when the safe fallback cannot satisfy the request.

OfficeCLI command success or a screenshot is not proof of formula correctness or zero-format-loss. Select claim-matched evidence: formula/readback/recalculation for calculation claims, structure inventory for preservation claims, validate/issues for package findings, and render plus actual image inspection for visual claims. Cross-viewer fidelity remains `Unverified` unless that exact viewer was freshly checked.

## Task Routing

| Task | Method | Guide |
|------|--------|-------|
| **READ** — inspect `.xlsx` | OfficeCLI first when installed help confirms the query | `references/read-analyze.md` for deeper/dataframe analysis |
| **CSV/TSV ANALYZE** | `xlsx_reader.py` + pandas; never mutate source | `references/read-analyze.md` |
| **CREATE** — new simple `.xlsx` | OfficeCLI first; XML template fallback for unsupported/complex requirements | `references/create.md` + `references/format.md` |
| **EDIT** — bounded existing `.xlsx` edit | OfficeCLI first when preservation is bounded; XML unpack→edit→pack fallback | `references/edit.md` (+ `format.md` if styling needed) |
| **MACRO/HIGH-FIDELITY** | Direct XML fallback; never modify VBA binaries | `references/edit.md` |
| **FIX / VALIDATE** | Claim-matched formula/readback/recalc evidence; XML fix when needed | `references/fix.md` + `references/validate.md` |

## READ — Analyze data (read `references/read-analyze.md` first)

For a simple `.xlsx` read/get/query, use OfficeCLI first when installed help confirms the operation. For CSV/TSV or custom dataframe analysis, use `xlsx_reader.py` and pandas. Never modify the source file.

**Formatting rule**: When the user specifies decimal places (e.g. "2 decimal places"), apply that format to ALL numeric values — use `f'{v:.2f}'` on every number. Never output `12875` when `12875.00` is required.

**Aggregation rule**: Always compute sums/means/counts directly from the DataFrame column — e.g. `df['Revenue'].sum()`. Never re-derive column values before aggregation.

## CREATE — OfficeCLI first, XML fallback

For a simple installed-help-confirmed `.xlsx` create, use OfficeCLI and write the explicit output. Otherwise read `references/create.md` and `references/format.md`, copy `templates/minimal_xlsx/`, edit XML directly, and pack with `xlsx_pack.py`. Every derived value MUST remain an Excel formula, never a hardcoded computed number.

## EDIT — OfficeCLI first, preservation-aware XML fallback

🔴 **CHECKPOINT — destructive workbook edit:** before editing an existing workbook, confirm the exact input file, output file, target sheet/cells/rows/columns, formula intent, and whether VBA/pivots/sparklines must be preserved. If the task requires deleting sheets, replacing the workbook, overwriting formulas with values, or changing protected/hidden content, stop for explicit user approval.

**CRITICAL — EDIT INTEGRITY RULES:**
1. **NEVER create a new `Workbook()`** for edit tasks. Start from a working copy of the original file.
2. The output MUST contain the **same sheets** as the input (same names, same data).
3. Only modify the specific cells the task asks for — everything else must be untouched.
4. **After saving output.xlsx, verify it**: open with `xlsx_reader.py` or `pandas` and confirm the original sheet names and a sample of original data are present. If verification fails, you wrote the wrong file — fix it before delivering.

For a simple installed-help-confirmed `.xlsx` edit with bounded preservation risk, use OfficeCLI against a working copy and save to the explicit output. Never use openpyxl round-trip on existing files. For `.xlsm`, VBA, unsupported extensions, high-fidelity surfaces, or insufficient OfficeCLI evidence, unpack → use helper scripts → repack.

**"Fill cells" / "Add formulas to existing cells" = EDIT task.** Use OfficeCLI only when installed help confirms the exact edit/output and the workbook has no unresolved preservation surface; otherwise use the XML edit path. Never create a new `Workbook()`. XML fallback example — fill B3 with a cross-sheet SUM formula:
```bash
python3 SKILL_DIR/scripts/xlsx_unpack.py input.xlsx /tmp/xlsx_work/
# Find the target sheet's XML via xl/workbook.xml → xl/_rels/workbook.xml.rels
# Then use the Edit tool to add <f> inside the target <c> element:
#   <c r="B3"><f>SUM('Sales Data'!D2:D13)</f><v></v></c>
python3 SKILL_DIR/scripts/xlsx_pack.py /tmp/xlsx_work/ output.xlsx
```

**Add a column** (formulas, numfmt, styles auto-copied from adjacent column):
```bash
python3 SKILL_DIR/scripts/xlsx_unpack.py input.xlsx /tmp/xlsx_work/
python3 SKILL_DIR/scripts/xlsx_add_column.py /tmp/xlsx_work/ --col G \
    --sheet "Sheet1" --header "% of Total" \
    --formula '=F{row}/$F$10' --formula-rows 2:9 \
    --total-row 10 --total-formula '=SUM(G2:G9)' --numfmt '0.0%' \
    --border-row 10 --border-style medium
python3 SKILL_DIR/scripts/xlsx_pack.py /tmp/xlsx_work/ output.xlsx
```
The `--border-row` flag applies a top border to ALL cells in that row (not just the new column). Use it when the task requires accounting-style borders on total rows.

**Insert a row** (shifts existing rows, updates SUM formulas, fixes circular refs):
```bash
python3 SKILL_DIR/scripts/xlsx_unpack.py input.xlsx /tmp/xlsx_work/
# IMPORTANT: Find the correct --at row by searching for the label text
# in the worksheet XML, NOT by using the row number from the prompt.
# The prompt may say "row 5 (Office Rent)" but Office Rent might actually
# be at row 4. Always locate the row by its text label first.
python3 SKILL_DIR/scripts/xlsx_insert_row.py /tmp/xlsx_work/ --at 5 \
    --sheet "Budget FY2025" --text A=Utilities \
    --values B=3000 C=3000 D=3500 E=3500 \
    --formula 'F=SUM(B{row}:E{row})' --copy-style-from 4
python3 SKILL_DIR/scripts/xlsx_pack.py /tmp/xlsx_work/ output.xlsx
```
**Row lookup rule**: When the task says "after row N (Label)", always find the row by searching for "Label" in the worksheet XML (`grep -n "Label" /tmp/xlsx_work/xl/worksheets/sheet*.xml` or check sharedStrings.xml). Use the actual row number + 1 for `--at`. Do NOT call `xlsx_shift_rows.py` separately — `xlsx_insert_row.py` calls it internally.

**Apply row-wide borders** (e.g. accounting line on a TOTAL row):
After running helper scripts, apply borders to ALL cells in the target row, not just newly added cells. In `xl/styles.xml`, append a new `<border>` with the desired style, then append a new `<xf>` in `<cellXfs>` that clones each cell's existing `<xf>` but sets the new `borderId`. Apply the new style index to every `<c>` in the row via the `s` attribute:
```xml
<!-- In xl/styles.xml, append to <borders>: -->
<border>
  <left/><right/><top style="medium"/><bottom/><diagonal/>
</border>
<!-- Then append to <cellXfs> an xf clone with the new borderId for each existing style -->
```
**Key rule**: When a task says "add a border to row N", iterate over ALL cells A through the last column, not just newly added cells.

**Manual XML edit** (for anything the helper scripts don't cover):
```bash
python3 SKILL_DIR/scripts/xlsx_unpack.py input.xlsx /tmp/xlsx_work/
# ... edit XML with the Edit tool ...
python3 SKILL_DIR/scripts/xlsx_pack.py /tmp/xlsx_work/ output.xlsx
```

## FIX — Repair broken formulas (read `references/fix.md` first)

This is an EDIT task. OfficeCLI may identify issues, but formula repair requires current formula/readback evidence. Use a supported installed-help-confirmed edit only when safe; otherwise unpack → fix broken `<f>` nodes → pack. Preserve all original sheets and data.

## VALIDATE — Check formulas (read `references/validate.md` first)

Run `formula_check.py` for static validation. Use `libreoffice_recalc.py` for dynamic recalculation when available. OfficeCLI validate/issues/render are supplemental and do not replace formula/readback/recalculation evidence.

If formula validation fails:

| Trigger | First fix | Still failing |
|---|---|---|
| Bad cell reference/range | Correct the `<f>` formula text and preserve the `<c r="...">` address | Re-open workbook XML and verify sheet relationship IDs |
| Cross-sheet formula error | Quote sheet names exactly and verify workbook sheet names | Read back with `xlsx_reader.py`; do not deliver until sample formulas resolve |
| Cached values stale | Recalculate with LibreOffice when available or clear stale `<v>` only for formula cells | Report dynamic recalculation as unverified if no recalc tool exists |
| Reader/pack validation fails | Repack from the original unpacked workbook after minimal XML fix | Do not create a new workbook as fallback for EDIT tasks |

🛑 **STOP:** do not deliver a workbook with failing `formula_check.py`, missing original sheets, or unverified formula readback unless the user explicitly accepts the risk.

## Financial Color Standard

| Cell Role | Font Color | Hex Code |
|-----------|-----------|----------|
| Hard-coded input / assumption | Blue | `0000FF` |
| Formula / computed result | Black | `000000` |
| Cross-sheet reference formula | Green | `00B050` |

## Key Rules

1. **Formula-First**: Every calculated cell MUST use an Excel formula, not a hardcoded number
2. **CREATE → OfficeCLI first** when installed help confirms the complete simple operation; otherwise use the XML template fallback
3. **EDIT → OfficeCLI first only for bounded `.xlsx` work**; use XML for `.xlsm`/VBA/high-fidelity/unsupported cases and never openpyxl round-trip
4. **Always produce the output file** — this is the #1 priority
5. **Validate before delivery**: `formula_check.py` exit code 0 is static evidence only; add formula readback/recalculation evidence required by the claim
6. **Fresh evidence**: before claiming the workbook complete, fixed, passing, or verified, follow the canonical lifecycle/ordinary-task verification owner and cite the selected formula/readback evidence.

## XML/pandas fallback utility scripts

```bash
python3 SKILL_DIR/scripts/xlsx_reader.py input.xlsx                 # structure discovery
python3 SKILL_DIR/scripts/formula_check.py file.xlsx --json         # formula validation
python3 SKILL_DIR/scripts/formula_check.py file.xlsx --report      # standardized report
python3 SKILL_DIR/scripts/xlsx_unpack.py in.xlsx /tmp/work/         # unpack for XML editing
python3 SKILL_DIR/scripts/xlsx_pack.py /tmp/work/ out.xlsx          # repack after editing
python3 SKILL_DIR/scripts/xlsx_shift_rows.py /tmp/work/ insert 5 1  # shift rows for insertion
python3 SKILL_DIR/scripts/xlsx_add_column.py /tmp/work/ --col G ... # add column with formulas
python3 SKILL_DIR/scripts/xlsx_insert_row.py /tmp/work/ --at 6 ...  # insert row with data
```

## Terminal Outcomes

- `complete`: the requested spreadsheet artifact exists at the explicit output and fresh evidence supports only the claims made.
- `need-user`: a material output, destructive edit, protected/hidden content, formula intent, or preservation decision is unresolved.
- `need-evidence`: formula/readback/recalc, structure, render, or viewer evidence required for the claim is unavailable.
- `blocked`: neither installed-help-confirmed OfficeCLI nor the preservation-aware fallback can safely perform the task.
- `Unverified`: the artifact exists, but a named formula, macro, high-fidelity, render, or target-viewer claim was not freshly proven.
