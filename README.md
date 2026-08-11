# AILI for Pi

`@rosetears/aili-pi` is a Pi Package that adds ROSE delivery routing, five workflow prompts, native Pi integrations, and diagnostics to the official `pi` CLI. It does not replace or fork Pi.

## Requirements

- Linux
- Node.js 22.19.0 or newer
- Pi 0.82.1 or newer with the Package and Extension APIs used by this release

AILI does not replace Pi's provider/model catalog. On the tested Pi 0.82.1 baseline, Codex-authenticated GPT-5.6 Sol, Terra, and Luna retain Pi's `272000` context-window metadata unless you explicitly configure a supported Pi model override.

macOS and native Windows are not supported by this bootstrap and fail before installation mutation.

## Install

### Stable 0.2.0

Install the current stable package through Pi:

```sh
pi install npm:@rosetears/aili-pi@latest
```

### Bootstrap route

Run the repository bootstrap:

```sh
./install.sh
```

If Pi is absent, the script downloads only `https://pi.dev/install.sh` over HTTPS and executes it with your user authority. The upstream “latest installer” is trusted through ordinary TLS because no accepted checksum/signature mechanism is currently available. Review that boundary before use in a sensitive environment.

The script preserves an existing compatible Pi by default. It validates an existing user-global `~/.pi/agent/settings.json` but never creates, rewrites, or refreshes that file. Absent settings retain Pi defaults; explicit `true`, unmarked `false`, and unrelated settings are preserved byte-for-byte. Malformed or non-object settings fail without replacing the original file. Project `.pi/settings.json` files are never scanned or rewritten. If Pi automatic threshold/overflow compaction is disabled, set `compaction.enabled` to `true`. Context compaction is owned entirely by Pi.

On WSL2, the bootstrap also validates `~/.pi/agent/keybindings.json` before package installation. If the file is absent or has no explicit `app.clipboard.pasteImage` action, it atomically adds both `Ctrl+V` and `Alt+V`; an existing explicit action is left byte-for-byte unchanged, and malformed or unsafe targets fail closed. This only exposes Pi 0.82.1's existing WSL clipboard-image path—AILI does not add another clipboard reader.

To request Pi's own self-update first:

```sh
./install.sh --update-pi
```

The bootstrap installs or updates only official Pi and the Pi Package. It does not run `npm`, `npx`, or `rose-aili`, and it does not write `~/.agents/skills/`.

Shared Skills/workflows and the Pi Package have two independent lifecycle owners; neither owner replaces the other.

**Shared Skills/workflows — explicit user-owned lifecycle.** Install or update them only by explicitly running `npx -y rose-aili@<exact-or-user-selected-version> install` or `npx -y rose-aili@<exact-or-user-selected-version> update`. The accepted exact baseline is:

```sh
npx -y rose-aili@0.4.2 install
npx -y rose-aili@0.4.2 update
```

Choose a different version deliberately when needed. A moving `rose-aili@latest` may be a convenience command, but it is not valid doctor or release evidence; those claims require an exact version.

**Pi Package — Pi-owned lifecycle.** Pi alone installs, lists, updates, and removes the Package resources: Extensions, prompts, theme, roles, and the Pi-owned package skill.

**Stable only — not a preview route:**

```sh
pi install npm:@rosetears/aili-pi@latest
pi list
pi update npm:@rosetears/aili-pi
pi remove npm:@rosetears/aili-pi
```

The repository `skills/**` tree is only an exact verification baseline for the shared upstream release. It is not included in the npm tarball, is not registered as a Pi skill, and is never written to `~/.agents/skills/` by the Package, its npm lifecycle, Pi, or the bootstrap.

Removal is destructive for this Package. It does not remove Pi and must not be presented as rollback when replacing a pre-existing AILI installation.

### Explicit global resources

The package does not write global AILI resources during extension load. After reviewing the target, explicitly run:

```text
/aili-install-global-resources
```

That command creates or updates only the AILI marker block in `~/.pi/agent/APPEND_SYSTEM.md` and installs the 19 packaged profiles at `~/.pi/agent/agents/aili/`. The marker block is a Pi-native governance derivation of the pinned `aili-workflows` global AGENTS template: it retains instruction precedence, untrusted-content handling, approval/evidence/verification discipline, bounded delegation, project-rule precedence, and user-language output, while excluding OpenCode-only control planes. It preserves unrelated prompt content, rejects malformed markers or an unowned profile collision, and reports stale profiles without pruning them.

## Rose Cyberdeck

The package supplies the dark `rose-cyberdeck` theme plus three additional Pi Extensions: a Rose header, Rose Shimmer + four-row Rose Code Rain working surface, and Zentui footer/editor surface. Select it through Pi's `/settings` theme selector or set `"theme": "rose-cyberdeck"` in `~/.pi/agent/settings.json`. The visual extensions are adapted from `pi-sakura-cyberdeck` at revision `165a1f8011a12a58a6409b56b8a6c0416cd9b589` under MIT; see `THIRD_PARTY_NOTICES.md` and `notices/pi-sakura-cyberdeck-NOTICE.txt`.

