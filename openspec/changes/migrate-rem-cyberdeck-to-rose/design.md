## Context

The current `extensions/matrix/index.ts` starts Pi's native Working Line and a separate above-editor Widget during `agent_start`. Pi 0.81.1 renders the status container before the Widget container and inserts a leading one-row spacer for a non-empty above-editor Widget, so the two surfaces cannot be visually contiguous. The Matrix owns one bounded timer already, but its fixed dark fade target and pinned Sakura palette are unsuitable for the requested Rose branding and light backgrounds.

The current package exposes one `rem-cyberdeck` theme, a `REM CYBERDECK` header, Sakura-named Matrix/Zentui symbols, and Rem/Sakura-named configuration paths. The prior changes that established those behaviors were released; this change supersedes their product behavior without rewriting their historical contracts or third-party attribution.

Constraints:

- Runtime baseline is official Pi `0.81.1` on supported Linux terminals.
- Pi Widget components must return lines no wider than the supplied terminal-cell width; above-editor Widgets are capped at ten lines, so the fixed five-line component fits.
- The public Extension API exposes `theme.name` and explicit theme switching, but not a reliable arbitrary custom-theme background classification.
- No new dependency, lockfile change, external access, user-setting write, Git operation, publication, installation, or real provider/TUI run is authorized by DEFINE.

## Goals / Non-Goals

**Goals:**

- Render one contiguous five-line Rose working component: one Rose Shimmer status line plus four Rose Code Rain lines.
- Preserve a single animation clock, deterministic Matrix geometry, full-width bounded sampling, single-cell glyphs, and the 96-track ceiling.
- Make phases truthful under streaming and parallel tools, using the user-selected `tool → requesting → working` transition.
- Display only exact monotonic elapsed time and provider/Pi-reported output usage.
- Guarantee at least one perceptibly visible Code Rain glyph in each of the four rows after every render.
- Resolve dark/light colors from explicit configuration or a known current theme, without silently treating every terminal as dark.
- Complete the Rose product-brand migration while preserving compatibility entrypoints and immutable upstream attribution.

**Non-Goals:**

- Copying or depending on a third-party Claude shimmer extension; this is an original Claude Code-style effect defined by this contract.
- Changing Matrix density, speed, gap, length, offset, glyph set, deterministic seed value, ordinary-width track selection, or the 96-track limit except for render-only blank-row repair.
- Estimating token counts from characters, bytes, elapsed time, or model heuristics.
- Publishing two visually identical formal themes, deleting legacy user configuration, mutating theme settings automatically, adding dependencies, or performing release/install operations.

## Decisions

### 1. One five-line Widget owns the active working surface

During an active agent run, the extension hides Pi's native Working Line with `setWorkingVisible(false)` and installs one `rose-matrix-engine` above-editor Widget. The Widget returns exactly five lines in this order:

1. Rose Shimmer status line;
2. four Rose Code Rain rows.

There is no empty line inside this array. Pi's own leading spacer above the entire Widget remains an upstream layout behavior and is not patched. Every returned line is ANSI-safe truncated and right-padded so `visibleWidth(line) === width`, including the status line.

The existing deadline-based scheduler remains the only timer. Shimmer frame selection, moving highlight position, elapsed text, glyph animation, and Code Rain position are pure functions of the same monotonic elapsed time and frame invalidation. No working-indicator animation or second interval is registered.

The Matrix height becomes a fixed product invariant of four rows. Legacy `height` is accepted during configuration migration but normalized to `4`; `density` and `fps` remain configurable within their existing bounds.

### 2. Phase state is explicit and tool state has precedence

The logical `activeToolCount` is backed by `Set<string>` of active `toolCallId` values so duplicate or out-of-order end events cannot underflow the count.

| Event | Guard | Result |
|---|---|---|
| `agent_start` | TUI, enabled, appearance resolved | clear tool IDs, reset usage/time, enter `requesting`, start Widget/timer |
| `thinking_start` / `thinking_delta` | no active tools | `thinking` |
| `thinking_end` | no active tools and no text event yet | `requesting` |
| `text_start` / `text_delta` | no active tools | `working` |
| `tool_execution_start` | always | add `toolCallId`, enter `tool` |
| `tool_execution_end` | always | remove that ID; remain `tool` while any ID remains; when zero enter `requesting` |
| `tool_execution_update` | tool ID remains active | stay `tool` |
| `agent_end`, `session_before_switch`, `session_shutdown` | always | idempotent complete cleanup |

Tool state wins if stream events arrive while a tool ID remains active. An unknown or duplicate tool-end ID is ignored. `start()` first performs idempotent cleanup, and a generation token prevents stale timer callbacks from reactivating an old component.

Cleanup removes the Widget, clears the timer/tool IDs/cache/usage/context references, restores Pi's default working message and indicator, and sets Working Line visibility back to `true`. Repeated start/stop and session replacement must leave one or zero live timers, never more.

### 3. Rose Shimmer is a width-safe moving highlight

The indicator uses the exact ping-pong sequence:

`· ✢ ✳ ✶ ✻ ✽ ✻ ✶ ✳ ✢`

