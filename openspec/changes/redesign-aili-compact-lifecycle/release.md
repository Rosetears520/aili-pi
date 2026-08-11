# Release Gates: redesign-aili-compact-lifecycle

Target: `@rosetears/aili-pi@0.2.0`. This document authorizes no BUILD, credential, network, version, Git, publish, tag, or release action.

## Blocking candidate gates

- [ ] Sequential materialized OpenSpec validation passes for base, base+P0 fix, and base+P0 fix+redesign, including exact modified base-requirement headings.
- [ ] Every P0 live gate is rerun freshly on the candidate; prior release evidence is not reused as a substitute.
- [ ] PR2–PR5 matrices, copied-session migration, fake-provider state contracts, deterministic 10K/100K budgets, package/provenance/sanitizer, and continued-work evidence pass.
- [ ] Quality goldens are independently hand-written and cover runtime-only extraction, UTF-16 spans, exact normalization, exact durable agent/job/turn/message/history refs, and all fail-closed paths.
- [ ] Economics tests derive all replacement and one-time values through production projector/provider serializers.
- [ ] Long-session quality runs T1→T2→T3→T3 restill using accepted defaults and human review.

## Provider and overflow gates

All LIVE-V2 rows and P0 live rows SHALL pass for all three project support families: OpenAI, Anthropic, and Google Gemini. Provider-reported usage is required for any real cache-hit claim; logical prefix identity is never represented as a provider cache implementation identity.

Production overflow evidence SHALL use official Pi 0.82.1 `AgentSession`: reproduce a real provider/context-length failure, observe `session_before_compact(reason="overflow")`, observe AILI custom result or `undefined`, observe persisted custom/native checkpoint, observe Pi retry the original request, and observe later work succeed. A synthetic CompactionEntry, directly invoked hook, fake retry event, or substitute harness is non-evidence and leaves the gate FAIL/Unverified.

## Extension composition gate

Use one controlled third-party context handler with deterministic observable transformation. Run it registered before AILI and after AILI. In both orders verify protocol validity, exact fail-open behavior, suffix placement/non-persistence, BranchIndex alignment/counters, checkpoint/native fallback, and continued work. Unknown uncontrolled handlers remain `Unverified`, but either controlled-order failure blocks release.

## Evidence rules

Artifacts contain only versions, bounded IDs/digests/counters/usage/verdicts and sanitized event order—never credentials, raw conversation/provider requests, protected text, or full logs. Missing, stale, synthetic, wrong-provider, or unsanitized evidence fails closed. Acceptance remains unchecked until an authorized run produces reviewed evidence.