Rose Code Rain uses the original sparse, fixed-column waterfall geometry: `density` selects even-cell tracks, at most 96 tracks span ultra-wide terminals, and each track falls vertically with a randomized tail and gap. The default 12 FPS cadence and 8–16 rows/second fall speed sit between the released and dense-preview profiles. `/rose-matrix on|off` controls the whole working widget; `/rose-matrix rain on|off` independently controls the four Rain rows while retaining Rose Shimmer. `/rose-matrix status`, `/rose-matrix fps <8-18>`, `/rose-matrix density <0.45-0.95>`, and `/rose-matrix appearance <auto|dark|light>` change active preferences. `/sakura-matrix` remains a deprecated compatibility alias. Header, rain, frames, footer, and editor use the Rose six-color system: Blue, Ice, Cyan, Violet, Rose, and Soft Rose.

### Migrating from Rem/Sakura names

Replace an exact legacy `rem-cyberdeck` theme token with `rose-cyberdeck` through `/settings` or `~/.pi/agent/settings.json`; when using a `light/dark` pair, replace only the legacy side. Existing `sakura-cyberdeck-matrix.json` and `rem-cyberdeck-zentui.json` configuration files are read compatibly and retained. Legacy product names below appear only for migration or upstream attribution.

Zentui keeps Pi's native editor by default. Its experimental fixed-bottom editor is opt-in because it replaces Pi's renderer, uses the terminal alternate screen, and renders its own overflow scrollbar at the right edge. Enable it through `/zentui fixed editor on`; disable it with `/zentui fixed editor off` to restore native terminal scrollback and selection. Mouse drag selection can continue across transcript viewports through wheel or bounded edge auto-scroll, then copies once on release. Zentui hides `pi-cache-stats` by default so the one canonical Codex weekly quota remains visible; explicitly re-enabled cache stats follow quota in the bounded footer.

### WSL2 clipboard-image paste

After bootstrap installation, take or copy an image in Windows and press `Alt+V` in Pi. `Ctrl+V` remains configured alongside it when no explicit user binding exists. Run `/reload` or restart Pi after a keybinding change. Pi's existing WSL path requires working WSL interop plus `wslpath` and `powershell.exe`; if `Alt+V` does not attach an image, confirm those commands resolve, Windows clipboard access is allowed, the clipboard contains an image, and `~/.pi/agent/keybindings.json` is a valid regular non-symlink JSON object. Dragging an image file into the editor remains unchanged.

## Commands and modes

- `/ideate`, `/define`, `/build`, `/ship`: the four AILI delivery modes.
- `/local-review`: a standalone local audit, not a fifth lifecycle mode.
- `/aili-doctor` or `/aili-doctor --json`: human or machine-readable health evidence.
- `/perm`: the revision-bound `pi-permission-modes@2.2.0` adaptation controls `Default`, `Plan`, `Build`, and `YOLO`.
- `Alt+M`: upstream mode-cycle shortcut.
- `/aili-install-global-resources`: explicit installation/update of marker-owned global ROSE and AILI-role resources.

### Context compaction

AILI Compact is removed from the 0.2.0 runtime. The package no longer registers its command, tools, provider projection, Session hooks, compaction hook, or diagnostics. Pi's native `/compact`, automatic threshold compaction, overflow summary, and retry behavior are the only supported compaction path. Historical implementation source is retained in the repository for possible future redesign but is not a supported 0.2.0 capability.

The `pi-permission-modes@2.2.0` baseline owns mode persistence, prompts, and sandbox behavior. AILI carries hash-locked adaptations so `*` and `?` also match line terminators and the one process-owned ready SandboxController can supply exact-profile Bash operations to persistent children. Children never initialize, reconfigure, reset, or silently downgrade that process-global runtime; a missing, degraded, disabled, or profile-mismatched sandbox denies sandbox-required child Bash. Linux disposable fixtures and a Pi 0.82.1 provider-backed child turn verified the Build path through installed Bubblewrap, while an incompatible Git-worktree fixture remained fail closed for children. This is not a universal isolation guarantee. `YOLO` remains unrestricted and unsandboxed.

## Native integrations and side effects

