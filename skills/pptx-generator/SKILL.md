---
name: pptx-generator
description: "Generate, edit, inspect, or verify editable PowerPoint/PPTX decks when a .pptx file is the deliverable; use for template-preserving edits and from-scratch slide production, but not for HTML/SVG mockups, PDF-only reports, or presentation advice that needs no PPTX artifact."
---

# PPTX Generator

## Contract

[KNOWN|USER] `pptx-generator` is the sole general PPT/PPTX workflow owner. OfficeCLI is an internal non-routable tool adapter, not another Skill or lifecycle owner. Source: accepted change `pptx-workspace-officecli-integration`, decision `m0020`.

[FRAME] This skill treats a presentation as a communication artifact first and a collection of decorated slides second. It is workspace-first: authored sources, generated artifacts, and verification evidence stay separated and hash-linked.

Use one of three branches:

| Branch | Trigger | Primary evidence |
|---|---|---|
| Inspect | Read, inventory, summarize, or diagnose an existing PPTX | Extracted content plus package/visual evidence appropriate to the claim |
| Template edit | Modify a supplied deck while retaining its slide size, masters, layouts, theme, and recurring visual language | Preserved source hash, replayable edit/build evidence, and rendered comparison |
| From scratch | Produce a new editable PPTX without a controlling template | Approved brief, slide plan, successful compile, and rendered QA |

Near misses:

- Return HTML/SVG design generation, PDF-only output, and document/spreadsheet artifacts to ROSE for the appropriate artifact owner.
- For outline coaching or slide critique with no PPTX artifact, provide bounded advice directly rather than manufacturing a file workflow.
- Do not silently convert a browser-rendered deck into a PPTX; editable-slide output is a distinct deliverable.

## Capability Boundary

- Required: `artifact.transform` for PPTX/package generation or editing.
- Optional: `repo.read` for local source decks and supporting content; `artifact.store` for the final user-visible file.
- If a required capability is missing, return `blocked` with the missing operation and do not claim a usable PPTX.
- If visual rendering or inspection is unavailable, return `Unverified` for layout, clipping, font substitution, and image-crop claims; text extraction alone is not visual QA.
- Installing a runtime or dependency, reading an external directory, fetching network assets, or writing outside the owning repository retains its separate ROSE approval gate.

## Common Workflow

### 1. Initialize the profile workspace

[FRAME] Choose `from-scratch`, `template-edit`, or `inspect`, then follow [`references/workspace.md`](references/workspace.md). Capture audience, setting, purpose, language, duration/count, source/template, output path, editability, and material blockers in the profile-owned sources described by [`references/intake-and-blockers.md`](references/intake-and-blockers.md).

[FRAME] Completion criterion: the workspace profile and artifact contract are explicit; required sources exist or are typed blockers.

### 2. Establish the canonical plan

[KNOWN|USER] `<deck-name>-per-slide-content-plan.md` is the sole semantic source for slide count, order, title, Layout, and Content. Source: accepted change `pptx-workspace-officecli-integration`, decision `m0020`.

[FRAME] Follow [`references/content-planning.md`](references/content-planning.md). Every slide uses exact `## Slide NN:`, one stable `<!-- slide-id: lower-kebab -->`, exactly one `### 1. Layout`, and exactly one `### 2. Content`. Keep page takeaways and source/status annotations inside Content.

[FRAME] Compile with `scripts/compile_plan.py`; `outline.json` is generated-only. Normal compilation never edits Markdown. Use `--initialize-ids` only for an explicit migration that inserts missing IDs without changing semantic text.

[FRAME] Completion criterion: the deterministic outline exactly matches current normalized Markdown and has continuous ordinals plus unique stable IDs.

### 3. Establish design and fonts

