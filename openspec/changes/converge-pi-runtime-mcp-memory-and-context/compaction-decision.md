# Compaction Decision: Codex Remote V2 First, ACP for Other Providers

## Status

Accepted product direction on 2026-08-12. This decision supersedes the earlier plan to use `algal/pi-openai-server-compaction` for both `openai` and `openai-codex`.

Implementation remains paused until the affected specification, tasks, and final test plan are revised, strictly validated, and explicitly reaccepted. Dependency, lockfile, vendoring, provider probes, user configuration, Git, publish, and release operations remain separately gated.

## Decision

AILI will use exactly one context/compaction owner per provider turn:

| Provider | Context and compaction owner | Current intent |
|---|---|---|
| `openai-codex` with `openai-codex-responses` | `@narumitw/pi-codex-compact`, pinned to an exact verified release | Codex Remote Compaction V2 for automatic/manual compaction and opaque-checkpoint replay |
| Every other provider, including direct `openai`, Azure, custom OpenAI-compatible endpoints, Anthropic, Google, and others | complete pinned `billion-context-pi` | ACP context management and complete upstream tool/delegation surface |

AILI will not load, vendor, or adapt `algal/pi-openai-server-compaction` in the current implementation. Direct OpenAI `previous_response_id`, custom WebSocket transport, HTTP fallback, and hybrid portable-summary behavior are deferred until a later accepted change demonstrates a real need.

For the initial Codex path, the target baseline is the currently observed `@narumitw/pi-codex-compact@0.50.0`, subject to fresh BUILD verification of npm identity, integrity, source revision, license, Pi compatibility, and package inventory. The package's extension-owned transport retries must not create a second retry loop; the integration must use zero extension retries or an equivalently proven single-owner arrangement while Pi remains the retry budget/backoff owner.

## Why

The primary workload is Codex. The highest-priority outcome is better compaction continuity, followed by speed, token use, and cache behavior. `pi-codex-compact` is narrowly designed for Pi's built-in `openai-codex` OAuth provider and Pi 0.84.1-era APIs. It leaves ordinary Codex transport ownership with Pi and concentrates on Remote Compaction V2 checkpoint creation, persistence, exact replay, repeated compaction, and safe fallback.

Using the broader algal runtime on the Codex route would duplicate the same remote-checkpoint responsibility and add a second replay owner. Its strongest additional features—direct OpenAI `previous_response_id`, custom Responses WebSocket transport, HTTP fallback, and a portable plaintext summary generated beside the opaque artifact—primarily serve direct `openai/*` and cross-provider portability. Those benefits do not currently justify their larger integration, state, token, and compatibility surface.

`billion-context-pi` remains the complete context runtime for all non-Codex providers, including its `compress`, `decompress`, `search_context`, `acp_status`, and `acp_delegate*` behavior. ACP delegation remains a separate non-formal surface and does not become a persistent AILI Agent.

## Checkpoint replay comparison retained for future diagnosis

Both implementations use the same core idea:

> Find the newest compatible opaque compaction item in the session and restore it into the Responses API input before the next compatible provider request.

The differences are in location, validation, surrounding history, and fallback.

| Aspect | `@narumitw/pi-codex-compact` | `algal/pi-openai-server-compaction` |
|---|---|---|
| Replay target | Exact compatible `openai-codex` model/API | Compatible direct OpenAI and OpenAI Codex models |
| Location | Places one checkpoint marker in Pi context and replaces exactly that marker before provider dispatch | Reconstructs provider-native state from the session branch and builds an explicit replay history |
| Consistency checks | Checkpoint/model identity, exactly one marker, retained-message fingerprints, bounded persisted shape | Model key, newest remote compaction entry, and provider/model-compatible trailing branch messages |
| Persisted checkpoint neighborhood | Opaque item plus bounded recent raw user history | Opaque replacement history plus compatible user/assistant/tool history accumulated after compaction |
| New turns after compaction | Pi constructs normal context; the provider hook replaces the marker | Runtime maintains and extends an explicit provider-native history |
| Repeated compaction | Expands the prior checkpoint, then creates the next checkpoint | Continues from reconstructed remote history |
| Mismatch behavior | Does not guess or inject; retains a visible marker and recent Pi messages | Drops/avoids incompatible remote state and falls back to the portable Pi path |
| Cross-provider degradation | Explanatory marker and recent retained messages only | A real plaintext Pi summary remains available |
| Explicit size bounds | Opaque item 2 MiB, persisted replacement history 8 MiB, recent user-history budget configurable; upstream default observed as approximately 64K tokens | Persists replacement history, but the reviewed implementation is not centered on the same checkpoint hard-bound contract |
| Integration surface | Pi `context` projection plus `before_provider_request` marker replacement | Session remote-state reconstruction plus direct-OpenAI continuation/transport integration |

### Narumitw replay behavior

The package records a marker shaped like:

```text
[PI_CODEX_REMOTE_CHECKPOINT:<id>]
```

Before replay it verifies the active model, checkpoint identity, retained-message fingerprints, and that the provider payload contains exactly one expected marker. It then replaces that marker with bounded recent user history plus the opaque checkpoint. Any mismatch fails closed rather than injecting guessed history.