- `pi-web-access@0.13.0` provides its complete upstream web-search, content-fetch, curator, clone/PDF/video, and bundled-skill surface. Its provider fallback, network traffic, config/credential paths, clone cache, temporary curator service, downloads, and optional browser-cookie access are upstream behavior; inspect its tool requests and configuration before use.
- `pi-quota-status@0.3.0` is enabled by default. It may maintain `~/.pi/agent/pi-quota-status/state.json`; `/quota config` creates its configuration template. Zentui displays exactly one weekly value as `codex <percent> <reset>`, preferring explicit `Wk` data and treating the dependency's current `5h`-labeled primary value only as a compatibility fallback when weekly is absent.
- `pi-permission-modes@2.2.0` provides the permission UI and process-owned sandbox lifecycle above through AILI's exact-source adaptation. The semantic adaptations are line-terminator-safe shared glob matching, Pi session-environment forwarding, and the fail-closed persistent-child sandbox bridge; `upstream/pi-permission-modes.lock.json` records the baseline and adapted hashes. AILI does not retain `/aili-mode` or `Ctrl+Shift+Alt+A` as competing controls.
- AILI owns the public `task`/`hub` persistent Agent framework. `task` creates parent-scoped official Pi child sessions using 19 specialized `aili.*` selectors or `general`; top-level work is async by default, supports bounded batch scheduling, and returns stable Agent/job/turn IDs plus `agent://` and `history://` references. `hub` provides list/send/wait/inbox/output/history/jobs/cancel/model operations, park/revive, durable delivery, and owner/descendant scoping. No `subagent` compatibility alias or run/attempt backend selector remains. See [`docs/persistent-agents.md`](docs/persistent-agents.md).
- `pi-cache-optimizer@2.6.18` provides `/cache-optimizer`, provider cache diagnostics, cache statistics, and prompt-cache optimization. It may maintain `~/.pi/agent/pi-cache-optimizer-stats.json`; `/cache-optimizer fix` is interactive and is the only command that may propose editing `models.json`.

## Optional capability packs

The core package does not install optional providers automatically.

- `web-research`: public web retrieval and source verification.
- `browser-qa`: browser-rendered inspection.
- `artifact-runtime`: durable artifacts and format transformations.
- `project-memory`: project-local durable memory after a separate project contract.

When unavailable, runtime and doctor output use explicit `SKIP`/`WARN` results and must not claim the work ran. Enable guidance and side effects are recorded in `manifests/capabilities.json`.

## Security boundary

AILI applies a non-removable in-process child guard before tool approval. It denies credential, authentication, and private-key paths/material; intersects parent-active tools with role/call ceilings; routes each `ask` decision back to the parent UI; and fails closed when no UI or audited child sandbox executor exists. Parent task acceptance is not blanket child authorization. The guard does not make arbitrary trusted extension code safe, and neither AILI nor Pi claims a universal OS sandbox. Inspect exact approval targets and do not put credentials in task text.

Wrapped local and sandboxed Bash preserve Pi's current `PI_SESSION_ID`, persistent `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL` values while removing stale inherited values. A command that is separately authorized to read `$PI_SESSION_FILE` performs an ordinary Pi tool read; AILI does not proactively read or copy that Session JSONL.

Use `hub jobs`, `hub wait`, `hub output`, and `hub history` to inspect durable asynchronous work. At most 32 top-level turns run concurrently; nested work is synchronous and depth-bounded. Persistent Agents are a benefit-based way to improve execution efficiency and preserve parent context, while the main agent retains decisions, integration, and final verification. Direct parent work remains valid when delegation has no clear net benefit; no Agent call is required to unlock mutation. Provider/model behavior still depends on the configured Pi environment.

## Provenance and reproducibility

- `upstream/aili-workflows.lock.json` pins the exact canonical 65-skill/588-file verification snapshot from `rose-aili@0.4.2` commit `bb1fedacc46d71045daa6257d121f2b71ba29d54`.
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
- **Child Bash is denied in a sandbox-required mode:** inspect `/sandbox` and the active profile. Persistent children require the process-owned sandbox to be ready with an exact matching profile; disabled/degraded state and Git-worktree `.git` files remain fail closed and approval cannot downgrade them to unsandboxed execution.
- **Global resources are non-pass:** run `/aili-install-global-resources` only after reviewing the exact `~/.pi/agent/` targets. A malformed marker or an unowned role collision intentionally leaves files unchanged.
- **Offline use:** the installed Package does not embed the generic shared-Skill snapshot and does not fetch or synchronize `aili-workflows` at runtime. Shared workflow installation/update remains an explicit user-run `rose-aili` operation; Pi Package installation/update remains a separate Pi operation. First-time installation still requires the relevant package sources.

## License

`@rosetears/aili-pi` version 0.1.13 and later is licensed under `AGPL-3.0-or-later`; see [`LICENSE`](LICENSE). Corresponding source is available from the repository declared in `package.json`. This prospective license declaration does not revoke licenses already granted for 0.1.12 or earlier releases.

Bundled dependencies, adaptations, assets, and behavioral references retain their own license terms. See `THIRD_PARTY_NOTICES.md` for exact source, revision, reuse boundary, and license details. No official endorsement by the Pi maintainers is claimed.
