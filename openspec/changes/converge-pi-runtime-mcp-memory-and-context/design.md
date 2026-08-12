# Design: Converged Pi Runtime

## Context

The current package has a stable persistent-Agent runtime, permission integration, quota integration and provenance generator, but its product surface is split across a runtime Extension plus separate header, Matrix and Zentui Extensions. Workflow data is still tied to an older local snapshot; Parent and Worker sessions have no common MCP runtime; task/hub have structured results but no custom renderer; the shipped package excludes the repository-retained AILI Compact implementation.

This design replaces those ownership splits without replacing the official Pi host or the persistent-Agent framework.

## Goals

- Consume one validated upstream Workflow runtime bundle.
- Provide the same configured MCP servers to Parent and Worker sessions without sharing mutable session state or widening permissions.
- Use one MemPalace Palace as the only durable memory.
- Make Agent allocation and execution visible at task/hub call time.
- Restore Pi-native theme, working and thinking while retaining a small status footer.
- Route each provider to exactly one compaction implementation: compatible Codex to pinned `pi-codex-compact`, all other providers to complete `billion-context-pi`.
- Preserve complete `pi-retry` classification/watchdog behavior while making failures explainable.
- Align the official Pi host/core/TUI baseline to `0.84.1`.
- Change the project’s primary license to MIT while preserving third-party obligations and reproducible release evidence.

## Non-goals

- Reimplementing MCP, MemPalace, CodeGraph, browser automation or Context7 protocols.
- Adapting or pruning `billion-context-pi` behavior, including its delegate tools.
- Migrating old SQLite/rose-memory data automatically.
- Automatically deleting legacy user configuration, Palace data, Matrix configuration or old APPEND_SYSTEM content.
- Making footer state a completion, billing or authorization authority.
- Changing Pi itself, provider APIs, authentication mechanisms, or native theme/working/thinking components.

## Architecture

### 1. Package composition

The package keeps `extensions/index.ts` as the AILI runtime entry. Independent visual Extensions for header, Matrix and Zentui leave `package.json#pi.extensions`. A new minimal footer module may be registered from the owned runtime entry or exposed as one narrowly scoped Extension, but it must use only public Pi UI APIs and must not install theme/editor/message/working overrides.

Runtime dependencies are installed and bundled according to Pi package rules. Package resources from a dependency are not loaded implicitly: AILI explicitly composes the `pi-mcp-adapter` factory into Parent and child session construction, and explicitly exposes the complete `billion-context-pi` Extension entry.

### 2. Workflow bundle consumer

Add `src/runtime/workflow-bundle/` with typed loader, validation and provenance modules. The loader resolves the pinned `rose-aili` package artifacts rather than copying them into a second handwritten manifest. It validates release version, source commit/provenance, schema compatibility and cross-file identity before returning an immutable bundle view.

Persistent role selection consumes role metadata and selection map from this validated view. The public selector catalog is the full canonical `rose-aili@0.4.7` inventory of 20 Specialized Agents, including the read-only `aili.solution-architect`; the Pi adapter must not retain a fixed 19-role assertion or silently exclude an upstream canonical role. Existing snapshots remain available only during implementation until equivalence tests pass. Deletion order is strictly:

1. load and validate the pinned bundle;
2. switch role/selection/protocol consumers;
3. pass focused runtime and generated-artifact verification;
4. remove obsolete snapshots, prompts and global-resource responsibilities.

A missing, mixed or incompatible bundle blocks affected Agent startup and doctor reports non-pass.

### 3. Shared MCP configuration and session factories

The default shared MCP path is resolved as `${XDG_CONFIG_HOME:-$HOME/.config}/mcp/mcp.json`; for the confirmed current environment this is `/home/rosetears/.config/mcp/mcp.json`. An explicit test/config override is permitted, but AILI must not create a second active MCP source.

Create `src/runtime/mcp/` for path resolution, adapter factory composition, permission bridge, status snapshots and doctor checks. The public `createMcpAdapter({ configPath })` factory is invoked separately for:

- the active Parent runtime;
- every created/revived persistent Worker session.

