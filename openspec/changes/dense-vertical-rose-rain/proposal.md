## Why

The released Rose Code Rain uses the desired sparse fixed-column waterfall geometry, but its original speed and palette no longer match the user’s preference. After rejecting an overly dense full-width preview, the user selected restoration of the 0.1.8 waterfall geometry with an intermediate speed and one six-color Rose palette for all package-owned visual surfaces.

## What Changes

- Restore the 0.1.8 sparse fixed-column geometry: even-cell track candidates, active density selection, 96-track ceiling, randomized length/gap/offset, four rows, and no horizontal coordinate movement.
- Set the default cadence to 12 FPS and track speeds to 8–16 rows/second, between the released and rejected dense-preview profiles.
- Assign rain tracks with exact 50% Blue, 20% Ice, 15% Cyan, 8% Violet, 4% Rose, and 3% Soft Rose weights.
- Use the same six colors across Rose-owned Header, theme, Zentui borders, footer/status defaults, and runtime badges. Remove green/gold/coral/palette-external vivid colors from those defaults.

## Boundaries

No dependency or lockfile changes, user Home writes, Git operations, publish, install, or real TUI/provider run are authorized. Existing user-owned Zentui overrides remain authoritative; only package defaults change.
