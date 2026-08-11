# Release State: integrate-upstream-formal-agent-protocols

This document keeps implementation, verification, source, candidate, exposure, and operation states separate. No state below grants another state or authorizes a release operation.

## Implementation

The accepted implementation and reconciliation packages through 6.5 are complete in the current working tree. The repository is intentionally dirty and no candidate commit has been created.

## Verification

The selected focused Runtime matrix passed 205 tests across 16 directly owning files. Package, doctor, bootstrap, generated-role/routing, compatibility, provenance, exact-snapshot, permission, formal-board protection, and affected integration checks also passed after current evidence regeneration. The offline disposable npm lifecycle exercised Pi install, update, and remove while preserving the seeded shared workflow tree byte-for-byte.

The accepted test plan makes the full repository suite conditional on an affected integration claim remaining unsupported. No such gap remained after the focused and affected integration matrices, so a current full-suite run was not required or performed. This document does not claim that the full repository suite passed for this candidate.

## Exact upstream release

The integrated shared source is `rose-aili@0.4.2` from `https://github.com/Rosetears520/aili-workflows.git` at commit and npm `gitHead` `bb1fedacc46d71045daa6257d121f2b71ba29d54`. The accepted tarball SHA-256 is `df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f`. Both v1 protocol hashes and the exact 19-specialist inventory are recorded in `upstream/aili-workflows.lock.json`.

## Local npm candidate

The fresh local candidate is `.tmp/integrate-upstream-formal-agent-protocols-release-state/rosetears-aili-pi-0.1.13.tgz`.

- Package: `@rosetears/aili-pi@0.1.13`
- License: `AGPL-3.0-or-later`
- SHA-256: `5b026d99287aed1eb8c298c2931d94fa5a69af0c8cdcbf51d1044efb2a22cf2d`
- Archive size: 9,829,963 bytes
- Regular-file inventory: 5,750
- Candidate commit: absent; the current dirty working tree is the candidate source

This is a local lifecycle/package-test artifact, not a publishable release candidate. Its package version `0.1.13` is below the source brief's recorded published baseline `0.1.15`. SHIP must confirm current public-registry state under exact approval, choose a valid next version, regenerate the tarball/provenance evidence and rerun affected package/exposure checks.

This local tarball identity becomes stale after any included-file change and is not a public npm registry or release identity.

## Public exposure review

A read-only archive inspection found no `openspec/`, `tests/`, `.pi/`, `graphify-out/`, `.tmp/`, generic `skills/`, retired global-Skill synchronizer, Zone Identifier, or environment-file path in the candidate. The packed manifest has no `postinstall`, does not publish `skills/`, and declares only `./node_modules/pi-web-access/skills` as the Pi Skill source. Required package-owned Extension, prompt, theme, and role resources are present. `pi-web-access` is a normal non-bundled dependency installed by the package manager, so its Skill body is not expected inside this tarball.

The bounded text scan covered 5,701 regular text files. Two AWS-key-shaped matches occurred only in generated `@tootallnate/quickjs-emscripten` JavaScript and source-map files; both archive files are byte-identical to the locked installed third-party dependency and are treated as pattern false positives rather than AILI credentials. No private-key marker, GitHub/OpenAI token shape, host-private path, DCP runtime marker, or package-owned credential material was found.

This is a bounded local static review, not publication approval or a guarantee against every possible secret format.

## Independent changes and live limitations

`add-file-task-board` and `separate-shared-and-pi-skill-distribution` remain historical/capability-source references and cannot advance overlapping work. `improve-tui-interaction-and-wsl-image-paste` remains an independent, unreconciled proposal with historical candidate evidence and unrun manual WSL2 rows. `replace-pi-native-fallback-with-aili-emergency-checkpoint` remains proposal-only and blocked on an official Pi provider-runtime seam. None inherits this change's completion state.

Current live provider/model/auth/transport/retry and real process-loss behavior remain unverified for this candidate. Real user HOME, real WSL2/clipboard/terminal behavior, and public npm-registry composition also remain unverified.

## Operation authority

Commit, push, npm publish, GitHub release, and real WSL installation have not been approved or executed. Each remains a separate exact operation gate.
