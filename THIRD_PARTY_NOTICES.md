# Third-Party Notices

This distribution is licensed under MIT. The following adapted sources, behavioral references, and locked development/runtime dependencies retain their own license terms.

## aili-workflows

- Status: adapted
- Source: https://github.com/Rosetears520/aili-workflows.git
- Revision: a69f3149d8f1db81726128c2819a3ccc954b9ccc
- Version: 0.4.7
- License: MIT
- Source files: upstream/aili-workflows.lock.json#files (562 exact skill files), upstream/aili-workflows-runtime/** (exact generated Pi runtime bundle), manifests/roles.json#records[].sourcePath (role adapters regenerated from the exact 0.4.7 source revision)
- Reused symbols/patterns: 58 canonical skill bodies and owned assets, 20 canonical Specialized Agent roles, Pi system/role/selection/protocol/installation runtime bundle
- Local changes: skills/** is an exact byte-for-byte snapshot with no semantic overlay; the generated Pi runtime bundle is copied byte-for-byte and validated through one lock-bound loader; specialized role prompts and deterministic routing were regenerated from the exact 0.4.7 source revision and remain manifest-hash bound; legacy APPEND_SYSTEM and global-role installation ownership is retired and report-only

## pi-mcp-adapter

- Status: dependency
- Source: https://github.com/nicobailon/pi-mcp-adapter.git
- Revision: 49e25be1cb917329980eb7a40786c5b91dddb277
- Version: 2.23.0
- License: MIT
- Source files: index.ts, types.ts, mcp-status.ts, tool-approval.ts
- Reused symbols/patterns: createMcpAdapter, MCP status snapshots, multi-origin tool approval event
- Local changes: AILI composes a fresh factory for Parent and each persistent Worker through src/runtime/mcp.ts; no upstream source is copied and the dependency is not registered as a second Pi package

## billion-context-pi

- Status: adapted
- Source: https://github.com/ranxianglei/billion-context-pi.git
- Revision: 558a83a9db695571339d693ab75129c2f13a324c
- Version: 0.1.34
- License: MIT
- Source files: upstream/billion-context-pi/** (complete tracked source tree except .git metadata)
- Reused symbols/patterns: compress, decompress, search_context, acp_status, acp_delegate, acp_delegate_wait, acp_delegate_cancel, context and compaction handlers
- Local changes: added AcpOwnershipRouter so a turn-frozen canonical route gates context, system-prompt and compaction ownership before side effects; disabled upstream auto-update and user-home subagent settings mutation in the AILI composition; rebuilt dist against the retained source and Pi 0.84.1

## pi-codex-compact

- Status: dependency
- Source: https://github.com/narumiruna/pi-extensions.git
- Revision: c98af43a6c71c5839b2e0671db71ed1cc1fc0c51
- Version: 0.50.0
- License: MIT
- Source files: node_modules/@narumitw/pi-codex-compact/src/**, upstream/pi-codex-compact-0.50.0-src/**, upstream/pi-codex-compact-0.50.0-LICENSE, upstream/pi-codex-compact-0.50.0-README.md
- Reused symbols/patterns: Codex Remote Compaction V2, opaque checkpoint marker/fingerprint replay, Pi-native fallback
- Local changes: composed only for canonical openai-codex/openai-codex-responses turns; settings view forces extension transport maxRetries=0 so Pi owns retries

## pi-retry

- Status: adapted
- Source: https://github.com/narumiruna/pi-extensions.git
- Revision: 3ad2c94970132353fc869cd2297b017465740791
- Version: 0.31.0
- License: MIT
- Source files: upstream/pi-retry-0.31.0/**, src/runtime/provider-retry.ts
- Reused symbols/patterns: provider retry classifiers, stall watchdog, receiving/retrying status, Pi retry-policy integration
- Local changes: added bounded redacted structured retry diagnostics and exported classification helpers; Pi 0.84.1 remains the sole attempt budget/backoff owner; later upstream deprecated placement is documented in the accepted change

## pi-permission-modes

- Status: adapted
- Source: https://github.com/wynainfo/pi-permission-modes.git
- Revision: 23d65d10a53b67043cae42322acf9044d6edb196
- Version: 2.2.0
- License: MIT
- Source files: src/vendor/pi-permission-modes/index.ts, src/vendor/pi-permission-modes/resolve.ts, upstream/pi-permission-modes.lock.json, licenses/pi-permission-modes-MIT.txt
- Reused symbols/patterns: Default/Plan/Build/YOLO, /perm, Alt+M, shared permission pattern matcher, sandbox degradation
- Local changes: AILI's generated adapted entry redirects unchanged sibling modules to the exact 2.2.0 dependency; the owned resolve.ts compiles permission globs with RegExp dotAll so * and ? include ECMAScript line terminators; the exact upstream and adapted files are hash-locked and drift-checked

## pi-quota-status

- Status: dependency
- Source: https://github.com/hafiezul/pi-quota-status.git
- Revision: 742b3e40b88fbf3d5dcd9d39af96d37bd26bb436
- Version: 0.3.0
- License: MIT
- Source files: src/index.ts, src/subscription.ts, src/format.ts, src/paths.ts
- Reused symbols/patterns: quota footer, Codex subscription windows, /quota, global state maintenance
- Local changes: AILI initializes the pinned upstream extension; upstream owns quota polling and state files; the Pi-native minimal footer consumes its published status without changing percentage or reset data

## pi-web-access

- Status: dependency
- Source: https://github.com/ttttmr/pi-web-access.git
- Revision: npm:0.13.0
- Version: 0.13.0
- License: MIT
- Source files: index.ts, skills/
- Reused symbols/patterns: web_search, fetch_content, get_search_content, curator and bundled librarian skill
- Local changes: AILI initializes the complete pinned upstream surface through its sole Extension entry; no upstream source is copied

## pi-cache-optimizer

- Status: dependency
- Source: https://github.com/jiangge/pi-cache-optimizer.git
- Revision: npm:2.6.18
- Version: 2.6.18
- License: MIT
- Source files: index.ts
- Reused symbols/patterns: default Extension, /cache-optimizer, cache statistics, prompt cache hooks
- Local changes: AILI initializes the pinned upstream extension through its single Extension entry; the Pi-native minimal footer gives model and quota status priority while leaving cache commands and collection unchanged; no upstream source is copied

## pi-sakura-cyberdeck

- Status: adapted
- Source: https://github.com/beautifulrem/pi-sakura-cyberdeck.git
- Revision: 165a1f8011a12a58a6409b56b8a6c0416cd9b589
- Version: git:165a1f8011a12a58a6409b56b8a6c0416cd9b589
- License: MIT
- Source files: extensions/header/index.ts, extensions/matrix/index.ts, extensions/zentui/**
- Reused symbols/patterns: retired header, retired matrix animation, retired Zentui UI, inactive fixed editor compositor
- Local changes: historical adapted source is retained in the repository but no header, Matrix, Zentui extension or theme is registered as a production Pi resource; legacy user configuration is untouched; the inactive fixed-editor source remains separate from the independently owned WSL image-paste keybinding behavior

## Oh My Pi reference

- Status: reference-only
- Source: https://github.com/can1357/oh-my-pi.git
- Revision: 59619623e1eeb7c290649eeaf3a269284ce8adef
- Version: 17.1.3
- License: MIT
- Source files: none copied
- Reused symbols/patterns: none
- Local changes: none

## algal pi-openai-server-compaction reference

- Status: reference-only
- Source: https://github.com/algal/pi-openai-server-compaction.git
- Revision: 8a3de2f3b0c178fdd6f73f2f94172dfc3943e466
- Version: git:8a3de2f3b0c178fdd6f73f2f94172dfc3943e466
- License: MIT
- Source files: none copied
- Reused symbols/patterns: none
- Local changes: none

## npm dependency inventory

The exact 519-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry. Package-owned third-party adaptations are copied only where their provenance sourceFiles explicitly name repository paths.
