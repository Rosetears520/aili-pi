## 1. Readiness and exact-operation boundaries

- [x] 1.1 Record explicit acceptance of this revised final `test-plan.md` and fresh BUILD intent before production/package edits.
  - Verify: acceptance is written to `interview.md`/`test-plan.md`, both reread, and strict OpenSpec validation passes.
- [x] 1.2 Obtain separate exact approval for installing `@earendil-works/pi-coding-agent@0.82.1` and mutating `package-lock.json`.
  - A second explicit approval aligned direct development types `pi-agent-core`, `pi-ai`, and `pi-tui` to exact0.82.1 after the mixed-version TUI typecheck failure.
  - Keep live/TUI, user HOME, Git, publish and release approvals separate.

## 2. Exact Pi 0.82.1 baseline

- [x] 2.1 Update the development dependency and exact npm lock graph to Pi `0.82.1` without opportunistic direct-dependency upgrades.
  - Verify: declared/installed `pi-coding-agent`, `pi-ai`, `pi-agent-core`, `pi-tui` identities and scoped lock diff.
- [x] 2.2 Raise Linux bootstrap minimum to `0.82.1`; update fixtures so `0.82.0` fails before package mutation and `0.82.1` passes.
  - Files: `scripts/bootstrap.sh`, `tests/bootstrap/bootstrap.test.ts`.
- [x] 2.3 Reconcile canonical version owners and generated outputs.
  - Canonical: `src/runtime/registry.ts`, `manifests/adapter-evidence.json`, `manifests/live-verification.json`, `manifests/provenance.json`, README, AGENTS and direct tests.
  - Generated: SBOM, THIRD_PARTY_NOTICES, skill compatibility; use existing generators, never hand-edit generated bulk records.
- [x] 2.4 Reconcile version-bound persistent-Agent diagnostics and host-seam evidence; remove stale legacy subagent provenance where its owner no longer exists.

## 3. Wrapped bash host parity

- [x] 3.1 Forward received `ExtensionContext` to local and sandboxed `createBashToolDefinition()` execute paths without adding a custom session-file reader.
- [x] 3.2 Extend persistent/ephemeral local+sandbox fixtures for all five current `PI_*` values and stale inherited-value removal.
- [x] 3.3 Preserve ask/deny, sandbox-required failure, protected paths and child credential guard; document explicit authorized `PI_SESSION_FILE` reads as ordinary Pi tool behavior.

## 4. Parent, persistent-Agent and host compatibility coverage

- [x] 4.1 Prove parent current model, one-shot child model, profile model and parent fallback continue resolving Pi 0.82.1 registry models without an AILI model metadata map or Provider re-registration.
- [x] 4.2 Run actual 0.82.1 extension loading, native integrations, wrapped permission bash, persistent task/hub/session/delivery/model seams and no-duplicate registration regressions.
- [x] 4.3 Run bounded Zentui/editor compatibility checks; if no real Linux TUI is authorized, retain `UV-TUI-0821-1`.

## 5. Documentation, cache and evidence truthfulness

- [x] 5.1 Document exact 0.82.1 tested floor and that GPT-5.6 context metadata remains Pi-owned at272K unless users explicitly configure Pi's supported override surface.
- [x] 5.2 Keep native compaction/branch-summary `cacheRetention:"none"` outside AILI Compact eligible warm-repeat metrics; update only direct host identity references required by this change.
- [x] 5.3 Bind release/live validation to0.82.1 and mark stale0.81.1 evidence non-pass until separately authorized fresh evidence exists.

## 6. Verification and closeout

- [x] 6.1 Run focused bootstrap, permission, extension-load, persistent-Agent model/runtime and provenance tests.
- [x] 6.2 Run `npm run typecheck`, `npm test`, generated/roles/package/capability/compatibility/provenance validators, strict OpenSpec validation, package dry-run and `git diff --check`.
- [x] 6.3 Inspect final scope: no Pi fork, copied upstream catalog, node_modules edit, raw-session reader, user-home mutation, unrelated dependency upgrade, Git or release action.
- [x] 6.4 Keep unperformed live/TUI evidence explicitly Unverified; do not infer it from deterministic compatibility tests.
