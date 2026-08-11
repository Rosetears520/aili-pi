# Pi 0.82.1 Public Contract Audit

## Audit status

- Audit date: 2026-07-28 (Asia/Shanghai)
- Scope: installed, lock-bound official `@earendil-works/pi-*` `0.82.1` public package contracts used by AILI Compact
- Result: `PASS_NO_PUBLIC_CONTRACT_DRIFT`
- Timing: `POST_BUILD_ONLY`

This audit was performed after the local P0 and v0.2.0 BUILD implementation already existed. It therefore does not retroactively satisfy `fix-aili-compact-recovery-deadlock` task 1.5 or `redesign-aili-compact-lifecycle` task 1.4, both of which explicitly require confirmation before production edits. Those checkboxes remain open unless the accepted contract is revised through a human-approved DEFINE write-back.

## Bound official identity

The installed packages and `package-lock.json` both resolve the exact baseline:

| Package | Version | lock integrity |
|---|---:|---|
| `@earendil-works/pi-coding-agent` | `0.82.1` | `sha512-zbkAhoIuDPMF3pKuja0ajZabrMWU29FUMV9A/XMXT/XC1yXs5xt6t6t13GogQFsDrDqbFP4DkZQO1w8rWRAzYA==` |
| `@earendil-works/pi-ai` | `0.82.1` | `sha512-3WFYRhEp3lQB3444EhPMBcM7zSaEUE3eJgHOR7s4081NLqbw/FsWilIKWXSua0Gv3sRr7m9xMidR3pPDE7jI/A==` |

The project change `support-pi-0-82-1` separately records official tag revision `b4f293684bba718d59cc1157679bcf6157b3a7f5`. This audit used the installed npm artifacts as the executable authority and did not modify `node_modules`.

## Public source map

| Contract | Installed public location |
|---|---|
| `ctx.compact()` | `pi-coding-agent/dist/core/extensions/types.d.ts:240` |
| `session_before_compact` / `session_compact` | `pi-coding-agent/dist/core/extensions/types.d.ts:436` / `:448` |
| `context` event/result/registration | `pi-coding-agent/dist/core/extensions/types.d.ts:493` / `:768` / `:856` |
| `CompactionEntry` / `CustomEntry` / `CustomMessageEntry` | `pi-coding-agent/dist/core/session-manager.d.ts:36` / `:69` / `:97` |
| public append methods | `pi-coding-agent/dist/core/session-manager.d.ts:223` / `:225` / `:238` |
| chained cloned context execution | `pi-coding-agent/dist/core/extensions/runner.js:737-764` |
| effective compaction settings | `pi-coding-agent/dist/core/settings-manager.js:509-529` |
| cache retention/session identity | `pi-ai/dist/types.d.ts:36` / `:60` / `:66` |

## Public contract findings

### Compact hook and persisted `CompactionEntry`

Official declarations in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` expose:

- `session_before_compact` with public `preparation`, `branchEntries`, optional `customInstructions`, exact reason union `manual | threshold | overflow`, `willRetry`, and `signal`;
- a result containing optional `cancel` and optional `compaction`;
- `session_compact` with the persisted `CompactionEntry`, `fromExtension`, reason, and `willRetry`;
- fire-and-forget `ctx.compact(options)` with callbacks.

`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` confirms that both manual and automatic paths emit `session_before_compact`, accept an extension-provided complete compaction result, otherwise use Pi native compaction, append the resulting `CompactionEntry`, rebuild context, and then emit `session_compact`. Overflow recovery performs at most one compact-and-retry attempt.

`node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts` confirms that a public `CompactionEntry` retains `summary`, `firstKeptEntryId`, `tokensBefore`, optional `details`, optional `usage`, and optional `fromHook`. Session entries remain append-only.

AILI mapping: `src/runtime/aili-compact/index.ts` returns only a validated `{ compaction }` or exact `undefined` from `session_before_compact`, uses `session_compact.compactionEntry.id` as the persisted epoch, and invokes only public `ctx.compact()` for rescue. No drift was found.

### Context and custom-entry contracts

The public `context` event receives `AgentMessage[]` and may return replacement messages. `ExtensionRunner.emitContext()` starts from `structuredClone(messages)` and chains handlers in registration order, passing each handler the previous handler's output.

The public SessionManager types distinguish:

- `CustomEntry`: persisted extension state that does not participate in LLM context;
- `CustomMessageEntry`: persisted content that does participate in LLM context;
- `pi.appendEntry(customType, data)`: the public state-persistence API.

AILI mapping: durable compact transactions use `pi.appendEntry`; provider projection and the bounded provider suffix are returned only from the `context` hook. The suffix is not appended as a `CustomMessageEntry`. Before/after third-party ordering is therefore publicly representable, although the separately required live ordering matrix remains `Unverified`. No drift was found.

### Settings contract

`SettingsManager.getCompactionEnabled()` resolves an absent value to `true`. `setCompactionEnabled()` writes the explicit global value, while `getCompactionSettings()` exposes the effective enabled/reserve/keep-recent tuple. `AgentSession._checkCompaction()` suppresses automatic threshold/overflow behavior when effective `enabled` is false; the public manual `compact()` path is separate.

AILI mapping: bootstrap/settings merge no longer inserts `compaction.enabled=false`; an existing explicit false is preserved and diagnosed without inferred ownership; manual rescue uses the public manual compact path. No drift was found.

### Cache contract

`@earendil-works/pi-ai` publicly defines `CacheRetention` as `none | short | long`; `StreamOptions.cacheRetention` defaults to `short` and `sessionId` is optional/provider-specific. Pi's native compaction summarization explicitly sends `cacheRetention: "none"` with a fresh request session ID because the standalone summary request is not reusable.

AILI mapping: static/logical-prefix/suffix/full identities remain AILI request-surface diagnostics only. Provider-reported usage remains authoritative, and native compaction/branch-summary requests do not enter the warm-candidate denominator. No drift was found.

## File bindings

The inspected installed artifacts had these SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| `node_modules/@earendil-works/pi-coding-agent/package.json` | `d1d4d2c7df821306abdbbcda59c8538214a6a7c87d1f9e3258e113154dbcd524` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` | `d3fb9d55d312e47df861507aeef41c1183261c3a577588dc2ddb1c97cc909d6e` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js` | `05a9e39f5c1109d168e4b9327a7858243b77ea3bbe836961549e67d282b5a231` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts` | `82b861efe463812fcc4e8b5bb3414c7c756bbb4fc3bae2721baf0dde3226fe68` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` | `d300f57a70b7ca3f86e8e41b5336b0579268cbcecfedf1d99c176f2add2dd39b` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js` | `068bbf86604a2770071cb096da28b4c3ec35c57944163d2d5153942bdad4df7d` |
| `node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js` | `fcb12f1eb4d38578978e1a8e3e382a3fccfd5e0ccf87bc86979a9a8d9c145c7b` |
| `node_modules/@earendil-works/pi-ai/package.json` | `955aa1caab4c875fc7755abe7cacbf9002d9875c471e8d5af245e495ae1d4596` |
| `node_modules/@earendil-works/pi-ai/dist/types.d.ts` | `95fddce61009f9ed0e97eb402e5438dfc980b76fc155edd4d6fc0ed3b71a0496` |

These hashes bind this post-BUILD inspection only; they are not a substitute for the package-lock integrity fields or live-provider evidence.

## Conclusion and ledger treatment

No public-contract drift requiring implementation or accepted-spec changes was found. No `drift-log.md` entry is needed. The audit provides a durable post-BUILD baseline for future review, while the two time-qualified pre-BUILD tasks remain intentionally unchecked.
