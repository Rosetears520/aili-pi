# Third-Party Notices

This distribution is MIT-licensed. The following adapted sources and locked development/runtime dependencies retain their own license terms.

## aili-workflows

- Status: adapted
- Source: https://github.com/Rosetears520/aili-workflows.git
- Revision: 7eb35f357ad489f5841ee10dac1e44549c1bdb76
- Version: 0.2.7
- License: MIT
- Source files: upstream/aili-workflows.lock.json#files (471 exact skill files), manifests/roles.json#records[].sourcePath (19 exact role source files)
- Reused symbols/patterns: 64 canonical skill bodies and owned assets, 19 child-role prompt bodies
- Local changes: skills/** is an exact byte-for-byte snapshot with no semantic overlay; role prompts are generated as Pi frontmatter with explicit tool/capability ceilings and structured output

## @agwab/pi-subagent

- Status: dependency
- Source: https://github.com/AgwaB/pi-subagent.git
- Revision: daa7b83819116a62008ad17aa65fcd50fefbafd0
- Version: 0.4.8
- License: MIT
- Source files: src/api.ts, src/runners/headless-model.ts, src/artifacts/result.ts
- Reused symbols/patterns: runSubagent API, headless lifecycle, artifact envelope
- Local changes: AILI calls the pinned API through a thin role/path/tool policy adapter; no upstream source is copied

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

## npm dependency inventory

The exact 350-entry package-lock inventory, versions, integrity values, dependency scope, and declared licenses is recorded in `manifests/sbom.json`.

Runtime dependencies are initialized through the single AILI Extension entry; no third-party source tree is copied into this package.
