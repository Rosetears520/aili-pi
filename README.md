# AILI for Pi

`@rosetears/aili-pi` is a Pi Package that adds ROSE delivery routing, five workflow prompts, a pinned AILI skill snapshot, native Pi integrations, and diagnostics to the official `pi` CLI. It does not replace or fork Pi.

## Requirements

- Linux
- Node.js 22.19.0 or newer
- Pi 0.81.1 or newer with the Package and Extension APIs used by this release

macOS and native Windows are not supported by this bootstrap and fail before installation mutation.

## Install

Run the repository bootstrap:

```sh
./install.sh
```

If Pi is absent, the script downloads only `https://pi.dev/install.sh` over HTTPS and executes it with your user authority. The upstream “latest installer” is trusted through ordinary TLS because no accepted checksum/signature mechanism is currently available. Review that boundary before use in a sensitive environment.

The script preserves an existing compatible Pi by default. To request Pi's own self-update first:

```sh
./install.sh --update-pi
```

Equivalent package lifecycle commands:

```sh
pi install npm:@rosetears/aili-pi@latest
pi list
pi update npm:@rosetears/aili-pi
pi remove npm:@rosetears/aili-pi
```

During a Pi-managed npm install or update, the package replaces only existing same-name directories in `~/.agents/skills/` with its pinned AILI skill snapshot. It does not create package-only skills, alter differently named skills, retain backups, or load its embedded AILI snapshot as a second Pi skill source. The package remains installed for its Extensions, prompts, theme, and bundled `librarian` skill.

Removal is destructive for this Package. It does not remove Pi and must not be presented as rollback when replacing a pre-existing AILI installation.

### Explicit global resources

The package does not write global AILI resources during extension load. After reviewing the target, explicitly run:

```text
/aili-install-global-resources
```

That command creates or updates only the AILI marker block in `~/.pi/agent/APPEND_SYSTEM.md` and installs the 19 packaged profiles at `~/.pi/agent/agents/aili/`. The marker block is a Pi-native governance derivation of the pinned `aili-workflows` global AGENTS template: it retains instruction precedence, untrusted-content handling, approval/evidence/verification discipline, bounded delegation, project-rule precedence, and user-language output, while excluding OpenCode-only control planes. It preserves unrelated prompt content, rejects malformed markers or an unowned profile collision, and reports stale profiles without pruning them.

## Rose Cyberdeck

The package supplies the dark `rose-cyberdeck` theme plus three additional Pi Extensions: a Rose header, Rose Shimmer + four-row Rose Code Rain working surface, and Zentui footer/editor surface. Select it through Pi's `/settings` theme selector or set `"theme": "rose-cyberdeck"` in `~/.pi/agent/settings.json`. The visual extensions are adapted from `pi-sakura-cyberdeck` at revision `165a1f8011a12a58a6409b56b8a6c0416cd9b589` under MIT; see `THIRD_PARTY_NOTICES.md` and `notices/pi-sakura-cyberdeck-NOTICE.txt`.

Rose Code Rain uses the original sparse, fixed-column waterfall geometry: `density` selects even-cell tracks, at most 96 tracks span ultra-wide terminals, and each track falls vertically with a randomized tail and gap. The default 12 FPS cadence and 8–16 rows/second fall speed sit between the released and dense-preview profiles. `/rose-matrix status`, `/rose-matrix fps <8-18>`, `/rose-matrix density <0.45-0.95>`, and `/rose-matrix appearance <auto|dark|light>` change active preferences. `/sakura-matrix` remains a deprecated compatibility alias. Header, rain, frames, footer, and editor use the Rose six-color system: Blue, Ice, Cyan, Violet, Rose, and Soft Rose.

### Migrating from Rem/Sakura names

Replace an exact legacy `rem-cyberdeck` theme token with `rose-cyberdeck` through `/settings` or `~/.pi/agent/settings.json`; when using a `light/dark` pair, replace only the legacy side. Existing `sakura-cyberdeck-matrix.json` and `rem-cyberdeck-zentui.json` configuration files are read compatibly and retained. Legacy product names below appear only for migration or upstream attribution.

Zentui enables its experimental fixed-bottom editor by default when the installed Pi TUI exposes the required private layout capabilities. If capability detection or installation fails, it keeps Pi's native editor and emits a warning. The feature uses the terminal alternate screen; its default mouse scrolling can interfere with terminal text selection and tmux scrollback. Use Zentui's `/zentui` settings to disable the fixed editor or mouse scrolling. Zentui hides `pi-cache-stats` by default so the one canonical Codex weekly quota remains visible; explicitly re-enabled cache stats follow quota in the bounded footer.

