---
name: minimax-docx
description: >
  Create, edit, fill, or template-format editable Word/DOCX documents with managed OfficeCLI first and OpenXML fallback for complex or preservation-sensitive work.
---

# minimax-docx

Create, edit, and format DOCX documents. This skill owns the DOCX artifact contract; managed OfficeCLI is the first tool for supported simple operations, while the existing OpenXML SDK/.NET path remains the complex and preservation-sensitive fallback.

## Routing Boundary

Use this skill only when the workflow explicitly needs Word/DOCX or an editable Office document: `.docx` output, Word template application, DOCX content edits, form-like DOCX filling, or OpenXML structure work. For final print-ready or non-editable page output use `minimax-pdf`; for spreadsheets/tables/formulas use `minimax-xlsx`; for slides use `pptx-generator`.

| Trigger | Use this skill? | Why |
|---|---:|---|
| "Edit this Word template and keep it editable" | Yes | DOCX/template workflow |
| "Create a final polished PDF proposal" | No | Route to `minimax-pdf` |
| "Build a financial model workbook" | No | Route to `minimax-xlsx` |
| "Make presentation slides" | No | Route to `pptx-generator` |

`minimax-docx` is the sole DOCX artifact owner. OfficeCLI is an internal non-routable tool, not a Skill, MCP, command owner, or substitute workflow.

## Capability Boundary

- Required: `artifact.transform` to create or mutate a DOCX.
- Optional: `repo.read` for source/template files, `artifact.store` for the requested output, and image inspection for render-based layout claims.
- If the selected path cannot transform the artifact, return `blocked`. If the file can be produced but the evidence needed for a visual or preservation claim is unavailable, return `need-evidence` or name that claim `Unverified`.
- Do not install dependencies, write outside the owning repository, or invoke another process Skill. Return any missing capability, approval, or routing need to ROSE.

## OfficeCLI-First Selection

1. Establish the artifact contract: exact input files, an explicit output path, requested changes, content that must be preserved, and the evidence needed for the final claim. Preserve every input original; write a distinct output unless replacement was explicitly approved.
2. Resolve only the AILI installer-managed OfficeCLI binary. Set `OFFICECLI_SKIP_UPDATE=1`, confirm the expected installed version, then query the applicable read-only `officecli help docx ...` family. Installed-version help is the authority for exact argv, properties, enums, and output behavior.
3. Use OfficeCLI first only when installed help confirms the complete simple operation and its explicit-output behavior. Supported candidates include create; read/outline/text/annotated inspection; simple replace/fill/merge; basic table, image, and structure edits; validate/issues; and render.
4. If OfficeCLI is absent or drifted, recover through `rose-aili install` or `rose-aili update` without `--skip-officecli`. Never run npm, a full OfficeCLI installer, `officecli install`, an OfficeCLI Skill, or OfficeCLI MCP from this skill.
5. Select the OpenXML fallback when the task involves complex styles, sections, per-section headers/footers, TOC, track changes, exact template transfer, unsupported help, unclear output semantics, or insufficient round-trip evidence. Do not guess an OfficeCLI command.

OfficeCLI command success is not a completion verdict. Select claim-matched evidence: content/readback for content claims, validate/issues for package findings, render plus actual image inspection for layout claims, and before/after comparison for preservation claims. Target-viewer fidelity remains `Unverified` unless that exact viewer was freshly checked.

## OpenXML Fallback Setup

Run this setup only after the selection above chooses the OpenXML fallback.

**First fallback use:** `bash scripts/setup.sh` (or `powershell scripts/setup.ps1` on Windows, `--minimal` to skip optional deps).

**First OpenXML fallback operation in session:** `scripts/env_check.sh` — do not proceed with the fallback if it reports `NOT READY`. (Skip on subsequent fallback operations within the same session.)

🛑 **STOP — fallback env NOT READY:** report the missing fallback dependency/tool. Use OfficeCLI only if its installed help independently confirms the complete task; otherwise return `blocked` instead of promising a DOCX.

## OpenXML Fallback: Direct C# Path

