# Release Gates: fix-aili-compact-recovery-deadlock

No gate below is currently satisfied by this DEFINE revision. Gates are sequential and fail closed; a later gate does not waive an earlier one.

## G0 — DEFINE Acceptance

- [ ] Proposal, context, design, both deltas, tasks, test plan, migration, and release gates explicitly accepted.
- [ ] Separate BUILD authorization recorded.

## G1 — OpenSpec Contract

- [ ] New capability delta strict-validates.
- [ ] Reversible delta strict-validates against exact base headings.
- [ ] Base plus deltas are applied and strict-validated sequentially in release order.
- [ ] Merged inspection proves exactly one removal and two exact modified reversible requirements.

**Stop:** independent delta passes without merged validation are insufficient.

## G2 — Focused Safety

- [ ] Exact return matrix proves only valid envelope/undefined and no cancellation.
- [ ] Repair schema/identity/1..16 order/partition/batching/atomic replay/concurrency pass.
- [ ] Reducer+projector+start/tree/fork/reload and raw fail-open pass.
- [ ] Age, permit, coordinator, pressure, epoch, commands, config, and doctor focused checks pass.

## G3 — Host and Production Entry

- [ ] Disposable-HOME absent/true/false/malformed/unrelated/idempotent matrix passes.
- [ ] Effective-false automatic versus manual host behavior is demonstrated truthfully.
- [ ] Registered production `AgentSession` overflow reaches the Extension hook and preserves custom/native fallthrough and retry/continued-work behavior.
- [ ] Accepted rescue proves `ctx.compact()` exactly once and `sendUserMessage()` zero times.

**Stop:** direct planner/handler-only evidence cannot satisfy production-entry gates.

## G4 — Repository Verification

- [ ] Focused unit/bootstrap/integration checks pass freshly.
- [ ] Typecheck, package, generated, and provenance validators pass freshly.
- [ ] Full test suite passes after focused checks.
- [ ] No unauthorized dependency/version/lock/settings/HOME/Git mutation occurred.

## G5 — Migration and Fake Evidence

- [ ] Copied-session matrix proves old byte-prefix preservation, selective repair, atomic reject, reload/tree/fork, epoch ancestry, search, and rollback.
- [ ] Fake-provider matrix proves every reason/fallback/race/storm/continued-work branch.
- [ ] Sanitized manifests pass their validators and contain no source bodies or private local material.

## G6 — Separately Authorized Live Pi 0.82.1

- [ ] LIVE-P0-1 deterministic rescue.
- [ ] LIVE-P0-2 native rescue/fallback and one-use permit.
- [ ] LIVE-P0-3 automatic threshold.
- [ ] LIVE-P0-4 controlled real overflow/retry through production entry.
- [ ] LIVE-P0-5 AILI-off and effective-false/manual behavior.
- [ ] LIVE-P0-6 copied mixed legacy repair.
- [ ] LIVE-P0-7 installed extension composition/order.

**Stop:** static or simulated evidence is not live evidence. If controlled real overflow is not reproducible, stable release remains blocked and the result is `Unverified`.

## G7 — Candidate and Claims

- [ ] Public docs match command, setting, repair, epoch, and rollback matrices.
- [ ] Doctor contains no inferred PASS for setting effectiveness, origin, provider behavior, or extension order.
- [ ] Candidate/package inspection and sanitizer pass under separate approval.
- [ ] Release manifest binds exact fresh automated, migration, fake, production-entry, and live evidence.

## G8 — Mutating Release Operations

- [ ] Exact version/lock/provenance mutation separately approved and verified.
- [ ] Commit separately approved.
- [ ] Push separately approved.
- [ ] Tag/publish/release each separately approved.

No acceptance, BUILD, test, or candidate gate implicitly grants a G8 operation.

## Release Verdict

- [ ] `v0.1.14` is ready only when G0 through G7 pass and any requested G8 action has its own approval.
- [ ] Every unsupported fact remains explicitly `Unverified`.
