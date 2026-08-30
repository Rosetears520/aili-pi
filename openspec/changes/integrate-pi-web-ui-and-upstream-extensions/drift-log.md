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

## 2026-08-27 — D-19 baseline and mutation-owner convergence

The user superseded the stale Pi `0.84.1` / Pi Web `0.8.8` baseline and the
stock-TUI/Web asymmetric observer contract:

- current baseline is official Pi `0.84.2` plus exact Pi Web `0.8.9` revision
  `febcba5e33e5eef9bf7f092099105c5dfea742ff`;
- the AILI Runtime Gateway/BFF is the sole mutation owner inside the Web
  application;
- production AppShell mutations and retained compatibility routes must all
  terminate at that Gateway boundary;
- Extension `session_start` Web-lease admission and private TUI observer
  projection are retired, with no claim that stock TUI and Web can safely
  mutate one session concurrently;
- old direct routes are sealed or translated in the current package rather
  than deleted;
- native agent-driven Browser work is deferred, optional, and requires fresh
  explicit authorization.

This required DEFINE write-back to proposal, design, context, interview,
specs, tasks, and test plan before implementation package 6.5 could start.

## 2026-08-29 — D-20 Pi 0.84.4 / Pi Web 0.8.11 upgrade

The user accepted the separately defined `upgrade-pi-0844-and-pi-web-0811` change. D-20 supersedes D-19 only for the active version/source baseline:

- exact Pi 0.84.4 replaces 0.84.2;
- exact Pi Web 0.8.11 tag revision `28bab3c25f5f6770c9b0b745ebbfec1c27f7b948` is active; 0.8.9 remains immutable historical evidence;
- existing AILI Gateway/BFF, writer lease, private IDs, access policy, Changes/native dialogs/footer/orb/questionnaire, Herdr, Prompt Middleware and Observational Memory remain authoritative;
- upstream built-in subagents/direct mutation owners are excluded;
- Browser/E2E execution remains unapproved.

The new change owns implementation/evidence; this write-back records cross-contract recognition and prevents the old baseline from remaining current.
