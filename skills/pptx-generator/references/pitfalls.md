# QA Process and Common Pitfalls

## Evidence Levels

[FRAME] Different checks prove different claims. Use the smallest fresh combination that supports the requested result.

| Check | Supports | Does not support by itself |
|---|---|---|
| Successful compile/repack | Package generation completed without an immediate tool error | Visual correctness or absence of PowerPoint repair warnings |
| Text extraction | Presence, order, and spelling of extractable text | Clipping, overlap, crop, contrast, or font rendering |
| Package inspection | Relationships, masters/layouts, media, and XML integrity | Audience readability or visual hierarchy |
| Rendered-slide inspection | Layout, crop, contrast, alignment, and visible font substitution | Animation behavior in every presentation runtime |
| Compatible-runtime playback | Transitions and animations in that runtime | Universal behavior across all PowerPoint versions |

## Verification Loop

[FRAME] In a full workspace, follow the current hash chain:

1. [FRAME] Compile canonical Markdown to `outline.json`; a mismatch is `STALE_OR_MUTATED_OUTLINE`.
2. [FRAME] Compute workspace readiness and repair typed blockers before build.
3. [FRAME] Build/repack, apply and verify shape-to-fit-text for every editable text shape, and bind the report to current plan, outline, authored-source, renderer, font/template, AutoFit, and final-PPTX hashes.
4. [FRAME] Extract content and compare it with the canonical Markdown/outline.
5. [FRAME] Capture current OfficeCLI issues, render every slide, and hash each image plus the contact sheet.
6. [FRAME] Reread post-AutoFit geometry and run layout preflight for overflow, wrapping, font bounds, images, boundaries, collision, alignment, spacing, placeholders, and issue dispositions.
7. [FRAME] Read those images, complete every page-level check with a concrete observation, and repair each issue at its authored or renderer source.
8. [FRAME] Rebuild/re-render/review every invalidated downstream step, then compute delivery readiness.

Do not require a ceremonial fix when the first output passes all selected checks. Do not skip re-verification after an actual repair.

## Content QA

Check:

- slide count and order;
- one primary message per slide;
- conclusion-style titles where the content supports a conclusion;
- missing, duplicated, or truncated source content;
- placeholder text, sample data, or unused template labels;
- spelling, punctuation, units, decimal places, and citations;
- chart/table values against the source;
- notes, comments, or hidden slides when they are part of the requested artifact.

Text extraction with a supported PPTX parser can accelerate this pass, but compare the result with the approved source rather than only scanning for a few placeholder words.

## Per-Slide Visual QA

Inspect each affected slide at normal presentation scale:

1. **Content area:** outer margins and title/content zones follow the deck's guides.
2. **Alignment:** related elements share visible edges, centers, baselines, or a deliberate visual axis.
3. **Proximity:** inner gaps are smaller than outer gaps; equal hierarchy levels use equal spacing.
4. **Hierarchy:** the intended focal point is visible within a three-second scan.
5. **Typography:** body text is readable, titles do not wrap awkwardly, and no unwanted font substitution appears.
6. **Text boxes:** no clipping, orphaned short tail, accidental center alignment, or inconsistent padding.
7. **Images:** aspect ratio, crop, subject direction, negative space, and style are appropriate.
8. **Portraits/logos:** eye lines, face sizes, perceived logo area, and supporting frames are consistent.
9. **Charts/tables:** important data is emphasized, secondary structure is quiet, labels are legible, and alignment/decimals are consistent.
10. **Contrast:** text, icons, lines, and data remain legible against the background.
11. **Effects:** gradients, masks, shadows, reflections, and 3D treatments have a clear purpose and are consistent.
12. **Navigation:** page numbers, section markers, logos, and footers match the controlling template or brief.

## Deck-Wide QA

Compare slides as a sequence:

- audience and purpose remain consistent;
- story flow answers one question after another;
- title, body, and data roles use the same typography;
- palette roles remain stable;
- recurring shapes, corners, lines, shadows, and image treatments form one visual language;
- visual variety follows changes in content relationships rather than random decoration;
- dividers, summaries, and closing slides feel related to the rest of the deck;
- transitions and animation, when required, support sequence and do not become the focus.

Use [`human-design-playbook.md`](human-design-playbook.md) as a lookup for the relevant content or layout type during this pass.

## Template-Fidelity QA

For template-preserving edits, compare changed slides with representative unchanged slides:

1. slide dimensions, masters, layouts, and theme remain intact;
2. native placeholders and style inheritance remain usable;
3. title and content-area positions match;
4. fonts, colors, shape language, image crops, charts, and tables remain native to the template;
5. navigation, footer, logo, and page-number behavior remains consistent;
6. unnecessary template slots and their full visual groups are removed;
7. no unrequested clean rebuild has flattened editable elements.

## Package Integrity

Stop and repair when:

- PowerPoint reports that the file needs repair;
- a slide, master, layout, notes page, media file, or relationship target is missing;
- images or fonts resolve only through broken external links;
- package XML is malformed or namespaces were rewritten incorrectly;
- the deck opens but silently drops content.

[FRAME] Retain the last known-good file while diagnosing corruption. Invalid Markdown compilation must not overwrite the last valid `outline.json`; stale build/render/review evidence remains present but ineligible.

## PptxGenJS Pitfalls

### Keep Slide Builders Synchronous When the Compiler Is Synchronous

```javascript
// Wrong when compile.js does not await the result
async function createSlide(pres, theme) { /* ... */ }

// Correct for a synchronous compile loop
function createSlide(pres, theme) { /* ... */ }
```

### Use Six-Character Hex Colors without `#`

```javascript
color: "FF0000"
```

Use the runtime's transparency/opacity option rather than appending alpha bytes to a hex color.

### Do Not Reuse Mutable Option Objects

```javascript
const makeShadow = () => ({
  type: "outer",
  blur: 6,
  offset: 2,
  color: "000000",
  opacity: 0.15
});

slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow() });
slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow() });
```

### Preserve Title Fit Deliberately

[FRAME] Use `fit: "resize"` for PptxGenJS text options to express shape-to-fit-text, then inspect the expanded final geometry. Do not use `fit: "shrink"` as a substitute for the accepted AutoFit policy or hide an overlong conclusion by making it unreadably small.

## Failure Outcomes

- Corrupt or repair-prompting PPTX after one focused repair pass: `blocked`.
- Missing registered renderer: full-workspace readiness is `blocked`; visual claims remain `Unverified`.
- Missing animation-capable runtime: animation behavior remains `Unverified`.
- Content cannot fit without deletion or a layout decision: `need-user`.
- Required source content, chart data, citation, or asset is absent: `need-evidence`.
- Current render without a reviewer/hash-bound finding disposition: delivery readiness is `blocked`.
- Required build/render font unavailable: `need-user`; target-player font availability may remain named `Unverified`.
