# BUILD Drift Log

## 2026-07-22 — Canonical migration requires owning-repository DEFINE

- [KNOWN|USER] The accepted `aili-pi` contract requires canonical skill正文 changes to occur only in `aili-workflows`, followed by an exact pinned snapshot in `aili-pi` (source: `context.md`, `design.md`, and tasks 2.1-2.7).
- [COMPUTED] Read-only inspection of `aili-workflows@a56a02b3c092f3bab86eaee0e44be6e703d9f78a` found 64 manifest rows matched by 64 canonical skill directories, but no accepted per-skill capability schema or migration change in that owning repository.
- [INFERRED] Selecting a new inventory schema, warning-versus-blocking behavior, mandatory validator/CI integration, frontmatter contract, or rewrites of backend-specific Task/browser/memory/permission semantics is not mechanical BUILD hydration; it changes owning-repository contract, acceptance, permissions, or verification strategy.
- [FRAME] Classification: `BUILD_MATERIAL_DISCOVERY`.
- [FRAME] Effect: No canonical skill file, manifest, test, script, lockfile, or Git metadata was modified in the attachment. Downstream snapshot task 2.7 and packages depending on its inventory remain blocked.
- [OPEN QUESTION] Required DEFINE decision: accept an upstream-owned change specifying capability inventory fields/location, backend-anchor disposition rules, `blocked` policy, OpenCode regression integration, and exact allowed rewrite boundaries.
- [UNVERIFIED] The preserved attachment has no target-specific CodeGraph index; a nested `codegraph status` resolved the host index and was not used as target evidence.

### Resolution — 2026-07-22

- [KNOWN|USER] The user pushed and identified the upstream work as complete for consumption.
- [COMPUTED] `aili-workflows@26fb4046e2623826b5c2a2dd8e64e68b05b568a9` now defines the canonical capability contract, complete 64-skill profile assignment, missing-capability behavior, and a deterministic coverage checker.
- [COMPUTED] The checker passed for all 64 installed skills in a clean detached attachment.
- [INFERRED] The owning-repository DEFINE blocker is resolved. Remaining per-skill hashes, anchor disposition, Pi adapter status/reason, and Pi verification are consumer evidence owned by `aili-pi`, not a reason to rewrite the accepted upstream contract during this BUILD.
- [FRAME] BUILD may resume at deterministic snapshot/lock generation after a fresh exact source-to-host write approval.

### npm package exact-snapshot conflict — 2026-07-22

- [COMPUTED] The approved consumer sync produced an exact 64-skill/472-file snapshot from upstream revision `26fb4046e2623826b5c2a2dd8e64e68b05b568a9`; deterministic lock, per-skill compatibility evidence, positive verification, and manual-drift rejection pass.
- [COMPUTED] `npm pack --dry-run --json` omits exactly `skills/minimax-docx/.gitignore`, so the published package would contain 471 of the 472 locked canonical files.
- [COMPUTED] Explicitly allowlisting that path and adding a root `.npmignore` did not change the real package result; both failed experiments were reverted. A separate minimal npm probe showed that the behavior is context-dependent, so no universal npm claim is made.
- [INFERRED] Treating the omission as harmless inside `aili-pi` would weaken the accepted exact-snapshot contract. The canonical file is not skill prose, but removing or renaming it belongs to `aili-workflows`; a consumer-side rename/archive is a transformation.
- [FRAME] BUILD_MATERIAL_DISCOVERY: P2 remains incomplete until a new canonical revision eliminates the packaging conflict or DEFINE explicitly accepts a package-level exception and updates verification expectations.

### Resolution — final canonical snapshot

- [COMPUTED] Upstream commit `7eb35f357ad489f5841ee10dac1e44549c1bdb76` removes the nested ignore file and centralizes equivalent repository-only rules without modifying shared Skill runtime content.
- [COMPUTED] The replaced snapshot and npm dry-run now agree on all 471 canonical files; no consumer exception or semantic transformation was introduced.
- [FRAME] The npm package exact-snapshot conflict is resolved. Remaining compatibility statuses belong to later Pi runtime/adapter verification and are not drift from the canonical snapshot.

## 2026-07-22 — Mutation-capable child roles remain blocked

