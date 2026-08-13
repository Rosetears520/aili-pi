## Why

`@rosetears/aili-pi` currently has no browser workbench and does not own the Analytics, BTW side-thread, Stamp/timing, or safe Worktree surfaces the user wants across Pi TUI and Web. This change adds one version-locked Web UI and absorbs those four upstream capabilities without creating a second Agent runtime, duplicating session truth, or importing reference-only UI architectures.

## What Changes

- Ship a complete AILI Web UI inside the existing `@rosetears/aili-pi` npm package, using `agegr/pi-web` as the sole code and functional base.
- Add on-demand foreground `pi-web` and Pi `/web` entry points; ordinary package or Pi startup does not start a Web server or inject Web assets into model context.
- Share Pi JSONL history and live AILI/Pi runtime state between TUI and Web through a versioned snapshot/event API and a first-writer session lease.
- Default Web access to loopback and fail closed for non-loopback startup unless password authentication, Origin validation, and allowed-root/path enforcement are active.
- Absorb the complete relevant behavior, privacy/safety boundaries, and important TUI entry points of `pi-analytics`, `pi-btw`, `pi-stamp`, and `pi-worktree` behind AILI-owned Runtime/API modules, with corresponding Web UI behavior required before the first release.
- Add content-free, append-oriented Analytics with bounded-memory aggregation, opaque per-session scopes outside model context, indefinite local retention until explicit cleanup, size reporting, and time-range/all deletion.
- Add fourteen semantically mapped AI process component categories, one default Orb, reduced-motion behavior, and bounded animation cost. AIcss source is copied only if public redistribution rights are evidenced; otherwise every category is independently implemented by AILI. Locked/private source and account tokens are excluded.
- Import exact locked MIT source revisions only during separately authorized BUILD work, preserve copyright/license/source/revision/provenance evidence, and avoid runtime dependencies on the five absorbed upstream npm packages.
- Retain official Pi `0.84.1`, Node.js `>=22.19.0`, MIT primary licensing, one owned Pi Extension entry, and the existing `aili-workflows` semantic-ownership boundary.
- Revise `AILI Web UI 详细设计与实施方案.md` so Codex, `pi-gui`, and OpenCode are explicitly visual/interaction references only and the accepted package, runtime, security, data, license, and release boundaries are authoritative.

## Capabilities

### New Capabilities

- `pi-web-package-and-process-lifecycle`: Single-package Web delivery, on-demand foreground startup, process ownership, and no incidental model-context inclusion.
- `shared-pi-session-web-runtime`: Shared Pi session truth, first-writer leasing, read-only observers, safe release, and crash recovery.
- `web-runtime-access-security`: Loopback defaults plus fail-closed non-loopback authentication, Origin, and allowed-root/path controls.
- `versioned-runtime-web-api`: Runtime snapshots, ordered events, reconnect/gap recovery, stale-event rejection, and capability-gated mutation APIs.
- `aili-web-workbench`: Pi Web baseline features plus AILI Timeline, sidebars, runtime status, truthful Agent/MCP inspection, media, and first-release surface boundaries.
- `local-content-free-analytics`: Privacy-bounded local Analytics, opaque attribution, retention, cleanup, and bounded resource behavior.
- `ephemeral-btw-side-threads`: Ephemeral independent side threads with explicit previewed bring-to-main behavior and no implicit main-session mutation.
- `session-stamp-and-timing`: Versioned out-of-context timestamps, response/tool timing, bounded metadata, and Pi-reported usage/cost.
- `safe-pi-worktree-management`: Safe Worktree status and lifecycle operations with exact preflight/revalidation and no force removal or branch deletion.
- `ai-process-components`: Fourteen AI process component categories, source-license fallback, reduced motion, one default Orb, and hidden-reasoning protection.
- `upstream-source-provenance`: Exact source locking, MIT/notice/SBOM treatment, adaptation boundaries, and reviewed future imports.

### Modified Capabilities

- None. The repository has no canonical baseline specs under `openspec/specs/`; overlap with earlier change-local contracts is handled as design/verification convergence rather than inventing a second modified capability authority.

## Impact

- **Package/runtime:** `package.json`, the npm tarball, the sole Pi Extension entry, runtime component registration, new foreground CLI/command startup, and exact Pi compatibility validation.
- **Web application:** version-locked Next.js/React application source and assets derived solely from the locked `agegr/pi-web` baseline.
- **AILI runtime/API:** shared session/event projection, writer leasing, access controls, Analytics, BTW, Stamp, Worktree, Agent/MCP projections, and media integration boundaries.
- **Dependencies and provenance:** future dependency/lockfile changes and source imports require separate authorization; notices, locks, SBOM, and real packed-install evidence must cover all copied/adapted sources.
- **Testing:** unit and integration contract coverage, package/install startup proof, browser/E2E verification in a repository-local location selected during DEFINE, WSL2 smoke where applicable, security boundary checks, long-running Analytics profiling, and a four-capability first-release matrix.
- **Non-goals:** no Pi fork or replacement CLI, multi-user service, direct public-Internet support claim, cloud sync, full browser IDE/terminal, plugin marketplace, large Agent graph, remote Agent fleet, complete mobile parity, MCP configuration editor, hidden daemon, or copied Codex/`pi-gui`/OpenCode runtime/source.