This is the selected Codex behavior because it is narrow, explicit, bounded, and aligned with the current provider priority.

### Algal replay behavior

The algal runtime reads the latest remote compaction details from the active branch, gathers compatible user/assistant/tool items that follow it, and constructs an explicit provider-native history. For direct OpenAI it can also coordinate that history with `previous_response_id` and a custom WebSocket/HTTP transport path.

This is broader and can preserve more post-compaction provider-native state, but it creates a larger state machine and Pi-version compatibility surface. It is retained here as prior-art evidence, not as current production scope.

## Speed, token, and cache implications

1. **Checkpoint quality:** if both integrations receive the same valid Remote Compaction V2 opaque item, replay mechanics do not improve the opaque item's internal quality. Quality depends primarily on the server compaction result, source context, retained recent history, and correct continuation after the checkpoint.
2. **Latency:** the selected Codex package avoids a second custom transport and lets Pi's built-in Codex provider own ordinary turns. This minimizes local integration work. Direct OpenAI `previous_response_id` and WebSocket can reduce request upload and connection latency, but those are not current Codex-path benefits.
3. **Input tokens:** `previous_response_id` reduces transmitted payload but does not imply that prior context is free or absent from usage. Long-term token reduction comes mainly from compaction and the amount of recent history retained beside the checkpoint.
4. **Retained-history budget:** upstream currently defaults to approximately 64K tokens and permits a lower bounded setting. A 32K starting point may improve speed and token use, but it is not accepted as the product default until a representative long-session comparison shows that continuity remains adequate.
5. **Prompt cache:** stable instructions/tools/prefixes generally improve cache reuse. Generating a fresh plaintext summary on every successful remote compaction changes the prefix and adds summary-generation output, so the current Codex-first design does not add algal's parallel portable summary. Cache behavior and billing must be judged from actual provider usage evidence rather than payload size alone.

## Consequences

- There is exactly one Codex compaction/replay owner: `pi-codex-compact`.
- `billion-context-pi` must bypass Codex context projection and compaction cancellation while retaining its independent delegation tools.
- Direct `openai` is ACP-routed in this change; it does not receive algal's server compaction, `previous_response_id`, or custom transport.
- Removing or disabling `pi-codex-compact`, or switching away from its compatible Codex model, exposes only the marker/fallback text and retained recent messages for older opaque history.
- The initial implementation favors narrower ownership and lower maintenance cost over cross-provider portability.
- If real sessions lose important assistant/tool state after compaction, first evaluate the checkpoint-adjacent history policy and retained-history budget. Do not add a second replay owner.
- Adding algal later requires a new provider-specific contract, ownership matrix, token/cache benchmark, and explicit test-plan acceptance.

## Evidence and source URLs

Sources were read on 2026-08-12. Public pages and branches can change; BUILD must pin immutable package/source identities before dependency or vendoring operations.

- Narumitw package source and README: https://github.com/narumiruna/pi-extensions/tree/main/packages/pi-codex-compact
- Narumitw package README: https://github.com/narumiruna/pi-extensions/blob/main/packages/pi-codex-compact/README.md
- Narumitw checkpoint implementation: https://github.com/narumiruna/pi-extensions/blob/main/packages/pi-codex-compact/src/checkpoint.ts
- Narumitw lifecycle/provider hooks: https://github.com/narumiruna/pi-extensions/blob/main/packages/pi-codex-compact/src/codex-compact.ts
- Narumitw protocol marker replacement: https://github.com/narumiruna/pi-extensions/blob/main/packages/pi-codex-compact/src/protocol.ts
- Narumitw npm package: https://www.npmjs.com/package/@narumitw/pi-codex-compact
- Algal repository: https://github.com/algal/pi-openai-server-compaction
- Algal architecture: https://github.com/algal/pi-openai-server-compaction/blob/main/ARCHITECTURE.md
- Algal validation evidence: https://github.com/algal/pi-openai-server-compaction/blob/main/VALIDATION.md
- Algal product-default benchmark: https://github.com/algal/pi-openai-server-compaction/blob/main/benchmarks/product-defaults/REPORT.md
- OpenAI compaction guide: https://developers.openai.com/api/docs/guides/compaction
- OpenAI Responses migration and `previous_response_id`: https://developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI Responses WebSocket mode: https://developers.openai.com/api/docs/guides/websocket-mode
- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
- Billion Context Pi package/source identity already selected by this change: https://www.npmjs.com/package/billion-context-pi

## Verification still required

- Exact npm version/integrity/git identity and complete package inventory for `@narumitw/pi-codex-compact`.
- Exact behavior and compatibility on the pinned Pi 0.84.1 runtime.
- Proof that only one Codex compaction/context owner mutates each turn.
- Automatic, manual, threshold, overflow, repeated compaction, reload, resume, fork, model-switch, malformed marker, fingerprint mismatch, bounded-history, cancellation, and Pi fallback tests.
- A representative provider-backed long-session comparison before changing the upstream retained-history default from 64K to 32K.
- Proof that extension-owned transport retry is disabled or otherwise cannot create a second retry loop beside Pi.
- Package, provenance, notices, SBOM, doctor, clean-install, and upgrade evidence.