When the task requires structural document manipulation (custom styles, complex tables, multi-section layouts, headers/footers, TOC, images), write C# directly instead of wrestling with CLI limitations. Use this scaffold:

```csharp
// File: scripts/dotnet/task.csx  (or a new .cs in a Console project)
// dotnet run --project scripts/dotnet/MiniMaxAIDocx.Cli -- run-script task.csx
#r "nuget: DocumentFormat.OpenXml, 3.2.0"

using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

using var doc = WordprocessingDocument.Create("output.docx", WordprocessingDocumentType.Document);
var mainPart = doc.AddMainDocumentPart();
mainPart.Document = new Document(new Body());

// --- Your logic here ---
// Read the relevant Samples/*.cs file FIRST for tested patterns.
// See Samples/ table in References section below.
```

**Before writing any C#, read the relevant `Samples/*.cs` file** — they contain compilable, SDK-version-verified patterns. The Samples table in the References section below maps topics to files.

## OpenXML CLI shorthand

All OpenXML fallback commands below use `$OPENXML_CLI` as shorthand for:
```bash
dotnet run --project scripts/dotnet/MiniMaxAIDocx.Cli --
```
Legacy OpenXML fallback references may call this same local command `$CLI`; that name never means OfficeCLI.

## Pipeline routing

Route by checking: does the user have an input .docx file?

```
User task
├─ No input file → Pipeline A: CREATE
│   signals: "write", "create", "draft", "generate", "new", "make a report/proposal/memo"
│   → If fallback selected, read references/scenario_a_create.md
│
└─ Has input .docx
    ├─ Replace/fill/modify content → Pipeline B: FILL-EDIT
    │   signals: "fill in", "replace", "update", "change text", "add section", "edit"
    │   → If fallback selected, read references/scenario_b_edit_content.md
    │
    └─ Reformat/apply style/template → Pipeline C: FORMAT-APPLY
        signals: "reformat", "apply template", "restyle", "match this format", "套模板", "排版"
        ├─ Template is pure style (no content) → C-1: OVERLAY (apply styles to source)
        └─ Template has structure (cover/TOC/example sections) → C-2: BASE-REPLACE
            (use template as base, replace example content with user content)
        → Read references/scenario_c_apply_template.md for the preservation-sensitive fallback
```

If the request spans multiple pipelines, run them sequentially (e.g., Create then Format-Apply).

## Pre-processing

Convert `.doc` → `.docx` if needed: `scripts/doc_to_docx.sh input.doc output_dir/`

For a simple supported read, use installed-help-confirmed OfficeCLI inspection first. In the OpenXML fallback, preview before editing with `scripts/docx_preview.sh document.docx`.

Analyze structure in the fallback with `$OPENXML_CLI analyze --input document.docx`.

## Scenario A: Create

**Choose your path:**
- **Simple and installed-help-confirmed** (plain text, minimal formatting): use managed OfficeCLI and write the explicit output.
- **Structural** (custom styles, multi-section, TOC, images, complex tables): select the OpenXML fallback, then read `references/scenario_a_create.md`, `references/typography_guide.md`, `references/design_principles.md`, and the relevant `Samples/*.cs`. For CJK, also read `references/cjk_typography.md`.

Do not copy OfficeCLI flags from this file; query installed `officecli help docx ...`. OpenXML fallback options remain documented by the local CLI help and scenario references.

Then collect claim-matched content/package/render evidence. The OpenXML fallback uses the validation pipeline below.

## Scenario B: Edit / Fill

**Choose your path:**
- **Simple and installed-help-confirmed** (text replacement, placeholder fill, bounded table/image/basic structure edits): use managed OfficeCLI against a working copy and save to the explicit output.
- **Structural** (add/reorganize sections, modify styles, manipulate tables, insert images): select the OpenXML fallback, then read `references/scenario_b_edit_content.md`, `references/openxml_element_order.md`, and the relevant `Samples/*.cs`.

OpenXML fallback edit subcommands:
- `replace-text --find "X" --replace "Y"`
- `fill-placeholders --data '{"key":"value"}'`
- `fill-table --data table.json`
- `insert-section`, `remove-section`, `update-header-footer`

