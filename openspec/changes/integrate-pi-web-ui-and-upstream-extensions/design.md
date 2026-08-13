## Context

This change adds a browser workbench to the existing single `@rosetears/aili-pi` package and absorbs four Pi extension capabilities. The locked functional and source baseline is `@agegr/pi-web@0.8.8` at git revision `5a53c18ca9328400a3dfb8c48c1e4f343b3e4903`. Codex, `pi-gui`, and OpenCode remain visual or interaction references only.

The baseline already supplies useful, proven patterns:

- a foreground `pi-web` CLI that launches packaged Next.js output;
- direct read-only Pi JSONL browsing through `SessionManager` without creating an `AgentSession`;
- lazy in-process `AgentSession` creation for mutations;
- a hot-reload-safe runtime registry, startup coalescing, idle cleanup, and process signal cleanup;
- HTTP command routes plus per-session SSE and browser-side reconnection/reconciliation;
- session, branch/fork, model, provider, skill, plugin, file, Git, Worktree, media-preview, and responsive workbench surfaces;
- Host/Origin checks, optional Basic Auth, and canonical allowed-root checks.

The baseline cannot be adopted unchanged. It has no cross-process first-writer lease, its event stream lacks a versioned epoch/sequence/gap protocol, SSE attachment can create a live `AgentSession`, non-loopback startup warns rather than fails closed, and its Worktree API supports force removal. Those behaviors conflict with the accepted AILI contract.

Pi `0.84.1` also has no universal public pre-mutation veto and no live external-JSONL observer reload for stock TUI. The accepted behavior is therefore asymmetric: a TUI-owned session may be observed by Web, while a Web-owned session rejects stock-TUI attachment until Web releases or exits.

## Goals / Non-Goals

**Goals:**

- Keep one npm package, one Pi Extension entry, official Pi `0.84.1`, and Pi JSONL as conversation truth.
- Adapt the locked Pi Web source and behavior rather than design a separate Web product.
- Provide on-demand foreground `pi-web` and Pi `/web` startup.
- Enforce one writer for each shared session and preserve the accepted stock-TUI asymmetry.
- Expose versioned browser contracts instead of binding UI routes directly to private Pi or AILI objects.
- Absorb Analytics, BTW, Stamp, and Worktree behind AILI-owned Runtime/API services while retaining important TUI entry points and complete first-release Web surfaces.
- Provide fourteen AILI AI-process component categories with license-safe source handling, reduced motion, and bounded animation.
- Preserve AILI Agent, MCP, provider/context, permission, memory, and Pi-native media ownership boundaries.

**Non-Goals:**

- Forking Pi, replacing the stock TUI, or creating another model/Agent/MCP runtime.
- Running a daemon, scheduler, remote Agent fleet, multi-user service, cloud sync, plugin marketplace, general terminal, or full browser IDE.
- Claiming direct public-Internet support or implementing TLS termination.
- Copying Codex, `pi-gui`, OpenCode, locked AIcss source, or AIcss source whose redistribution rights are not established.
- Replacing the existing Pi-native WSL clipboard path; Web media processing is a separate browser entry path that converges only on validated Pi image content.

## Decisions

### 1. Adapt the locked Pi Web baseline behind an AILI Session Runtime Gateway

The Web source, Next.js app structure, foreground launcher, JSONL readers, lazy `AgentSession` construction, UI components, and relevant tests will be imported from the exact locked Pi Web revision during authorized BUILD. AILI will add a transport-neutral Session Runtime Gateway between browser routes and mutable runtime services.

The gateway is a per-session composition root, not a second process-global Agent framework. It owns:

- session projection and mutation admission;
- writer lease state;
- versioned snapshots and events;
- capability routing for Pi, Agent, MCP, Analytics, BTW, Stamp, Worktree, and Web media;
- permission, path, authentication, Origin, and stale-generation checks.

Browser routes become a BFF over gateway contracts. They do not call persistent-Agent journals, MCP adapters, filesystem mutations, or private Pi objects directly.

**Alternative considered:** importing Pi Web unchanged and adding checks to its routes. Rejected because policy would remain fragmented and would not safely coordinate stock Pi and a Web process.

**Alternative considered:** a permanent broker/daemon. Rejected because it violates foreground lifetime and no-daemon decisions.

### 2. Preserve Pi JSONL as the only conversation-history truth

Read-only session browsing continues to use the Pi Web pattern of reading JSONL through Pi `SessionManager` helpers without creating an `AgentSession`. Transcript content is not duplicated into a durable Web database or event log.

A mutation owner creates exactly one official Pi `AgentSession` adapter after acquiring the writer lease. AILI services persist only their separately defined out-of-context metadata or sidecars.

### 3. Enforce an asymmetric first-writer lease

