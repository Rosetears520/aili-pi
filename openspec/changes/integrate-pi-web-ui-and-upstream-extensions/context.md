# Change Context

## Change identity

- Change: `integrate-pi-web-ui-and-upstream-extensions`
- Lifecycle phase: BUILD
- Backend: OpenSpec `spec-driven`
- Implementation authorization: granted for the accepted repository-local BUILD scope; exact risky operation gates remain controlling.

## Maintained user intent

- Build an AILI Web UI with `agegr/pi-web` as the sole code and functionality base.
- Treat Codex-style interfaces and the previously cited `minghinmatthewlam/pi-gui` only as interaction and visual references, never as the runtime or application base.
- Absorb the complete relevant functionality of `pi-analytics`, `pi-btw`, `pi-stamp`, and `pi-worktree` from `narumiruna/pi-extensions` into the AILI-owned runtime and Web UI contract.
- Use and adapt the nine publicly free AIcss components where their terms permit public source and npm redistribution; independently implement AILI-owned equivalents for the five locked component categories, while preserving semantic fit, reduced-motion behavior, and performance constraints.
- Revise `AILI Web UI 详细设计与实施方案.md` to reflect these ownership and implementation boundaries.

## Current repository constraints

- `aili-pi` remains one Pi Package with one Extension entry at `extensions/index.ts`.
- Official Pi `0.84.1`, Node.js `>=22.19.0`, MIT primary licensing, existing runtime ownership, and current package validation remain controlling until this change explicitly revises them.
- Dependency and lockfile changes, upstream source vendoring, external repository writes, package installation, Git operations, publish, and release require separate exact authorization.
- Existing uncommitted footer changes and unrelated untracked `.pi/`, archive, Graphify, design Zone.Identifier, and other user files must be preserved.

## Frozen upstream evidence

- `@agegr/pi-web@0.8.8`, npm gitHead `5a53c18ca9328400a3dfb8c48c1e4f343b3e4903`, MIT, Node.js `>=22.19.0`, Pi packages `0.84.1`, Next.js `16.2.12`, React/React DOM `^19.2.4`. It is a standalone local browser application with a `pi-web` CLI, Next.js API routes, in-process Pi `AgentSession`, SSE, direct Session JSONL browsing, file/Git/worktree/model/plugin/skill interfaces, and loopback binding by default.
- `@narumitw/pi-analytics@0.49.6`, gitHead `1156ee787d7bbf04a2a67f25ace61ef50355cb8d`, MIT, Pi `0.84.1` development baseline. It is experimental, content-free local analytics with per-runtime private versioned JSONL writers and a TUI/RPC dashboard.
- `@narumitw/pi-btw@0.50.0`, gitHead `e7d9112f4f3418216a14343c00f6f637e7a3d390`, MIT, Pi `0.84.1` development baseline. It owns ephemeral in-memory side threads, independent model/thinking selection, queued steering, explicit bring-to-main preview, and no implicit main-conversation mutation.
- `@narumitw/pi-stamp@0.49.3`, gitHead `4c2c2e8c4b6c3d21659110ea1966810b1d15e045`, MIT, Pi `0.84.1` development baseline. It records versioned Pi custom entries outside model context for message timestamps, response timing, bounded assistant metadata, usage/cost fields reported by Pi, and tool duration/outcome.
- `@narumitw/pi-worktree@0.50.0`, gitHead `492cc9cef225f20b98b70158156229b1f44a8778`, MIT, Pi `0.84.1` development baseline. It provides safe local worktree status/add/switch/remove/prune/configure flows, session replacement, exact preflight/revalidation, and no force removal or branch deletion.
- AIcss currently exposes 14 copy-paste components in React/Vue/Svelte with plain CSS and no Tailwind. Nine are free. Web Search, File Diff, Image Generation, Inline Citations, and Comparison Table are licensed. Official pricing terms allow commercial/client use but prohibit redistributing or reselling components as-is; locked source requires a private account token. No public open-source license was found for the complete catalog.
- The local design already names Pi Web as the functional/code base and Codex/pi-gui as references, but sections 2.2 and 31 still use ambiguous feature-provenance language. The revised contract must state that no Codex/pi-gui source, component, protocol, data model, or runtime is adopted; current Codex Remote Compaction remains an unrelated provider/runtime feature.

