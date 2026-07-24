# Restored Rose Code Rain

## ADDED Requirements

### Requirement: Released sparse fixed-column geometry

Rose Code Rain SHALL use even-cell track candidates, density-based deterministic selection, randomized length/gap/offset generation, and a 96-track maximum. A selected track x coordinate SHALL remain fixed for its active lifetime. The renderer SHALL retain four rows and deterministic blank-row vertical repair.

#### Scenario: Ultra-wide terminal
- **WHEN** the renderer receives width 320 or more
- **THEN** it creates no more than 96 tracks and deterministically samples both the first and final width deciles.

### Requirement: Intermediate waterfall cadence and six-color weights

The default Matrix cadence SHALL be 12 FPS and normal track speed SHALL be between 8 and 16 rows per second. A deterministic 100-track color cycle SHALL assign Blue `#88B8FF` 50%, Ice `#D6F4FF` 20%, Cyan `#7DE4FF` 15%, Violet `#BCA7FF` 8%, Rose `#C75B7A` 4%, and Soft Rose `#E8A7B8` 3%. Green SHALL NOT be emitted.

#### Scenario: Four-row renderer
- **WHEN** a four-row frame is rendered
- **THEN** all rows are ANSI-safe and exactly the requested visible width.
