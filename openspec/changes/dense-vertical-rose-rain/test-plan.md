# Test plan — restored Rose waterfall geometry and six-color remap

**Accepted:** user confirmed implementation and then explicitly selected 0.1.8 waterfall geometry, six-color weights, and intermediate speed on 2026-07-24. Git/release/install and real TUI/provider operations remain separately gated.

| ID | Claim | Evidence |
|---|---|---|
| DVR-1 | Even-cell candidates are density-selected and capped at 96 tracks while spanning ultra-wide widgets. | Matrix unit tests at wide widths. |
| DVR-2 | Track x coordinates remain fixed; length/gap/offset follow the released sparse waterfall model. | Deterministic geometry assertions. |
| DVR-3 | Track speed is 8–16 rows/second and default cadence is 12 FPS. | Renderer/config unit tests. |
| DVR-4 | All four rendered rain rows and the Shimmer remain exactly requested width. | Existing width tests at narrow/wide widths. |
| DVR-5 | A deterministic 100-track palette cycle produces 50/20/15/8/4/3 Blue/Ice/Cyan/Violet/Rose/Soft Rose weights. | Palette unit tests. |
| PAL-1 | Theme, Matrix, Header/Zentui gradient, and Zentui defaults use only the six named chromatic values plus neutral contrast colors. | Theme/config/gradient tests and bounded source assertions. |
| PAL-2 | Green/gold/coral legacy package defaults are absent; status semantics map to Cyan/Violet/Rose. | Theme and Zentui default tests. |
| REG-1 | Existing animation lifecycle, appearance fail-closed behavior, config migration, provenance/package checks remain passing. | Focused lifecycle/config tests plus project checks. |

**Unverified:** actual WSL terminal frame smoothness, font-specific appearance, and provider streaming usage. These require separate manual authorization.