Worker MCP is added to the explicit child extension list; it is never obtained through ambient Extension discovery. Existing child approval/workspace guards remain installed, and forbidden coordinator extensions remain forbidden. Each AgentSession owns and disposes its adapter instance. Parent replacement, shutdown, Worker park/revive, failed prepare and cancellation paths must not retain transports or child processes.

MCP servers remain lazy unless their pinned server contract requires otherwise. Status uses the adapter’s machine-readable status event/snapshot and cannot connect a lazy server just to report health.

### 4. Permission bridge

AILI brokers MCP approval requests through the existing Pi permission/approval owner. Effective access is the intersection of:

```text
Parent active grant
∩ canonical role tool ceiling
∩ task tools/write/workspace scope
∩ Pi permission mode
∩ adapter/server exposed capability
```

The proxy tool and any promoted direct tool are subject to the same ceiling. A child cannot regain a hidden MCP tool through proxy search, scripting, resource exposure or a same-name collision. Headless approval-required calls fail closed.

### 5. Initial MCP server contracts

The shared configuration is previewed and written only under a separately approved external-write operation. Server commands use immutable versions or commits; floating `latest` is forbidden in the accepted configuration.

Frozen DEFINE identities are `pi-mcp-adapter@2.23.0`, `mempalace==3.7.0`, `@upstash/context7-mcp@4.0.2`, `@playwright/mcp@0.0.79`, and `@colbymchenry/codegraph@1.5.0`. BUILD must verify their published file/integrity/license/runtime inventory before mutation; an incompatible result is a material discovery rather than permission to float to another version.

- **MemPalace:** isolated Python tool installation; stdio command `mempalace-mcp --palace /home/rosetears/code/ai/.mempalace` under the fixed release. The equivalent `MEMPALACE_PALACE_PATH` remains available for clients whose config favors environment references.
- **Context7:** pinned `@upstash/context7-mcp@4.0.2`; secrets, if used, remain environment/credential references rather than committed values.
- **Playwright:** pinned `@playwright/mcp@0.0.79`; browser installation/download is a separate approved operation and is not hidden in package startup.
- **CodeGraph:** only `https://github.com/colbymchenry/codegraph`, package `@colbymchenry/codegraph@1.5.0`; CLI/MCP command and project initialization are separately approved. No curl-pipe installer is used by automated BUILD.

Doctor reports installed/configured/available states without installing, indexing, initializing a Palace, launching a browser or downloading an embedding model.

### 6. MemPalace mapping

There is one Palace. A deterministic normalized project identity maps each trusted project to one Wing; cross-project reusable facts map to `shared`; a stable AILI Agent may map to a diary within its project/shared scope. Exact supported names and commands come from the selected MemPalace release.

AILI does not mine transcripts automatically. Memory reads and writes occur only through MCP tools under ordinary permission and operation gates. AgentSession JSONL remains hot execution context. When MemPalace is absent or failed, tools and doctor report unavailable; no local fallback is created.

### 7. Task/hub preflight and rendering

Selector, role profile, requested/effective model, provider authentication/availability and thinking compatibility are resolved before durable Agent/job/turn allocation. Batch preflight is atomic. Effective model is frozen for the allocated turn and revalidated before provider request without silently changing identity.

Add stable, redacted display metadata to task/hub details. Both top-level definitions in `registerPersistentAgentTools` and nested definitions in `childToolDefinitions` use the same renderer helpers. Renderers consume structured details, never parse JSON content.

Compact task layout:

```text
TASK · <name> · <selector> · <provider/model> · <status>
<bounded assignment summary>
```

Before allocation, unavailable fields are omitted rather than fabricated. Expanded output carries requested/effective model, model layer, thinking, Agent/job/turn IDs and references. `hub` renders action plus target identity. Summaries are single-line, credential-redacted and width bounded. Renderer failures fall back to Pi’s normal tool renderer without changing execution.

### 8. Native UI and footer

Remove Matrix registration and source, the custom header/theme resources, Zentui editor/message/thinking/footer ownership and associated settings. Do not call `setWorkingVisible(false)` or replace the working indicator. Do not patch Pi component prototypes.

A minimal footer uses `ctx.ui.setFooter()` and reads only public footer/session/model/status data. Required high-priority fields are current model, Codex quota when published by `pi-quota-status`, quota reset/update age when present, and current local time. Context, git/cwd and package/update status are optional when reliably available without introducing a second update client.