[FRAME] When a template exists, derive its grammar instead of imposing defaults. Otherwise use [`references/design-system.md`](references/design-system.md), [`references/human-design-playbook.md`](references/human-design-playbook.md), and [`references/design-contract.md`](references/design-contract.md). Record content area, hierarchy, palette roles, shape/image/chart language, and navigation in the design contract without duplicating slide copy.

[FRAME] For `template-edit`, first confirm every visual reference's role, allowed uses, fidelity mode, path, and hash. Before mapping content, run `scripts/profile_template.py` and require a current `template-profile.json` that preserves shape→paragraph→run raw/inherited/effective typography, palette usage, native layout IDs, capacity, alignment, spacing, and image-frame evidence. A role summary never overrides a run-level exception.

[FRAME] Follow [`references/font-policy.md`](references/font-policy.md). `font-contract.json` records intent; `font-environment.json` separately records registration, mounted files, and renderer-visible families. Required fonts must be verified separately in build and render environments; missing/unknown required fonts return `need-user`. Unknown target-player availability remains named `Unverified`.

[FRAME] For from-scratch work, render and actually review a representative Style Proof before full build. A style lock binds current design/proof/review hashes; any bound change invalidates it.

[FRAME] Use the `style-proof` build kind and stable-ID render selection before creating the lock; the default full from-scratch build fails closed when the lock is missing or stale. Generate the hash-bound font audit from the current contract evidence before relying on font readiness.

[FRAME] Completion criterion: current contracts define one implementable visual grammar, required fonts are evidenced, and applicable Style Proof evidence is current.

### 4. Compute workspace readiness

[FRAME] Run `scripts/report_workspace_readiness.py`. `workspace.json` records identity/configuration and never supplies manual completion truth. Resolve typed `blocked` or `needs_attention` results before building.

[FRAME] Only registered renderer kinds and contained workspace-relative entrypoints are allowed. Arbitrary command strings, absolute paths, `..`, and escaped symlinks are blocked. Readiness fingerprints renderer source and authored inputs.

[FRAME] Completion criterion: readiness is `ready` for the selected branch and all named `Unverified` limits remain explicit.

### 5. Implement with the selected branch

- **Inspect:** extract text and package metadata; render slides when making visual claims.
- **Template-preserving edit:** follow [`references/editing.md`](references/editing.md).
- **From scratch:** use the registered renderer and technical patterns in [`references/pptxgenjs.md`](references/pptxgenjs.md).

[FRAME] Every supported editable text-bearing shape in a final from-scratch or template-edit PPTX uses `shape-to-fit-text`. Apply it after paragraph/run formatting, then reread the final geometry. Unsupported, locked, unreadable, or non-recalculated objects are blockers; AutoFit never waives overlap, boundary, single-line, font-size, spacing, alignment, or visual checks.

[FRAME] `src/` reads current outline/design/font/assets and implements layouts; it never stores a second copy of page titles or content. Keep custom slide builders keyed by stable slide ID and include all renderer source in the build fingerprint.

[FRAME] OfficeCLI use stays behind [`references/officecli-adapter.md`](references/officecli-adapter.md). The AILI installer owns installation and recovery; this Skill retains only PPTX-specific probe/build/render use. Use installed-version help as syntax authority; do not run npm or install/load OfficeCLI Skills, MCP, PATH integration, or another presentation owner.

[FRAME] Completion criterion: all canonical slides exist, content is mapped once from outline, no placeholder survives, and the build report binds current source/renderer/outline/final-PPTX hashes.

### 6. Verify content, visuals, and delivery

[FRAME] Follow [`references/pitfalls.md`](references/pitfalls.md), [`references/visual-review.md`](references/visual-review.md), and [`references/delivery-readiness.md`](references/delivery-readiness.md):