## Evidence sources

- https://github.com/agegr/pi-web and https://registry.npmjs.org/@agegr/pi-web
- https://github.com/narumiruna/pi-extensions/tree/main/packages and the four corresponding npm registry records
- https://www.aicss.dev/llms.txt, https://www.aicss.dev/r, and https://www.aicss.dev/pricing
- `AILI Web UI 详细设计与实施方案.md`, `package.json`, `README.md`, and `docs/persistent-agents.md`

## Recorded product directions

- AIcss source strategy is `conditional`: adapt the nine publicly free components when their terms are verified to permit inclusion in this public repository and npm package; independently implement AILI-owned equivalents for Web Search, File Diff, Image Generation, Inline Citations, and Comparison Table. No locked source or account token may be requested, exposed, or committed.
- Web UI package boundary is `accepted`: ship and version the Web UI inside the existing `@rosetears/aili-pi` npm package. The larger installation footprint is accepted, but installed Web source/assets must not enter model context merely because they are present.
- Upstream absorption boundary is `accepted`: preserve the complete relevant behavior, data/privacy boundaries, safety rules, and important TUI public entry points of the four upstream extensions behind AILI-owned runtime modules and versioned APIs; Web presentation may be redesigned.
- Web startup boundary is `accepted`: provide standalone `pi-web` and Pi `/web` entry points, start the server only on demand, default to loopback, and treat non-loopback access as a separately controlled mode.
- Upstream source strategy is `accepted`: import exact locked sources during an authorized BUILD operation, retain MIT/provenance evidence, adapt into AILI-owned modules, keep the released runtime independent of the five upstream npm packages, and update only through reviewed imports.
- Analytics retention is `accepted`: use metadata-only append storage with bounded runtime memory, retain it until explicit user cleanup, expose store size and time-range/all cleanup, and verify exact memory/disk behavior through implementation profiling.
- Shared-session writer ownership is `accepted`: the first TUI or Web client to acquire the writer lease is the only mutation owner, must display the owner, and cannot silently steal ownership or write concurrently. With official Pi `0.84.1`, this is intentionally asymmetric: when stock TUI owns, Web may observe live and read-only; when Web owns, stock TUI attachment to the same session fails closed until release or exit because Pi exposes neither a universal mutation veto nor live external-JSONL observer reload.
- Non-loopback access is `accepted`: default to loopback; explicit non-loopback binding fails closed without password authentication, Origin validation, and allowed-root/path enforcement, and direct public-Internet exposure is not claimed as supported.
- First-release completeness is `deferred`: the final release still requires all four absorbed capabilities to have retained important TUI entry points, AILI-owned Runtime/API behavior, and corresponding Web UI behavior. The currently accepted BUILD milestone is TUI-first capability usability; Runtime/API and Web parity are deferred until the foreground Pi Web work is resumed last.
- Writer-lease recovery is `accepted`: explicit release is immediate; an unexpected disconnect receives a short recovery grace period; active turns retain ownership until settled or durably interrupted; acquisition after failure requires liveness validation; force stealing is forbidden.
- Web process lifetime is `accepted`: Pi `/web` owns a foreground child tied to the Pi process, standalone `pi-web` is tied to its foreground shell process, and no hidden daemon or detached singleton is created. This supersedes the user's immediately prior transient Option B response.
- Analytics attribution is `accepted`: an opaque per-session analytics scope is stored as a Pi custom entry outside model context without persisting raw Pi session identity, paths, cwd, labels, or titles.
- AIcss fallback is `accepted`: if public source-redistribution rights remain unproven, copy none of the nine public free sources and independently implement AILI-owned equivalents for all fourteen categories; no private/locked source or token is used.
- Browser/E2E artifact placement is `accepted`: browser and Playwright test source belongs under `tests/browser/`, durable browser reports/traces/screenshots belong under `artifacts/test-results/browser/`, and temporary output stays in ignored repository-local `.tmp/`.
- Pi `0.84.1` feasibility evidence establishes that stock Pi TUI has no universal public veto for every mutation and no live external-JSONL observer seam. The accepted Option A keeps official Pi and no replacement TUI: TUI-writer sessions may project live state to a read-only Web observer; Web-writer sessions reject stock-TUI attachment to the same session until Web releases or exits. Any gateway-owned mutation path must still mediate before Pi invocation, and an ungated stock-TUI session must never weaken writer exclusivity.
- The locked `agegr/pi-web` source is the concrete source and functional baseline for Web server, session, API, and UI patterns. DEFINE must inspect and preserve useful supported patterns from that project; where a baseline pattern conflicts with the accepted AILI single-writer, security, package, or runtime ownership boundaries, AILI adapts it rather than introducing another code base.