## Commands and modes

- `/ideate`, `/define`, `/build`, `/ship`: the four AILI delivery modes.
- `/local-review`: a standalone local audit, not a fifth lifecycle mode.
- `/aili-doctor` or `/aili-doctor --json`: human or machine-readable health evidence.
- `/aili-compact [context|stats|sweep|manual|compress|decompress|recompress|cache|prompt|on|off|restore-all|doctor]`: AILI Compact context controls and diagnostics; `cache panel on|off` toggles its bounded footer widget, and `prompt reload` explicitly refreshes an opted-in prompt snapshot.
- `/perm`: the revision-bound `pi-permission-modes@2.2.0` adaptation controls `Default`, `Plan`, `Build`, and `YOLO`.
- `Alt+M`: upstream mode-cycle shortcut.
- `/aili-install-global-resources`: explicit installation/update of marker-owned global ROSE and AILI-role resources.

### AILI Compact

AILI Compact is a provider-time context projection: Pi Session JSONL/tree remains append-only source truth, while bounded v2 transactions control only the provider copy. Its exact model surface is six tools: `aili_compact`, `aili_decompress`, `aili_prune`, `aili_search_context`, `aili_compact_status`, and read-only `aili_context_recap`. Status returns an epoch/branch-scoped `catalogId`, paged `mNNNNNN` message references, active `bNNNNNN` block references, candidates, recap previews, and bounded policy reasons. Mutators must be the sole tool call and echo the current catalog. `aili_compact` supports bounded range and message batches, rejects stale/split/overlapping/protected or non-beneficial selections, and inserts deterministic recap call/result pairs while removing hidden source and stale compact protocol from the provider projection. Decompression is all-or-nothing for 1..16 current-epoch blocks and returns at most 2,000 UTF-8 bytes of exact preview; pruning applies only to complete consumed tool-result atoms. Search remains current-branch, including query-only archived source.

`/aili-compact context [offset] [limit]` defaults to 0/32 with limit 64; `stats` is distinct; `sweep [limit]` defaults to 8 and bounds 1..16; direct `decompress`/`recompress` accept 1..16 block refs. `manual on|off` controls only semantic-compression mode and is independent of `autoCooling`. `compress [focus]` appends one replayable trigger and starts one visible user turn permitting at most one compact attempt; busy or invalid requests append and request nothing. Hard protection covers AILI/incomplete/binary/current-turn/recent-user atoms, secret paths, configured tools/globs, balanced protect tags, and uncertain metadata. Automatic work groups consumed candidates, journals dedupe/purge-error decisions, emits adaptive reference-discovery guidance, and leaves subagent results raw unless default-off public lineage/completion gating is explicitly enabled and proven. Generational/nested GC is provider-free; unsafe major GC always leaves Pi emergency recovery available, and each completed Pi compaction starts a new summary-plus-tail epoch.

The cache surface has two bounded sections. **Current Session cache statistics** replay assistant `usage` from Pi's current `SessionManager.getBranch()` once on session start/reload or explicit tree navigation, then update in O(1) from each finalized assistant `message_end`; they survive restart through Pi JSONL without polling the filesystem or rescanning the branch on each provider request/widget draw. They show current-branch input, output, cache-read/write totals and `cacheRead/(input+cacheRead+cacheWrite)` hit rate. **AILI repeated-request stability diagnostics** remain separate: cache identity hashes provider, model, session, branch source, epoch, projection, guidance, and sorted active tool schemas/prompts. Only matching warm requests with numeric `cacheRead` and `cacheWrite` enter its last-20 window, which requires five eligible samples; cold, state-change, zero-token, and unavailable telemetry are counted separately. `/aili-compact cache` keeps the bounded two-section detail view. The below-editor widget is enabled by default, renders the detailed current Session statistics as a left-aligned column and AILI stability as a right-aligned column, and remains user-toggleable with `cache panel on|off`; live terminal-resize behavior remains host-unverified on Pi 0.81.1.

