# Third-Party Notices

This distribution is licensed under AGPL-3.0-or-later. The following adapted sources, behavioral references, and locked development/runtime dependencies retain their own license terms.

## aili-workflows

- Status: adapted
- Source: https://github.com/Rosetears520/aili-workflows.git
- Revision: 7eb35f357ad489f5841ee10dac1e44549c1bdb76
- Version: 0.2.7
- License: MIT
- Source files: upstream/aili-workflows.lock.json#files (471 exact skill files), manifests/roles.json#records[].sourcePath (19 exact role source files), upstream/opencode-global-agents.lock.json (pinned source template revision/hash)
- Reused symbols/patterns: 64 canonical skill bodies and owned assets, 19 child-role prompt bodies
- Local changes: skills/** is an exact byte-for-byte snapshot with no semantic overlay; role prompts are generated as Pi frontmatter with explicit tool/capability ceilings and structured output; templates/APPEND_SYSTEM.md is a Pi-native governance derivation of the pinned global AGENTS template, with OpenCode-only control planes excluded

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
- Local changes: AILI initializes the pinned upstream extension; upstream owns quota polling and state files; Zentui shows one canonical weekly segment as codex, preferring explicit Wk and using the dependency's legacy-mislabeled 5h primary only as fallback, without changing selected percentage or reset data

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
- Local changes: AILI initializes the pinned upstream extension through its single Extension entry; Zentui defaults its pi-cache-stats footer placement off while leaving cache commands and collection unchanged; no upstream source is copied

## pi-markdown-preview

- Status: dependency
- Source: https://github.com/omaclaren/pi-markdown-preview.git
- Revision: npm:0.10.1
- Version: 0.10.1
- License: MIT
- Source files: index.ts, shared/, client/
- Reused symbols/patterns: default Extension, /preview, /preview-browser, /preview-pdf, preview_export
- Local changes: AILI initializes the pinned upstream extension through its single Extension entry; no upstream source is copied

## @narumitw/pi-lsp

- Status: dependency
- Source: https://github.com/narumiruna/pi-extensions.git
- Revision: npm:0.25.0
- Version: 0.25.0
- License: MIT
- Source files: extensions/pi-lsp/src/pi-lsp.ts, extensions/pi-lsp/src/
- Reused symbols/patterns: default Extension, lsp_diagnostics, lsp_fix, /lsp
- Local changes: AILI initializes the pinned upstream extension through its single Extension entry; no upstream source is copied

## pi-zentui

- Status: adapted
- Source: https://github.com/lmilojevicc/pi-zentui.git
- Revision: fda2c9c7d0027f7e98a3eba7d4e03f5c0ac7d600
- Version: 0.11.0
- License: MIT
- Source files: extensions/zentui/**
- Reused symbols/patterns: fixed editor compositor, editor chrome, user-message rendering, Zentui footer
- Local changes: the pi-sakura-cyberdeck lineage supplied the vendored base; AILI applies Rose Cyberdeck palette and gradients, package defaults and configuration paths, Pi 0.82.1 lifecycle adaptations, and bounded fallback behavior

## pi-sakura-cyberdeck

- Status: adapted
- Source: https://github.com/beautifulrem/pi-sakura-cyberdeck.git
- Revision: 165a1f8011a12a58a6409b56b8a6c0416cd9b589
- Version: undefined
- License: MIT
- Source files: extensions/header/index.ts, extensions/matrix/index.ts, extensions/zentui/**
- Reused symbols/patterns: header, matrix animation, Zentui footer, fixed editor compositor
- Local changes: registered as three additional Pi Package Extensions; Rose header loads a package-owned renamed artwork asset without changing upstream identity; Rose Shimmer, Rose Code Rain, and Zentui use the Rose-owned palette and gradient; overflowing Matrix tracks remain deterministic across the complete terminal width with the 96-track budget, while each rain row receives a structural blank-row repair; relative import specifiers and session lifecycle event are adapted for this package's NodeNext TypeScript contract

## Oh My Pi reference

- Status: reference-only
- Source: https://github.com/can1357/oh-my-pi.git
- Revision: 59619623e1eeb7c290649eeaf3a269284ce8adef
- Version: 17.1.3
- License: MIT
- Source files: none copied
- Reused symbols/patterns: none
- Local changes: none

## opencode-acp reference

- Status: reference-only
- Source: https://github.com/ranxianglei/opencode-acp.git
- Revision: f1a33d9f4ce55af808eb4e050717c914ed16084b
- Version: 1.12.6
- License: AGPL-3.0-or-later
- Upstream notice: Based on opencode-dynamic-context-pruning by Tarquinen (https://github.com/Tarquinen/opencode-dynamic-context-pruning); modified by ranxianglei, 2026 — 34 bug fixes, performance optimizations, enhanced stability.
- Source files: none copied
- Reused symbols/patterns: none
- Local changes: none

## npm dependency inventory

The exact 423-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry. Package-owned third-party adaptations are copied only where their provenance sourceFiles explicitly name repository paths.
