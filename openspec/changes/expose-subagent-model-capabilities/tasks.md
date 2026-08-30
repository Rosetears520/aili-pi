## 1. Freeze Current Behavior and Contracts

- [x] 1.1 Add a durable regression fixture for Parent `xhigh` + explicit `zai-coding-cn/glm-5.3-flash` + omitted thinking with the desired final target-default expectation; record that it fails before the fix without retaining an obsolete-behavior assertion.
- [x] 1.2 Inventory the installed Pi 0.84.4 model-registry, scoped-model, `input` provenance, supported-thinking/clamp, isolated child in-memory settings and modality APIs used by the design; verify the implementation uses exported types/functions and the SDK settings order rather than a duplicate provider/default table.
- [x] 1.3 Add preservation tests for current-turn authority lifetime, selector scoping, zero durable allocation, managed/Herdr shared preflight and persistent override precedence before changing shared resolution code.
- [x] 1.4 Reconcile the resolver requirements with `make-persistent-agent-model-thinking-decisions-explicit` and mark the overlapping model-preflight scope in `restore-native-working-ui-and-expose-agent-model-resolution` as superseded before either overlapping package enters BUILD.

## 2. Project the Read-only Model Capability Snapshot

- [x] 2.1 Implement one pure scope-aware catalog predicate reused by projection, canonical/bare resolution, runtime fallback and revalidation; verify empty scope, non-empty scope, canonical sorting, thinking capability, effective default, text/image modalities and exclusion of unavailable/unauthenticated/out-of-scope entries.
- [x] 2.2 Implement deterministic complete-section rendering capped at 64 entries and 16 KiB with identifier validation/escaping, per-field limits, UTF-8-safe truncation and omitted-count guidance; verify stable bytes plus newline/control/delimiter/credential/header/token/path canaries.
- [x] 2.3 Implement a separate current-turn authority summary for `inherit-only`, `explicit` and `delegated-choice`; verify catalog visibility never changes the captured authority or permits a different selector/model/thinking.

## 3. Expose the Snapshot to the Parent Turn

- [x] 3.1 Capture at most one session-local authority candidate from non-streaming Pi `input` events with source `interactive|rpc`; correlate it once by normalized prompt digest and monotonic sequence, and verify earlier transforms preserve authority only when Pi retains `interactive|rpc`, while `extension` source, later transform/mismatch, handled input, consecutive inputs, abort, steer/follow-up, retry, compaction, settlement and shutdown clear/fail closed without stale authority.
- [x] 3.2 Extend `before_agent_start` to return a bounded replacement `systemPrompt` formed from `event.systemPrompt` plus one idempotent delimited discovery/authority section; verify multi-handler chaining, same-turn tool loops and next-turn rebuild without duplicate sections.
- [x] 3.3 Verify the implementation does not re-register `sub`, add a second catalog tool, execute remote refresh/credential resolution, create a child session, persist the full snapshot or inject the catalog into child prompts.

## 4. Correct Model-only Thinking Resolution

- [x] 4.1 Change resolution so Parent thinking fallback applies only when the effective model is inherited; verify a different explicit/configured target model with omitted thinking resolves with `thinkingSource: model-default` and never auto-selects the highest supported level.
- [x] 4.2 Implement the isolated child default resolver as Pi `medium` → exported target-model clamp without importing file-backed Parent/project settings; verify GLM, non-reasoning and opt-in xhigh/max fixtures plus a negative setting-leak fixture.
- [x] 4.3 Preserve the other three combinations—both omitted, thinking-only, and model+thinking explicit—and verify existing instance/project/user/profile/Parent precedence tests remain unchanged.

## 5. Keep Preflight Strict and Actionable

- [x] 5.1 Carry the frozen canonical model, effective thinking/source, speed tier and bounded snapshot metadata through the shared preallocation result; verify managed and Herdr consume semantically equivalent fields/loadout hash inputs and stale availability/auth/scope fails with zero Agent/job/turn/pane/process allocation.
- [x] 5.2 Remove duplicate `SUB_*` code wrapping and add bounded corrective guidance with supported thinking values and a copyable current-user-message example; verify the example itself grants no authority and the failed turn remains failed.
- [x] 5.3 Add negative modality tests proving `text,image` does not imply MP4/audio/ASR or filesystem/browser/network tools, and verify effective tool claims still come only from the existing role/backend/tool policy.