Custom prompts are **opt-in**, not a cache optimization. With `experimental.customPrompts: true`, only six fixed slots are read from global `~/.pi/agent/aili-compact-prompts/` and project `.pi/aili-compact-prompts/`: `system.md`, `compress-range.md`, `compress-message.md`, `context-limit-nudge.md`, `turn-nudge.md`, and `iteration-nudge.md`. Project overrides global per slot; each file is limited to 4 KiB and the immutable snapshot to 8 KiB. Slot text is bounded guidance and cannot override schemas, protocol, source fidelity, privacy, or safety. It is never written to JSONL, diagnostics, tools, or widgets; AILI never creates or mutates these files. `/aili-compact prompt reload` explicitly refreshes the snapshot and starts a cache-input state transition.

Healthy manual Pi compaction is redirected to AILI controls; unhealthy projection or unsafe overflow falls through to Pi recovery. Local serializer evidence covers installed OpenAI Completions/Responses, Anthropic, and Gemini adapters, but real-provider summary quality/cache performance, later third-party context-handler order, and Pi internal request order remain Unverified. `opencode-acp@1.12.6` is recorded as an AGPL-3.0-or-later behavior reference only; AILI Compact is independently implemented for Pi and distributes no ACP source, prompt, schema, fixture, or asset.

The `pi-permission-modes@2.2.0` baseline owns mode persistence, prompts, and sandbox behavior. AILI carries one hash-locked matcher adaptation so `*` and `?` also match line terminators; this prevents multiline Bash/heredoc text from falling through YOLO's `"*": "allow"` rule while retaining custom ask/deny and fail-closed fallback behavior across every pattern-map surface. A Linux disposable fixture verified the stock Build profile through installed Bubblewrap, while an incompatible Git-worktree fixture visibly fell back to confirmation. This is not an isolation guarantee. `YOLO` remains an unrestricted, unsandboxed mode and must be treated accordingly.

## Native integrations and side effects

- `pi-web-access@0.13.0` provides its complete upstream web-search, content-fetch, curator, clone/PDF/video, and bundled-skill surface. Its provider fallback, network traffic, config/credential paths, clone cache, temporary curator service, downloads, and optional browser-cookie access are upstream behavior; inspect its tool requests and configuration before use.
- `pi-quota-status@0.3.0` is enabled by default. It may maintain `~/.pi/agent/pi-quota-status/state.json`; `/quota config` creates its configuration template. Zentui displays exactly one weekly value as `codex <percent> <reset>`, preferring explicit `Wk` data and treating the dependency's current `5h`-labeled primary value only as a compatibility fallback when weekly is absent.
- `pi-permission-modes@2.2.0` provides the permission UI and sandbox degradation behavior above through AILI's exact-source adaptation. The only semantic source change is line-terminator-safe shared glob matching; `upstream/pi-permission-modes.lock.json` records the baseline and adapted hashes. AILI does not retain `/aili-mode` or `Ctrl+Shift+Alt+A` as competing controls.
- AILI owns the public `task`/`hub` persistent Agent framework. `task` creates parent-scoped official Pi child sessions using 19 specialized `aili.*` selectors or `general`; top-level work is async by default, supports bounded batch scheduling, and returns stable Agent/job/turn IDs plus `agent://` and `history://` references. `hub` provides list/send/wait/inbox/output/history/jobs/cancel/model operations, park/revive, durable delivery, and owner/descendant scoping. No `subagent` compatibility alias or run/attempt backend selector remains. See [`docs/persistent-agents.md`](docs/persistent-agents.md).
- `pi-cache-optimizer@2.6.18` provides `/cache-optimizer`, provider cache diagnostics, cache statistics, and prompt-cache optimization. It may maintain `~/.pi/agent/pi-cache-optimizer-stats.json`; `/cache-optimizer fix` is interactive and is the only command that may propose editing `models.json`.
- `pi-markdown-preview@0.10.1` provides `/preview`, `/preview-browser`, `/preview-pdf`, `/preview-clear-cache`, and the `preview_export` tool. Terminal/browser previews require a Chromium executable; PDF export additionally requires Pandoc and a LaTeX engine.
- `@narumitw/pi-lsp@0.25.0` provides language-agnostic `lsp_diagnostics`, `lsp_fix`, and `/lsp`. It supports routes for C/C++, Python, CSS/SCSS, JavaScript/TypeScript, Go, Rust, Java, Kotlin, Bash, YAML, Terraform, and other languages. It does not download language servers; install the required commands separately and configure project routes in `.pi/pi-lsp.json` or user routes in `~/.pi/agent/pi-lsp.json`.