```bash
$OPENXML_CLI edit replace-text --input in.docx --output out.docx --find "OLD" --replace "NEW"
$OPENXML_CLI edit fill-placeholders --input in.docx --output out.docx --data '{"name":"John"}'
```

For the OpenXML fallback, run the validation pipeline and diff to verify intended content changes:
```bash
$OPENXML_CLI diff --before in.docx --after out.docx
```

## Scenario C: Apply Template

Scenario C is preservation-sensitive and uses the OpenXML fallback unless installed help and current round-trip evidence prove the exact accepted template operation. Read `references/scenario_c_apply_template.md` first. Preview and analyze both source and template.

🔴 **CHECKPOINT — template ambiguity:** before applying a template, identify whether it is C-1 style overlay or C-2 base-replace, and list content that must be preserved. If the template purpose, section/header/footer ownership, or source-vs-template precedence is unclear, stop and ask instead of guessing.

```bash
$OPENXML_CLI apply-template --input source.docx --template template.docx --output out.docx
```

For complex template operations (multi-template merge, per-section headers/footers, style merging), write C# directly — see Critical Rules below for required patterns.

Run the **validation pipeline**, then the **hard gate-check**:
```bash
$OPENXML_CLI validate --input out.docx --gate-check assets/xsd/business-rules.xsd
```
Gate-check is a **hard requirement**. Do NOT deliver until it passes. If it fails: diagnose, fix, re-run.

If gate-check fails, use this recovery path:

| Trigger | First fix | Still failing |
|---|---|---|
| XSD/business rule names element order | Run `fix-order`, then inspect the named parent/child ordering | Patch only the named XML structure; do not regenerate the whole document |
| Style/header/footer preservation fails | Re-check C-1 vs C-2 routing and compare source/template preview | Stop if preserving both content and template structure conflicts |
| Content disappeared or duplicated | Run `$OPENXML_CLI diff --before ... --after ...` and restore from source/template base | Do not deliver until paragraph/table counts match expected preservation |
| Gate-check cannot run | Run business validation and preview as fallback | Mark gate-check as unverified; do not claim full validation |

🛑 **STOP — failed gate-check:** do not deliver or call the DOCX complete while the hard gate-check fails unless the user explicitly accepts an unverified artifact.

Also diff to verify content preservation: `$OPENXML_CLI diff --before source.docx --after out.docx`

## OpenXML fallback validation pipeline

Run after every write operation. For Scenario C the full pipeline is **mandatory**; for A/B it is **recommended** (skip only if the operation was trivially simple).
Use the canonical lifecycle/ordinary-task verification owner before claiming the document complete, fixed, passing, or verified; include only the fresh validation/preview evidence needed for that claim.

```bash
$OPENXML_CLI merge-runs --input doc.docx                                    # 1. consolidate runs
$OPENXML_CLI validate --input doc.docx --xsd assets/xsd/wml-subset.xsd     # 2. XSD structure
$OPENXML_CLI validate --input doc.docx --business                           # 3. business rules
```

If XSD fails, auto-repair and retry:
```bash
$OPENXML_CLI fix-order --input doc.docx
$OPENXML_CLI validate --input doc.docx --xsd assets/xsd/wml-subset.xsd
```

If XSD still fails, fall back to business rules + preview:
```bash
$OPENXML_CLI validate --input doc.docx --business
scripts/docx_preview.sh doc.docx
# Verify: font contamination=0, table count correct, drawing count correct, sectPr count correct
```

Final preview: `scripts/docx_preview.sh doc.docx`

## Terminal Outcomes

- `complete`: the requested DOCX exists at the explicit output and fresh evidence supports only the claims made.
- `need-user`: a material output, template precedence, destructive replacement, or preservation decision is unresolved.
- `need-evidence`: content, formula/package, render, or viewer evidence required for the claim is unavailable.
- `blocked`: neither installed-help-confirmed OfficeCLI nor a ready OpenXML fallback can safely perform the task.
- `Unverified`: the artifact exists, but a named visual, target-viewer, or complex preservation claim was not freshly proven.

## Critical rules

These prevent file corruption — OpenXML is strict about element ordering.

