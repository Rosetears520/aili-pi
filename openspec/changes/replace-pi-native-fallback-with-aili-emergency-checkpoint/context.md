# Change Context: Pi-Compatible AILI Emergency Checkpoint

## Status

DEFINE was reopened on 2026-08-02 after the user directed this proposal to fit Pi's currently public interfaces and remove the AILI-only design. The 2026-08-01 final-test-plan acceptance and BUILD authorization applied to the superseded AILI-only contract and do not carry forward. The user accepted the revised final test plan and granted revised repository-local BUILD authorization on 2026-08-02.

## Public Host Boundary

The verified Pi `0.82.1` Extension surface provides:

- `session_before_compact`, which may return a complete custom compaction result or no result;
- public fire-and-forget `ctx.compact()` with completion/error callbacks;
- `session_compact`, including persisted entry/origin information and `willRetry`;
- `ctx.model`, `modelRegistry`, `getContextUsage()`, lifecycle events, and public message APIs.

It does not provide an Extension-bound operation for running an AILI-owned summary through the active Agent's complete `ModelRuntime`/`streamFn` composition, a durable continuation token/receipt, or a documented cancellable pre-provider dispatch veto. Pi `0.83.0` adds useful public metadata and transport support but does not close those three gaps.

The revised design does not wait for or emulate those missing seams. Pi native compaction is the supported path that already owns active provider/model/auth/headers/env/transport/retry composition and overflow continuation.

## Current Product Decisions

- AILI and Pi cooperate: AILI owns reversible semantic projection and deterministic checkpoint planning; Pi remains the mandatory native checkpoint and overflow-recovery backend.
- Every compaction hook returns only a validated AILI envelope or exact JavaScript `undefined`; no cancel-only path is allowed.
- `activeBlocks=0` and incomplete semantic coverage fall through to Pi native summary rather than invoking an AILI provider request.
- A persisted custom or native `CompactionEntry` creates the new epoch. Callback or tool completion alone is not durable success.
- AILI observes host `willRetry` but never synthesizes a continuation turn.
- Pressure policy may schedule one proactive `ctx.compact()` at an idle/settled boundary. It does not claim a per-dispatch zero-request guarantee unavailable from the public API.
- Parent and persistent child Sessions retain independent session/branch/epoch/coordinator state. This change does not claim cross-runtime child orchestration beyond registered production evidence.
- Pi branch/tree summary behavior remains host-owned.
- Canonical configuration remains read-only hybrid/native-fallback; no HOME migration occurs.
- Provider-only guidance is transient, identity-bound and non-authoritative.

## Dependencies and Evidence Boundaries

Relevant predecessor contracts remain:

- `openspec/changes/add-reversible-context-compression/`
- `openspec/changes/fix-aili-compact-recovery-deadlock/`
- `openspec/changes/redesign-aili-compact-lifecycle/`

The current delta must preserve their P0 recovery invariants and exact merged requirement headings. Independent strict validation is not complete merged-contract proof.

No dependency, lockfile, version, settings, HOME, provider credential, Git, publish, release, or installation operation is authorized by this DEFINE revision. Real provider/installed-package evidence remains separately gated. Raw Sessions, credentials, provider requests and private runtime data must not enter repository artifacts.

## Open Gates

- Revised final `test-plan.md` acceptance and repository-local BUILD authorization were recorded on 2026-08-02.
- Sequential merged-contract validation through this current delta.
- BUILD verification of any implementation difference found against the revised contract.
- Pi `0.83.0` runtime compatibility remains `Unverified` until separately installed/run; source compatibility alone is not runtime proof.