These three community extensions are initialized by the single AILI Extension entry and remain upstream-owned code. AILI does not load `pi-lens` alongside `@narumitw/pi-lsp`, because both provide overlapping LSP tools.

## Optional capability packs

The core package does not install optional providers automatically.

- `web-research`: public web retrieval and source verification.
- `browser-qa`: browser-rendered inspection.
- `artifact-runtime`: durable artifacts and format transformations.
- `project-memory`: project-local durable memory after a separate project contract.

When unavailable, runtime and doctor output use explicit `SKIP`/`WARN` results and must not claim the work ran. Enable guidance and side effects are recorded in `manifests/capabilities.json`.

## Security boundary

AILI applies a non-removable in-process child guard before tool approval. It denies credential, authentication, and private-key paths/material; intersects parent-active tools with role/call ceilings; and routes each `ask` decision back to the parent UI. In sandbox-required modes, child Bash reuses the initialized `pi-permission-modes` SandboxManager through a child-cwd-specific Bash definition; if that executor is unavailable or the child is in an incompatible Git worktree, Bash fails closed rather than running unsandboxed. Parent task acceptance is not blanket child authorization. The guard does not make arbitrary trusted extension code safe, and neither AILI nor Pi claims a universal OS sandbox. Inspect exact approval targets and do not put credentials in task text.

Use `hub jobs`, `hub wait`, `hub output`, and `hub history` to inspect durable asynchronous work. At most 32 top-level turns run concurrently; nested work is synchronous and depth-bounded. Persistent Agents are a benefit-based way to improve execution efficiency and preserve parent context, while the main agent retains decisions, integration, and final verification. Direct parent work remains valid when delegation has no clear net benefit; no Agent call is required to unlock mutation. Provider/model behavior still depends on the configured Pi environment.

## Provenance and reproducibility

- `upstream/aili-workflows.lock.json` pins the exact canonical 64-skill/471-file snapshot.
- `upstream/opencode-global-agents.lock.json` pins the global AGENTS source revision/hash and documents its Pi-native derivation.
- `upstream/pi-permission-modes.lock.json` pins the exact upstream and adapted permission runtime files and semantic diff.
- `manifests/skill-compatibility.json` records one compatibility state per skill.
- `manifests/roles.json` records 19 generated specialized profiles plus the AILI-owned `general` profile.
- `manifests/provenance.json`, `manifests/sbom.json`, and `THIRD_PARTY_NOTICES.md` record adapted/reference sources and the exact npm lock inventory.

Verify generated artifacts with:

```sh
npm run validate:generated
npm run validate:provenance
npm run validate:release
```

## Troubleshooting

- **Unsupported Pi version/API:** update Pi explicitly, then rerun the bootstrap. The script fails before AILI mutation when preflight cannot prove compatibility.
- **Package install failure:** keep the reported Pi/AILI states distinct. Retry the printed `pi install` command after fixing the cause; do not automatically remove a pre-existing package.
- **Doctor is non-pass:** inspect the exact `ERROR`, `WARN`, `SKIP`, or `UNVERIFIED` component. Missing optional packs are not core execution success.
- **Permission shortcut does nothing:** use `/perm`; terminal multiplexers may consume `Alt+M`.
- **YOLO still asks for multiline Bash:** confirm the loaded Package contains the adapted permission runtime with `npm run verify:permission-modes`; do not work around it by granting every distinct script for the session.
- **Persistent task says the parent Session is not durable:** start/save a normal Pi session first; Agents require a parent JSONL so their sidecar can be scoped exactly.
- **Child Bash is denied in a sandbox-required mode:** inspect `/sandbox` for dependency/platform readiness. AILI deliberately denies instead of running unsandboxed when the parent SandboxManager is unavailable or when an isolated Git worktree uses a `.git` file that Bubblewrap cannot bind safely.
- **Global resources are non-pass:** run `/aili-install-global-resources` only after reviewing the exact `~/.pi/agent/` targets. A malformed marker or an unowned role collision intentionally leaves files unchanged.
- **Offline use:** the installed Package embeds the pinned skills and does not fetch `aili-workflows` at runtime. Its Pi-managed npm lifecycle synchronizes only pre-existing same-name global skills from that embedded fixed snapshot. First-time Pi/package installation still requires the relevant package sources.

See `THIRD_PARTY_NOTICES.md` for source and license details. No official endorsement by the Pi maintainers is claimed.
