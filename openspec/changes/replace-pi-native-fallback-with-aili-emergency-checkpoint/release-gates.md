# Release Gates: replace-pi-native-fallback-with-aili-emergency-checkpoint

Gates are sequential. The historical 2026-08-01 AILI-only acceptance/BUILD authorization is superseded and satisfies no current gate.

## G0 — Revised DEFINE Acceptance

- [x] Revised proposal, context, design, capability deltas, tasks, migration and release gates are coherent.
- [x] Revised final `test-plan.md` was explicitly accepted on 2026-08-02.
- [x] Repository-local BUILD authorization was granted for the revised contract on 2026-08-02.

**Stop:** no source implementation begins before revised final-test-plan acceptance and separate revised repository-local BUILD authorization.

## G1 — Sequential OpenSpec Contract

- [ ] Base reversible-compression contract validates.
- [ ] P0 recovery delta validates against the base.
- [ ] Lifecycle redesign validates against base plus P0.
- [ ] This change validates against the exact merged predecessor headings.
- [ ] The merged result preserves custom-or-undefined, Pi final native recovery, no-cancel, append-only and branch/epoch/session isolation.

**Stop:** independent delta validation is not merged-contract proof.

## G2 — Public Pi Common Subset

- [ ] Official Pi `0.82.1` declarations support the exact hook/events/context calls used by BUILD.
- [ ] No private AgentSession/runtime API, direct credential read, provider duplication, `node_modules` edit or Pi fork is present.
- [ ] Missing active-runtime summary, continuation receipt and synchronous dispatch-veto seams are not referenced by implementation or tests as required behavior.
- [ ] Pi `0.83.0` claims remain source-only/`Unverified` unless separately installed and run.

## G3 — Core Arbitration and Planning

- [ ] Manual/threshold/overflow total matrix returns complete custom envelope or exact `undefined` only.
- [ ] Disabled, deterministic-off, native permit, empty catalog, gaps, stale/invalid input and exceptions preserve native fallthrough without partial mutation.
- [ ] Complete accepted current-epoch coverage passes exact preparation/protocol/source/quality/lineage/bounds checks.
- [ ] No cancel path or extension-owned secondary provider summary request exists.

## G4 — Pressure, Persistence and Truth

- [ ] One semantic attempt and one public checkpoint invocation per unchanged pressure cycle pass.
- [ ] Proactive pressure status does not claim an unsupported synchronous provider-dispatch veto.
- [ ] Callback without a matching persisted entry is not durable success.
- [ ] Custom/native/`Unverified` origin and new epoch adoption are truthful.
- [ ] Rebuilding usage and provider suffix actions are current-state truthful and non-authoritative.
- [ ] AILI emits no synthetic continuation message.

## G5 — Commands, Configuration and Session Safety

- [ ] Deterministic rescue, one-use native rescue, status and Pi `/compact` semantics pass.
- [ ] Hybrid/native-fallback config remains read-only and unsafe false is rejected.
- [ ] No HOME or official Pi settings migration occurs.
- [ ] Parent/child, branch/tree, fork, reload and prior/current epoch isolation pass.
- [ ] Copied-session byte prefix and no-raw-sidecar checks pass.

## G6 — Production Entry and Repository Verification

- [ ] Registered production `AgentSession` proves custom deterministic persistence/rebuild.
- [ ] Registered production `AgentSession` proves deterministic ineligibility -> Pi native persistence -> host overflow retry.
- [ ] Focused affected tests and typecheck pass freshly.
- [ ] Generated, package, provenance and release validators pass freshly where applicable.
- [ ] Full suite passes after focused checks.
- [ ] No unauthorized dependency, lockfile, version, settings, HOME, Git or external mutation occurred.

## G7 — Separately Authorized Live Evidence

- [ ] Real provider/auth/headers/transport/SSE/tokenization and external overflow claims have exact approval and fresh sanitized evidence.
- [ ] Pi `0.83.0` installed runtime compatibility has exact approval and fresh evidence.
- [ ] Installed Package, third-party extension ordering, persistent-child runtime and interactive TUI claims have exact approval and fresh evidence.

**Stop:** fake providers, static declarations, synthetic entries and direct hook calls cannot satisfy named live rows.

**Stable-release rule:** the inherited real provider/context-length overflow and host retry row is blocking. Separate authorization controls whether the live operation may run; absence of authorization/evidence leaves stable release blocked rather than excluding the row.

## G8 — Candidate and Mutating Release Operations

- [ ] Candidate/package inspection and sanitizer pass under separate approval.
- [ ] Version/lockfile/provenance/SBOM mutation is separately approved.
- [ ] Commit is separately approved.
- [ ] Push is separately approved.
- [ ] Tag, publish, installation and release are separately approved.

No earlier gate grants a G8 operation.

## Release Verdict

- [ ] The change is ready only after G0 through G6 pass with fresh evidence and every applicable G7 row is satisfied; the inherited real overflow row cannot be excluded from a stable-release claim.
- [ ] Unsupported provider, Pi `0.83.0`, extension-order and interactive claims remain `Unverified`.
