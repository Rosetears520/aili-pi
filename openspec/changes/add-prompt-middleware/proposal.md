## Why

AILI has static Skills and isolated prompt snippets but no trusted per-turn middleware that can combine reusable instructions with enforceable runtime restrictions. This change adds deterministic one-shot prompt modifiers without rewriting the stable system prefix or allowing prompt text to widen permissions.

## What Changes

- Discover and validate trusted user/project prompt modifiers with content hashes.
- Resolve main/subagent/role scope, allowlists, requires, conflicts, and deterministic order.
- Assemble prepend/user/append dynamic blocks while preserving the stable system prefix.
- Apply runtime policy patches as monotonic permission/capability intersections only.
- Add Alt+S, `/snippets`, preview, pending state, and consume-on-success one-shot behavior.
- Add bounded provenance for applied/rejected modifiers and effective restrictions.
- Allow `sub` to request role-authorized one-turn snippets.
- Use clean-room behavior reference only; no pi-config source is copied.

## Capabilities

### New Capabilities
- `prompt-middleware`: Trusted modifier discovery, deterministic resolution/assembly, runtime policy narrowing, TUI controls, subagent scope, and provenance.

### Modified Capabilities
- None.

## Impact

New `src/runtime/prompt-middleware/` modules, Extension/TUI registration, role metadata and sub schema additions, integration with current prompt assembly and permission guards, manifests/docs, and focused tests. No dependency or lockfile change is planned.
