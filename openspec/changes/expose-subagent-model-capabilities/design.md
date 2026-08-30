## Context

See `proposal.md` for motivation. The current runtime already has the necessary pieces, but they are separated:

- `ContextModelCatalog` resolves authenticated/available models for preflight but exposes no Parent-facing snapshot.
- `parseCurrentTurnModelAuthority()` derives authority only from the current direct user prompt and clears it at settlement.
- `resolveModelChoice()` resolves model and thinking independently. A model-only explicit layer currently falls through to the Parent thinking layer, so a Parent `xhigh` can make a GLM model fail before backend startup.
- `SubCoordinator` performs preflight before durable allocation and passes one frozen choice to managed or Herdr.
- Pi exposes the current `modelRegistry`, scoped models, model thinking metadata and input modalities through the Extension context. Pi documents no supported API for mutating an already-registered tool description or opening the native Ctrl+L selector from an Extension.

The design must preserve current-turn user authority, zero-allocation failures, managed/Herdr equivalence, prompt-cache stability and credential redaction.

## Goals / Non-Goals

**Goals:**

- Give the Parent a compact current-turn view of models it can actually request for subagents.
- Keep capability discovery and current-turn authorization mechanically separate.
- Make model-only selection use the target model's default-thinking semantics rather than Parent thinking or highest-supported thinking.
- Improve preflight correction messages without weakening strict failure behavior.
- Reuse the existing Pi model owner and shared preflight for both execution backends.

**Non-Goals:**

- Reimplement or programmatically open Ctrl+L.
- Refresh remote provider catalogs, execute credential resolvers, or mutate auth/settings.
- Add a second public model-catalog tool or dynamic `sub` schema owner.
- Infer ASR/video/tool capability from model modalities.
- Change persistent override precedence, current-turn authority lifetime, or backend ownership.

## Decisions

### D1 — Build one allow-listed snapshot from the current Pi Extension context

A new pure projection will consume the existing current-turn `ExtensionContext` and the same catalog adapter used by preflight. It will:

1. start from `modelRegistry.getAvailable()`;
2. require `hasConfiguredAuth()`;
3. apply one effective-scope predicate: empty `context.scopedModels` means unscoped, while a non-empty list permits only exact canonical entries;
4. canonicalize, validate/escape and sort by `provider/model`;
5. project only canonical id, supported thinking, the isolated-child Pi default (`clampThinkingLevel(model, "medium")`) and `text|image` modalities.

The same scope predicate will be reused by projection, canonical resolution, bare-id resolution, runtime fallback and pre-request revalidation so the displayed and executable catalogs cannot diverge. Supported thinking will use Pi's exported `getSupportedThinkingLevels()`/`clampThinkingLevel()` semantics rather than a second hand-maintained interpretation of `thinkingLevelMap`, especially for opt-in `xhigh` and `max`.

The complete injected catalog-plus-authority section will be capped at 64 models and 16 KiB after deterministic sorting. Canonical ids/aliases receive control-character rejection, delimiter escaping and per-field limits before rendering; truncation is UTF-8 safe, includes the omitted count and tells the Parent not to infer omitted models. Availability means local configured-auth/catalog availability, not proof that a later provider request will succeed.

**Alternative considered:** expose every registry entry. Rejected because unauthenticated/unavailable models differ from Ctrl+L's actionable view and create avoidable prompt volume.

### D2 — Inject per-user-turn guidance through `before_agent_start`, not tool re-registration

A trusted `input` event handler will capture provenance and authority only when Pi reports `source: interactive|rpc`. The existing `before_agent_start` handler will then perform these operations in order:

1. match the pending trusted-input authority to the corresponding Parent turn, otherwise use `inherit-only`;
2. build and freeze the informational catalog and authority summary for that Parent user turn;
3. return `{ systemPrompt: appendBounded(event.systemPrompt, section) }`, preserving the prompt produced by earlier handlers.

The append operation uses a unique delimiter and replaces its own prior section rather than duplicating it if Pi re-enters the hook. Pi chains `before_agent_start` handlers by passing each handler the previous `systemPrompt`; `systemPromptOptions` remains inspect-only and is not used as a mutation API. The section remains available to subsequent model/tool cycles in that user turn without reinjecting it through the recurring `context` hook. The next trusted direct user turn rebuilds it. Dispatch still revalidates live state.

The section uses explicit labels:

```text
Subagent model catalog (discovery only; not authorization)
...
Current-turn subagent model authority
...
```

**Alternative considered:** mutate the `sub` tool description every turn. Rejected because Pi has no documented in-place tool-description update API and re-registration risks tool-owner collisions and cache churn.

