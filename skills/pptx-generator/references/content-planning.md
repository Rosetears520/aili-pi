# Content Distillation and Per-Slide Planning

[KNOWN|USER] This reference adapts the user-provided information-synthesis notes and one user-approved local conversation example into a reusable workflow. It retains the interaction pattern and planning methods while excluding personal identifiers, uploaded source files, raw transcript content, and project-specific data. Source: user-approved harness change, 2026-07-29.

[KNOWN|USER] `<deck-name>-per-slide-content-plan.md` is the sole semantic source for page count, order, title, Layout, and Content in a full PPTX workspace. Source: accepted change `pptx-workspace-officecli-integration`, decision `m0020`.

[FRAME] The per-slide plan is the content contract between source analysis and PPTX implementation. Generated `outline.json`, renderer source, PPTX files, and reviews never become parallel semantic editing surfaces; source verification and rendered-slide QA remain separate evidence.

## When to Write the Plan

Write a task-scoped Markdown plan before slide production when any of these conditions applies:

- the user asks to synthesize a report, paper, transcript, research package, or long-form source into slide content;
- the user asks what every page should contain;
- the deck requires material selection, omission, compression, or narrative restructuring;
- a supplied template must be matched to source content page by page;
- the user explicitly asks for a reusable outline or per-slide planning file.

[FRAME] A full `from-scratch` or `template-edit` workspace always keeps this plan, even when the user supplies an accepted page-by-page script; transpose that accepted script into the contract without inventing content. The `inspect` profile does not manufacture a content plan.

[FRAME] Use `<deck-name>-per-slide-content-plan.md` and store it at the workspace-configured contained path. Writing to an external directory retains its separate approval gate.

Completion criterion: the plan is required only where it prevents content loss, unsupported invention, or premature slide production.

## Distillation Workflow

### 1. Fix the Presentation Boundary

Capture:

- audience and presentation setting;
- purpose and expected audience takeaway;
- language;
- duration and approximate slide count;
- required sections, identity fields, or institutional wording;
- source files and controlling template;
- exclusions and output-format preferences.

Do not infer a missing duration, required section, identity field, or template constraint when the choice would materially change the deck.

Completion criterion: the source boundary and delivery constraints are explicit.

### 2. Inventory Source Information

Separate the source into:

1. verified facts, data, quotations, and citations;
2. source-supported findings or interpretations;
3. background and explanatory material;
4. required names, labels, acknowledgements, or metadata;
5. uncertain, conflicting, missing, or unsupported items.

Preserve qualifiers, denominators, units, comparison bases, and attribution. Do not turn a source hypothesis, correlation, or model output into a stronger causal claim.

Completion criterion: every candidate slide claim can be traced to source material or is visibly marked as unresolved.

### 3. Choose an Organizing Method

Select the method that matches the information rather than forcing every method into one deck.

#### Element method

Ask: “Which aspects or elements does this information contain?” Group items by shared characteristics such as audience, behavior, result, scenario, concern, channel, or resource.

Use this for profiles, feature sets, issue categories, findings, and parallel recommendations.

#### Model method

Apply a problem-analysis frame such as `A + B = C`, cause → mechanism → result, supply versus demand, driver versus barrier, or input → process → output.

Use this when the deck must explain why an outcome occurs or how several factors combine.

#### Process method

Organize the material by chronological, procedural, journey, or dependency order.

Use this for methods, implementation, customer journeys, historical development, and phased recommendations.

One method should lead each section. Combine methods only when the relationship genuinely changes.

Completion criterion: the selected structure explains why items belong together and why they appear in that order.

### 4. Extract the Key Points

1. Group repeated actions, outcomes, scenarios, or characteristics.
2. Inspect recurring keywords and information emphasized at the beginning or end of a source section.
3. Convert each group into one audience-facing conclusion.
4. When natural, compress labels into `verb + adjective + noun`, such as “reduce unclear decision costs” or “build smooth visitor journeys.”
5. Retain the strongest evidence needed to support the conclusion; remove detail that does not change audience understanding.

Prefer conclusion-style titles over topic labels. “Convenience drives trial; reliability drives continued use” is stronger than “Survey Results.”

Completion criterion: every retained point states a distinct takeaway and has sufficient evidence.

### 5. Make Abstract Content Understandable

Choose the lightest method that clarifies the idea:

- **Concrete:** extract defining characteristics, connect them to a user scenario, and rephrase from the user's point of view.
- **Analogy:** extract defining characteristics, find a familiar element with the same relevant properties, and state only that bounded similarity.
- **Comparison:** expose a meaningful contrast such as before/after, expected/actual, resource/experience, driver/barrier, or group A/group B.

Sentence patterns such as “the … of its field,” “an online version of …,” or “equivalent to …” are rhetorical devices, not evidence. Use them only when the analogy clarifies rather than exaggerates.

Completion criterion: an abstract idea becomes easier to grasp without changing its factual strength.

### 6. Organize, Delete, and Layer

#### Organize

Divide information by dimension, category, and relationship. Keep parallel items at the same level and separate evidence from conclusions.