Narrow-width degradation drops optional fields first, then timestamps, while preserving model and the most material quota state. Time refresh is at most once per minute. Other status changes request render only when their value changes. All timers/listeners are disposed on session shutdown/replacement. AILI does not perform package-version network polling; Pi remains update owner.

### 9. Codex Remote V2 and complete provider-routed context runtime

Preserve the complete source tree from `billion-context-pi@0.1.34`, gitHead `558a83a9db695571339d693ab75129c2f13a324c`, MIT, in a clearly separated upstream-owned boundary with repository structure, tests, docs, license and attribution intact.

Use an exact BUILD-verified release of `@narumitw/pi-codex-compact` (current observed candidate `0.50.0`, MIT) for compatible `openai-codex` models. Prefer the published dependency plus the thinnest ownership/router adaptation over copying its implementation. If Pi package composition cannot enforce one Codex owner without source adaptation, stop for material discovery rather than silently forking the package.

The provider router selects `pi-codex-compact` only when provider/API/model compatibility is exact. Every other provider—including direct `openai`, Azure, custom OpenAI-compatible endpoints and non-OpenAI providers—uses `billion-context-pi`. On compatible Codex turns, ACP context projection, nudges, compression ownership and unconditional `session_before_compact` cancellation are bypassed, while independent `acp_delegate*` tools remain registered. Model switching clears provider-specific ephemeral state before the next provider turn.

The Codex runtime owns automatic/manual Remote Compaction V2, opaque checkpoint persistence, exact marker replacement and repeated compaction. Replay requires compatible provider/API/model identity, exactly one expected marker, valid bounded checkpoint data and matching retained-message fingerprints. Mismatch does not guess or inject. Pi's built-in Codex provider continues to own ordinary transport. Successful remote compaction does not add a parallel plaintext summary; remote failure uses the package's truthful Pi-native fallback.

The upstream retained-user-history default remains the baseline until representative long-session evidence supports changing it. A 32K budget is a test candidate for speed/token optimization, not an accepted default. Extension-owned remote retries must be configured to zero or otherwise proven to delegate to one Pi-owned retry budget/backoff loop without duplicate attempts.

`algal/pi-openai-server-compaction` is excluded from production, dependency, vendoring and hook ownership in this change. Its direct OpenAI continuation/WS and hybrid portable-summary approaches remain recorded in `compaction-decision.md` for a later provider-specific change.

Remove every AILI Compact production source, command/config/documentation/script/test that claims current ownership, plus stale registry/doctor/provenance/package exclusions. Historical OpenSpec artifacts remain as history. Package/runtime validation proves exactly one active compaction owner for each provider family.

The ACP delegate remains a separate spawned Pi process with upstream cwd, role-tool, nesting, wait/cancel and result-file semantics. It is not a formal persistent Agent and does not inherit AILI task package/write/workspace audit claims. If Pi 0.84.1 permission interception cannot enforce the accepted non-formal boundary, BUILD stops as material discovery rather than silently weakening or deleting upstream behavior.

### 10. Complete explainable provider retry

Vendor the complete published source of `@narumitw/pi-retry@0.31.0` (gitHead `3ad2c94970132353fc869cd2297b017465740791`, MIT), preserving its unknown-detail, Codex websocket-limit, explicit Codex retry, stall watchdog, Pi retry-policy, status and timer cleanup behavior. Record that the current upstream monorepo later deprecates the package.

Pi `0.84.1` remains the sole retry loop, budget and backoff owner. The absorbed extension only classifies known transient errors and watchdog-triggered stalls. AILI adds one bounded structured error status/renderer/diagnostic record containing provider/model, category, sanitized original cause, retryable decision, attempt and next delay when the Pi event exposes them, and exhausted/cancelled terminal state. Raw secrets, headers, payloads and unbounded provider text are excluded.

Classification is idempotent. An error already tagged is not tagged again; a watchdog abort cannot be confused with user cancellation; disabled Pi retry prevents watchdog abort; unmatched errors remain ordinary errors. Footer may show receiving/retrying briefly, but the transcript/expanded diagnostic preserves why.

### 11. Pi 0.84.1 baseline