A versioned lease sidecar is associated with the canonical session and uses atomic acquisition. It records an opaque generation, owner surface, process identity and start fingerprint, liveness endpoint identity, heartbeat, active-turn state, and timestamps. It contains no password or browser secret.

Every mutation carries the expected runtime epoch, lease generation, request ID, and command. Admission revalidates authentication, Origin, allowed root, permission/capability, session leaf, request freshness, and lease ownership immediately before invoking Pi or another mutating service.

- When stock TUI acquires first, the Extension exposes an authenticated owner-only local projection endpoint and Web attaches as a live read-only observer.
- When Web acquires first, the Extension detects the conflicting lease during `session_start` and requests graceful shutdown or otherwise blocks the TUI runtime before accepting user mutation.
- Explicit idle release is immediate.
- Unexpected disconnect enters a short bounded recovery grace period.
- Active turns remain owned until settled or, after owner death is proven, durably marked interrupted.
- No force-steal API exists.

The exact grace duration is an implementation constant selected and verified in BUILD; changing the behavior above requires DEFINE write-back.

### 4. Use versioned snapshot and ordered event contracts

The gateway exposes:

- `RuntimeSnapshotV1`: contract version, runtime epoch, opaque session handle, last sequence, writer state, capability matrix, and bounded projections.
- `RuntimeEventV1`: contract version, runtime epoch, monotonic sequence, timestamp, opaque session handle, source, type, and validated payload.
- `MutationEnvelopeV1`: request ID, client identity, expected epoch and lease generation, command type, and validated arguments.

Initial connection returns a snapshot. SSE resumes from a cursor within a bounded in-memory replay window. Unknown epoch, stale generation, or a cursor gap returns a reset instruction and replacement snapshot. Old events and responses cannot overwrite newer state. Slow clients are disconnected with a reset-required disposition rather than receiving an unbounded queue. A bounded mutation disposition journal deduplicates identical in-flight and completed requests across every mutation family; request-ID collisions fail closed, and an unknown non-idempotent outcome after crash requires authoritative reconciliation rather than replay.

This adapts Pi Web's SSE, readiness handshake, heartbeat, run ID, visibility reconciliation, and stale-response protection while adding the missing explicit protocol.

### 5. Keep Web startup foreground and package-owned

The package adds a `pi-web` executable and `/web` Pi command.

- `pi-web` runs the packaged Web build in the foreground, owns signal handling, and exits with its child/server.
- `/web` spawns the same executable as a non-detached child owned by the Pi process, reports or reuses its address for that Pi process, and terminates it during Pi shutdown.
- Bootstrap identity and sensitive setup data use an inherited private channel or protected file, not argv.
- Ordinary package installation or Pi startup starts no server and loads no Web source into model context.

The imported Pi Web launcher pattern is retained where compatible, including direct Node invocation of the Next CLI and explicit packaged build checks. Automatic browser opening remains an operator-facing startup option, not a background process.

### 6. Strengthen Web access controls before listening

Loopback is the default. A non-loopback bind is rejected before listening unless all of these are configured and valid:

- password authentication;
- an exact Origin/Host policy;
- one or more canonical allowed roots.

AILI adapts Pi Web's Host/Origin checks and lexical-plus-realpath containment as its base. Mutating routes additionally use authenticated same-site sessions, request/body bounds, content-type checks, and operation-specific revalidation. Passwords and bootstrap secrets never enter argv, logs, Analytics, sessions, browser persistent storage, or package defaults.

Direct public-Internet support and HTTP password confidentiality are not claimed; operators provide HTTPS or a trusted VPN outside this package.

### 7. Absorb four capabilities as AILI-owned services

**Analytics** uses versioned content-free append segments, bounded-cardinality identifiers, multi-process serialization, atomic segment finalization, corruption quarantine, coordinated cleanup, and streaming aggregation. An opaque per-session scope is stored as a Pi custom entry outside model context. Storage exposes queries, total size, time-range deletion, and complete deletion. It rejects prompt/reply/thinking text, tool arguments/results, raw errors, credentials, cwd, paths, titles, labels, and raw session identity.

**Stamp** writes bounded versioned Pi custom entries outside model context for timestamps, response and tool timing, Pi-reported usage/cost, and categorized outcomes through the owning serialized session mutation path; invalid or unsupported entries are ignored without rewriting unrelated Pi JSONL. It does not relabel estimated or unavailable values as provider-measured facts.

**BTW** owns ephemeral in-memory side threads with independent model/thinking settings, queued steering, and explicit preview before bring-to-main. It never implicitly mutates the main conversation and is not recovered after process loss.

**Worktree** absorbs status/add/switch/remove/prune/configure and session-replacement behavior but routes mutations through AILI preflight and revalidation. It uses argv-safe Git execution, canonical roots, repository-level serialization, active-session/Agent checks, and never exposes force removal or branch deletion. The baseline's `force` DELETE path is intentionally not retained.