**Element order** (properties always first):

| Parent | Order |
|--------|-------|
| `w:p`  | `pPr` → runs |
| `w:r`  | `rPr` → `t`/`br`/`tab` |
| `w:tbl`| `tblPr` → `tblGrid` → `tr` |
| `w:tr` | `trPr` → `tc` |
| `w:tc` | `tcPr` → `p` (min 1 `<w:p/>`) |
| `w:body` | block content → `sectPr` (LAST child) |

**Direct format contamination:** When copying content from a source document, inline `rPr` (fonts, color) and `pPr` (borders, shading, spacing) override template styles. Always strip direct formatting — keep only `pStyle` reference and `t` text. Clean tables too (including `pPr/rPr` inside cells).

**Track changes:** `<w:del>` uses `<w:delText>`, never `<w:t>`. `<w:ins>` uses `<w:t>`, never `<w:delText>`.

**Font size:** `w:sz` = points × 2 (12pt → `sz="24"`). Margins/spacing in DXA (1 inch = 1440, 1cm ≈ 567).

**Heading styles MUST have OutlineLevel:** When defining heading styles (Heading1, ThesisH1, etc.), always include `new OutlineLevel { Val = N }` in `StyleParagraphProperties` (H1→0, H2→1, H3→2). Without this, Word sees them as plain styled text — TOC and navigation pane won't work.

**Multi-template merge:** When given multiple template files (font, heading, breaks), read `references/scenario_c_apply_template.md` section "Multi-Template Merge" FIRST. Key rules:
- Merge styles from all templates into one styles.xml. Structure (sections/breaks) comes from the breaks template.
- Each content paragraph must appear exactly ONCE — never duplicate when inserting section breaks.
- NEVER insert empty/blank paragraphs as padding or section separators. Output paragraph count must equal input. Use section break properties (`w:sectPr` inside `w:pPr`) and style spacing (`w:spacing` before/after) for visual separation.
- Insert oddPage section breaks before EVERY chapter heading, not just the first. Even if a chapter has dual-column content, it MUST start with oddPage; use a second continuous break after the heading for column switching.
- Dual-column chapters need THREE section breaks: (1) oddPage in preceding para's pPr, (2) continuous+cols=2 in the chapter HEADING's pPr, (3) continuous+cols=1 in the last body para's pPr to revert.
- Copy `titlePg` settings from the breaks template for EACH section. Abstract and TOC sections typically need `titlePg=true`.

**Multi-section headers/footers:** Templates with 10+ sections (e.g., Chinese thesis) have DIFFERENT headers/footers per section (Roman vs Arabic page numbers, different header text per zone). Rules:
- Use C-2 Base-Replace: copy the TEMPLATE as output base, then replace body content. This preserves all sections, headers, footers, and titlePg settings automatically.
- NEVER recreate headers/footers from scratch — copy template header/footer XML byte-for-byte.
- NEVER add formatting (borders, alignment, font size) not present in the template header XML.
- Non-cover sections MUST have header/footer XML files (at least empty header + page number footer).
- See `references/scenario_c_apply_template.md` section "Multi-Section Header/Footer Transfer".

## References

Load as needed — don't load all at once. Pick the most relevant files for the task.

**The C# samples and design references below are the project's knowledge base ("encyclopedia").** When writing OpenXML code, ALWAYS read the relevant sample file first — it contains compilable, SDK-version-verified patterns that prevent common errors. When making aesthetic decisions, read the design principles and recipe files — they encode tested, harmonious parameter sets from authoritative sources (IEEE, ACM, APA, Nature, etc.), not guesses.

### Scenario guides (read first for each pipeline)

| File | When |
|------|------|
| `references/scenario_a_create.md` | Pipeline A: creating from scratch |
| `references/scenario_b_edit_content.md` | Pipeline B: editing existing content |
| `references/scenario_c_apply_template.md` | Pipeline C: applying template formatting |

### C# code samples (compilable, heavily commented — read when writing code)

