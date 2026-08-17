## ADDED Requirements

### Requirement: Composer visual restyle
The composer SHALL be restyled by copying the published aicss AI Agent Input component code and adapting it (user authorization 2026-08-15: personal-use copying accepted, at most MIT publication; the site publishes its components as free copy-paste blocks). The adaptation SHALL: a rounded frame container holding attachment chips above the text area and a bottom control row, a neutral border with an accent focus ring, a soft height transition when attachments or presets change, and `prefers-reduced-motion` respected. The upstream input internals (textarea behavior, slash-command palette, draft persistence, key handling) MUST be retained; the reference's contenteditable and inline-pill mechanics are out of scope.

#### Scenario: Focus state is visible
- **WHEN** the composer gains focus
- **THEN** the frame shows the accent focus ring without shifting layout

#### Scenario: Reduced motion is honored
- **WHEN** the user prefers reduced motion
- **THEN** the composer's height and chip transitions render without animation

### Requirement: Bottom control row layout
The composer's bottom control row SHALL follow the reference layout: the left cluster contains the image attach button and then the permission-mode chip; the right cluster, from left to right, contains the tool preset selector, the compact action, the thinking-level selector, the model selector, and the send button. The send button SHALL be the circular arrow-up style, active only when the composer has content, and the streaming state SHALL replace the left cluster with the existing steer/follow-up controls while keeping both clusters' remaining items stable. The completion-sound toggle (speaker) is a global preference and SHALL relocate to the top bar's right-side cluster instead of the composer.

#### Scenario: Idle layout order
- **WHEN** the composer is idle
- **THEN** the control row renders, left to right: image attach, mode chip, … spacer …, tool preset, compact, thinking level, model, send

#### Scenario: Send activation
- **WHEN** the composer has text or attachments
- **THEN** the send button activates and submits; with empty content it stays inactive

#### Scenario: Streaming keeps anchors stable
- **WHEN** the session is streaming
- **THEN** steer/follow-up appear in the left cluster while the right cluster's selectors and send/stop stay in place

### Requirement: Chat code block restyle
Chat code blocks SHALL be restyled by copying the published aicss Code Block component code and adapting it (same 2026-08-15 authorization): a header row with the language label and a one-click copy button that confirms with a "Copied" state, per-line rows with a line-number gutter in a monospace body, in both light and dark themes. Existing syntax highlighting, KaTeX, Mermaid, and file-diff rendering MUST keep working.

#### Scenario: Copy feedback
- **WHEN** a user clicks a code block's copy button
- **THEN** the code is placed on the clipboard and the button shows a copied confirmation before reverting

#### Scenario: Highlighting is preserved
- **WHEN** a message contains a fenced code block with a known language
- **THEN** it renders with the new header, line-number gutter, and copy control while retaining syntax coloring
