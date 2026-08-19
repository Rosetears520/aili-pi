## ADDED Requirements

### Requirement: One shared ChangeDiffView renderer
The Web UI SHALL provide one shared `ChangeDiffView` component with `inline` and `full` variants consuming unified patch input, and SHALL replace the existing duplicate diff implementations (`AiliFileDiff` and the `patch.ts`/`SplitPatchView` path) so the timeline inline diff, the file viewer diff mode, and the Changes workspace render from the same implementation.

#### Scenario: Timeline and Changes share one renderer
- **WHEN** an inline timeline card and the Changes workspace render the same change
- **THEN** both use `ChangeDiffView` (inline and full variants) with identical patch parsing and row semantics

#### Scenario: Duplicate implementations are removed
- **WHEN** the shared renderer is integrated
- **THEN** no second independent diff row renderer remains in the Web UI for these surfaces

### Requirement: Variant capabilities and render bounds
The inline variant SHALL render unified diff only; the full variant SHALL support unified and split views. Both variants SHALL apply bounded rendering for very large diffs with an explicit truncation indication.

#### Scenario: Full view toggles unified and split
- **WHEN** the user opens a change in the full variant
- **THEN** unified/split selection is available and honors the existing persisted Changes-page preference

#### Scenario: Very large diffs stay bounded
- **WHEN** a patch exceeds the render cap in either variant
- **THEN** rendering is bounded and the truncation is visibly indicated

### Requirement: No second change runtime
Diff data SHALL continue to originate from existing sources — tool-result patch/diff details and the existing git routes backed by the repository working tree — and the shared renderer MUST NOT introduce a second change-tracking, file-history, or Git runtime.

#### Scenario: Renderer consumes, never computes truth
- **WHEN** `ChangeDiffView` renders a change
- **THEN** the change and its patch come from the existing tool-result or git data source rather than a new tracking layer