Its index and a four-character highlight band are derived from elapsed time using a 120 ms Shimmer step. The highlight center traverses the status text and reverses at each boundary; characters are colored independently, so the line never flashes as one block. The shared scheduler may render at a different configured FPS, but elapsed-time indexing keeps the Shimmer deterministic and creates no second timer.

Status copy is fixed:

- `requesting`: `Connecting to the model…`
- `thinking`: `Weaving the next move…`
- `working`: `Composing the response…`
- `tool`: `Running tools…`

Dark appearance uses `#C75B7A` for the indicator, `#88B8FF` as the normal base, `#D6F4FF` as the normal highlight, and `#BCA7FF → #7DE4FF` for tool text. Light appearance uses the website ink `#2A2622`, deep Rose `#A8455F`, and precomputed darker derivatives that meet at least 4.5:1 contrast on `#FAF7F2`: blue `#5C7397`, violet `#776A97`, and cyan `#4E7881`. The moving highlight may use ink to remain visibly stronger than the base.

The status suffix is lower priority than the phase message. Exact elapsed duration appears after 30 completed seconds, floored from monotonic milliseconds and formatted as `Ns` below one minute or `Nm SSs` at one minute and above. Token accounting is exact across a multi-turn agent run: finalized positive `usage.output` values from completed assistant messages are summed once, while the current assistant message contributes only its directly reported, non-decreasing positive partial value. `message_start`/`message_end` boundaries distinguish a legitimate per-message reset from a malformed decrease and prevent final usage from being counted twice. The field is labeled `output tokens`. If neither completed nor current messages provide real positive usage, the token field is absent; estimated, synthesized, duplicated, or decreasing within-message values are never displayed. Narrow-width truncation drops suffix content before compromising the indicator and phase message.

### 4. Rose Code Rain changes color ownership, not geometry

The normal deterministic geometry retains the current seed value, column spacing, density behavior, drop lengths, gaps, speeds, offsets, responsive full-width bounded selector, single-cell glyph set, and `MAX_DROPS = 96`. Symbols are renamed to Rose terms without changing the numeric seed or geometry sequence.

A twelve-entry deterministic track palette provides an exact 10/12 (83.3%) blue-family share and 2/12 (16.7%) Rose share. Blue-family entries use only `#88B8FF`, `#7DE4FF`, and `#D6F4FF`; accents use `#C75B7A` and `#E8A7B8`. Green is absent from normal and fallback rain. Violet is reserved for tool-state Shimmer.

Dark trails fade toward `#10121D`. Light trails fade toward `#FAF7F2` and use the resolved darker palette variants for heads/near trails. Head and fallback glyphs maintain perceptible contrast; ordinary distant trails may fade more softly, but a fallback glyph used to satisfy row visibility must meet at least 2:1 contrast against its fade target.

Geometry regression tests hash only geometry fields. Palette weighting and exact colors are asserted separately so a brand-color change cannot masquerade as trajectory drift.

### 5. Blank-row repair extends vertical structure deterministically

After all normal drops are rendered, the renderer checks each of the four rows for a non-space glyph cell.

- For a blank row when another row contains a normal glyph, choose a deterministic nearest occupied row/column and extend that existing track through the blank row, producing a two-to-four-cell vertical trail rather than an isolated point.
- For contiguous blank rows, one extension may repair the whole contiguous segment.
- If all four rows are blank, choose a deterministic column from width/time/seed and render one four-row low-intensity vertical track.
- Repair uses the active appearance palette/fade target and does not alter stored drops, density, speed, gap, length, or future frames.

A final invariant check confirms all four rows contain at least one non-space, contrast-qualified glyph. This structural postcondition provides the every-frame guarantee; finite timestamp sampling supplements but does not substitute for the invariant test.

### 6. Appearance resolution is explicit and fail-closed for unknown themes

Configuration adds `appearance: "auto" | "dark" | "light"`, defaulting to `auto`.

Resolution order:

1. explicit `dark` or `light` configuration wins;
2. in `auto`, built-in `light` resolves light;
3. built-in `dark`, `rose-cyberdeck`, and a separately installed legacy `rem-cyberdeck` resolve dark;
4. an unknown or unnamed theme in `auto` is not guessed: the animation remains inactive, Pi's native Working Line stays untouched, and one actionable warning tells the user to run `/rose-matrix appearance dark|light`.

Theme invalidation clears cached appearance-dependent output and re-resolves the current `theme.name`. A known dark↔light change updates the next shared-clock frame in place. If an active auto-mode run changes to an unknown theme, the extension stops its Widget/timer, restores Pi's native Working Line, and emits the same once-per-session actionable warning. `/rose-matrix appearance auto|dark|light` persists an explicit choice through the new Matrix config.

### 7. Configuration and command migration preserve user data

The Matrix config becomes versioned schema v2 at `~/.pi/agent/rose-cyberdeck-matrix.json` with explicit `version: 2`, `enabled`, `fps`, `density`, fixed `height: 4`, and `appearance`.