1. [FRAME] validate/repack the current final PPTX and bind validation to its hash;
2. [FRAME] render every slide and a contact sheet, then hash each artifact;
3. [FRAME] run `scripts/report_layout_preflight.py` against the current final PPTX, post-AutoFit geometry, font audit, image-fit evidence, and individually dispositioned OfficeCLI issues; any blocking or unknown item fails closed;
4. [FRAME] read the actual images and record reviewer, exact PPTX/render hashes, exact slide IDs, per-page checks, concrete observations, findings, finding dispositions, and overall disposition;
5. [FRAME] for `template-edit`, obtain user confirmation of the current baseline/current proof hash before a full build; confirmation never waives final per-page review;
6. [FRAME] repair at source and rebuild every invalidated downstream step;
7. [FRAME] run `scripts/report_delivery_readiness.py`; missing or stale evidence fails closed.

[FRAME] Completion criterion: the current plan→outline→build→PPTX→render→visual-review hash chain is `ready`; unsupported target-viewer, font, animation, or visual claims remain `Unverified`.

## Reference Map

| Need | Reference |
|---|---|
| Workspace profiles, ownership, initialization, and safe renderer paths | [`workspace.md`](references/workspace.md) |
| Intake fields, typed blockers, and next actions | [`intake-and-blockers.md`](references/intake-and-blockers.md) |
| Source distillation and a reusable per-slide Markdown content plan | [`content-planning.md`](references/content-planning.md) |
| Complete English translation of the curated learning notes, including natural-language descriptions of source visuals | [`human-design-playbook.md`](references/human-design-playbook.md) |
| Base slide roles and relationship-led layouts | [`slide-types.md`](references/slide-types.md) |
| Palette, typography, spacing, and shape recipes | [`design-system.md`](references/design-system.md) |
| Design brief/contract and Style Proof lock | [`design-contract.md`](references/design-contract.md) |
| Font selection and build/render/target evidence | [`font-policy.md`](references/font-policy.md) |
| Existing-template inventory and fidelity-preserving edits | [`editing.md`](references/editing.md) |
| Compile, content, visual, and package QA | [`pitfalls.md`](references/pitfalls.md) |
| Actual image review and hash-bound findings | [`visual-review.md`](references/visual-review.md) |
| Workspace/delivery freshness gates | [`delivery-readiness.md`](references/delivery-readiness.md) |
| Internal non-routable OfficeCLI tool use | [`officecli-adapter.md`](references/officecli-adapter.md) |
| PptxGenJS implementation patterns | [`pptxgenjs.md`](references/pptxgenjs.md) |

## Hard Boundaries

- Preserve the original file unless replacement was explicitly requested; write an edited copy by default.
- Do not rebuild a supplied template from scratch merely because generation is easier.
- Do not invent data, citations, logos, customer names, or source claims to fill a slide.
- Do not begin slide production before a required per-slide content plan exists and its material omissions, claims, or structure decisions are resolved.
- Do not edit `outline.json` as a semantic source or copy slide meaning into renderer source.
- Do not accept unregistered renderer kinds, arbitrary command strings, or workspace-escaping paths.
- Do not hide PPTX corruption or layout defects by shipping only screenshots or a PDF.
- Do not treat a render, issue scan, file-existence check, or reviewer-free record as visual completion.
- Do not silently substitute a required build/render font or claim an unknown target font environment is verified.
- Do not force a page-number badge, palette, font, gradient, animation, or decorative motif when the brief or controlling template does not use it.
- Do not recurse, invoke another process skill, or delegate. Return any routing, research, capability, approval, or independent-work need to ROSE.

## Terminal Outcomes

- `complete`: the requested PPTX work is produced and claim-matched verification is current.
- `need-user`: one material audience, content, template, output, style, required-font, or fidelity decision is unresolved.
- `need-evidence`: required source content or visual/package evidence is unavailable.
- `material-delta`: implementation reveals a new dependency, public artifact contract, permission, or verification-strategy change.
- `blocked`: required capability/approval is missing, workspace/delivery readiness fails closed, renderer/path policy is violated, or the PPTX remains corrupt.
- `Unverified`: the file exists but one or more claimed visual behaviors could not be freshly inspected.