- [COMPUTED] P8 evidence promotion leaves no blocked skill record, but stable-release validation still reports exactly `implementer` and `test-engineer` as blocked role profiles.
- [OPEN QUESTION] Mapping their upstream edit semantics to Pi `write`/`edit` would permit bounded child file mutation when the parent-active tool set, role, bounded-YOLO mode, canonical project root, and explicit task path all allow it. That security-sensitive behavior requires explicit approval.
- [KNOWN|USER] The user selected “保持角色 blocked” after the exact target, risk, recommendation, and denial effect were presented in the current BUILD session.
- [FRAME] Effect: no child-role authority was expanded. Tasks 8.4 and 8.6 cannot satisfy the accepted stable-release exit criteria; `npm run validate:release` must continue to fail on the two exact role records.

### Resolution — approved minimal role mapping

- [KNOWN|USER] After reviewing the recommended constrained path, the user explicitly approved the minimal `write`/`edit` mapping.
- [COMPUTED] `implementer` and `test-engineer` now expose only Pi `write`/`edit` mutation tools; bash remains absent. A write-capable child is rejected before spawn unless the caller provides at least one explicit task path boundary.
- [COMPUTED] Standard/headless mode blocks child writes, bounded-YOLO permits only ordinary writes inside the canonical explicit boundary, and credential/external/symlink targets remain fail-closed. Conservative protected names now include `.envrc`, secret/credential/auth/service-account JSON/YAML files, plus the existing provider stores; canonical symlink aliases to protected files are denied.
- [COMPUTED] Focused security review identified missing explicit-path enforcement and additional credential-name gaps. Both findings were repaired and covered by executable negative tests.
- [COMPUTED] All 19 roles now classify as adapted or optional with zero blocked roles. `npm run validate:release` passes; this resolves the role-specific P8 blocker without granting bash or weakening any higher authority ceiling.

## 2026-07-23 — Stable platform scope revised to Linux-only

- [KNOWN|USER] The user first stated that task 8.3 should consider Linux only and then selected the explicit option to formally change the whole change to Linux-only rather than merely waive macOS E2E.
- [INFERRED] This changes product support, bootstrap behavior, platform metadata, acceptance, and release evidence; it is `BUILD_MATERIAL_DISCOVERY`, not a mechanical task-checkbox update.
- [FRAME] Effect: BUILD is stopped before production-code changes. The proposal, context, design, installation spec, interview decision record, tasks, and final Test Plan were revised in DEFINE. The prior Test Plan acceptance is invalid for further BUILD until the revised Linux-only plan is explicitly accepted.

### Resolution — Linux-only BUILD resumed

- [KNOWN|USER] The user explicitly accepted the revised Linux-only final Test Plan and resumed BUILD.
- [COMPUTED] Bootstrap, capability metadata, doctor, stable-release platform gate, local E2E command, README, and project facts now declare Linux only. macOS and native Windows stop before Pi/AILI mutation with explicit unsupported-platform evidence.
- [COMPUTED] Linux clean/repeat/failure fixtures, real offline local Package install/list/load/remove, macOS/native-Windows negatives, full validators/tests, package dry-run, and strict OpenSpec validation pass. Tasks 7.1 and 8.3 are complete under the revised scope.

## 2026-07-23 — Live child provider protocol remains unresolved

- [KNOWN|USER] The user approved one minimal real-provider read-only `code-scout` child for `package.json`, then separately approved exactly one same-scope rerun after the first protocol failure. No third call was authorized.
- [COMPUTED] Both real calls returned in about 10–11 seconds without changed files but were classified `protocol_error`. The second bounded diagnostic proved `payload=missing-assistant-message`: the child JSONL stream contained no recognized assistant `message_end` payload for the owned result parser.
- [COMPUTED] Pi 0.81.1 documentation and the official subagent example confirm that `message_end` is the expected JSON-mode event. Unit fixtures now also accept exactly one JSON Markdown fence and emit content-free payload-shape diagnostics; 25 related tests pass, but this did not resolve the live missing-event result.
- [UNVERIFIED] The remaining cause may be provider/event behavior, invocation/task delivery, or another live integration difference. Raw model content was not retained or exposed, and no speculative weakening or third model retry was performed.
- [FRAME] Effect: task 8.6 remains blocked by failed required live-provider evidence. Static stable-release validation still passes, but it is not sufficient for the accepted final BUILD exit criteria.

### Resolution — live provider protocol and read path