- New config has precedence.
- If it is absent and `sakura-cyberdeck-matrix.json` is a valid regular file, supported fields are validated and converted, then the new file is written atomically; the old file is retained.
- A legacy non-4 height is normalized to 4 and reported in the migration notification.
- Corrupt, unreadable, or unsafe legacy/new paths are not overwritten; defaults are used for runtime only and a warning identifies the blocked migration.

`/rose-matrix` owns `status`, `on`, `off`, `preview`, `fps`, `density`, and `appearance`. `/sakura-matrix` delegates to the same handler but first emits a deprecation notice directing users to `/rose-matrix`; it is the only product command allowed to retain Sakura naming.

Zentui's canonical config path becomes `rose-cyberdeck-zentui.json`. To preserve its existing user-owned configuration policy, it fallback-reads a valid legacy `rem-cyberdeck-zentui.json` when the new file is absent; the first explicit settings save writes the new path atomically and never deletes the old file.

### 8. One Rose theme and an actionable legacy-theme path

The package declares exactly one formal theme resource, `themes/rose-cyberdeck.json`, whose schema name is `rose-cyberdeck`. The old theme file is no longer declared or shipped as a second selectable alias. The dark theme keeps `#10121D` as its base, uses Rose-owned variable names for blue `#88B8FF`, cyan `#7DE4FF`, violet `#BCA7FF`, ice `#D6F4FF`, brand Rose `#C75B7A`, soft Rose `#E8A7B8`, deep Rose `#A8455F`, and success green `#5A8A72`, and maps product accents without a `rem` variable. Header telemetry becomes `ROSE CYBERDECK`; the preserved Unicode artwork is renamed to a Rose-owned asset path without claiming a different artistic source.

The package does not silently rewrite `~/.pi/agent/settings.json`. Documentation and a bounded startup detector recognize a single `rem-cyberdeck` value or a `light/dark` pair containing it and emit exact replacement guidance for `/settings` or the settings file. This warning is compatibility guidance, not operation authority.

User-facing README, command/status copy, theme labels, Header, and Rose-owned symbols/configuration use Rose naming. Internal Zentui gradient identifiers become `ROSE_*` / `renderRoseGradient`. The canonical reasoning/editor/tool-rail gradient stops are `#C75B7A → #E8A7B8 → #BCA7FF → #88B8FF → #7DE4FF → #D6F4FF`, combining website Rose accents with the blue visual family. The explicit exceptions are the deprecated `/sakura-matrix` compatibility command and immutable third-party attribution surfaces.

### 9. Attribution identity remains immutable

`pi-sakura-cyberdeck`, its source URL, revision `165a1f8011a12a58a6409b56b8a6c0416cd9b589`, copyright/license text, provenance source identity, SBOM identity, and upstream notice filename remain unchanged. Package-owned local-modification descriptions are updated to state that the adapted visuals are now Rose-branded. A package-owned `NOTICE.rem-cyberdeck` filename may migrate to a Rose-owned filename, but no upstream identity is renamed or presented as original Rose work.

## Risks / Trade-offs

- **Unknown custom theme cannot be classified through the public API** → fail closed without hiding Pi's native Working Line and require explicit appearance selection.
- **The extension cannot restore another extension's previous Working Line customization because Pi exposes no getter** → own the surface only while active and restore Pi defaults deterministically; document this composition limit.
- **`agent_end` may be followed by Pi retry/compaction** → honor the requested cleanup boundary; a later `agent_start` creates a fresh generation, accepting a possible brief transition rather than leaving stale state.
- **Fallback tracks could satisfy string tests but be visually indistinguishable** → enforce both non-space presence and minimum fallback contrast.
- **Automatic Matrix config migration writes a new user file** → perform only when the new path is absent and legacy input is valid, use atomic create/replace, preserve old data, and never treat DEFINE as runtime operation permission.
- **Theme rename breaks an existing settings reference** → expose only the new canonical theme, provide precise non-mutating migration guidance, and retain rollback through the previous package version and untouched legacy configs.
- **Brand refactors can accidentally rewrite attribution** → separate product-name assertions from immutable provenance assertions and validate both.

## Migration Plan

1. Introduce Rose palette/renderer/state/config owners and compatibility readers without altering geometry constants.
2. Switch the active working surface to the unified Widget and add lifecycle/state/width/invariant tests.
3. Rename the theme, Header, Rose-owned assets, Zentui gradient/config symbols, package resource, docs, and package assertions.
4. Add legacy Matrix/Zentui config handling and old-theme compatibility guidance; retain all old user files.
5. Update only local adaptation descriptions in notices/provenance/SBOM generation inputs while preserving upstream identity.
6. Run focused unit/integration checks, typecheck, full affected tests, package/provenance validators, dry-run packaging, strict OpenSpec validation, and separately authorized manual TUI checks.

Rollback is installation of the prior package version plus selection of the former theme. Legacy Matrix and Zentui files remain available because migration never deletes them. No rollback, release, installation, settings write, or Git action is performed by DEFINE.

## Open Questions

No material product or architecture question remains. Runtime visual appearance on real dark/light terminals and whether each configured provider reports streaming `usage.output` remain planned verification items; absence of streaming usage fails closed by hiding the token field and does not change implementation design.
