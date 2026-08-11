# Requirements Interview

> **Status: SUPERSEDED.** The decisions below record the former AILI-only design. On 2026-08-02 the user directed this existing proposal to fit Pi's currently public interfaces and remove AILI-only. The revised proposal/design/spec/test plan now use deterministic-first plus Pi-native final recovery. This historical interview does not establish acceptance of the revised final test plan or authorize BUILD.

## 2026-08-02 revision directive

- Source: user instruction to adapt the existing proposal to Pi's available public interfaces.
- Superseded decisions: R1-Q4, R1-Q6 through R1-Q12, and R3-Q13 where they require no native fallback, an Extension-owned provider request, fail-closed branch/tree behavior, three explicit retries, synthetic continuation, AILI-only migration, or a synchronous 90% dispatch veto.
- Preserved intent: session/branch/epoch isolation, deterministic semantic checkpoint preference, bounded attempts, truthful durable status, append-only history, and no private Pi API.
- Revised decision: use Pi-native compaction/retry as the mandatory public recovery backend whenever AILI cannot return a complete deterministic envelope.
- Current gate: revised final `test-plan.md` acceptance is pending; BUILD authorization is absent for the revised contract.

## Historical interview metadata

- Mode: Frontier Batch
- Source: `proposal.md`, `progress.txt`, and the user-reported compaction/continuation behavior
- Historical final round: 3
- Readiness: `SUPERSEDED`
- Implementation authorization: `absent`

The later complete Round 1 reply supersedes the earlier duplicated partial reply.

## Round 1 decisions

### R1-Q4 — Behavior when AILI Compact is disabled

- User answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: while an AILI-managed Session is active, Pi-native summary generation is never an allowed fallback. Disabling AILI Compact makes compaction unavailable rather than restoring Pi-native summaries.
- Write-back target: `proposal.md`, configuration/migration design, and AILI-only recovery specification.

### R1-Q5 — Session coverage

- Round 1 answer: requested a detailed explanation.
- Round 2 answer: compaction for the main Agent and each subagent is separate and independent; each model decides its own compaction.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: AILI-only summary ownership applies to the parent Session and every persistent Agent child Session. Each Session owns an independent catalog, pressure cycle, planner, model decision, checkpoint coordinator, epoch and continuation identity. A parent checkpoint cannot compact, reset, satisfy, or resume a child Session, and a child checkpoint cannot affect the parent or another child.
- Write-back target: scope, child-session lifecycle design, and session-isolation tests.

### R1-Q6 — Summary-surface coverage

- Round 1 answer: requested a detailed explanation.
- Round 2 answer: C.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: this change first delivers AILI-owned manual/threshold/overflow `CompactionEntry` summaries. Any branch/tree operation that would require a Pi-generated summary must fail closed until an AILI branch/tree summary owner is separately implemented; it cannot fall through to Pi native summarization.
- Write-back target: scope, host-hook design, compatibility behavior, and branch/tree negative tests.

### R1-Q7 — Pi `/compact` command

- User answer: the command must remain usable, but default compaction and fallback compaction must both use AILI.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: keep Pi `/compact` available and route its compaction attempt through the AILI planner/hook. It may produce only a validated AILI `fromHook:true` checkpoint; an unavailable AILI candidate yields an explicit error rather than Pi-native summary generation.
- Write-back target: public command behavior, checkpoint recovery specification, and manual-command tests.

### R1-Q8 — AILI summary model

- User answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: AILI summary generation inherits the active Session's effective provider/model, authentication, transport, retry behavior, and compatible thinking configuration rather than selecting a separate summary model.
- Write-back target: provider-runtime design and fake/live provider evidence requirements.

### R1-Q9 — Missing public provider/transport seam

- User answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: stable delivery remains blocked until the required public provider/transport inheritance seam is proven. Missing public capability never authorizes Pi-native fallback, private API use, a Pi fork, or `node_modules` modification.
- Write-back target: blocker, host contract, release gate, and migration plan.

### R1-Q10 — Emergency retry budget

- Round 1 answer: “A + three times”.
- Round 2 answer: A is acceptable.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: each Session/branch/epoch pressure cycle gets one automatic emergency attempt. After failure, the user may invoke `/aili-compact rescue retry` at most three times for that unchanged cycle. The three retries are never automatic, reset only after a new persisted epoch or a verified pressure reset, and never enter Pi-native fallback.
- Write-back target: pressure-cycle state machine, command behavior, counters, and retry tests.

### R1-Q11 — Automatic continuation scope

