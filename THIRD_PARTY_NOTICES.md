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
- Source files: src/api.ts, src/runners/headless-model.ts, src/artifacts/result.ts
- Reused symbols/patterns: runSubagent API, headless lifecycle, artifact envelope
- Local changes: AILI registers the full pinned upstream subagent tool schema, injects a non-removable credential guard, and relies on the ambient AILI pi-permission-modes registration exactly once in each child; no upstream source is copied

## pi-permission-modes

- Status: dependency
- Source: https://github.com/wynainfo/pi-permission-modes.git
- Revision: 23d65d10a53b67043cae42322acf9044d6edb196
- Version: 2.2.0
- License: MIT
- Source files: src/index.ts, permission-mode.defaults.json
- Reused symbols/patterns: Default/Plan/Build/YOLO, /perm, Alt+M, sandbox degradation
- Local changes: AILI initializes the pinned upstream extension and does not retain a competing AILI mode command or shortcut

## pi-quota-status

- Status: dependency
- Source: https://github.com/hafiezul/pi-quota-status.git
- Revision: 742b3e40b88fbf3d5dcd9d39af96d37bd26bb436
- Version: 0.3.0
- License: MIT
- Source files: src/index.ts, src/paths.ts
- Reused symbols/patterns: quota footer, /quota, global state maintenance
- Local changes: AILI initializes the pinned upstream extension; upstream owns quota polling and state files

## pi-web-access

- Status: dependency
- Source: https://github.com/ttttmr/pi-web-access.git
- Revision: npm:0.13.0
- Version: 0.13.0
- License: MIT
- Source files: index.ts, skills/
- Reused symbols/patterns: web_search, fetch_content, get_search_content, curator and bundled librarian skill
- Local changes: AILI initializes the complete pinned upstream surface through its sole Extension entry; no upstream source is copied

## pi-sakura-cyberdeck

- Status: adapted
- Source: https://github.com/beautifulrem/pi-sakura-cyberdeck.git
- Revision: 165a1f8011a12a58a6409b56b8a6c0416cd9b589
- Version: undefined
- License: MIT
- Source files: extensions/header/index.ts, extensions/matrix/index.ts, extensions/zentui/**
- Reused symbols/patterns: header, matrix animation, Zentui footer, fixed editor compositor
- Local changes: registered as three additional Pi Package Extensions; header avatar loads the supplied Rem asset; Sakura palette values are replaced with the Rem palette; relative import specifiers and session lifecycle event are adapted for this package's NodeNext TypeScript contract

## npm dependency inventory

The exact 350-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry; no third-party source tree is copied into this package.