**Alternative considered:** add a read-only `sub_models` tool. Rejected for the initial scope because the Parent must know the actionable catalog before constructing the first `sub` call, and a second tool adds another routing surface. A future change can add interactive browsing if the bounded snapshot proves insufficient.

### D3 — Authority remains sourced only from trusted current user input

Catalog text, Extension-originated inputs, prior messages, persistent progress files, child output, retries/compaction and model-generated tool arguments cannot create authority. Pi's `input` event provides the trusted `interactive|rpc|extension` provenance that `before_agent_start` itself lacks. Authority parsing moves to that provenance-bearing seam; the later injected summary is a projection of the already-captured decision and is never parsed back as input.

Each Parent session keeps at most one pending authority candidate: a local monotonic sequence plus a digest of the normalized `input` text. Only `interactive|rpc` input with no streaming behavior can create it; a later qualifying input replaces it. Per the accepted boundary, text already transformed by an earlier installed Extension remains user-originated when Pi still marks its source `interactive|rpc`; installed Extensions are trusted composition participants. `before_agent_start` consumes the candidate exactly once only when the normalized final `event.prompt` digest matches. A later transform/mismatch, handled input with no start, consecutive prompt, abort, settlement or session shutdown clears the candidate and yields `inherit-only`. This fail-closed correlation does not require a Pi turn id and cannot cross sessions. Steer/follow-up inputs never create fresh authority.

`inherit-only` tells the Parent to omit model/thinking or ask the user. `explicit` and `delegated-choice` list only bounded canonical allowances and selector scope. The summary never includes raw prompt text or the digest.

This preserves the current security/cost boundary while making it visible enough for the Parent to avoid unsupported combinations.

### D4 — Represent omitted thinking as `model-default`, then freeze one backend-equivalent effective value

Resolution remains field-aware, with one change: a Parent thinking fallback applies only when the effective model is inherited. If a higher model-bearing layer selects a different canonical model and no non-Parent thinking layer supplies a value, resolution chooses `thinkingSource: model-default`.

Pi 0.84.4 model metadata has no declared default-thinking field, and current persistent children deliberately use an empty in-memory `SettingsManager`. Therefore their real omitted-thinking path has no file-backed per-model/global values: Pi falls back to `DEFAULT_THINKING_LEVEL` (`medium` in 0.84.4) and clamps it with the selected model's capability.

Production preflight will reproduce that same isolated-child path with `clampThinkingLevel(targetModel, "medium")`, using Pi's exported target capability semantics; non-reasoning models become `off`. It will not read or import Parent/project thinking settings, because doing so only in preflight would diverge from child construction and importing them into the child would broaden the isolation contract.

No arbitrary “first supported” or highest-level policy is added. The user-facing semantics are “no thinking override”; the internal preflight freezes Pi's concrete effective default so managed and Herdr cannot diverge. Audit metadata records `thinkingSource: model-default`, not `inherited-parent` or `direct-user-turn`.

A configured thinking value from an authorized higher layer remains valid and takes precedence; only the Parent fallback is skipped after a model identity change. If the selected model is the Parent model, Parent thinking inheritance remains unchanged.

**Alternative considered:** pass no value into both child processes and read it back after startup. Rejected because effective thinking would not be known before durable allocation and separate process settings could make managed and Herdr diverge.

**Alternative considered:** clamp Parent thinking to the nearest supported level. Rejected because it silently preserves an authorization/configuration value the user did not select for the target model and makes the audit rule provider-specific.

### D5 — Keep one preflight and add structured correction data

`SubCoordinator` continues calling the production preallocator before Agent/job/turn creation. The preflight result will carry the snapshot generation/source, canonical model, effective thinking, thinking source, speed tier and backend-neutral loadout inputs. Managed and Herdr consume that same frozen object; equivalence is asserted over those semantic fields and the Herdr loadout hash input, not over backend-specific serialized bytes.

Error formatting will avoid wrapping an already-prefixed `SubModelRequestError` with a second code. Structured error details will include supported thinking values and a bounded correction example such as:

```text
请在当前用户消息中明确授权：使用 zai-coding-cn/glm-5.3-flash、max thinking 启动 aili.implementer 子代理。
```

The example is guidance, not authority; only a later current user message can authorize it.

### D6 — Expose modalities, not inferred tools

The model snapshot may state `input: text,image`. It will also state that model modalities do not imply audio/video/ASR or filesystem/browser/network tools. The existing role catalog remains the source for static role capabilities; `computeEffectiveTools()` remains the execution owner after selector/backend/request inputs exist.

The initial change will not predict exact effective tools before the `sub` arguments are known. Therefore the catalog can only avoid claiming video/ASR availability; a definitive available/unavailable statement belongs to preflight or settlement after selector, backend and requested tool policy are known.