#### Delete

Remove connectors, repeated subjects, duplicated qualifiers, and prose that merely joins sentences. Convert linear paragraphs into concise points without deleting required meaning.

#### Layer

Establish a scan order:

1. conclusion-style page title;
2. group labels or comparison dimensions;
3. supporting points and evidence;
4. one page takeaway when it adds value.

Increase contrast between levels through wording and structure before relying on visual decoration.

Completion criterion: a reader can identify the conclusion, grouping logic, and evidence without reading a paragraph wall.

### 7. Build the Deck Spine

Write these deck-wide decisions before the individual slides:

- recommended topic or title;
- recommended slide count;
- expected duration;
- overall logic, expressed as a short sequence such as `background → evidence → findings → causes → recommendations → close`.

Allocate time and slide count according to importance. Cover and navigation pages should not consume the same explanatory weight as central findings.

Completion criterion: every section advances one coherent argument within the delivery time.

### 8. Allocate Content Page by Page

For each slide, decide internally:

1. the audience question;
2. the conclusion-style title;
3. the information relationship;
4. the supporting content and evidence;
5. the relationship to the preceding and following slide.

Expose only the user's requested output fields. The default planning artifact uses `Layout` first and `Content` second. Do not add image suggestions, asset searches, implementation instructions, or extra microcopy unless requested.

Completion criterion: every source item is retained, compressed, moved, or omitted deliberately, and every slide has one primary point.

## Default Markdown Contract

```markdown
# <Deck title> — Per-Slide Content Plan

Recommended topic: **<title>**
Recommended slide count: **<count>**
Expected duration: **<duration>**
Overall logic: **<stage> → <stage> → <stage> → <stage>**

---

## Slide 01: <conclusion-style title>
<!-- slide-id: <stable-lower-kebab-id> -->

### 1. Layout
<State the structural arrangement and the information assigned to each region.>

### 2. Content
<Write the actual title, labels, concise points, data, and inline source/status notes.>

Page takeaway: **<one sentence, when useful>**

---

## Slide 02: <conclusion-style title>
<!-- slide-id: <another-stable-lower-kebab-id> -->

### 1. Layout
...

### 2. Content
...
```

Keep `Page takeaway` inside `Content`; it is not a third default section. Cover and navigation pages may omit it when it adds no value.

[FRAME] Every slide section contains exactly one `<!-- slide-id: lower-kebab -->` comment. IDs remain attached to the semantic slide when pages are reordered or retitled. Normal compilation never edits Markdown; use `compile_plan.py --initialize-ids` only to insert missing IDs during an explicit migration.

Use inline annotations such as `[Source: ...]`, `[Unverified]`, or `[Need user]` inside `Content` when traceability or a decision is required. Do not manufacture a citation to make the plan appear complete.

Completion criterion: the file is implementation-ready, source-grounded, and limited to the agreed output contract.

## Template-Aware Refinement

When the user supplies candidate pages or a controlling template:

1. identify the content relationship needed by the planned slide;
2. choose the native layout whose structure expresses that relationship;
3. map each planned label and content block to an existing slot;
4. preserve the template's information density and rhythm;
5. compress wording or choose another native layout before adding unplanned helper text;
6. revise only the affected plan entry when the user corrects a label, layout, or content boundary.

Do not add small explanatory copy merely because a template has empty space. Do not recommend a timeline for a non-temporal relationship or a process graphic for independent categories.

Completion criterion: the selected template structure matches the information relationship without flattening the template or distorting the content.

## Interaction Pattern

1. Produce the first complete per-slide plan from the accepted source and constraints.
2. Apply user corrections to the output contract globally. If the user says “only Layout and Content,” remove other sections from every page rather than correcting one page at a time.
3. Preserve newly stated requirements such as a mandatory contents page or original-template rhythm.
4. When the user supplies a template screenshot or candidate layout, select by semantic fit and return exact replacement copy for its existing slots.
5. If a correction changes the argument, evidence, duration, or slide count, update the deck-wide spine and all affected pages.

Do not preserve a previous suggestion merely for consistency after the user supplies better evidence or a clearer constraint.

Completion criterion: user feedback changes the canonical plan, and later PPTX implementation follows the latest accepted version rather than stale chat output.

## Plan Review

Before implementation, check:

- the total page count and speaking time are plausible for the accepted setting;
- every required section is present;
- each slide has one primary conclusion;
- adjacent slides do not repeat the same point;
- numbers, units, labels, and comparison bases match the source;
- no unsupported causal claim, analogy, or invented detail was introduced;
- each proposed layout has enough capacity for its assigned content;
- slide ordinals are continuous and every stable slide ID is valid and unique;
- the file uses only `Layout` and `Content` by default;
- asset or image recommendations appear only when requested;
- unresolved material content decisions are visible.

If the user requested plan-first acceptance or the plan contains material omissions, claims, or structural choices, return `need-user` before slide production. Otherwise, use the completed plan as the implementation input for the selected PPTX branch.

Completion criterion: the plan can be traced to the source and implemented without silently deciding what the user meant.
