# Workspace and Delivery Readiness

[FRAME] Readiness is computed from current files and SHA-256 fingerprints, not from `workspace.json` phase text or artifact existence.

## Workspace Readiness

[FRAME] `report_workspace_readiness.py` returns:

- [FRAME] `ready`: required authored sources are present, the outline exactly matches current Markdown, no open blocker prevents work, renderer configuration/source is valid for full profiles, and required build/render fonts are verified when declared.
- [FRAME] `needs_attention`: a deterministic non-hard action such as compiling a missing outline or verifying a required font environment remains.
- [FRAME] `blocked`: authored sources are invalid/missing, outline is stale/mutated, a hard blocker is open, a required font is unavailable, or renderer configuration escapes the registry/workspace.

## Delivery Readiness

[FRAME] `report_delivery_readiness.py` returns only `ready` or `blocked`. Ready requires one current chain:

`normalized Markdown hash → generated outline hash → authored-source/renderer hashes → template/font hashes when applicable → successful build report and AutoFit evidence → current final PPTX hash → strict validation → current OfficeCLI issues → current per-slide/contact-sheet render hashes → passing layout preflight → current page-level visual review`.

[FRAME] Missing or stale evidence fails closed with a typed blocker and next action. Target-player font uncertainty may remain named `Unverified`; it does not become a claim of target fidelity.

[FRAME] Build and render producers must use the report schemas and workspace-contained paths. See [`workspace.md`](workspace.md), [`visual-review.md`](visual-review.md), and the internal [`officecli-adapter.md`](officecli-adapter.md).

[FRAME] A full from-scratch build additionally requires a current Style Proof lock bound to authored-source, outline, renderer, design, proof-build, proof-PPTX, proof-render, review, and selected-slide hashes. Style-proof build mode is the bounded producer used before that lock exists.

[FRAME] A full template-edit build additionally requires a current user confirmation bound to the controlling-template profile, font environment, baseline/current proof PPTX/render/review hashes, selected slide IDs, and image-or-chart/longest-text/densest-numeric role coverage. The final delivery gate still requires current AutoFit geometry, issue dispositions, preflight, and every-slide visual observations.