Update all official Pi core/AI/coding-agent/TUI declarations, compatibility specs, docs, tests and generated evidence from `0.82.1` to exact `0.84.1`. Current runtime inspection confirms the active installed Pi is `0.84.1`. Every vendored integration is typechecked and seam-tested against that baseline; widening a stale upstream peer range without evidence is forbidden.

### 12. License and provenance

Change root `LICENSE`, package metadata and README to MIT under repository-owner authorization. Audit every retained source path before changing headers or claims. Third-party MIT, Apache-2.0 and other licenses remain separate.

Extend provenance input and generation so each copied, adapted or bundled source records immutable identity, license, local boundary and verification. Regenerate `THIRD_PARTY_NOTICES.md` and SPDX SBOM from canonical inputs. Real `npm pack` inventory must prove required bundled code/licenses are present and retired AILI-owned/theme/compact resources are absent.

## Migration behavior

- Existing shared MCP configuration is inventoried and previewed with redacted values. Same-name conflicts block; no credential values are printed or moved.
- Writes back up the destination and preserve rejected source configuration. No OpenCode host config is rewritten.
- Existing Palace data is preserved; initialization, imports and mining are separate operations.
- Legacy Matrix/theme/AILI Compact settings become ignored historical files and are not automatically deleted.
- Legacy APPEND_SYSTEM markers are reported with manual cleanup instructions; deletion remains separately approved.
- AILI Compact persisted session entries remain readable historical Pi entries but no AILI Compact runtime replays or projects them.

## Failure semantics

- Invalid Workflow bundle: block affected runtime; doctor non-pass.
- Invalid MCP config: MCP unavailable; non-MCP operation may continue.
- One MCP server failure: report that server failed without claiming all MCP failed; dependent operation fails.
- MemPalace unavailable: memory-dependent operation fails closed; no fallback.
- Model/selector preflight failure: zero durable allocation, including atomic batch failure.
- Footer data unavailable: omit or label unavailable; never stale-success.
- Provider router ambiguity, Codex marker/fingerprint mismatch, or double ownership: fail before unsafe compaction/context mutation; do not let two owners handle one provider turn.
- Retry classification failure: preserve the original provider error and do not manufacture a retryable result.
- Provenance/license/package inventory mismatch: release validation fails.

## Verification strategy

Focused automated verification covers pure config resolution, bundle validation, permission intersection, session factory isolation/disposal, task/hub renderer states/redaction, UI resource absence, footer degradation/timer cleanup, provider-router exclusivity, complete billion-context inventory, Codex Remote V2 marker/fingerprint/repeated-compaction/fallback behavior, retry taxonomy/idempotence/watchdog cleanup, Pi 0.84.1 seams, package/license/provenance generation and tarball inventory.

Separately approved integration probes cover Parent/Worker MCP calls, MemPalace at the configured Palace, Context7 retrieval, Playwright browser operation, CodeGraph query after explicit project initialization, Codex Remote V2 compaction/replay, representative direct-OpenAI and non-OpenAI ACP sessions, retryable/error/stall behavior, and real TUI native working/thinking/footer behavior. Passing unit tests alone cannot establish external installation, credential, browser, embedding, quota-header, provider reliability or subjective TUI claims.

## Risks and dispositions

- **Two delegation systems:** accepted product decision; docs distinguish `task`/`hub` from `acp_delegate*` and do not claim one lifecycle.
- **Worker resource leaks:** session-owned factories and disposal tests on every existing park/revive/shutdown/failure seam.
- **Tool permission bypass:** one approval bridge and effective intersection applied to proxy, direct, script and resource origins.
- **Upstream context collision:** exact Codex-versus-ACP routing, one-owner hook validation, exclusion of algal production hooks and removal of all AILI Compact hooks.
- **Footer repaint cost:** minute clock and change-driven quota/status rendering only.
- **License drift:** generated notices/SBOM plus real package inventory and exact pins.

## Unverified until BUILD operations are authorized

Runtime compatibility of the final pins, actual user configuration contents, Palace health, browser availability, embedding downloads, CodeGraph project initialization, provider-backed OpenAI/Codex compression and real terminal behavior remain unverified. They are operation-gated evidence, not reasons to guess or silently install during DEFINE.
