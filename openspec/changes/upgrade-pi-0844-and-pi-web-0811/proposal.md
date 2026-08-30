## Why

The repository is pinned to official Pi 0.84.2 and Pi Web 0.8.9 while official Pi 0.84.4 and `@agegr/pi-web@0.8.11` are now available. The upgrade should adopt compatible fixes and read-side/UI improvements without replacing AILI's Gateway/BFF, writer lease, Herdr, Prompt Middleware, Observational Memory, or existing Web customizations.

## What Changes

- **BREAKING**: Raise the exact tested Pi development/runtime baseline from 0.84.2 to 0.84.4 across all official Pi packages, runtime guards, Web build manifests, tests, provenance and documentation.
- Lock the Pi 0.84.4 family to revision `b79e4cc834970cca69daebffab7df1da7d1e52c4` and package-specific npm integrity evidence; `sha512-jmOlrqUmvhh/siNWFRXjYLJzhKFIHNsAQaysRwzQPQFnPAaV/vhqHsLH/MBsIISA1Rjj7WTUFR3nJrpXoLx39w==` identifies `pi-coding-agent` only, not the entire family.
- Raise the Pi Web functional/source baseline from 0.8.9 to exact 0.8.11, recording npm gitHead `024be0b1154ba8a2650237a2db8bfa89124e167e`, release tag commit `28bab3c25f5f6770c9b0b745ebbfec1c27f7b948`, npm integrity `sha512-AUnw18qoSA5kvy5hz+Z+PIFqVrvnjM0FFnZjuE6n7TbvDhqIloeM4BbWpD0DUz9jenJYfgSZQxiRKjQxYY3yKg==`, npm tarball SHA-256 `69baa3d4dc9328924a8ae03d431ff3ea5e0a707e1c9aeb4708cf31dbb07cb834`, and Git tag archive SHA-256 `329ac758a3bd70916988f507f71938a9dc28e44bbcb772b5ef34c06dc1bc36a6`.
- Selectively port Pi Web 0.8.10/0.8.11 improvements: ANSI extension-widget rendering, local provider icons, Traditional Chinese, bounded session-history pagination, opaque lazy tool-result images, Project Info, scroll-safe extension dialogs, and applicable read-only settings/tool-definition presentation.
- Preserve AILI's sole Runtime Gateway/BFF mutation owner, private request IDs, writer lease, mutation disposition journal, access policy, native file dialogs, Git branch/Changes UI, AILI footer/orb/questionnaire, Herdr subagents, Prompt Middleware, Observational Memory and sealed legacy mutation facades. Existing direct `/api/git/checkout` and `/api/worktrees` mutations must be translated or sealed, and force Worktree removal is removed.
- Do not import Pi Web's built-in subagent runtime/profile APIs, direct browser-to-RPC mutation ownership, direct settings/skill/tool/Git/Worktree mutation routes, conventional launcher, or session-ID-bearing media URLs.
- Adapt Pi 0.84.4 additions where useful: `ui_prompt_start`/`ui_prompt_end` observability for InteractionBroker and Prompt Middleware, RPC `clear_queue`, official image MIME detection, and regression coverage for resume/newline, message ordering and new compaction sequencing. Do not replace AILI's existing prompt, retry, compaction, memory or Agent owners.
- Keep Native Browser deferred and separately authorized.

## Capabilities

### New Capabilities
- `pi-runtime-web-baseline-upgrade`: Exact Pi 0.84.4 and Pi Web 0.8.11 compatibility, selective upstream adoption, preservation guardrails, and upgrade verification.

### Modified Capabilities

None. This change supersedes version statements in the active change-local Pi Web contract while preserving its accepted mutation ownership and security behavior.

## Impact

- Dependencies/lockfile: four direct Pi dev packages plus resolved Pi client/protocol/telemetry packages; generated Web/provenance/SBOM outputs.
- Runtime/API: Pi event types, InteractionBroker UI-wait observability, RPC queue operations, media MIME handling and version guards.
- Web source: selected components/helpers/routes adapted behind the existing Gateway/BFF and read contracts; no wholesale overwrite of large AILI-owned files.
- Upstream evidence: migrate `upstream/web-source-locks.json` to an active/historical Pi Web lock model, add a new exact 0.8.11 source snapshot while retaining 0.8.9 history, update validators/notices/provenance, imported behavior inventory and preservation map; the new snapshot remains excluded from npm package contents.
- Tests: package/version, extension events, Prompt Middleware, InteractionBroker, compaction ordering, resume/newline, model metadata, Web session/media/pagination/i18n/ANSI/Gateway invariants, build and full regression.
- No publish, release, Git operation, Native Browser work, or external production mutation is included.