## D-15 — TUI-first plugin delivery sequence

- User confirmation: `ok` on 2026-08-19.
- Decision state: accepted material delta.
- Current BUILD milestone: deliver the four absorbed capabilities through retained Pi TUI entry points and deterministic local tests before returning to foreground Pi Web composition.
- Order: BTW first; Analytics and Stamp next in either order; Worktree may accompany them only when it does not delay those paths. Foreground Pi Web composition and the deferred Runtime/API/Web parity work are last and remain blocked until the user gives fresh explicit approval to resume them.
- Safety boundary retained: Worktree never exposes force removal or branch deletion. No capability is described as first-release complete until its deferred Runtime/API/Web parity and release verification are done.

## D-16 — Three-plugin TUI release-preparation focus

- User direction: complete BTW, Analytics, and Stamp first; retain the existing Pi Web code without further Web work; do not run `npm install`.
- Decision state: accepted material BUILD delta.
- Scope: only the retained Pi TUI BTW, Analytics, and Stamp packages advance now. Worktree, foreground Pi Web work, deferred Runtime/API/Web parity, AI components, and broader release-completion packages remain held.
- Operation boundary: `npm install`, dependency/lockfile changes, npm publication, Git operations, and release actions are not authorized.

## D-17 — Analytics local persistence and typecheck repair authorization

- User authorization: `允许` on 2026-08-19 in response to the exact pending Analytics local-persistence and one Web typecheck-repair questions.
- Authorized operation: Analytics may create and use only its content-free local store beneath Pi's agent directory (`getAgentDir()/aili-analytics`); no prompts, replies, thinking, tool arguments/results, credentials, raw session IDs, paths, or raw errors may persist. Repository-local deterministic storage fixtures remain preferred for tests.
- Authorized operation: repair only `src/runtime/web/process-liveness.ts` type error at line 156 to restore global typecheck; do not extend Web behavior, package metadata, dependencies, lockfile, builds, or runtime composition.
- D-17 also authorizes a TUI-only npm package boundary: retain Web source repository-only, remove `/web`, `pi-web`, Web build/prepack hooks, Web output, and Web-exclusive dependencies from the published package, and run exactly `npm install --ignore-scripts` to regenerate `package-lock.json` for that removal.
- D-18 corrects the earlier dependency classification: `pi-web-access@0.13.0` is a retained Pi TUI web-retrieval capability, not the paused foreground Pi Web application. It remains a direct runtime dependency and Pi-owned skill resource; its upstream network/filesystem side effects remain subject to the active Pi permission policy. The foreground `pi-web` application, Next/React toolchain, and all repository Web source remain excluded from the npm artifact.
- Still absent: npm publication, Git operation, release, any dependency addition other than restoring the exact retained `pi-web-access@0.13.0` dependency and its lockfile closure, and any broader Web work or Web build/runtime execution.

## Open material questions

- None for the accepted TUI-first milestone; exact deferred Pi Web and release evidence remains `Unverified` until its later package resumes.

## Current gate

The user explicitly confirmed the consolidated product understanding and accepted Q4-01 Option A in `interview.md`; requirements-grilling is `READY`. Formal design, delta specs, tasks, revised detailed design, and the final test plan remain to be written and validated. Final `test-plan.md` acceptance is still pending and implementation authorization remains absent. No BUILD task, dependency change, source copy, install, user-home write, server startup, Git operation, or release is authorized.
