# Change Context

## Change identity

- Change: `converge-pi-runtime-mcp-memory-and-context`
- Lifecycle phase: BUILD
- Backend: OpenSpec `spec-driven`
- BUILD authorization: granted 2026-08-12 for the accepted revised contract; risky operations remain separately gated

## Confirmed product decisions

- MemPalace through MCP is the sole durable-memory source of truth. The older AILI-owned SQLite direction is retired.
- Pi and OpenCode share one Palace at `/home/rosetears/code/ai/.mempalace`.
- The shared MCP configuration is `~/.config/mcp/mcp.json`, resolving to `/home/rosetears/.config/mcp/mcp.json` for the current user.
- MCP is available to the Parent and every persistent Worker through separate session-owned adapter instances.
- Initial MCP servers cover MemPalace, Context7, Playwright, and one explicitly identified CodeGraph implementation.
- `task` must show task name, Agent selector, assignment summary, model and status instead of only `Task`; expanded task/hub surfaces carry IDs and detailed metadata.
- Rose Matrix, the four-line waterfall, the custom thinking component, and the Rose/Zentui theme chrome are retired. Pi owns theme, working and thinking. AILI retains only a lightweight footer implemented through Pi APIs.
- Provider-routed compaction replaces one universal owner: compatible `openai-codex` uses pinned `@narumitw/pi-codex-compact` for Remote Compaction V2 and checkpoint replay; every other provider, including direct `openai`, Azure and custom endpoints, uses complete `billion-context-pi`, including `acp_delegate*`. The complete billion-context surface is preserved; algal remains documented prior art rather than production scope.
- `@narumitw/pi-retry@0.31.0` is absorbed with its full published source and retry/stall behavior, while AILI adds bounded visible error classification so retrying does not hide why an error occurred. Its later upstream deprecation status is recorded.
- AILI Compact is retired and removed as a production context owner.
- The supported official Pi baseline is `0.84.1`; prior `0.82.1` declarations are superseded.
- The project’s intended primary license is MIT. Third-party components retain their own licenses and notices.
- The `rose-aili@0.4.7` canonical public catalog is accepted in full: 20 Specialized Agents, including the read-only `aili.solution-architect`; Pi SHALL NOT filter it back to the previous 19-selector inventory.

## Superseded directions

- `add-aili-sqlite-memory` is fully superseded.
- Active work that restores or publishes AILI Compact is superseded by the upstream context runtime decision.
- Matrix, Rose theme, and custom thinking portions of older TUI changes are superseded.
- The persistent Agent framework remains the runtime base and is modified rather than replaced.

## Delegation exception

The first formal public-web evidence package was dispatched to `aili.web-researcher` but returned blocked because that Worker profile had no web tools. ROSE may perform the bounded official-source lookup directly because the exact specialist capability is unavailable in that execution profile. This exception covers only current version, identity, license, command, and compatibility evidence required by this DEFINE; it grants no installation, dependency, configuration, or external-write authority.

The initial spec-miner package failed before producing an artifact because output persistence rejected a protected-path string. ROSE may integrate already-inspected repository evidence directly for the affected candidate requirements; no Worker result is treated as evidence.

## Worktree boundary

The current branch is `feature/reconcile-aili-compact-raw-gap-proof`. Existing untracked `.pi/`, `graphify-out/`, archive files, and Zone.Identifier files are unrelated and must not be modified. The user authorized this change’s DEFINE artifacts in the current worktree only.

## Frozen upstream identities for DEFINE

- `rose-aili@0.4.7`, gitHead `a69f3149d8f1db81726128c2819a3ccc954b9ccc`, MIT; its 20-role canonical specialist inventory, including `solution-architect`, is the accepted public selector contract.
- `pi-mcp-adapter@2.23.0`, gitHead `49e25be1cb917329980eb7a40786c5b91dddb277`, MIT.
- `mempalace==3.7.0`, Python `>=3.9`, official repository `MemPalace/mempalace`; stdio entry `mempalace-mcp --palace <path>` and `MEMPALACE_PALACE_PATH` are supported by current source. Final wheel/license-file inventory remains a BUILD dependency check.
- `@upstash/context7-mcp@4.0.2`, MIT.
- `@playwright/mcp@0.0.79`, gitHead `4c5077651542f68525a0b51e97bab2a32abc9290`, Apache-2.0.
- `@colbymchenry/codegraph@1.5.0`, gitHead `ea72e1b190921232aa7bd02e96bef5bbe4fe0ab6`, MIT, Node `>=20 <25`.
- `billion-context-pi@0.1.34`, gitHead `558a83a9db695571339d693ab75129c2f13a324c`, MIT, Node `>=20`, Pi peer `*`.
- `@narumitw/pi-codex-compact@0.50.0` is the current observed Codex candidate, MIT, with Pi `0.84.1` development peers; exact npm integrity/git identity and complete package inventory remain BUILD evidence gates. Its Remote V2 replay uses exact marker replacement, checkpoint/model checks, retained-message fingerprints, bounded replacement history, and Pi-native fallback. Its extension retry setting must be zero or otherwise proven not to create a second retry owner.
- `algal/pi-openai-server-compaction@8a3de2f3b0c178fdd6f73f2f94172dfc3943e466` remains comparison/prior-art evidence only; it is not a dependency, vendored runtime, or current context owner.
- `@narumitw/pi-retry@0.31.0`, gitHead `3ad2c94970132353fc869cd2297b017465740791`, MIT, no runtime dependencies/peers in the published package. The current upstream monorepo later moved the project to `deprecated/pi-retry`; this maintenance state does not erase the accepted frozen package but must remain visible in provenance and risk documentation.
- `@earendil-works/pi-coding-agent`, `pi-agent-core`, `pi-ai` and `pi-tui` baseline `0.84.1`, MIT.

## Remaining evidence items

- Published tarball/file inventory and exact Pi 0.84.1 runtime compatibility for the frozen upstream identities.
- Provider-router behavior proving compatible Codex never passes through ACP context rewriting/cancellation, while direct OpenAI and all other providers never use Codex Remote V2.
- Exact npm/source identity and Pi 0.84.1 behavior of `pi-codex-compact`, including single-owner retry, marker/fingerprint fail-closed replay, and complete `billion-context-pi` packaging boundaries.
- Retry error taxonomy, raw bounded cause visibility and non-duplicating interaction with Pi's built-in retry loop under Pi 0.84.1.
- The fixed MemPalace release’s exact Palace/Wing/diary naming and concurrency behavior.
- The smallest reliable footer contract for Codex quota/reset/update timestamps using Pi’s official status/footer APIs.

## Authorization boundaries

Repository-local BUILD edits and claim-matched local checks are authorized for the accepted revised contract. Dependency or lockfile changes, license replacement, source vendoring requiring an external operation, MCP/Python/browser/model installation, `~/.config` writes, Palace initialization/read/write/mining, Git operations, publish, and release remain unauthorized until each separate operation gate is satisfied.
