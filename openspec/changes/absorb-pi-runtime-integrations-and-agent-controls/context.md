# Change Context

## Identity and baseline

- Change: `absorb-pi-runtime-integrations-and-agent-controls`
- Selected by user: a new independent OpenSpec change after mapping the current local checkout.
- Baseline: current `main` commit `1d321cdcd146d08dcf1940c4e87db3e0a4c25e3c`, checked out on `feature/reconcile-aili-compact-raw-gap-proof`; `origin/main` points to the same commit.
- Unrelated untracked paths (`.pi/`, `graphify-out/`, chat archives and Zone.Identifier files) are not change-owned and must remain untouched.
- Existing foreground Pi Web work is explicitly paused in `integrate-pi-web-ui-and-upstream-extensions`; this change does not resume it.

## Current implementation mapping

- Persistent Agent selection is in `src/runtime/persistent-agents/model-selection.ts`; `task.model` currently becomes an unconfirmed `one-shot` override in `production.ts` preallocation. Current precedence is one-shot → instance → trusted project role → user role → profile → parent fallback.
- `TaskAncestry` carries an active scheduler permit but no resolved model/thinking identity. Nested children consequently currently resolve from the top-level Pi context rather than their direct Persistent parent.
- Child sessions already receive `model` and `thinkingLevel` through `createPersistentChildSession`; frozen model choices are journaled/audited and revalidated before use.
- Top-level scheduling is `FifoTurnScheduler` with capacity 32; nested turns are sequential under the inherited permit. Scheduler timing instrumentation is absent.
- Formal dispatch resolves `formal-task-board.md`/`progress.txt` before Agent allocation. An invalid existing pair yields `EXISTING_PAIR_INVALID` from `formal-task-board-root.ts`; tests assert byte-identical pair preservation.
- `pi-mcp-adapter@2.23.0` is the single MCP adapter. Current `mcp-config.ts` configures MemPalace, Context7, Playwright and CodeGraph as lazy `npx` servers. The installed adapter supports `lazy`, `keep-alive`, `lazy-keep-alive`, and `eager` lifecycles plus reconnect and cleanup.
- Current PATH tools: `codegraph` is `/home/rosetears/.nvm/versions/node/v24.16.0/bin/codegraph`, version `1.4.1`; globally installed package is `@colbymchenry/codegraph@1.4.1`. Current config pins `npx @colbymchenry/codegraph@1.5.0`, so changing to PATH requires an exact compatibility decision rather than an ungoverned fallback.
- Current PATH `graphify` is `/home/rosetears/.local/bin/graphify`, version `0.9.22`. `graphify-out/` exists and is untracked; `health.json` reports a built graph, but this change cannot treat that artifact as fresh/reproducible evidence until a bounded probe is authorized.
- The current shared MCP config exists at `~/.config/mcp/mcp.json` and currently names `mempalace`, `context7`, `playwright`, and `codegraph`, all with `lazy` lifecycle. Its secret values were not read or recorded.
- The native footer lives at `extensions/footer/{index,layout,lifecycle}.ts`. It currently renders model, raw quota status, MCP then clock, and cwd/branch. It does not expose thinking or permission mode.

## Upstream evidence mapping

- `pi-notify`: npm `pi-notify@1.4.0`, MIT; upstream commit observed at `a17c63ef1c3071d793aad7e9d327a3728f2ad88c`. Its `index.ts` implements agent-end notification with OSC 777, iTerm OSC 9, Kitty OSC 99, tmux passthrough, `WT_SESSION` detection and `powershell.exe` toast. Upstream calls PowerShell without failure handling, so the AILI adaptation must make every notification path non-fatal.
- `pi-file-context`: user-described `experimental/pi-file-context` has moved in current upstream to `packages/pi-file-context`. Upstream commit observed at `7624b3c50d09d2e9dafa8dbc810c7f2adb453d70`; npm version is `@narumitw/pi-file-context@0.53.0`, MIT. The source preserves file/content search, line/hunk selection, Git status/diff/blame/history/revision, bounded immutable snapshots, SHA-256 provenance and deterministic token estimate. Its declared `@narumitw/pi-tui-kit` dependency is `^0.51.0`; this change shall resolve and lock the exact `0.53.0` companion package or otherwise vendor no dependency, never retain that floating range.
- `pi-codex-fast`: the user-provided `calesennett/pi-codex-fast` current commit observed at `34804067eb7c276e38ef70ba3f156c8b5293914`; its implementation uses `before_provider_request` to add `service_tier: "priority"` only for listed Codex models. The repository package metadata is `@calesennett/pi-codex-fast@0.1.5`, while unrelated npm package `pi-codex-fast@1.1.0` reports a different repository; source provenance must not conflate them.
- Pi `0.84.1` installed types define `OpenAICodexResponsesOptions.serviceTier` and the `before_provider_request` extension event. This supports a testable request-payload adaptation, subject to a real-provider request probe gate.
- Graphify upstream current commit observed at `e4bfd2ad1a9393251023a4edef93e93dc798afc7`; PyPI package is `graphifyy` (not `graphify`), current observed version `0.9.41`, Apache-2.0, with an `mcp` extra and stdio `graphify-mcp <graph.json>`. Its server supports an optional `project_path` tool argument that maps to `<project>/.graphify-out/graph.json`; AILI can therefore retain one shared user configuration and pass the existing adapter session cwd, without generated per-project config. Existing local Graphify 0.9.22 must not silently masquerade as 0.9.41.
- `pi-tool-display` current observed commit is `91cef7580078371f8dc49a8607222807ad6a424d`; it is MIT and reference-only for future tool presentation. It must not be imported as a Persistent Agent runtime.

## Existing contracts to preserve

- `converge-pi-runtime-mcp-memory-and-context` established one shared MCP config, isolated Parent/Worker adapters, no lazy connection during status inspection, and a public-API-only footer.
- `integrate-pi-web-ui-and-upstream-extensions` establishes RuntimeSnapshot/RuntimeEvent as the Web projection foundation. Future Agent Inspector and Context Core must extend that system rather than create parallel transport/runtime; foreground Web implementation remains paused.

## Operation authorization matrix and unresolved evidence

| Operation | Status in initiating request |
| --- | --- |
| Repository source, tests, docs and OpenSpec | Authorized |
| Dependency and lockfile mutation; copied source import; provenance/NOTICE/SBOM generation | Authorized |
| Local CLI install and ordinary local MCP config write | Authorized |
| Context7 placeholder in local config | Authorized only as an env-variable reference; never write a real token |
| Real provider request; browser, MCP-server or external-process live probe | Separately gated before execution |
| Git push, publication and release | Explicitly forbidden |

A real Context7 token must not enter repository files, tests, logs, docs, fixtures, provenance or SBOM.
