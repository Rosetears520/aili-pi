## 1. Contract and regression coverage

- [x] Add renderer tests for 96-track bounded sampling, fixed even-column x coordinates, intermediate speeds, and exact palette weights.
- [x] Update theme/Zentui default tests to reject legacy green/gold/coral and accept the six-color mapping.

## 2. Implement dense vertical rain

- [x] Restore bounded sparse drop selection and blank-row repair in `extensions/matrix/index.ts`.
- [x] Set default FPS to 12 and 8–16 row/second track speed; preserve compatible config parsing and density behavior.

## 3. Apply the visual palette

- [x] Update `themes/rose-cyberdeck.json`, Header, Matrix, Zentui gradient/default config, and owned runtime badge styles to the six-color palette.
- [x] Preserve user config migration/read behavior and all nonvisual runtime behavior.

## 4. Verify

- [x] Run affected Vitest files, `npm run typecheck`, `npm test`, `npm run validate:provenance`, `npm run validate:package`, strict OpenSpec validation, and `git diff --check`.
- [x] Record real TUI visual verification as Unverified unless separately authorized.
