## 1. Vendored evaluator

- [x] 1.1 Add `upstream/billion-context-pi/src/pressure-evaluator.ts` exporting `createAcpPressureEvaluator()` with decision-only `processTurn` (`renderTags: "none"`), in-memory per-session `CompressionState`, shared config/token resolution, and `reset(ctx)`; never persist `.acp.json`, never inject or prune.
- [x] 1.2 Export the evaluator and its types from `upstream/billion-context-pi/src/index.ts`.
- [x] 1.3 Rebuild vendored dist with its own toolchain (`npm ci && npm run build`) and remove the vendored `node_modules` afterwards to keep a single Pi instance.

## 2. AILI orchestration layer

- [x] 2.1 Add `src/runtime/context-pressure.ts` (`wireContextPressure`): `turn_end` observation gated on the codex owner, in-flight guard, `ctx.compact()` with onComplete/onError clearing, evaluator-failure diagnostics.
- [x] 2.2 Register the threshold gate (`session_before_compact` reason `threshold` + codex owner → `{cancel:true}`) and the `session_compact` baseline reset, plus switch/shutdown hygiene resets.
- [x] 2.3 Wire into `createProviderRoutedContextExtension` in the order acp → pressure → codex, with an injectable `pressureEvaluator` option.

## 3. Tests

- [x] 3.1 `tests/unit/context-pressure.test.ts`: no-pressure → no compact; pressure → exactly one compact per epoch with repeated `turn_end` held; emergency path; observe failure is diagnostic-only; `session_compact` resets baseline and in-flight; gate matrix (threshold/codex cancels, manual/overflow pass, non-codex and modelless pass); non-codex/modelless `turn_end` ignored; switch/shutdown resets.
- [x] 3.2 Real-evaluator integration: baseline observation does not trigger; growth + compressible mass triggers `shouldRelieve` below the emergency line; `reset` starts a fresh epoch.
- [x] 3.3 Update `tests/integration/codex-remote-compaction-compat.test.ts`: three `session_before_compact` handlers, gate ordering/behavior matrix, non-codex ownership unchanged.

## 4. Governance and verification

- [x] 4.1 Pin the new symbols in `tests/unit/context-upstream-inventory.test.ts` (src export, decision-only marker, dist marker) and update `manifests/provenance.json` + `THIRD_PARTY_NOTICES.md`.
- [x] 4.2 `npm run typecheck`, focused vitest suites, full `npm test`, `npm run validate:capabilities`, and `openspec validate unify-context-pressure-timing --strict` all pass.
- [x] 4.3 Keep this change within v1 scope: no own thresholds, no ACP HOW changes, no pi-codex-compact modifications, no dependency/lockfile changes.
