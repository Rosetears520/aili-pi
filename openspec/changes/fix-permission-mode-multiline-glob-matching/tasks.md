## 1. Readiness and baseline

- [x] 1.1 Record the user's 2026-07-24 acceptance of the final `test-plan.md` and repository-local BUILD authorization.
- [x] 1.2 Lock `pi-permission-modes@2.2.0` revision `23d65d10a53b67043cae42322acf9044d6edb196`, source/adapted file inventory, hashes, MIT license, and the observed multiline reproduction.
- [x] 1.3 Preserve the separate gate: no dependency/lockfile, installed `node_modules`, `~/.pi/agent`, external repository, Git, publish, or release mutation occurred.

## 2. Reproducible 2.2.0 adaptation

- [x] 2.1 Materialize the generated two-file Package-owned runtime adaptation from the exact upstream baseline, with an upstream/adapted lock inventory and no undeclared source drift.
- [x] 2.2 Change the shared glob compilation so `*` and `?` include all ECMAScript line terminators while preserving escaping, home expansion, anchoring, code-unit behavior, and definition order.
- [x] 2.3 Route AILI's single native integration entry exclusively to the adapted permission runtime without duplicate command, shortcut, tool, or `tool_call` handler registration.
- [x] 2.4 Preserve stock defaults, sandbox/network lifecycle, approvals, protected paths, project tighten-only composition, headless fail-closed behavior, and custom mode support.
- [x] 2.5 Resolve the exact dependency through Node package resolution so generation and runtime validation work when npm hoists it outside the scoped Package's local `node_modules`; cover the installed layout with a fixture.

## 3. Focused regression coverage

- [x] 3.1 Add pure matcher tests for empty/single/multiline targets, `\n`, `\r`, U+2028, U+2029, `*`, `?`, UTF-16 boundaries, literal escaping, home expansion, and last-match-wins.
- [x] 3.2 Add policy-engine tests for `resolveSurface`, `decide`, and `decideBashCommand`, including allow/ask/deny, sparse fallback, all shared surfaces, multiline custom targets, and most-restrictive project overlays.
- [x] 3.3 Add real adapted-Extension dispatcher tests proving stock YOLO never calls confirmation UI for multiple distinct multiline/heredoc/internal/external Bash commands and that file/external-directory/web-search surfaces share the matcher.
- [x] 3.4 Add negative dispatcher tests proving custom unsandboxed ask still prompts, deny still blocks, no-UI ask fails closed, and session approval behavior remains exact-command scoped where ask is intentional.
- [x] 3.5 Retain Build/Plan/Default sandbox, external-path, network, protected-path, and existing generic permission regressions.

## 4. Provenance, diagnostics, and documentation

- [x] 4.1 Change the permission integration provenance state from unmodified dependency to adapted exact source; update source files, symbols, localChanges, verification, MIT license/notice, SBOM, and generated hashes.
- [x] 4.2 Make doctor/release evidence identify the adapted 2.2.0 baseline and reject vanilla, stale, missing-hash, or unverified matcher states; package/runtime integration covers duplicate registration.
- [x] 4.3 Update README/troubleshooting with the multiline glob defect, fixed semantics, custom ask/deny preservation, and future upstream migration boundary.
- [x] 4.4 Keep `/sandbox` notification visibility, subagent provider readiness, quota/theme UI, credential guard semantics, and unrelated integrations explicitly out of scope.

## 5. Verification

- [x] 5.1 Run focused permission matcher/dispatcher/integration tests, typecheck, and the full test suite.
- [x] 5.2 Run generated-drift, provenance, compatibility, capability/doctor/release, package, strict OpenSpec, package dry-run, and `git diff --check` validation; release reports no permission-adaptation error and remains non-pass only for separately unverified subagent live evidence.
- [x] 5.3 Inspect the final diff for no undeclared upstream changes, no duplicate permission handler, no permissive fallback, no weakened ask/deny/overlay, and no task-unapproved dependency/global/install/Git mutation.
