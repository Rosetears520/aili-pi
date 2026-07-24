# Third-Party Notices

This distribution is MIT-licensed. The following adapted sources and locked development/runtime dependencies retain their own license terms.

## aili-workflows

- Status: adapted
- Source: https://github.com/Rosetears520/aili-workflows.git
- Revision: 7eb35f357ad489f5841ee10dac1e44549c1bdb76
- Version: 0.2.7
- License: MIT
- Source files: upstream/aili-workflows.lock.json#files (471 exact skill files), manifests/roles.json#records[].sourcePath (19 exact role source files), upstream/opencode-global-agents.lock.json (pinned source template revision/hash)
- Reused symbols/patterns: 64 canonical skill bodies and owned assets, 19 child-role prompt bodies
- Local changes: skills/** is an exact byte-for-byte snapshot with no semantic overlay; role prompts are generated as Pi frontmatter with explicit tool/capability ceilings and structured output; templates/APPEND_SYSTEM.md is a Pi-native governance derivation of the pinned global AGENTS template, with OpenCode-only control planes excluded

## @agwab/pi-subagent

- Status: dependency
- Source: https://github.com/AgwaB/pi-subagent.git
- Revision: daa7b83819116a62008ad17aa65fcd50fefbafd0
- Version: 0.4.8
- License: MIT
- Source files: src/index.ts, src/api.ts, src/runners/headless-model.ts, src/artifacts/result.ts
- Reused symbols/patterns: subagent tool renderCall, runSubagent API, headless lifecycle, artifact envelope
- Local changes: AILI registers the full pinned upstream subagent tool schema, prepends a sanitized bounded requested-Agent heading, injects a non-removable credential guard, normalizes ordinary omitted/auto runs to headless for the Pi 0.81.1 compatibility window, and rejects explicit inline before model startup; no upstream source is copied

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

## pi-sakura-cyberdeck

- Status: adapted
- Source: https://github.com/beautifulrem/pi-sakura-cyberdeck.git
- Revision: 165a1f8011a12a58a6409b56b8a6c0416cd9b589
- Version: undefined
- License: MIT
- Source files: extensions/header/index.ts, extensions/matrix/index.ts, extensions/zentui/**
- Reused symbols/patterns: header, matrix animation, Zentui footer, fixed editor compositor
- Local changes: registered as three additional Pi Package Extensions; header avatar loads the supplied Rem asset; Zentui shell palette uses Rem while Matrix and the reasoning trail retain the upstream Sakura palette; overflowing Matrix tracks are sampled deterministically across the complete terminal width while retaining the 96-track budget and ordinary-width behavior; relative import specifiers and session lifecycle event are adapted for this package's NodeNext TypeScript contract

## npm dependency inventory

The exact 424-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry. Package-owned third-party adaptations are copied only where their provenance sourceFiles explicitly name repository paths.