- Round 1 answer: A, with a request to inspect OpenCode and Codex prior art.
- Round 2 answer: accepted the evidence-backed recommendation.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: only a checkpoint that actually interrupted unfinished work may continue automatically; an idle manual checkpoint never invents a task. Prefer a host-owned same-logical-turn retry when Pi exposes it. Only when a persisted AILI checkpoint interrupted unfinished work and the host will not retry may AILI create one synthetic/internal continuation marker. The marker binds checkpoint and source-turn identity, deduplicates callback/event/restart races, and never replays completed tool calls.
- Write-back target: continuation coordinator, visibility/deduplication design, and race tests.

### R1-Q12 — Legacy hybrid configuration migration

- Round 1 answer: requested a detailed explanation.
- Round 2 answer: directly overwrite and change it.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: an upgrade automatically rewrites the AILI-owned compact configuration from legacy `hybrid`/`nativeFallback:true` to canonical `aili-only` values. The migration is schema-validated and atomic, preserves unrelated valid AILI configuration, refuses symlink/non-regular/malformed targets without byte changes, and never edits official Pi settings. Real HOME mutation remains a separately gated implementation/install operation; this decision records product behavior only.
- Write-back target: config ownership, migration behavior, doctor output, and disposable-HOME tests.

## Round 3 decisions

### R3-Q13 — 90% hard compaction gate

- User answer: 90% itself is the fallback safety boundary, not a fallback used after compaction failure; once a Session reaches that point it must compact.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: before every provider dispatch, each parent or persistent child Session evaluates reliable observed usage and the conservative projection of the pending provider context against the active model context window. An unrounded ratio at or above 90% blocks the request and immediately requires the cycle's automatic AILI emergency checkpoint. Earlier reserve-based thresholds may compact sooner, but no configuration may move this hard gate above 90% or bypass it. The same logical turn can continue exactly once only after an exact persisted `fromHook:true` checkpoint and a rebuilt projection below the gate with required reserve. If compaction is unavailable or fails, the request remains blocked and the Session remains recoverable; it is never sent at the hard gate and never falls through to Pi-native summarization.
- Retry-budget interaction: reaching the hard gate makes the existing one automatic attempt mandatory; a failed attempt does not grant another automatic loop or release the request. The previously accepted maximum of three explicit user retries remains unchanged.
- Write-back target: `proposal.md`, pressure/preflight design, emergency-checkpoint specification, configuration bounds, continuation behavior, and boundary/fault-injection tests.

## Prior-art evidence for R1-Q11

- OpenCode's current compaction service returns `"continue" | "stop"`. For automatic compaction, a `continue` result can append one synthetic user message marked `metadata.compaction_continue: true`; replay recovery instead reconstructs the original user turn. This proves a visible/durable continuation identity is useful, but related loop reports show why it must not be injected after every completed turn. Sources: [OpenCode `compaction.ts`](https://github.com/sst/opencode/blob/dev/packages/opencode/src/session/compaction.ts), [loop report #15533](https://github.com/anomalyco/opencode/issues/15533), and [missing-continuation report #13946](https://github.com/anomalyco/opencode/issues/13946).
- Codex distinguishes pre-turn/manual compaction from mid-turn compaction. Manual/pre-turn compaction uses `DoNotInject` and waits for the next regular turn; mid-turn compaction uses `BeforeLastUserMessage`, replaces history, and continues inside the same `run_turn` loop. Its hardened overflow recovery consumes the sampling/provider retry budget rather than re-entering an unbounded outer loop. Sources: [Codex `compact.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs), [Codex `session/turn.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs), and [Codex PR #22141](https://github.com/openai/codex/pull/22141).
- Applicable pattern: distinguish idle/manual compaction from interrupted mid-turn recovery; continue the same logical turn when the host owns retry; otherwise use one durable synthetic continuation identity and deduplicate it.
- Rejected pattern: unconditional “Continue” injection after every successful checkpoint, because it can invent work or create compaction/continuation loops.

## Historical unresolved frontier (superseded)

At the time of the former interview, the AILI-only compression requirements frontier was considered empty. That conclusion is superseded by the 2026-08-02 revision directive and is not the current contract state.

## Historical status (superseded)

The former requirements-grilling result was `READY` for the AILI-only design and blocked on provider/continuation seams. The revised design removes those dependencies and instead awaits fresh acceptance of its final test plan. No BUILD, provider call, real HOME/configuration write, dependency change, Git operation, installation, publishing, or release is authorized.
