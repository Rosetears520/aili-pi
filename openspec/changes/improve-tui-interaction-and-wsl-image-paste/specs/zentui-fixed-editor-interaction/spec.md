## ADDED Requirements

### Requirement: Fixed editor renders an application-owned overflow scrollbar
While the fixed editor owns the alternate-screen transcript viewport, configuration SHALL contain `fixedEditor.scrollbar:boolean` with default `true`. When enabled and transcript rows exceed visible transcript rows, the compositor SHALL overlay one ANSI-safe track/thumb cell at the rightmost terminal column of every visible transcript row. It SHALL preserve the original Pi render width and every returned line SHALL remain exactly the requested visible width. The scrollbar SHALL be hidden when no overflow exists, configuration is false, width is below two cells, or fewer than two transcript rows are visible.

#### Scenario: Transcript exceeds the viewport
- **WHEN** scrollbar is enabled and total transcript rows exceed visible transcript rows
- **THEN** a proportional thumb is visible and its position reflects the absolute viewport start

#### Scenario: Original content is rendered
- **WHEN** the compositor obtains root lines from Pi
- **THEN** Pi was called with the full terminal width and only the final visible cell is overlaid

#### Scenario: User presses the scrollbar cell
- **WHEN** a left press occurs in the visible scrollbar column
- **THEN** no transcript text selection starts

### Requirement: Text selection spans transcript viewports
Selection anchor and focus SHALL remain absolute full-transcript coordinates. Ordinary wheel input SHALL scroll normally. During an active drag, wheel input SHALL scroll by the existing bounded increment and extend focus against the prospective viewport. Dragging at the top or bottom transcript edge SHALL start a single 70 ms one-line auto-scroll timer; leaving the edge, reaching the scroll bound, releasing, rolling back, restoring, disposing, or shutting down SHALL stop it.

#### Scenario: Drag reaches the top edge
- **WHEN** a selection is active and the pointer remains on the first transcript row while older history exists
- **THEN** the viewport advances toward older history and focus extends on each bounded timer tick

#### Scenario: Wheel is used during drag
- **WHEN** an active selection receives wheel input
- **THEN** the selection remains active, the viewport moves, and focus maps through the new viewport without waiting for a render cycle

#### Scenario: Drag crosses into the pinned cluster
- **WHEN** a drag began in transcript content and later enters editor/footer rows
- **THEN** focus clamps to the final transcript row and release still terminates the drag

#### Scenario: Selection starts in the pinned cluster
- **WHEN** left press begins below the transcript viewport
- **THEN** no transcript selection starts and editor/footer input ownership is preserved

### Requirement: Release copies one complete selection and cleans state
Releasing an active nonempty selection SHALL extend to the final clamped point, extract from full `rootLines` using current ANSI/OSC-8 and whitespace semantics, invoke the existing clipboard helper at most once, emit the configured copy notice at most once, clear selection/pointer state, stop auto-scroll, and request one final render. Empty selection SHALL perform no clipboard operation.

#### Scenario: Cross-viewport drag is released
- **WHEN** anchor and focus reside in different transcript viewports
- **THEN** one extracted text value covering the full absolute range is sent to the clipboard path

#### Scenario: Compositor is disposed while dragging
- **WHEN** dispose or rollback occurs with a live edge timer
- **THEN** the timer and pointer are cleared and no later timer tick requests rendering

### Requirement: Scrollbar configuration and terminal restoration fail safely
`/zentui` SHALL expose the scrollbar setting beside fixed-editor mouse/copy controls. Missing values SHALL normalize to the default; valid user values and unrelated config keys SHALL be preserved. Corrupt, unreadable, symlinked, or unsafe config SHALL retain current fail-closed save behavior. Disabling fixed editor or any installation failure SHALL restore terminal descriptors and modes completely.

#### Scenario: Older Zentui config is loaded
- **WHEN** `fixedEditor.scrollbar` is absent
- **THEN** runtime behavior uses `true` without rewriting the file merely to migrate it

#### Scenario: Fixed editor is disabled
- **WHEN** `/zentui fixed-editor disable` completes
- **THEN** application scrollbar, mouse reporting, alternate-screen ownership, drag state, and timers are absent