### D7 — No persisted catalog or authorization state

The snapshot is in-memory Parent-turn state only. It is not written to user HOME, project config, Agent journals, progress files or child prompts. Durable turn audit may retain only the already-allowed canonical selected model, effective thinking/source and bounded catalog generation metadata; it must not retain the full catalog or auth diagnostics.

### D8 — Disable ACP delegation at the AILI-owned factory boundary

`createProviderRoutedContextExtension()` will instantiate the retained billion-context adapter with `delegate: false`. Because current `applyUserConfig()` lets user/project config override factory values, the adapted merge will also make an explicit factory `false` monotonic: user configuration can disable a factory-default delegate, but cannot re-enable one the embedding package disabled.

This removes the three delegate tool registrations, delegate system-prompt section and delegate widget from the AILI-owned instance while preserving compression/context tools and owner routing. It does not uninstall billion-context and does not suppress an independently installed third-party Extension.

**Alternative considered:** add an AGENTS instruction saying “prefer sub.” Rejected because both tools remain visible and the model can still choose the wrong owner.

**Alternative considered:** require every installer to write `~/.pi/acp.json`. Rejected because it mutates user HOME, is overridable per project and does not give package installations a deterministic default.

### D9 — Add one-shot `cli` authority, not new native Drivers

The public `sub` schema will add optional canonical `cli`. A small allow-listed registry maps product phrases and executable candidates:

- `claude-code` → `claude`
- `gemini-cli` → `gemini`
- `codex-cli` → `codex`
- `opencode` → `opencode`
- `grok-cli` → prefer `grok-cli`; accept `grok` only when bounded version/help identity markers confirm the intended product, otherwise fail ambiguous

The current trusted-input authority parser will capture an external CLI only from explicit phrases such as “Claude Code” or “Gemini CLI.” A bare provider/model word is not sufficient. Wrong-selector, multiple, conflicting and negated CLI phrases fail closed. The tool argument cannot create authority by itself, and the value expires with the Parent turn.

If `cli` is absent, no external CLI code path runs. External CLI model/thinking flags are outside v1: the nested CLI uses its own configured default. Pi child model/thinking resolution remains independent.

### D10 — Derive backend and CLI loadout in one atomic preallocation step

Current coordinator code resolves backend before item preflight, so BUILD must not bolt CLI routing on after that decision. The preallocation contract will be widened to receive the normalized item plus trusted authority and atomically return the validated effective backend and frozen loadout before support checks or durable allocation.

For a new Agent, an authorized `cli` derives Herdr, verifies Herdr availability, static-role eligibility and effective bash capability, then freezes `backend: herdr`, `driver: pi-cli`, `nestedCli` and the built-in runner modifier. Unauthorized CLI fails before it can influence backend selection. Batch/continuation paths use the same ordering. An existing managed Agent cannot change its frozen backend and fails with create-new-Herdr-Agent guidance; an existing Herdr Agent can use the one-turn modifier. A later continuation without explicit CLI authority receives no modifier and runs as ordinary Pi.

The Herdr bootstrap continues to launch Pi. The `external-cli-runner` guidance is an immutable package-owned prompt fragment supplied directly by production preflight/prompt assembly, not a mutable HOME/project snippet and not a Pi Skill; it remains available despite `--no-skills`/`--no-prompt-templates`, is included in the frozen loadout hash and is absent when `cli` is omitted.

**Alternative considered:** model each product as a new `AgentDriverKind`. Rejected for v1 because the Pi Agent already supplies identity, continuation, tool policy, sandbox, settlement and visible Herdr lifecycle; native external-CLI Driver semantics can be proposed later if raw TUI/session control becomes necessary.

### D11 — Combine a deterministic probe helper with help-guided Pi execution

A package-owned local probe helper will enforce the part that must not depend on model compliance. Given a canonical registry id, it resolves exact executable candidates without a shell string, starts a new process group, and runs bounded `--version` then `--help` probes with a 5-second timeout each and a combined 64 KiB UTF-8-safe output cap. Abort/timeout terminates the whole process group. It returns a redacted structured result containing executable basename, bounded version/help and identity status; it never installs, logs in or invokes the task.

The built-in modifier then tells the Pi Agent to select only a one-shot non-interactive invocation visibly supported by that frozen help and run it through the existing bash permission/tool path in the task cwd. The modifier forbids install/update/login/browser-auth, known permission-bypass flags, interactive TUI takeover, shell-profile sourcing, explicit external session resume and recursive delegation. If help is malformed, identity is ambiguous, auth blocks execution or the model cannot identify a safe non-interactive mode, the Pi turn reports the blocker instead of guessing.

