## ADDED Requirements

### Requirement: The Package exposes one canonical Rose Cyberdeck theme
The Package SHALL expose exactly one formal Cyberdeck theme resource named `rose-cyberdeck`, with every required Pi theme token. Its Rose-owned variables SHALL include dark base `#10121D`, blue `#88B8FF`, cyan `#7DE4FF`, violet `#BCA7FF`, ice `#D6F4FF`, brand Rose `#C75B7A`, soft Rose `#E8A7B8`, deep Rose `#A8455F`, and success green `#5A8A72`; it SHALL NOT retain a current product variable named `rem`. It SHALL NOT expose a second visually equivalent `rem-cyberdeck` theme or any replacement Pi CLI.

#### Scenario: Pi discovers package themes
- **WHEN** Pi loads the Package resources
- **THEN** exactly `themes/rose-cyberdeck.json` is declared and its schema name is `rose-cyberdeck`

### Requirement: Product branding is Rose across owned surfaces
User-facing Header telemetry, README copy, Matrix status/commands, theme labels, and Zentui-owned visual terminology SHALL use Rose branding. Header telemetry SHALL read `ROSE CYBERDECK`; owned runtime/config/palette/gradient symbols SHALL use Rose names such as `rose-matrix-engine`, `renderRoseMatrix`, `ROSE_MATRIX_GLYPHS`, and `renderRoseGradient`.

The only permitted Sakura/Rem product-name occurrences are the deprecated `/sakura-matrix` compatibility entry, legacy configuration detection/migration text, and immutable third-party attribution. Generic artistic descriptions may state that the retained Unicode artwork is Rem-inspired, but SHALL NOT present Rem or Sakura as the current product brand.

#### Scenario: Owned branding inventory is inspected
- **WHEN** package-owned user-facing resources and Rose-owned symbols are searched
- **THEN** current product labels use Rose and every remaining Rem/Sakura occurrence is classified as compatibility, historical evidence, or third-party attribution

#### Scenario: Header renders
- **WHEN** the package Header is displayed
- **THEN** it shows `ROSE CYBERDECK` with the retained Unicode artwork from a Rose-owned asset path

### Requirement: Zentui uses Rose gradient ownership and configuration naming
Zentui SHALL use Rose-owned gradient identifiers and the ordered gradient `#C75B7A → #E8A7B8 → #BCA7FF → #88B8FF → #7DE4FF → #D6F4FF` for reasoning markers, editor chrome, and applicable tool rails. Its canonical configuration path SHALL be `rose-cyberdeck-zentui.json`.

#### Scenario: Rose reasoning marker renders
- **WHEN** Zentui renders `✦ REASONING` or a `◇` step marker
- **THEN** it uses the documented Rose gradient and no Sakura-named runtime symbol

#### Scenario: Legacy Zentui config exists
- **WHEN** the new Zentui config is absent and a valid `rem-cyberdeck-zentui.json` exists
- **THEN** Zentui reads the legacy values, and the first explicit settings save writes the canonical new path atomically without deleting the legacy file

### Requirement: Legacy theme settings receive non-mutating migration guidance
The Package SHALL NOT silently rewrite `~/.pi/agent/settings.json` and SHALL NOT retain a duplicate selectable legacy theme. It SHALL detect a single theme value or a light/dark theme pair containing `rem-cyberdeck` and SHALL provide exact guidance to replace only that legacy token with `rose-cyberdeck` through `/settings` or an explicit settings edit.

#### Scenario: Single legacy theme setting is detected
- **WHEN** the configured theme value is exactly `rem-cyberdeck`
- **THEN** the Package emits one actionable compatibility notice and does not mutate the setting

#### Scenario: Auto theme pair contains the legacy name
- **WHEN** either side of Pi's `<light-theme>/<dark-theme>` setting equals `rem-cyberdeck`
- **THEN** guidance preserves the other side and replaces only the legacy token with `rose-cyberdeck`

#### Scenario: No legacy theme reference exists
- **WHEN** the settings value contains no exact `rem-cyberdeck` token
- **THEN** no legacy-theme warning is emitted

### Requirement: Third-party source identity and license provenance remain truthful
The Package SHALL preserve the upstream name `pi-sakura-cyberdeck`, source URL, locked revision `165a1f8011a12a58a6409b56b8a6c0416cd9b589`, copyright/license text, NOTICE identity, provenance source identity, and SBOM source identity. Rose branding SHALL NOT rewrite or obscure upstream authorship. Package-owned local-modification descriptions SHALL be updated to accurately describe the Rose adaptation.

#### Scenario: Provenance validation runs
- **WHEN** notices, provenance, SBOM, and license records are validated
- **THEN** immutable upstream identity fields remain exact and local modification text accurately distinguishes Rose-owned changes from upstream work

#### Scenario: Package notice filename changes
- **WHEN** a package-owned Rem-branded notice filename is migrated to Rose naming
- **THEN** referenced upstream names and license text inside attribution surfaces remain unchanged

### Requirement: Documentation distinguishes canonical names from compatibility names
README and command help SHALL document `rose-cyberdeck`, `ROSE CYBERDECK`, Rose Shimmer, Rose Code Rain, and `/rose-matrix` as canonical. They SHALL document `/sakura-matrix` and old config/theme names only in bounded migration or attribution sections.

#### Scenario: User follows current setup documentation
- **WHEN** a user selects the packaged theme or configures the animation from README
- **THEN** the primary instructions use only canonical Rose names and include a bounded legacy migration note
