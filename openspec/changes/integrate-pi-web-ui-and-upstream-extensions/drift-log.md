# Drift Log — integrate-pi-web-ui-and-upstream-extensions

Record actual spec drift, trade-offs, unresolved assumptions, and required
DEFINE write-back for this change. Newest entries last.

## 2026-08-19 — questionnaire shared controller: Web first, TUI stays byte-exact

The accepted direction (2026-08-19 review) calls for one questionnaire state
machine shared by TUI and Web so the two presentations cannot diverge again.
Implementation trade-off taken this round:

- `src/questionnaire/controller.ts` is AILI-owned and mirrors the absorbed
  PiCraft `QuestionnairePrompt` semantics one-to-one, but the TUI prompt
  (`src/questionnaire/ui.ts`) was **not** refactored onto it. The TUI prompt
  is an absorbed byte-exact PiCraft copy governed by
  `upstream/picraft-questionnaire-55642c8/PROVENANCE.md`; rewiring it would
  break the byte-exact property the provenance evidence asserts.
- Consequence: today the controller is the single state machine for the Web
  surface only; TUI/Web parity is enforced by the controller's unit tests
  encoding the TUI semantics (advance/simple-single/custom-row/tab-wrap/
  finish-freeze), not by shared code at runtime.
- Follow-up option (needs its own authorization): migrate the TUI prompt onto
  the controller and update PROVENANCE.md to record the deviation, making the
  sharing structural instead of tested equivalence.

No DEFINE write-back required: the design's "presentation routes per host"
wording is unaffected — both hosts still own only presentation.
