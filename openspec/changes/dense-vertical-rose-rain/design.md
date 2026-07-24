## Design

### Vertical Code Rain

`createDrops(width, density)` restores the 0.1.8 geometry: candidates occupy even terminal cells, density selects active fixed-x tracks, and the deterministic 96-track sampler spans ultra-wide terminals. Tracks retain randomized 3–7 glyph lengths, 1–5 row gaps, and offsets; their x coordinate never changes. Post-render blank-row repair remains a deterministic vertical fallback.

The renderer returns exactly four ANSI-safe, width-padded rows. Default config FPS is 12 and normal track speed is 8–16 rows/second, an intentional midpoint between the released and rejected full-width profiles. The deadline scheduler remains the sole animation clock.

Track colors are assigned through a deterministic 100-track cycle: Blue 50%, Ice 20%, Cyan 15%, Violet 8%, Rose 4%, and Soft Rose 3%. Fades are derived only from those colors and the active neutral background; green is never emitted.

### Six-color visual system

The canonical chromatic set is Blue `#88B8FF`, Ice `#D6F4FF`, Cyan `#7DE4FF`, Violet `#BCA7FF`, Rose `#C75B7A`, and Soft Rose `#E8A7B8`. Dark neutrals (`void`, panels, text, muted/dim) remain for contrast and layout.

Theme semantic mapping: success/completion → Cyan; warning/running → Violet; error → Rose. Zentui context/cost/addition values use Cyan; warnings/time/user identity use Violet; errors/deletions use Rose; strings and soft labels use Soft Rose or Ice. Header and editor/tool borders use only the six-color gradient. Runtime icon defaults are remapped from named traffic-light ANSI colors to equivalent six-color literals. User-saved Zentui values are not rewritten.

### Acceptance

The user confirmed the visual remap and then explicitly selected 0.1.8 waterfall geometry on 2026-07-24. Automated tests prove 96-track bounded sampling, fixed even-column x coordinates, midpoint speeds, exact six-color weights, no legacy forbidden defaults, and existing lifecycle/width behavior. Real terminal visual review remains unverified until separately authorized.
