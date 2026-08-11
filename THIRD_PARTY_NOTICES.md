# Third-Party Notices

This distribution is licensed under AGPL-3.0-or-later. The following adapted sources, behavioral references, and locked development/runtime dependencies retain their own license terms.

## aili-workflows

- Status: adapted
- Source: https://github.com/Rosetears520/aili-workflows.git
- Revision: bb1fedacc46d71045daa6257d121f2b71ba29d54
- Version: 0.4.2
- License: MIT
- Source files: upstream/aili-workflows.lock.json#files (588 exact skill files), manifests/roles.json#records[].sourcePath (role adapters regenerated from the exact 0.4.2 source revision), upstream/opencode-global-agents.lock.json (pinned source template revision/hash)
- Reused symbols/patterns: 65 canonical skill bodies and owned assets
- Local changes: skills/** is an exact byte-for-byte snapshot with no semantic overlay; specialized role prompts and deterministic routing were regenerated from the exact 0.4.2 source revision and remain manifest-hash bound; templates/APPEND_SYSTEM.md is a Pi-native governance derivation of the pinned global AGENTS template, with OpenCode-only control planes excluded

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

## pi-sakura-cyberdeck

- Status: adapted
- Source: https://github.com/beautifulrem/pi-sakura-cyberdeck.git
- Revision: 165a1f8011a12a58a6409b56b8a6c0416cd9b589
- Version: git:165a1f8011a12a58a6409b56b8a6c0416cd9b589
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
- Revision: 00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb
- Version: 1.14.3
- License: AGPL-3.0-or-later
- Upstream notice: Based on opencode-dynamic-context-pruning by Tarquinen (https://github.com/Tarquinen/opencode-dynamic-context-pruning); modified by ranxianglei, 2026 — 35 bug fixes plus performance and stability improvements.
- Source files: none copied
- Reused symbols/patterns: none
- Local changes: none

## npm dependency inventory

The exact 350-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry. Package-owned third-party adaptations are copied only where their provenance sourceFiles explicitly name repository paths.
