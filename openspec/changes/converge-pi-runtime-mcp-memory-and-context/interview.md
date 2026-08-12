# Requirements Interview

- Mode: focused clarification
- Source: `proposal.md`, `context.md`, and the user-confirmed runtime direction
- Readiness: READY; revised test plan accepted 2026-08-12
- Implementation authorization: granted for repository-local BUILD; risky operations remain separately gated

## Confirmed decisions

### Q1 — CodeGraph MCP identity

- User answer: A.
- Decision: the CodeGraph implementation is `https://github.com/colbymchenry/codegraph`.
- Consequence: its exact package/command, version or commit, license, runtime prerequisites, configuration, permissions, provenance and tests are the only CodeGraph target for this change. Other similarly named CodeGraph MCP packages are out of scope.

## Decisions already settled before this interview

- MemPalace through MCP is the sole durable-memory source of truth.
- The Palace is shared with OpenCode at `/home/rosetears/code/ai/.mempalace`.
- Shared MCP configuration uses `~/.config/mcp/mcp.json`.
- `billion-context-pi` is adopted with its complete feature surface, including `acp_delegate*`, for every provider except compatible `openai-codex`.
- Compatible `openai-codex` uses pinned `@narumitw/pi-codex-compact` for automatic/manual Remote Compaction V2 and strict checkpoint replay. Algal is retained only as documented prior art and is not loaded alongside it.
- Pi owns theme, working and thinking; AILI retains only a lightweight footer through official Pi APIs.
- AILI Compact and the AILI SQLite-memory direction are retired.
- The project’s intended primary license is MIT while third-party licenses remain intact.

## Design-owned decisions

These do not require another product interview unless fresh evidence forces a material change:

- complete bundled dependency versus complete vendored-source packaging for `billion-context-pi`;
- the immutable version/commit pin mechanism for dependencies and MCP server commands;
- footer field priority and deterministic narrow-terminal degradation;
- internal module placement and test decomposition.

## Current unresolved frontier

No product question remains for provider ownership. Evidence must still determine the exact immutable `pi-codex-compact` package/source identity and whether a 32K or upstream-default 64K retained-history budget best satisfies representative long-session continuity, speed and token behavior. Until that evidence exists, 64K remains the upstream baseline rather than an AILI product promise.

This revision records the user's product decision only. It does not establish complete DEFINE readiness, accept the revised final test plan, reauthorize BUILD for the affected scope, or authorize dependencies, installation, configuration, user-directory writes, deletion, Git, publication, or release.
