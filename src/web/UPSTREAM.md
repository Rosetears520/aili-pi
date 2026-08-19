# Pi Web 0.8.9 adaptation boundary

This directory is the AILI-owned adaptation of the exact MIT source snapshot at `upstream/pi-web-0.8.9` (`@agegr/pi-web@0.8.9`, revision `febcba5e33e5eef9bf7f092099105c5dfea742ff`). Pi Web remains the sole Web code/function base.

| Locked Pi Web source | AILI adaptation |
|---|---|
| `components/AppShell.tsx`, `SessionSidebar.tsx` | `components/AiliWorkbench.tsx`, responsive independent sidebars and project/session tree |
| `components/AppShell.tsx` | top-bar Changes button (`/changes` in a reused tab), `AiliQuotaOrb`, `AiliKeybindSettings` mounts, workspace identity via `projectKey`/`workspaceKeyOf` |
| `components/ChatWindow.tsx`, `ChatInput.tsx` | structured Timeline, bounded composer, distinct Queue Next and Steer controls |
| `components/ChatWindow.tsx` | direct `set_perm_mode` RPC switching (no prompt pipeline), `/perm` echo suppression, AILI keybind events (`aili:mode:cycle`, `aili:changes:open`, `aili:btw:open`), oversized/non-image drop-to-path split, `aicss/Orb` activity indicators for agent/bash phases, `aicss/ApprovalCard` for confirm/select extension dialogs (input/editor keep the plain dialog) |
| `components/ChatInput.tsx` | `AiliPermChip`, `AiliFilePicker` (Plus button), `AiliBtwDialog`, aicss composer restyle (`aili-composer*`), paste/drop image-attach vs upload-and-insert-path split through `/api/aili/upload` |
| `components/MessageView.tsx` | `ThinkingBlock` restyled as the aicss thinking-state + thinking-reasoning adaptation (`.aili-thinking*`, `.aili-shimmer`): shimmering label while live, "Thought for Ns" summary, chevron collapsible body |
| `components/MarkdownBody.tsx` | comparison-cell coloring: bare ✓/✗/yes/no/true/false/是/否 cells map to `.aili-cell-yes`/`.aili-cell-no` (own values on theme variables after the AIcss locked-component audit); GFM task lists render as the vendored `aicss/TodoList` card; local-file links gain numbered citation chips with a source footer (AILI-owned `.aili-cite-*`, replacing the paid-locked AIcss inline-citations component); streaming messages end with the `aicss/StreamingText` caret |
| `components/aicss/**` | verbatim-vendored AIcss free components only (2026-08-18 owner authorization + free/locked audit, provenance in `aicss/README.md`): `ApprovalCard` backs the ExtensionDialog confirm/select approval surfaces, `Orb` animates the agent phase and bash-running indicators, `TodoList`/`StreamingText` power the markdown integrations |
| `hooks/useAgentSession.ts`, `components/AiliQuestionnaire.tsx`, `components/ChatWindow.tsx`, `lib/types.ts`, `lib/pi-types.ts`, `lib/rpc-manager.ts` | AILI Unified User Interaction: the model-facing `questionnaire` tool (core absorbed byte-exact from PiCraft, MIT — `src/questionnaire/`, `upstream/picraft-questionnaire-55642c8/`) reaches the web through a dedicated `extension_ui_request` method `"questionnaire"`; `AiliQuestionnaire` renders all questions on one ApprovalCard-styled card (radio/checkbox/custom input), never auto-dismisses, and returns structured `{answers}`; plain `select/confirm` dialogs are unchanged |
| `lib/i18n/messages/en.ts`, `zh-CN.ts` | added `i18n.thoughtFor` ("Thought for {seconds}s" / "思考了 {seconds} 秒") for the settled thinking summary |
| `components/BranchNavigator.tsx` | branch tree helpers and explicit Branch/Fork contracts in `workbench-model.ts` |
| `components/ModelsConfig.tsx`, `SkillsConfig.tsx`, `PluginsConfig.tsx` | bounded catalog resources and capability-gated BFF commands |
| `components/FileExplorer.tsx`, `FileViewer.tsx` | opaque file resources, Git diff, and BFF-only media previews |
| `hooks/useAgentSession.ts`, `lib/agent-client.ts`, event helpers | `gateway-client.ts` and `runtime-projection.ts` over `RuntimeSnapshotV1`, `RuntimeEventV1`, and `MutationEnvelopeV1` |
| `hooks/useDragDrop.ts`, `lib/image-attachments.ts` | byte-sniffed bounded upload/paste/drop and official Pi image conversion in `media.ts` |
| `lib/rpc-manager.ts` | `set_perm_mode` case invoking the `/perm` handler in-process through `_tryExecuteExtensionCommand` |
| `lib/allowed-roots.ts`, `lib/file-access.ts`, `app/api/files/[...path]/route.ts` | `AILI_WEB_FILE_ROOTS` startup roots with `~` expansion and WSL `/mnt/[a-z]` drvfs/9p mounts; `@types/node` 24 stream adaptation |
| `components/MermaidBlock.tsx` | `CodeBlock` restyled as the aicss code-block adaptation: ring-outlined 12px card, `</>` + language header, icon+text copy button (`is-copied` state), 32px line-number gutter with a hairline divider; Prism highlighting, streaming fast path, and the mermaid preview/source toggle kept |
| `app/globals.css` | AILI sections: `aili-chip/menu/quota/diff/composer/btw/picker` + aicss file-diff, and AILI round 3 — markdown tables as the aicss data-table + comparison-table adaptation (`.markdown-table-wrap`, `.aili-cell-yes/no`) and the thinking block styles |
| PWA, responsive, i18n source | `app/**`, `public/**`, `i18n.ts`, and `app/globals.css` |

The adaptation intentionally does not copy upstream direct RPC/`AgentSession` ownership, direct filesystem/Git mutation routes, force Worktree removal, branch deletion, or Pi Web self-update. Browser routes under `app/api/runtime/v1` delegate to `PrivateWebBff`; the server bridge has no private service fallback.

Upstream 0.8.9 deltas absorbed in-place (no adaptation conflict): streamed tool-call argument display, tool execution progress labels, centered floating notices, Prism `span.token.table` inline fix, project-command environment isolation (`lib/project-command-env.ts`), normalized project identity (`lib/project-identity.ts`, `workspaceKeyOf`), guarded model provider responses, and ambiguous bare model scope rejection. Upstream `bin/process-lifecycle.js` (wrapper shutdown forwarding for their own launcher) is not absorbed; `bin/pi-web.js` at the repository root owns process supervision.