| File | Topic |
|------|-------|
| `Samples/DocumentCreationSamples.cs` | Document lifecycle: create, open, save, streams, doc defaults, settings, properties, page setup, multi-section |
| `Samples/StyleSystemSamples.cs` | Styles: Normal/Heading chain, character/table/list styles, DocDefaults, latentStyles, CJK 公文, APA 7th, import, resolve inheritance |
| `Samples/CharacterFormattingSamples.cs` | RunProperties: fonts, size, bold/italic, all underlines, color, highlight, strike, sub/super, caps, spacing, shading, border, emphasis marks |
| `Samples/ParagraphFormattingSamples.cs` | ParagraphProperties: justification, indentation, line/paragraph spacing, keep/widow, outline level, borders, tabs, numbering, bidi, frame |
| `Samples/TableSamples.cs` | Tables: borders, grid, cell props, margins, row height, header repeat, merge (H+V), nested, floating, three-line 三线表, zebra striping |
| `Samples/HeaderFooterSamples.cs` | Headers/footers: page numbers, "Page X of Y", first/even/odd, logo image, table layout, 公文 "-X-", per-section |
| `Samples/ImageSamples.cs` | Images: inline, floating, text wrapping, border, alt text, in header/table, replace, SVG fallback, dimension calc |
| `Samples/ListAndNumberingSamples.cs` | Numbering: bullets, multi-level decimal, custom symbols, outline→headings, legal, Chinese 一/（一）/1./(1), restart/continue |
| `Samples/FieldAndTocSamples.cs` | Fields: TOC, SimpleField vs complex field, DATE/PAGE/REF/SEQ/MERGEFIELD/IF/STYLEREF, TOC styles |
| `Samples/FootnoteAndCommentSamples.cs` | Footnotes, endnotes, comments (4-file system), bookmarks, hyperlinks (internal + external) |
| `Samples/TrackChangesSamples.cs` | Revisions: insertions (w:t), deletions (w:delText!), formatting changes, accept/reject all, move tracking |
| `Samples/AestheticRecipeSamples.cs` | 13 aesthetic recipes from authoritative sources: ModernCorporate, AcademicThesis, ExecutiveBrief, ChineseGovernment (GB/T 9704), MinimalModern, IEEE Conference, ACM sigconf, APA 7th, MLA 9th, Chicago/Turabian, Springer LNCS, Nature, HBR — each with exact values from official style guides |

Note: `Samples/` path is relative to `scripts/dotnet/MiniMaxAIDocx.Core/`.

### Markdown references (read when you need specifications or design rules)

| File | When |
|------|------|
| `references/openxml_element_order.md` | XML element ordering rules (prevents corruption) |
| `references/openxml_units.md` | Unit conversion: DXA, EMU, half-points, eighth-points |
| `references/openxml_encyclopedia_part1.md` | Detailed C# encyclopedia: document creation, styles, character & paragraph formatting |
| `references/openxml_encyclopedia_part2.md` | Detailed C# encyclopedia: page setup, tables, headers/footers, sections, doc properties |
| `references/openxml_encyclopedia_part3.md` | Detailed C# encyclopedia: TOC, footnotes, fields, track changes, comments, images, math, numbering, protection |
| `references/typography_guide.md` | Font pairing, sizes, spacing, page layout, table design, color schemes |
| `references/cjk_typography.md` | CJK fonts, 字号 sizes, RunFonts mapping, GB/T 9704 公文 standard |
| `references/cjk_university_template_guide.md` | Chinese university thesis templates: numeric styleIds (1/2/3 vs Heading1), document zone structure (cover→abstract→TOC→body→references), font expectations, common mistakes |
| `references/design_principles.md` | **Aesthetic foundations**: 6 design principles (white space, contrast/scale, proximity, alignment, repetition, hierarchy) — teaches WHY, not just WHAT |
| `references/design_good_bad_examples.md` | **Good vs Bad comparisons**: 10 categories of typography mistakes with OpenXML values, ASCII mockups, and fixes |
| `references/track_changes_guide.md` | Revision marks deep dive |
| `references/troubleshooting.md` | **Symptom-driven fixes**: 13 common problems indexed by what you SEE (headings wrong, images missing, TOC broken, etc.) — search by symptom, find the fix |
