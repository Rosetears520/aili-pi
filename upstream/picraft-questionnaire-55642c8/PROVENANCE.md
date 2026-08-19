# PiCraft questionnaire absorption

- Source: https://github.com/Losomz/AgentFramework
- Path: packages/picraft/extensions/questionnaire/
- Revision: 55642c8efb320f8785d12e391805876715f8f685 (latest commit touching the directory, retrieved 2026-08-18)
- License: MIT (Copyright (c) 2026 Losomz) — LICENSE in this directory is the repo root license
- Files: index.ts, model.ts, ui.ts, README.md are byte-exact copies

Absorbed into AILI-Pi on 2026-08-18 (user-authorized) as the Unified User
Interaction / questionnaire capability:

- `src/questionnaire/model.ts` — absorbed with one AILI deviation (2026-08-18, owner direction): the four-question upper cap was removed — four or fewer is recommended in the tool description, wider batches are accepted; everything else is byte-exact (UI-independent schema, normalization, result formatting)
- `src/questionnaire/ui.ts` — byte-exact copy (TUI presentation: tabbed questions, multi-select, custom input, review page)
- `src/questionnaire/index.ts` — AILI-owned glue: registers the model-facing
  `questionnaire` tool for all four permission modes, routes TUI to the copied
  prompt, routes AILI Web through a dedicated extension-UI `questionnaire`
  method (full card), falls back to sequential `ui.select` on generic RPC hosts,
  and returns an explicit unavailable result on headless (json/print) hosts
