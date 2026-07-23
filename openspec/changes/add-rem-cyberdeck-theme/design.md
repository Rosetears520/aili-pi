# Design: Rem Cyberdeck Theme

## Architecture

1. `themes/rem-cyberdeck.json` supplies the complete Pi palette.
2. Three copied visual Extensions own their upstream surfaces independently: header, Matrix working animation/widget, and Zentui footer/editor chrome/fixed-editor compositor. The AILI Extension registers none of these competing UI surfaces.
3. Header, Matrix, widget and footer use their existing public Pi APIs. Footer reads `footerData`, `ctx.getContextUsage()`, session usage and existing extension statuses. It never polls quota.
4. The fixed-editor enhancement is copied from the exact Sakura source revision, retaining its above-editor probe, strict writable-surface inspection, terminal compositor, and teardown behavior. Only Rem visual assets/palette may change without a further reuse revision.

## Compatibility and degradation

- Fixed editor is enabled by default in configuration, but installation is conditional, not forced.
- Internal inspection must reject unknown/non-writable layouts. Any patch/install exception must restore the original descriptors and terminal modes.
- Mouse reporting is opt-in within the fixed editor configuration and must provide application-level selection/copy only while enabled.
- Overlays retain Pi-native behavior; the compositor must not patch their rendering path.
- TUI-only surfaces do nothing in print/JSON/RPC modes.

## Reference and license boundary

`https://github.com/beautifulrem/pi-sakura-cyberdeck` at locally inspected commit `165a1f8011a12a58a6409b56b8a6c0416cd9b589` is the exact MIT source selected by the user. Copied files must retain both the Sakura and upstream Zentui MIT licenses, the existing notice chain, an exact inventory, and Rem-specific diff/provenance/SBOM records.

## Footer data sources

| Surface | Source | Fallback |
|---|---|---|
| cwd | `ctx.cwd` | basename or omitted on narrow width |
| branch/status | `footerData` + bounded Git status refresh | `no git`/omitted |
| context/tokens | `ctx.getContextUsage()` and session assistant usage | `n/a`/zero only when observed |
| local time | local clock | omitted only when unavailable |
| permission/network | existing Extension status entries | retained; no value fabricated |
| quota | upstream `pi-quota-status` status slot | no value fabricated |

On a narrow terminal, the footer splits primary left/right content across two lines rather than truncating it. The OS icon and runtime-version segments are disabled by default.

## User asset

The user-provided Unicode/Braille source is stored at `assets/rem-head.txt`. Rendering must preserve Unicode code points and truncate by terminal display width rather than JavaScript code-unit count.
