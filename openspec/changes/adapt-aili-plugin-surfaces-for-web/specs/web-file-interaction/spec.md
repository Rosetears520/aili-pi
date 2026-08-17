## ADDED Requirements

### Requirement: Unified file access policy
Every web-side file capability — the @ file completion, the Plus file picker, the file viewer, image attachment reads, and any future file API — SHALL authorize through one file access policy built on the existing canonicalize/realpath containment check (lexical boundary-safe prefix matching against realpath-resolved roots for existing paths). The default allowed roots remain the session working directories, project roots, and `~/pi-cwd-*` directories. Startup SHALL additionally include roots from the `AILI_WEB_FILE_ROOTS` environment variable (colon-separated, `~` expanded). No entry point may add its own private permission exception; widening access means widening the shared policy.

#### Scenario: Sibling directory is rejected
- **WHEN** `/home/u/project` is an allowed root and a request targets `/home/u/project-evil/file`
- **THEN** authorization fails because the containment check is boundary-safe, not a raw prefix match

#### Scenario: Symlink escape is rejected
- **WHEN** an allowed root contains a symlink pointing to `/etc` and a request targets the symlinked `passwd`
- **THEN** authorization fails because the existing-path check resolves the target through realpath before containment

#### Scenario: Environment-configured roots are honored
- **WHEN** the server starts with `AILI_WEB_FILE_ROOTS=/data:/home/u/extra`
- **THEN** both roots are browsable through every file entry point with no per-entry configuration

### Requirement: WSL Windows-drive roots
When running under WSL, the shared file policy SHALL automatically include Windows drive mounts by scanning `/proc/mounts` for drvfs (or 9p) mounts whose mount points match `/mnt/[a-z]` — only actual Windows drive mounts are added, never the whole `/mnt` tree. When not running under WSL, no `/mnt` root is added automatically.

