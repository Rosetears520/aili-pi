## 1. DEFINE readiness

- [x] 1.1 Re-read and accept this final `test-plan.md` before BUILD.

## 2. Theme and public TUI surfaces

- [x] 2.1 Add/validate `rem-cyberdeck` Theme JSON and Package resource declaration.
- [x] 2.2 Implement Rem header from `assets/rem-head.txt`, width-safe rendering, working indicator, and bounded animation/widget; retain the explicitly approved Sakura Matrix palette.
- [x] 2.3 Implement footer data collection/layout with narrow-width truncation, existing quota-status slot reuse, and display-only `codex`/`7d` window labels.
- [x] 2.4 Add focused unit/integration coverage for theme discovery, header width, work lifecycle, footer source/fallback, quota labels, and no quota poller.

## 3. Editor and fixed-bottom compatibility

- [x] 3.1 Implement editor chrome through `setEditorComponent`, preserving Pi keybindings and existing editor composition.
- [x] 3.2 Implement strict private-TUI capability inspector and fixed editor compositor with transactional install/rollback.
- [x] 3.3 Implement terminal mode restoration, overlay handling, optional mouse selection, disable command/configuration, and visible degradation.
- [x] 3.4 Add compatibility, rollback, no-patch, cleanup, and terminal-sequence tests.

## 4. Provenance, docs, and verification

- [x] 4.1 Document activation, fixed-editor warning/disable path, terminal requirements, quota boundary, and supported platform.
- [x] 4.2 If any upstream source is reused, record exact files/revision/license/local changes in notices/SBOM/provenance before claiming reuse.
- [ ] 4.3 Run changed-scope automated checks, package dry-run, strict OpenSpec validation, and manual Linux terminal matrix.
