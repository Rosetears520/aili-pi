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

## Authorized interim patch release: `v0.1.15`

On 2026-07-28 the user explicitly requested publication of `0.1.15` instead of `0.1.14` or `0.2.0`, followed by installation into the user's WSL Pi Package directory. This authorizes the exact package/lock/SBOM identity update, task-scoped commit, fast-forward push to `origin/main`, annotated `v0.1.15` tag, public npm/GitHub release, and WSL Pi installation for this interim patch release.

This authorization is a release exception, not retrospective evidence. The package keeps real-provider, interactive, and historical old-binary rows `Unverified`; it does not mark the final `v0.2.0` acceptance checklist complete. The fail-closed Compact candidate validator therefore remains authoritative for the later `v0.2.0` release and is expected to stay `NON_PASS` for this explicitly authorized interim patch.

## Interim patch execution record

The authorized `v0.1.15` release completed on 2026-07-28. npm `@rosetears/aili-pi@0.1.15` is public and is the `latest` dist-tag; annotated tag `v0.1.15` and the GitHub Release bind release commit `bf7b41eef62a614d3b5dad26a71f4cebb6988dc7`. The user's real WSL Pi `0.82.1` installation now resolves only `npm:@rosetears/aili-pi@0.1.15`, and Pi's package listing plus extension-loading help smoke both pass.

The complete immutable identity, test summary, installation checks, and remaining evidence boundary are recorded in `ship-closeout-v0.1.15.md`. This execution record changes no final `v0.2.0` gate and grants no future publish, dependency, credential, or live-provider authority.
