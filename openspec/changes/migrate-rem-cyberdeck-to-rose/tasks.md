## 1. DEFINE readiness

- [x] 1.1 Record explicit user acceptance of the final `test-plan.md` before any BUILD implementation.

## 2. Rose rendering primitives

- [x] 2.1 Define the canonical dark/light Rose palettes, twelve-entry 83.3% blue-family rain weighting, appearance resolver, contrast helpers, and Rose-owned symbol names without changing deterministic geometry constants.
- [x] 2.2 Implement the pure Rose Shimmer renderer with the exact indicator sequence, deterministic 120 ms four-character bidirectional highlight, fixed phase copy, exact elapsed/real-usage suffix policy, ANSI-safe truncation, and full-width padding.
- [x] 2.3 Rename the Matrix renderer/glyph exports to Rose ownership, preserve ordinary/ultra-wide deterministic geometry, and separate geometry regression identity from color assertions.
- [x] 2.4 Add deterministic post-render blank-row repair that extends vertical tracks, handles an all-empty grid, enforces fallback contrast, and preserves four exact-width rain rows.

## 3. Unified Widget lifecycle and state

- [x] 3.1 Replace the active native Working Line plus separate Matrix surface with one five-line `rose-matrix-engine` Widget while retaining exactly one deadline-based animation scheduler.
- [x] 3.2 Implement `requesting | thinking | working | tool` transitions with active `toolCallId` set precedence, duplicate/unknown-end safety, the accepted final-tool `tool → requesting → working` path, and exact per-message usage commit/reset without double-counting.
- [x] 3.3 Implement idempotent repeated-start, `agent_end`, `session_before_switch`, and `session_shutdown` cleanup that removes Widget/timer/state and restores Pi's default native Working Line.
- [x] 3.4 Preserve host-render suppression and resize caching without delaying a phase/render update beyond the shared animation frame window.

## 4. Commands, appearance, and configuration migration

- [x] 4.1 Add explicit schema-v2 `rose-cyberdeck-matrix.json` parsing and atomic persistence, with `version: 2`, valid legacy `sakura-cyberdeck-matrix.json` conversion, fixed-height normalization, warnings, and no legacy deletion.
- [x] 4.2 Register `/rose-matrix` status/on/off/preview/fps/density/appearance behavior and retain `/sakura-matrix` only as a deprecation alias to the same handler.
- [x] 4.3 Resolve appearance from explicit config or known theme names; for unknown auto themes, leave native Working Line untouched or stop an active Widget, and emit one once-per-session actionable selection warning.

## 5. Rose Cyberdeck brand migration

- [x] 5.1 Replace the single packaged theme resource with `themes/rose-cyberdeck.json`, update its schema name/palette, Header telemetry, Rose-owned head asset path, package resource declaration, and package assertions.
- [x] 5.2 Rename Zentui Sakura-owned gradient symbols to Rose ownership, apply the Rose gradient to reasoning/editor/tool rails, and update affected imports/tests without changing unrelated footer/editor behavior.
- [x] 5.3 Move Zentui's canonical config path to `rose-cyberdeck-zentui.json`, fallback-read valid legacy Rem config, and write only the new path on the next explicit settings save while retaining the legacy file.
- [x] 5.4 Add bounded legacy theme-setting detection for a single value and light/dark pair, with exact non-mutating migration guidance and no duplicate selectable theme.
- [x] 5.5 Update README and command/status copy so Rose is canonical; classify every remaining Rem/Sakura occurrence as deprecated compatibility, historical evidence, retained artwork description, or third-party attribution.

## 6. Tests, attribution, and verification

- [x] 6.1 Add pure renderer tests for one Shimmer plus four rain rows, no internal blank separator, per-character highlight, exact status/stat policy, all-row visibility, fallback structure/contrast, and exact visible width at 40/80/120/240/320/640 columns in dark and light modes.
- [x] 6.2 Add fake-clock/lifecycle tests for one timer, four phases, multiple parallel tools, duplicate ends, real/missing usage, repeated start/stop, session switch/shutdown, native Working Line hiding, and complete restoration.
- [x] 6.3 Add Matrix/Zentui config migration and command-alias tests covering valid, missing, corrupt, unsafe, non-4 legacy height, explicit appearance, first explicit Zentui save, and preservation of old files.
- [x] 6.4 Add theme/package/Header/Zentui/README naming tests proving one Rose theme and only bounded compatibility/attribution exceptions.
- [x] 6.5 Update package-owned local-modification descriptions and generated provenance/SBOM evidence while preserving exact `pi-sakura-cyberdeck` source identity, revision, license, and upstream NOTICE fields.
- [x] 6.6 Run focused affected tests, `npm run typecheck`, `npm test`, package/provenance/release validators that do not require external probes, `npm pack --dry-run --json`, `openspec validate migrate-rem-cyberdeck-to-rose --strict`, and `git diff --check`; record separately gated manual dark/light TUI checks as `Unverified` until authorized.
