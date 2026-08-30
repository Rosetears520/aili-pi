# Pi Web 0.8.9 → 0.8.11 source disposition inventory

This is the source-to-AILI three-way inventory for the immutable active Pi Web 0.8.11 evidence snapshot. It compares the historical `upstream/pi-web-0.8.9/` baseline, the active `upstream/pi-web-0.8.11/` baseline, and current AILI. A source anchor is evidence, not permission to copy a subsystem wholesale.

Disposition vocabulary is exact: **already-present**, **scoped-port**, **Gateway-adapt**, **deferred**, and **excluded**. Every selected item maps to an accepted implementation task. `AppShell`, `ChatWindow`, `ChatInput`, `SessionSidebar`, `rpc-manager`, `session-reader`, and global CSS remain AILI-owned merge boundaries.

## Selected presentation and read behavior

| 0.8.11 source anchor / symbol | Disposition | AILI boundary | Accepted task |
|---|---|---|---|
| `components/AnsiText.tsx`; extension widget/status call sites | scoped-port | Isolated bounded ANSI renderer; do not replace AILI timeline/chat shells | 4.1 |
| `components/ProviderIcon.tsx`, `public/provider-icons.svg` | scoped-port | Local sprite/fallback only; consolidate AILI icon presentation without a new dependency | 4.2 |
| i18n locale registry and Traditional Chinese messages | scoped-port | Merge all AILI-only Gateway, lease, Herdr, Prompt, Memory, footer, orb and questionnaire keys | 4.3 |
| Project information section in `components/AppShell.tsx` | scoped-port | Extract only the read-only directory-label/Git-branch/worktree presentation; no shell replacement or new absolute-path disclosure | 4.4 |
| config/extension modal scroll and mobile safe-area styles | scoped-port | Symbol/style-level merge preserving AILI footer, orb, questionnaire and mobile toolbar mounts | 4.5 |
| `components/SettingsUi.tsx`, `components/ToolDefinitionsPanel.tsx#getToolParameterFields` | scoped-port | Read-only projection only; toggles and writes remain absent until a Gateway capability exists | 4.6 |
| tail-page session reading in session reader/API/UI call sites | Gateway-adapt | Versioned BFF history read, first page ≤50, continuation ≤200, opaque expiring session-bound cursor; never copy direct session-file API ownership | 5.1 |
| lazy historical tool-result image extraction and image UI call sites | Gateway-adapt | Existing BFF media route and opaque handle; no raw session/entry identity in browser URLs | 5.2 |

## Existing AILI ownership retained

| Upstream behavior | Disposition | AILI owner / rationale | Accepted task |
|---|---|---|---|
| Session/project browsing, branch/fork distinction, file/Git read projections | already-present | Current BFF/read projections and AILI Git/Changes UI remain authoritative | preservation gate 1.6 |
| Foreground Agent turn, queue, compaction, model/thinking and event streaming | already-present | Runtime Gateway, writer lease and official Pi AgentSession composition remain authoritative | preservation gate 1.6; runtime tasks 3.2–3.6 |
| Responsive extension widgets and status surfaces | already-present | AILI timeline/runtime bar/footer mounts remain; only isolated ANSI rendering is selected | 4.1 |
| Native file dialogs and media validation | already-present | Existing native-dialog and BFF media owners remain | preservation gate 1.6; 5.2 |
| Herdr workers, Prompt Middleware and Observational Memory projections | already-present | Existing specialized Agent, prompt and memory owners are preserved | preservation gate 1.6 |

## Mutation surfaces requiring adaptation or sealing

| 0.8.11 source area | Disposition | Required result | Accepted task |
|---|---|---|---|
| `app/api/git/checkout/**` direct checkout | Gateway-adapt | Reject or translate to an explicit Gateway action after lease/access/root admission | 5.3 |
| `app/api/worktrees/**` POST/DELETE | Gateway-adapt | Reject or translate through the sole safe Worktree service; force removal is unreachable | 5.3 |
| Session rename/delete/fork/branch/model/thinking/queue mutations | Gateway-adapt | Keep current private request IDs, writer lease, disposition journal and Gateway owner; do not import direct browser RPC | preservation gate 1.6 / 5.3 |
| Provider, model, settings, plugin, skill and tool writes | deferred | Requires a separately accepted Gateway capability and privacy contract | 5.4 negative coverage |
| chat-only persistence and PowerShell preference writes | deferred | No accepted mutation contract | 5.4 negative coverage |
| push subscription/enrollment | deferred | Requires separate privacy and Gateway contract; no automatic enrollment | 5.4 negative coverage |

## Explicit exclusions

| 0.8.11 source subsystem | Disposition | Reason / retained owner | Accepted task |
|---|---|---|---|
| Built-in subagent profiles, runtime, API and UI | excluded | AILI Herdr/persistent-Agent is the sole child-Agent owner; no built-in subagent route or profile is imported | 5.4 negative coverage |
| Direct mutation routes and browser-owned RPC/session manager | excluded | A second direct mutation or AgentSession owner conflicts with Gateway, lease and private-ID contracts | 5.3–5.4 |
| Conventional launcher/process owner and upstream self-update | excluded | AILI foreground lifecycle and package identity are authoritative | 5.4 negative coverage |
| Running-session-list SSE replacement | excluded | Keep AILI visible-page polling and per-session stream contract | 5.4 negative coverage |
| Session-ID/entry-ID media URLs | excluded | BFF opaque media handles are mandatory | 5.2 |
| Worktree force removal, branch deletion, stash/discard/overwrite fallback | excluded | Dirty/untracked bytes must be preserved and unsafe fallback stays unreachable | 5.3 |
| Native Browser and Browser/E2E execution | excluded | Outside this change's authorization | test plan §1/§5 |

## Import and adaptation boundary

The active source snapshot is license/provenance evidence and a symbol-level port reference. It is not production Web source and is excluded from npm package contents. Selected code must be adapted through current AILI owners; no whole-file overwrite of large shared UI/runtime modules is authorized. Both snapshots retain the upstream MIT notice (`Copyright (c) 2026 agegr`) and are validated independently by file count and aggregate tree identity.
