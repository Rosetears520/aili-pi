# Editing Existing Presentations

## Fidelity Contract

[FRAME] “Keep the original format/style” means preserving the controlling deck's visual grammar unless the user names a specific exception. It does not mean freezing every line break or preventing necessary overflow repair.

Preserve by default:

- slide size and orientation;
- masters, layouts, themes, and placeholders;
- recurring title, footer, navigation, and page-number behavior;
- font roles, palette roles, shape language, image treatment, and chart/table treatment;
- content-area boundaries, alignment lines, spacing rhythm, and section structure.

Write to an edited copy unless the user explicitly asks to replace the original.

## Template-Preserving Workflow

### 1. Protect the Baseline

1. Keep the supplied deck unchanged.
2. Create one task-scoped working copy inside the approved artifact location.
3. Record the original workspace-relative path and SHA-256 in `sources/manifest.json`, together with slide count, dimensions, and output target.
4. Put the page mapping, final order, title, Layout, and Content in the canonical per-slide Markdown rather than a second editable mapping file.

Completion criterion: the original remains recoverable and the working target is explicit.

### 2. Inventory the Visual Grammar

Inspect at least:

1. slide masters and layouts;
2. theme colors and fonts;
3. title and content-area positions;
4. repeated guides, margins, and gaps;
5. background and image treatments;
6. shape corner, line, shadow, and material styles;
7. chart and table styling;
8. recurring headers, footers, logos, navigation, and page numbers;
9. representative slides for every section or layout family.

Use the style and layout observations in [`human-design-playbook.md`](human-design-playbook.md) to name the patterns without imposing unrelated defaults.

Completion criterion: the deck's reusable grammar is written down before content is remapped.

[FRAME] `template-profile.json` is the executable record for this step. It binds the controlling-template hash and records master/layout/shape identity, palette/layout capacity, image frames, alignment/spacing groups, paragraph properties, and each text run's raw direct formatting, inheritance source, and resolved effective font/size/color/style. Role-level typography summaries are navigation only and must not overwrite local run differences.

### 3. Map Content to Native Layouts

For every source section:

1. identify the audience question and conclusion-style title;
2. choose an existing slide/layout whose information relationship fits;
3. map every text, image, chart, table, icon, label, and citation slot;
4. note slots that must be deleted, duplicated, or changed;
5. choose a different native layout only when the content relationship changes.

Prefer reusing or duplicating a native slide over reconstructing its appearance from scratch.

Completion criterion: every source item has a destination and every template placeholder has a disposition.

### 4. Complete Structural Changes First

Before editing final copy:

1. remove unwanted slides;
2. duplicate needed slides with all relationships intact;
3. reorder slides;
4. update section/navigation structure;
5. confirm the final slide count and mapping.

[FRAME] Express rebuildable OfficeCLI mutations in `patches/officecli-postbuild.batch.json` and replay them from the current base deck. Direct edits to a derived final PPTX are not the normal source of truth.

For package-level XML work, keep `presentation.xml`, slide XML, relationship files, `[Content_Types].xml`, notes, comments, and media references consistent. Do not copy a slide XML file without its required relationship and content-type updates.

Completion criterion: the package structure is coherent before detailed text replacement begins.

### 5. Replace Content without Flattening the Design

For each slide:

1. replace all placeholder copy and media;
2. retain paragraph, run, placeholder, and theme formatting where possible;
3. keep separate list items in separate paragraphs;
4. remove an unused visual group instead of only clearing its text;
5. retain the original alignment and spacing tokens unless the new content requires a bounded repair;
6. preserve native chart/table editability when the user needs editable data;
7. preserve image aspect ratio and reposition the crop inside the established frame.
8. apply `shape-to-fit-text` to every supported editable text-bearing shape after paragraph/run formatting, then reread its final geometry.

When replacement text is longer, repair in this order:

1. shorten or restructure the copy without changing its meaning;
2. use another native layout with more capacity;
3. split the content across slides;
4. reduce type size only within the deck's established readable range.

Ask before cutting user-required content. Do not solve overflow by silently shrinking text below a readable size.

Completion criterion: every placeholder is resolved and the new content still follows the template's visual grammar.

[FRAME] AutoFit is not an overflow verdict. If expansion causes overlap, off-slide geometry, broken equal-size groups, spacing drift, or unwanted wrapping, select a better native layout, repair neighboring layout, split the slide, or request a content decision. Do not disable AutoFit or silently normalize run-level formatting to hide the defect.

### 6. Clean and Repack

1. Remove orphaned slides, relationships, notes, comments, and media introduced by the edit.
2. Repack through a local scratch path when the selected PPTX library needs seekable storage.
3. Copy the final package only to the approved artifact target.
4. Preserve valid XML namespaces and character encoding.

Completion criterion: the PPTX opens without repair warnings and contains no orphaned task-created package parts.

### 7. Compare Before and After

Run three comparisons:

1. **Content:** slide order, title, body, labels, citations, and missing/extra items.
2. **Visual:** content area, alignment, spacing, font substitution, image crop, chart/table style, and recurring navigation.
3. **Package:** relationships, media, masters/layouts, notes, and corruption/repair warnings.

Render every changed slide and at least one unchanged neighboring slide so style drift is visible.

Completion criterion: all changed slides are checked against the baseline and every remaining fidelity limitation is reported.

## XML-Specific Notes

- Copy the original paragraph properties when inserting new paragraphs so line spacing and bullet behavior survive.
- Use native bullet or numbering properties instead of Unicode bullet characters.
- Preserve `xml:space="preserve"` where leading or trailing spaces are meaningful.
- Use a namespace-safe parser for structural operations.
- Keep smart punctuation encoded correctly when a text-edit path normalizes characters.

## Failure Behavior

- Missing required source deck or read capability: `need-evidence` or `blocked`.
- Unresolved master/layout relationship or corrupt package: `blocked`; retain the last known-good copy.
- Visual rendering unavailable: deliver only with visual fidelity marked `Unverified`.
- Requested content cannot fit without cutting or changing the template: `need-user` with the smallest decision required.
