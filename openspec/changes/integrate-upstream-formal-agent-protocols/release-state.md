# Release State: integrate-upstream-formal-agent-protocols

This document keeps implementation, verification, source, candidate, exposure, and operation states separate. No state below grants another state or authorizes a release operation.

## Implementation

The accepted implementation and reconciliation packages through 6.5 are reconstructed on branch `docs/openspec-proposals-20260730` from the clean public `0.1.15` baseline. The publishable package identity is now `@rosetears/aili-pi@0.1.16`. Existing `0.1.15` runtime, release validators, bundled dependency checks, `roles/general.md`, and release history remain present.

## Verification

The reconstructed tree passed TypeScript typecheck and the focused formal routing/orchestration/Board/persistent-Agent matrix: 206 tests across 16 directly owning files. The deterministic permission, 65-skill/588-file snapshot, 20-role, 19-specialist routing, adapter-evidence, provenance, notices, and SPDX generation checks also passed locally.

An initial broader package/doctor/bootstrap/generated/provenance group passed 66 of 72 tests. Five failures require the target worktree's absent `node_modules` paths; the remaining stale doctor fixture was corrected. A fresh unaffected subset then passed 39 of 39, provenance regeneration passed 1 of 1, and doctor passed 17 of 18 with only the absent exact Pi host packages remaining. Final status/diff inspection and `git diff --check` passed. No full repository suite, real provider, real HOME, real WSL, public-registry, or publish operation is claimed.

## Exact upstream release

The integrated shared source is `rose-aili@0.4.2` from `https://github.com/Rosetears520/aili-workflows.git` at commit and npm `gitHead` `bb1fedacc46d71045daa6257d121f2b71ba29d54`. The accepted tarball SHA-256 is `df7c67af6acaa7e5080e81f5c7fab6b9dc77b5a24397a26240a527370cad206f`. Both v1 protocol hashes and the exact 19-specialist inventory are recorded in `upstream/aili-workflows.lock.json`.

## Candidate identity

The source/package/lock/SBOM identity is `@rosetears/aili-pi@0.1.16`. The current local candidate is `.tmp/release-0.1.16/rosetears-aili-pi-0.1.16.tgz`: 9,833,442 bytes, 5,752 archive entries, SHA-256 `336497c8d160a73db0b7ee70f2d60a04dc509af2dd12898fcd9090efabed9293`. It remains a local candidate until commit/merge/publication evidence binds the final Git revision.

The package manifest removes `postinstall`, excludes repository `skills/**`, declares public access for the scoped package, preserves the bundled dependency declarations, and retains only `./node_modules/pi-web-access/skills` as the Pi Skill source. Repository-only contributor checks are labeled separately from self-contained packaged validators.

## Independent changes and live limitations

`add-file-task-board` and `separate-shared-and-pi-skill-distribution` remain historical/capability-source references and cannot advance overlapping work. `improve-tui-interaction-and-wsl-image-paste` remains an independent proposal; no TUI, image-paste, Matrix, Zentui, keybinding, or settings implementation was imported by this reconstruction. `replace-pi-native-fallback-with-aili-emergency-checkpoint` remains proposal-only and blocked on an official Pi provider-runtime seam.

Current live provider/model/auth/transport/retry and real process-loss behavior remain unverified for this candidate. Real user HOME, real WSL2/clipboard/terminal behavior, public npm-registry composition, and final tarball exposure also remain unverified.

## Operation authority

Commit, push, merge, npm publish, GitHub release, installation, and real WSL operations have not been executed. Task 7.3 remains unchecked; each operation remains a separate ROSE gate.

## Superseding bounded 0.1.16 SHIP repair

The loaded Extension now exposes parent/ROSE-only `hub formal-plan` and `hub formal-reconcile` actions. Planning requires exact change/package identity plus current operation, ownership and normalized write-scope evidence; reconciliation remains explicit. Child Agents are denied both actions. Neither path automatically dispatches, replays, accepts, closes a join, marks done, or advances phase.

Generated role adapters retain ordinary JSON output and explicitly defer to the Runtime's exact line-oriented formal override. The role manifest records the ordinary scope and canonical formal marker/field order. Restart collection now includes all same-Agent/same-formal-identity continuation turns, so nonterminal follow-ups preserve the package and failed, aborted, interrupted, or completed-without-fresh-immutable-evidence follow-ups cannot reuse the initial result to return.

Mutation-capable formal roles now require a non-empty normalized public write scope before allocation. The same validated scope is carried by the production plan, task request, continuation audit and workspace lease; in-scope writes remain eligible while out-of-scope and owning-Board writes remain fail closed. Read-only effective profiles may use an empty scope.

The 0.1.16 prepublish gate now includes generated role/routing validation transitively, compatibility/provenance checks, and the focused loaded Runtime/catalog test. `validate:interim-release` remains available only as historical 0.1.15 validation and is not in the 0.1.16 gate. README now identifies provenance and other source-checkout gates as repository-only because `package-lock.json`, tests and the shared Skill snapshot are excluded from the installed tarball.

Fresh final evidence passes the complete `prepublishOnly` chain, typecheck, strict OpenSpec, diff hygiene, the loaded Extension planning/reconciliation and formal prompt/continuation/write-scope matrices, and the full suite: `93` files passed, `2` skipped; `733` tests passed, `2` skipped. The Linux disposable lifecycle passes `0.1.12→0.1.16→removed` while preserving the seeded shared tree hash. Review follow-up additionally denies resource-only formal file mutation, path-only formal resource mutation, and in-root symlink scope escapes. The stale packaged Compact version sentence and Sakura notice attribution were corrected.

The actual candidate has no `openspec/`, `tests/`, repository `skills/`, `.pi/`, `.tmp/`, or `graphify-out/` path. A bounded first-party scan found no private-key, GitHub/OpenAI/AWS token shape, private host path, or DCP marker. This is a bounded static exposure result, not a universal secret guarantee.

Package identity remains `@rosetears/aili-pi@0.1.16`. No commit, push, merge, publish, release, install, dependency, lockfile, real HOME, or real WSL operation was performed.