- [COMPUTED] Bounded diagnosis found and repaired four concrete integration mismatches: final text may arrive through `agent_end` or settled text deltas; confidence casing differed; the model emitted bounded `success`/scalar/flat-object variants; and raw repeated JSONL update bytes were incorrectly counted as retained evidence, causing later events to be skipped.
- [COMPUTED] The parser now normalizes only bounded documented/observed variants, retains strict caps, and rejects unknown/nested/oversized shapes. The approved no-tool provider probe and bounded real `code-scout` read of `package.json` both passed with zero changed files. Revision-bound evidence is stored in `manifests/live-verification.json`.
- [FRAME] The live provider blocker is resolved. Task 8.6 remains open for the separate physical shortcut failure below.

## 2026-07-23 — Linux terminal shortcut did not toggle

- [KNOWN|USER] The user ran `pi -e ./extensions/index.ts` in a real Linux terminal, attempted `Ctrl+Shift+Alt+A`, and reported that the requested second step “好像没有用”. The visible state remained `AILI: standard`; the slash command output stated that high-risk operations still require exact approval.
- [KNOWN|USER] Required behavior remains explicit: the shortcut must both open and close bounded-YOLO mode, while `/aili-mode` remains the fallback.
- [COMPUTED] Registration/unit evidence is insufficient to override this manual failure. Test Plan rows R-5, PERM-12, and MAN-3 are marked failed pending focused reproduction and repair.
- [FRAME] Effect: task 8.6 remains open and BUILD cannot be declared complete. No shortcut repair was started because the user requested durable recording and ended work for the night.

## 2026-07-23 — Global AILI skill synchronization

- [KNOWN|USER] The user selected `~/.agents/skills/` as the single runtime source for AILI skills and explicitly approved overwriting only existing same-name skill directories from the fixed embedded snapshot, with no backup, no package-only additions, and no changes to differently named user skills.
- [INFERRED] This changes global filesystem side effects and package skill discovery, so the installation specification and acceptance plan were revised before implementation.
- [COMPUTED] The package now keeps its exact embedded snapshot for provenance/reproducibility but declares only the bundled `pi-web-access` librarian skill to Pi. A guarded npm lifecycle synchronizer runs only below Pi-managed npm package roots and replaces only real matching global skill directories.
- [COMPUTED] A direct approved synchronization updated 64 existing global AILI skill directories; no unmatched skill was added or removed.
- [FRAME] The npm package itself, Extensions, prompts, theme, and librarian skill remain installed; only duplicate runtime discovery of the embedded AILI snapshot is removed.

## 2026-07-24 — Generic subagent and Pi-native global AGENTS contract

- [KNOWN|USER] The user selected a material replacement of public `aili_task` with the full pinned generic `subagent` surface, retaining 19 `aili.*` profiles as optional agents; upstream lifecycle actions, async/background, broad version-bounded fan-out, worktree, external `cwd`, and configurable sandbox become public. Credential/auth/private-key targets remain hard-denied and external writes remain under the active vendor permission policy.
- [KNOWN|USER] The user selected Pi-native synchronization of portable governance mechanisms from `aili-workflows/templates/opencode-global-AGENTS.md`, not a byte-for-byte OpenCode prompt copy.
- [COMPUTED] The current adapter deliberately conflicts with this direction: `src/runtime/subagents.ts` enforces two active children, project-only boundaries, no background/worktree, forced headless/shared/no-sandbox, and AILI-only normalized results. The pinned upstream package exposes the requested generic lifecycle. `pi-permission-modes` documents protected path gating for file tools and parsed bash paths.
- [COMPUTED] The upstream template was fetched read-only at current pinned upstream commit `7eb35f357ad489f5841ee10dac1e44549c1bdb76`; SHA-256 is `45b2c81650433c64e6316f078d1cdb11779cf3a0309eabdbd3fd64d616f3f2c0`.
- [FRAME] Classification: `BUILD_MATERIAL_DISCOVERY`; runtime implementation is stopped. The new report, design, proposal/context, affected specs, task queue, and draft test plan are the DEFINE write-back. The preceding test-plan acceptance is invalid for task 10.
- [OPEN QUESTION] No user decision is currently missing for the draft contract. Real provider/sandbox/external-directory/global-home probes, if later needed, remain separately exact-approval operations rather than implicit effects of the new generic tool.