## 6. Retire the Competing ACP Delegation Surface

- [x] 6.1 Set the AILI-owned billion-context factory to `delegate: false` and make explicit factory disablement monotonic over global/project `acp.json`; verify global/project `delegate: true` fixtures cannot re-enable it while standalone/default factory behavior remains unchanged.
- [x] 6.2 Rebuild/verify the adapted billion-context `dist` owner, update provenance/notices, and add executable source/dist parity plus registration tests; verify `acp_delegate`, `acp_delegate_wait`, `acp_delegate_cancel`, delegation prompt and widget are absent while `compress`, `decompress`, `search_context`, `acp_status`, context transform, compaction hooks and provider ownership routing remain unchanged.

## 7. Add Explicit One-shot External CLI Execution

- [x] 7.1 Add optional canonical `cli` to the public `sub` schema and a bounded registry for Claude Code, Gemini CLI, Codex CLI, OpenCode and Grok CLI executable candidates; verify unknown values, generic `grok` without product identity, and ambiguous bare provider/model wording do not select a CLI.
- [x] 7.2 Extend trusted current-turn authority capture to exact external CLI phrases and validate tool arguments independently; verify wrong-selector, multiple/conflicting/negated phrases, model self-selection and prior-turn CLI values fail closed while omission remains ordinary Pi execution.
- [x] 7.3 Refactor backend resolution and item preflight into one atomic preallocation result that validates CLI authority before deriving/finalizing Herdr; verify unauthorized CLI cannot influence backend, non-Herdr/non-bash roles and managed continuation fail before allocation, valid new/Herdr-continuation turns freeze `driver: pi-cli` + `nestedCli`, and omitted continuation receives no runner.
- [x] 7.4 Implement `external-cli-runner` as an immutable package-owned modifier injected directly into the frozen Herdr prompt/loadout, not a HOME/project Skill/snippet; verify it survives `--no-skills`/`--no-prompt-templates`, is hashed, and is absent from ordinary Pi turns.
- [x] 7.5 Implement a deterministic external-CLI probe helper with exact executable argv, version→help order, 5-second per-probe timeout, 64 KiB combined UTF-8-safe cap, process-group abort and bounded redacted evidence; verify it never shells, installs, logs in or runs a task.
- [x] 7.6 Add repository-local fake executable fixtures for supported, missing, ambiguous identity, malformed/oversized/non-zero/hanging/signal/auth-blocked and no-safe-mode probes; verify ordering, cancellation, task-cwd handoff guidance, normal-HOME disclosure, structured probe audit bounds, final-command evidence labeled model-reported, and no real network/vendor CLI execution.

## 8. Documentation and Verification

- [x] 8.1 Update `docs/persistent-agents.md` to document the live model snapshot, current-turn authorization separation, target-model default, default-Pi/explicit-CLI behavior, help-first Herdr runner, ACP delegation retirement and corrected failure workflow; verify no historical authorization or prior CLI choice is described as reusable.
- [x] 8.2 Run `tests/unit/persistent-agent-model-selection.test.ts`, `tests/unit/persistent-agent-model-authority.test.ts`, new `tests/unit/persistent-agent-model-capabilities.test.ts`, new `tests/unit/persistent-agent-external-cli.test.ts`, `tests/unit/persistent-agent-sub.test.ts`, `tests/unit/persistent-agent-backends.test.ts`, `tests/unit/herdr-backends.test.ts`, `tests/unit/context-upstream-inventory.test.ts`, `tests/unit/context-provider-router.test.ts`, `tests/integration/context-runtime-load.test.ts`, `tests/integration/persistent-agent-production.test.ts` and `tests/integration/persistent-agent-runtime.test.ts` plus typecheck; verify GLM/xhigh, default Pi, explicit CLI and compression-only ACP paths pass before unsupported allocation.
- [x] 8.3 Run package/generated/provenance/compatibility/audit-redaction checks and the full non-browser suite, inspect the task-scoped diff, and record real vendor CLI, Browser, provider-live and publication execution as unexecuted unless separately authorized.
