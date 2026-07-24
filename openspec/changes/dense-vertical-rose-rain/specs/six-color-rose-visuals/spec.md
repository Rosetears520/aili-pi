# Six-color Rose visuals

## ADDED Requirements

### Requirement: Owned defaults use the canonical six-color palette

Package-owned theme, Header, Matrix, Zentui gradient, footer/status default configuration, and runtime badge defaults SHALL use Blue `#88B8FF`, Ice `#D6F4FF`, Cyan `#7DE4FF`, Violet `#BCA7FF`, Rose `#C75B7A`, Soft Rose `#E8A7B8`, and required neutral contrast colors only. User-owned saved Zentui configuration SHALL NOT be rewritten.

#### Scenario: Semantic color mapping
- **WHEN** package defaults render completion, pending/warning, and failure states
- **THEN** they use Cyan, Violet, and Rose respectively.

#### Scenario: Legacy defaults
- **WHEN** the canonical theme and Zentui default config are inspected
- **THEN** they contain no green, gold, coral, or other legacy vivid palette defaults.