#### Scenario: Windows C drive is browsable
- **WHEN** the server runs under WSL with `C:\` mounted at `/mnt/c` as drvfs
- **THEN** `/mnt/c` is an allowed root for every file entry point

#### Scenario: Non-Windows mounts stay out
- **WHEN** `/mnt/data` is a network or manually mounted volume that is not a drvfs/9p Windows drive
- **THEN** it is not automatically allowed; it must be configured via `AILI_WEB_FILE_ROOTS` if wanted

### Requirement: Single Plus file picker
The composer's bottom-left attach control SHALL be a single Plus button (aicss AI Agent Input reference, 2026-08-15 copy authorization) opening one server-side file browser popover. The popover SHALL provide a directory listing with folder/file icons and fuzzy filtering, an editable address bar for jumping to any absolute path, a parent-directory control, and quick-entry chips for the session working directory, the server home directory, and each Windows drive root (the Windows chips appear only under WSL). Selecting a directory descends into it. Selecting a file dispatches by type: image files attach through the existing image attachment flow (preview chip, content sent to the model); every other file inserts its absolute path at the composer cursor — file contents are never uploaded for non-image files. Paths containing whitespace are wrapped in plain double quotes. The picker browses only paths the unified file policy allows and reports denied locations truthfully.

#### Scenario: Browsing starts at the session directory
- **WHEN** the user opens the picker
- **THEN** the listing shows the session working directory's entries with filtering available

#### Scenario: Jumping outside the working directory
- **WHEN** the user types or pastes an absolute path into the address bar
- **THEN** the picker navigates there if the unified policy allows it, or shows a denial message if it does not

#### Scenario: Image files attach, other files reference
- **WHEN** the user selects a `.png` and then a `.log` file
- **THEN** the image becomes an attachment chip with its content bound for the model, and the log's absolute path is inserted at the cursor with no content upload

### Requirement: Platform-native file dialog
Activating the Plus control SHALL offer the operating system's native multi-select file dialog: the Windows Explorer dialog through WSL interop (forced to the foreground — a background interop process otherwise leaves the dialog buried behind other windows), AppleScript `choose file` on macOS, and zenity or kdialog on Linux. The dialog's own path input and search are the native ones; the web layer adds no imitation. Only one dialog is live at a time and a newer activation replaces an abandoned one instead of queueing behind it. Selected paths are returned to the web client in WSL form through the same drive-letter conversion as paste normalization, then dispatch by the same type rule: images attach through the existing flow, other files insert their absolute paths at the cursor. Cancelling the dialog inserts nothing. When interop is unavailable or the server is not WSL, the Plus control falls back to the in-web file browser popover instead of erroring.

#### Scenario: Native selection round trip
- **WHEN** the user selects two files in the native dialog (one `.png`, one `.log`)
- **THEN** the image attaches as a preview chip and the log's `/mnt/…` path is inserted at the cursor, with no content uploaded for the log

#### Scenario: Cancelled dialog
- **WHEN** the user cancels the native dialog
- **THEN** nothing is attached or inserted

#### Scenario: Fallback without interop
- **WHEN** the Plus control is activated and the native dialog cannot be launched
- **THEN** the in-web file browser popover opens instead

#### Scenario: A hidden dialog never wedges the control
- **WHEN** a dialog is left unanswered and the user activates Plus again
- **THEN** the previous dialog is dismissed and a fresh one opens instead of blocking until a timeout

### Requirement: Path-first hybrid
File input SHALL follow one principle: whenever a real path is obtainable it is used directly and the file is never copied — the native dialog's selections, @ file references, and pasted path text all reference originals. Only inputs whose local path the browser cannot reveal (paste/drag of file content) are copied into the session attachment cache, and only visual content (images) enters the model directly by default; every other file becomes a path reference the agent reads on demand.

#### Scenario: Native selection never copies
- **WHEN** the user selects a 20 GB log through the native file dialog
- **THEN** no upload or copy occurs and the original absolute path is inserted

#### Scenario: Pasted path never copies
- **WHEN** the user pastes `C:\xxx\file.txt`
- **THEN** it converts to `/mnt/c/xxx/file.txt` and references the original file

### Requirement: Session attachment cache
Paste/drag copies SHALL be stored under `<agentDir>/aili-uploads/<session-id>/…` when a session is active, and under `<agentDir>/aili-uploads/orphan/…` otherwise. The per-file size cap (50 MB) applies only to this copy path; native-dialog and @ selections have no size cap because nothing is copied. Exceeding the copy cap SHALL surface an actionable message directing the user to the native dialog instead of failing silently. An image exceeding the attachment limit becomes a path reference (original path when one exists, cache path otherwise) rather than being dropped.

#### Scenario: Session-scoped storage
- **WHEN** the user drags a `.csv` into an active session's composer
- **THEN** it is stored under that session's `aili-uploads/<session-id>/` directory and its path inserted

#### Scenario: Copy-cap rejection is actionable
- **WHEN** a dragged file exceeds 50 MB
- **THEN** the user sees a message explaining the copy limit and suggesting the native dialog for a real-path reference

#### Scenario: Oversized image from the native dialog
- **WHEN** a natively selected image exceeds the model attachment limit
- **THEN** its original path is inserted instead of attaching

### Requirement: Attachment cache lifecycle
The attachment cache SHALL be a bounded, lifecycle-managed store, not a permanent session asset. A lightweight garbage collection SHALL run once per web server startup (no resident timer), applying in order: orphaned uploads (no session) older than 24 hours are deleted; directories belonging to sessions that no longer exist are deleted; files older than 30 days are deleted; and if total size exceeds a 2 GB hard cap, the least-recently-modified files SHALL be evicted oldest-first until the cache falls back to the 1.5 GB target.

#### Scenario: Orphan cleanup
- **WHEN** a paste was uploaded without an active session and 24 hours pass
- **THEN** the next server startup's garbage collection removes it

#### Scenario: Dead session cleanup
- **WHEN** a session is deleted
- **THEN** the next startup's garbage collection removes that session's uploaded attachments

#### Scenario: Hard cap eviction
- **WHEN** the cache totals more than 2 GB
- **THEN** garbage collection evicts least-recently-modified files oldest-first until the cache is at or below 1.5 GB

### Requirement: WSL path paste normalization
When the server reports WSL (with its distribution name), pasting text that is exactly a Windows drive path (`C:\Users\me\a.md`) into the composer or the picker's address bar SHALL convert it to the WSL form (`/mnt/c/Users/me/a.md`). Pasting a `\\wsl$\…` or `\\wsl.localhost\…` UNC path SHALL convert to the Linux path only when the named distribution matches the current distribution; otherwise the text is left unchanged. Partial matches inside larger pasted text are never converted — only a paste whose entire content is a single Windows path is normalized.

#### Scenario: Drive-letter paste
- **WHEN** the clipboard contains exactly `C:\Users\rose\a.md`
- **THEN** `/mnt/c/Users/rose/a.md` is inserted instead

#### Scenario: Same-distro UNC paste
- **WHEN** the current distribution is `Ubuntu` and the clipboard contains exactly `\\wsl.localhost\Ubuntu\home\rose\a.md`
- **THEN** `/home/rose/a.md` is inserted instead

#### Scenario: Foreign-distro UNC paste
- **WHEN** the current distribution is `Ubuntu` and the clipboard contains exactly `\\wsl$\Debian\home\x\a.md`
- **THEN** the pasted text is left unchanged

#### Scenario: Prose is never converted
- **WHEN** the clipboard contains a sentence that merely mentions a Windows path
- **THEN** the text is pasted verbatim
