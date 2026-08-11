# PPTX Workspace Contract

[FRAME] A workspace keeps authored sources, generated artifacts, and verification evidence separate so a deck can be rebuilt and stale evidence can be rejected.

## Profiles

| Profile | Authored sources | Derived/evidence surface |
|---|---|---|
| `from-scratch` | intake, canonical Markdown plan, design/font/evidence/asset contracts, manifests, renderer source | outline, PPTX builds, renders, reviews, readiness reports |
| `template-edit` | full sources plus an immutable controlling-deck entry, confirmed reference role/uses, `template-profile.json`, `font-environment.json`, and optional replayable patch | preserved-template build, AutoFit/layout/issues evidence, baseline/current proof, renders, reviews, reports |
| `inspect` | workspace identity and inspected-source manifest only | extracted reports, renders, reviews |

[FRAME] Initialize with `python scripts/init_workspace.py <target> --profile <profile> --deck-name <lower-kebab> --deck-title <title>`. Existing targets fail closed; `--update` creates only missing template paths in a matching workspace and never overwrites authored files.

## Ownership

[KNOWN|USER] `<deck-name>-per-slide-content-plan.md` is the sole semantic source for slide count, order, title, Layout, and Content. Source: accepted change `pptx-workspace-officecli-integration`, decision `m0020`.

[FRAME] `workspace.json` records identity, profile, contained paths, and registered renderer configuration. It is not a manual phase or completion ledger. `outline.json`, PPTX files, reports, renders, style locks, and reviews are generated artifacts or evidence and never write meaning back into Markdown.

[FRAME] `src/` reads outline/design/font/assets and implements rendering. It may contain slide-specific layout code, but not a parallel copy of page titles or content.

## Safe Paths and Renderer

[FRAME] Every configured source, artifact, renderer, and evidence path is workspace-relative and contained. Absolute paths, `..`, symlink escape, arbitrary command strings, and unregistered renderer kinds are blocked.

[FRAME] The registered `pptxgenjs` kind accepts a contained `.js`, `.cjs`, or `.mjs` entrypoint. Readiness fingerprints the renderer source tree, so renderer edits invalidate downstream build evidence.

## Authoring and Compilation

1. [FRAME] Resolve intake blockers and author the Markdown/design/font/source contracts; for template edits confirm exactly one controlling reference and its allowed uses.
2. [FRAME] Before content mapping, run `profile_template.py` for template edits and `inventory_fonts.py` for build/render/target evidence. External font directories remain operation-gated.
3. [FRAME] Run `python scripts/compile_plan.py <workspace>`; use `--initialize-ids` only for an explicit migration of missing IDs.
4. [FRAME] Run `python scripts/report_workspace_readiness.py <workspace>` before build or inspect execution.
5. [FRAME] Build/render/review the applicable Style Proof. From-scratch creates a current style lock; template-edit obtains user confirmation of the current baseline/current proof hash and role coverage.
6. [FRAME] Build through the registered renderer and replayable edits; apply shape-to-fit-text to every supported editable text shape, rerender/reopen as needed, reread final geometry, and run `report_layout_preflight.py` after current issue/render evidence exists.
7. [FRAME] Build/render/review through the internal adapter documented in [`officecli-adapter.md`](officecli-adapter.md); OfficeCLI does not become another workflow owner.
8. [FRAME] Run `python scripts/report_delivery_readiness.py <workspace>` before claiming a visually complete PPTX.

[FRAME] Schemas under `schemas/` document each JSON contract. Python scripts use only the standard library and enforce the security- and freshness-critical subset directly.
