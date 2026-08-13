# Pi Web 0.8.8 adaptation boundary

This directory is the AILI-owned adaptation of the exact MIT source snapshot at `upstream/pi-web-0.8.8` (`@agegr/pi-web@0.8.8`, revision `5a53c18ca9328400a3dfb8c48c1e4f343b3e4903`). Pi Web remains the sole Web code/function base.

| Locked Pi Web source | AILI adaptation |
|---|---|
| `components/AppShell.tsx`, `SessionSidebar.tsx` | `components/AiliWorkbench.tsx`, responsive independent sidebars and project/session tree |
| `components/ChatWindow.tsx`, `ChatInput.tsx` | structured Timeline, bounded composer, distinct Queue Next and Steer controls |
| `components/BranchNavigator.tsx` | branch tree helpers and explicit Branch/Fork contracts in `workbench-model.ts` |
| `components/ModelsConfig.tsx`, `SkillsConfig.tsx`, `PluginsConfig.tsx` | bounded catalog resources and capability-gated BFF commands |
| `components/FileExplorer.tsx`, `FileViewer.tsx` | opaque file resources, Git diff, and BFF-only media previews |
| `hooks/useAgentSession.ts`, `lib/agent-client.ts`, event helpers | `gateway-client.ts` and `runtime-projection.ts` over `RuntimeSnapshotV1`, `RuntimeEventV1`, and `MutationEnvelopeV1` |
| `hooks/useDragDrop.ts`, `lib/image-attachments.ts` | byte-sniffed bounded upload/paste/drop and official Pi image conversion in `media.ts` |
| PWA, responsive, i18n source | `app/**`, `public/**`, `i18n.ts`, and `app/globals.css` |

The adaptation intentionally does not copy upstream direct RPC/`AgentSession` ownership, direct filesystem/Git mutation routes, force Worktree removal, branch deletion, or Pi Web self-update. Browser routes under `app/api/runtime/v1` delegate to `PrivateWebBff`; the server bridge has no private service fallback.