Repository-local fake executables deterministically verify probe argv/order, output bounds, malformed/oversized/non-zero/hanging/signal cases and cancellation. Because the final task argv remains a Pi model decision through bash, automated tests prove the probe and guidance contract—not that every model or real vendor version will choose correct flags. Real vendor CLI execution remains separately gated.

The pane remains a Pi TUI showing tool execution. “Visible Herdr” does not mean the external CLI owns the pane.

### D12 — State the real external-process boundary

The user accepted functional use of the normal user HOME. Explicit current-turn CLI wording therefore authorizes the named CLI, for that bounded task, to use its existing vendor-specific login/config/cache under normal HOME and to make the provider/network/source transmissions inherent in that CLI. AILI neither copies nor parses credentials, but cannot claim those internal reads, writes or network destinations are sandbox-inspected. Vendor token refresh, cache or session files may change according to the installed CLI.

This authority does not extend to unrelated Git, publication, destructive or non-CLI user-home operations. The process launch still inherits the Pi child's cwd and effective bash permission/sandbox boundary; unsupported local filesystem/process operations can be denied there, while vendor-internal network/source behavior is disclosed rather than falsely claimed to be controlled. AILI does not request external session resume in v1, but vendor-local cache writes are not treated as durable AILI Agent state.

Structured turn audit records only canonical `nestedCli`, resolved executable basename, bounded version and whether deterministic version/help probes completed. Because the final task argv remains an ordinary Pi-selected bash call in v1, its argv/exit/output are bounded model-reported evidence rather than authoritative structured CLI audit fields. Audit does not persist full help/output, credentials or environment values. The only durable conversation identity remains the Pi Agent.

## Risks / Trade-offs

- **[Prompt size and cache churn]** A changing catalog alters the Parent system prompt. → Build it once per direct user turn, sort deterministically and cap it at 64 entries/16 KiB.
- **[Configured auth is not request-time success]** Command-backed or expired credentials may still fail later. → Label snapshot availability accurately and retain provider-request revalidation; never claim provider reachability.
- **[Parent settings differ from isolated children]** Parent/project files may contain per-model/global defaults, while current persistent children use empty in-memory settings. → Keep child isolation unchanged, use Pi medium→clamp in both preflight and child loadout, and add a negative fixture proving file-backed settings do not leak.
- **[Scoped model drift]** A model can become out of scope after the snapshot. → Revalidate scope during the existing zero-allocation preflight.
- **[Capability overclaim]** Input modalities could be mistaken for tools. → Keep model and tool projections separate and add negative ASR/video tests.
- **[Error examples look like authorization]** A generated correction string could be replayed by the model. → State that only a new direct user message grants authority and keep the current turn failed.
- **[Nested CLI can perform broad actions]** One approved executable may contain its own agent/tool runtime and use normal HOME/network/source. → Require exact current-turn CLI authority, disclose vendor behavior, keep launch/filesystem controls at the existing bash boundary and avoid unsupported destination/source-control claims.
- **[Vendor help and flags drift]** Hard-coded invocation knowledge becomes stale. → Deterministically probe the installed version/help with strict process/output limits, then permit only a help-supported non-interactive choice; test probes with fake executables.
- **[Prompt modifier is not a native Driver]** The Pi model can still misunderstand help or vendor output. → Enforce probe ordering in code, keep final invocation under Pi bash permission, fail explicitly on uncertainty and defer raw vendor TUI/session semantics.
- **[Separately installed ACP plugin can reintroduce delegation]** AILI cannot own unrelated extension registration. → Guarantee only the package-owned composition and document the external-extension boundary.

## Migration Plan

1. Add projection/default-resolution unit fixtures without retaining an assertion that requires the obsolete bug.
2. Add trusted `input` provenance tracking plus Parent-turn catalog/authority/CLI injection and redaction/bounds tests.
3. Lock ACP delegation off in the AILI factory composition and verify compression-only registration.
4. Add `cli` schema/authority plus atomic backend/loadout preallocation, the immutable external-CLI modifier and deterministic probe helper.
5. Change model-only thinking resolution and structured preflight errors.
6. Verify zero-allocation, ordinary-Pi default behavior, one-shot CLI non-stickiness and identical managed/Herdr frozen model loadouts.
7. Update user documentation, provenance/notices and run focused persistent-Agent plus full non-browser verification.

No user data migration is required. Rollback removes the injected context/CLI field and restores the prior resolver; persistent model override files remain unchanged. Re-enabling ACP delegation is not part of rollback because `sub` remains the sole package-owned delegation surface. No compatibility flag or dual delegation owner will be retained.
