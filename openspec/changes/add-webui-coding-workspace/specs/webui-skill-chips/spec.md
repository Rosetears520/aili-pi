## ADDED Requirements

### Requirement: Collapsed skill chips on the composer surface
The composer surface SHALL present skills as a collapsed summary chip (for example `Skills N ▼`) by default, showing individual removable chips only for the currently enabled skills, with an expanded panel grouping Active and Available skills. Skill chips SHALL be owned by the composer/interaction surface rather than a permanently occupied region.

#### Scenario: Default view stays compact
- **WHEN** the composer renders with skills available
- **THEN** only the summary chip and any enabled-skill chips are visible, not an unbounded row of all skills

#### Scenario: Expanded panel groups by activation
- **WHEN** the user expands the skill chip
- **THEN** Active and Available groups are listed from registry data, with enabled skills removable and available skills addable

### Requirement: Existing skill registry as the sole source
Skill chips SHALL be backed exclusively by the existing AILI skill registry, loader, and activation/dormancy mechanism, and MUST NOT create a second skill registry, copy skill bodies, or maintain a parallel activation store. Any per-session activation layer requires an explicit accepted design decision before Phase 4 implementation.

#### Scenario: Chip state matches registry state
- **WHEN** a skill's activation changes through existing surfaces
- **THEN** the chip presentation reflects it on refresh without a divergent state store

#### Scenario: Enabling a chip uses existing activation paths
- **WHEN** the user enables or disables a skill from the chip surface
- **THEN** the change flows through the existing activation/dormancy mechanism rather than a new persistence path
