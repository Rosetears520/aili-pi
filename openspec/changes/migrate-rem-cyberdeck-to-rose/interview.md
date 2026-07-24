# Requirements Interview: Rose Cyberdeck Migration

## Interview Mode

- Mode: Interactive
- Source: canonical AILI IDEATE/DEFINE conversation plus current repository and Pi 0.81.1 evidence
- Target: `openspec/changes/migrate-rem-cyberdeck-to-rose/`

## Material Decisions

### Q-001 — Scope selection

- **Decision:** Select the implementation scope after comparing animation-only, brand-consistent, and enhanced variants.
- **Why material:** Changes product branding, runtime architecture, compatibility, acceptance coverage, and affected artifacts.
- **User answer:** `C｜完整 Rose 品牌增强版`, with the eleven detailed scope sections supplied in chat.
- **Classification:** confirmed
- **Write-back:** `proposal.md`, `context.md`, both capability specs, `design.md`, `tasks.md`, `test-plan.md`

### Q-002 — Phase after the final parallel tool completes

- **Decision:** Whether the last `tool_execution_end` transitions directly to `working` or first to `requesting`.
- **Why material:** Determines the user-visible state while Pi is waiting for the next model response and changes lifecycle tests.
- **Options presented:**
  - A: `tool → working`
  - B: `tool → requesting`; the first assistant `text_start` / `text_delta` enters `working`
- **Recommendation:** B, because `working` is defined as assistant text output and no text output exists immediately after a tool finishes.
- **User answer:** `B`
- **Classification:** confirmed
- **Write-back:** `context.md`, `design.md` phase table, `rose-working-animation` requirements and test-plan state cases

## Evidence-resolved Decisions

- Pi's fixed spacer is between layout regions, so the contract guarantees no blank line *inside* the five-line Widget and does not patch Pi internals.
- Tool concurrency uses unique `toolCallId` membership and derives `activeToolCount` from set size.
- Unknown custom theme background cannot be reliably inferred from the public API; auto mode therefore fails closed without hiding native Working Line and requests explicit appearance.
- Legacy theme settings receive non-mutating guidance because automatic `setTheme()` would persist user settings and may collapse a configured light/dark pair.
- Matrix geometry and palette verification are separated because the current full-drop digest binds both.

## Requirements-grilling Readiness

- State: `READY`
- Material questions remaining: 0
- Decision-shaping research gaps: 0
- Named runtime verification items: 2 (`real terminal visual`, `provider streaming usage availability`), both fail closed and are carried into `test-plan.md`
- Final lifecycle gate: explicit acceptance of the completed `test-plan.md` remains pending and is not supplied by these interview answers.
