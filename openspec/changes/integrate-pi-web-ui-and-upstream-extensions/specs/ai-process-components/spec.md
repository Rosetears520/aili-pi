## ADDED Requirements

### Requirement: Fourteen semantic component categories
The Web UI SHALL provide AILI-owned implementations for this frozen fourteen-category inventory: Thinking State, Thinking and Reasoning, Orbs, Web Search, File Diff, Image Generation, Text Response, Streaming Text, Inline Citations, Code Block, To-do List, Data Table, Comparison Table, and AI Agent Input. Each component SHALL map to explicit observable runtime semantics.

#### Scenario: Complete category inventory
- **WHEN** the built Web component inventory is compared with the accepted fourteen-category contract
- **THEN** every category has a reachable semantic rendering and no locked category is omitted

### Requirement: License-safe source fallback
AIcss source SHALL be copied only when explicit evidence permits source inclusion and redistribution through this public repository and npm/MIT package. If that evidence is absent, none of the free or locked AIcss source SHALL be copied and all fourteen categories SHALL be independently implemented from public behavior and visual references.

#### Scenario: Redistribution evidence is absent
- **WHEN** BUILD cannot establish compatible redistribution rights for AIcss source
- **THEN** package and repository scans find no copied AIcss source or private token while all fourteen category behaviors remain in scope

### Requirement: One default Orb and semantic state
The Web UI SHALL use one default Orb for the designated primary process indicator and SHALL ensure that color, motion, and shape do not become the sole way to communicate state.

#### Scenario: Orb state is understandable without motion
- **WHEN** animation is disabled or unavailable
- **THEN** text, accessible name, or another non-motion signal still communicates the process state

### Requirement: Reduced motion and bounded animation
Every animated component SHALL honor reduced-motion preferences, pause or reduce work when hidden or offscreen, and stay within acceptance thresholds established by browser profiling. Exact performance measurements remain `Unverified` until BUILD verification.

#### Scenario: Reduced-motion preference is active
- **WHEN** the browser reports reduced-motion preference
- **THEN** continuous or decorative motion is replaced with a static or minimal transition that preserves meaning

#### Scenario: Workbench is backgrounded
- **WHEN** the component is offscreen or the page is not visible
- **THEN** nonessential animation work pauses or reduces according to the bounded animation policy

### Requirement: No hidden reasoning disclosure
AI-process components MUST render only observable events, summaries, statuses, and explicitly public content. They MUST NOT expose hidden chain-of-thought, credentials, prompts, private tool arguments/results, or raw internal error bodies as process details.

#### Scenario: Private runtime field is present
- **WHEN** an internal projection contains a field not allowed by the public component schema
- **THEN** the field is omitted from rendering and cannot be revealed through component expansion or browser state