Each capability must have its retained important TUI entry points, Runtime/API service, and Web UI before first release.

### 8. Project existing Agent, MCP, context, and media owners

The Web UI consumes bounded projections from existing AILI owners:

- persistent-Agent task/hub status and bounded output/history;
- MCP connection/status snapshots without exposing raw config, environment, credentials, or tool arguments;
- provider-routed context and retry state without creating a browser-owned retry loop;
- Pi-native session/model/thinking/context state.

Web media upload validates bounded bytes and converts them to official Pi image content. It does not replace or rewrite the existing Pi-native WSL clipboard implementation.

### 9. Keep AI process components license-safe and accessible

The frozen component inventory is Thinking State, Thinking and Reasoning, Orbs, Web Search, File Diff, Image Generation, Text Response, Streaming Text, Inline Citations, Code Block, To-do List, Data Table, Comparison Table, and AI Agent Input. These fourteen semantic categories are implemented with one default Orb, explicit semantic states, reduced-motion alternatives, offscreen/background pausing, and bounded animation work.

AIcss source is imported only if explicit evidence permits source inclusion and public npm/MIT redistribution. Otherwise none of the free or locked source is copied and all fourteen categories are independently implemented from public visual/behavior references. Hidden chain-of-thought, credentials, prompts, and private tool payloads are never rendered as process detail.

### 10. Lock source and packaging provenance

Authorized BUILD imports exact immutable snapshots for Pi Web and the four narumitw packages, with URL, version, revision, license, copyright, adaptation notes, and machine-readable lock evidence. The released package does not depend at runtime on those five npm packages.

Package validation must cover the new executable, generated Web output, notices, SBOM, source locks, packed contents, clean install, and foreground startup. The hard-coded provenance source inventory must be generalized rather than bypassed.

## Risks / Trade-offs

- **Stock Pi observation is asymmetric** → make Web-owned stock-TUI attachment visibly fail closed; never advertise unsupported read-only attachment.
- **Lease recovery may misclassify a live process** → combine generation checks, process-start fingerprint, heartbeat, private liveness endpoint, complete grace period, and atomic recovery.
- **Pi Web source may drift from its published package** → bind import and adaptation evidence to the exact accepted revision and separately verify packed output.
- **Next.js increases package size and dependency surface** → accept the installation footprint, package only runtime build/assets, and prove no eager server/model-context load.
- **SSE can miss or reorder state across reconnects** → epoch/sequence/cursor validation plus reset snapshots and stale-response rejection.
- **Analytics can grow indefinitely** → content-free append format, bounded-memory aggregation, size visibility, explicit cleanup, and long-running profiling; exact figures remain Unverified until measured.
- **Filesystem or Git routes can escape intended roots** → preserve Pi Web's lexical and realpath containment, then revalidate immediately before mutation.
- **Reference UI can imply hidden reasoning** → expose only observable process state and explicitly exclude chain-of-thought and private payloads.
- **AIcss redistribution rights may remain unclear** → independently implement all fourteen categories and copy no AIcss source.
- **Absorbed Worktree behavior differs from upstream** → document that complete relevant capability excludes unsafe force removal and branch deletion under the accepted AILI boundary.

## Migration Plan

1. Add source locks, notices, SBOM/provenance support, and exact upstream snapshots under separate source-import and dependency authorization.
2. Introduce gateway contracts, projections, lease storage, and compatibility validation without enabling Web startup.
3. Add foreground process lifecycle, security preflight, BFF routes, SSE protocol, and packaged Web baseline.
4. Integrate the Pi Web workbench against gateway contracts.
5. Add BTW first, then Analytics and Stamp, and safe Worktree when it does not delay those paths; deliver retained Pi TUI usability and deterministic local tests before their deferred Runtime/API/Web parity.
6. Resume foreground Pi Web composition last, then connect deferred Runtime/API/Web parity for the absorbed capabilities.
7. Add Agent/MCP/context/media projections and fourteen AI process components.
8. Run package, multi-process, browser, security-boundary, WSL2, and long-running Analytics verification.
9. Rollback by stopping foreground Web processes and removing the executable/build in a later authorized change; preserve existing JSONL, unknown custom entries, Analytics segments, and Agent sidecars rather than destructively rewriting user data.

## Open Questions

- Exact Analytics memory, disk-growth, event-buffer, and animation-cost measurements are `Unverified` until BUILD profiling.
- Exact retained upstream TUI command names and imported file inventory will be derived immediately after authorized source import into a reviewable included/excluded behavior inventory; dependent adaptation tasks remain blocked until ROSE dispositions that inventory against the already accepted capability boundaries.
