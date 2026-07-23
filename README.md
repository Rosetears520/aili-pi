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

## Rem Cyberdeck

The package supplies the `rem-cyberdeck` theme plus three additional Pi Extensions: a Rem header, matrix animation, and Zentui footer/editor surface. They are derived from `pi-sakura-cyberdeck` at revision `165a1f8011a12a58a6409b56b8a6c0416cd9b589` under MIT; see `THIRD_PARTY_NOTICES.md` and `notices/pi-sakura-cyberdeck-NOTICE.txt`.

Zentui enables its experimental fixed-bottom editor by default when the installed Pi TUI exposes the required private layout capabilities. If capability detection or installation fails, it keeps Pi's native editor and emits a warning. The feature uses the terminal alternate screen; its default mouse scrolling can interfere with terminal text selection and tmux scrollback. Use Zentui's `/zentui` settings to disable the fixed editor or mouse scrolling.

## Commands and modes

- `/ideate`, `/define`, `/build`, `/ship`: the four AILI delivery modes.
- `/local-review`: a standalone local audit, not a fifth lifecycle mode.
- `/aili-doctor` or `/aili-doctor --json`: human or machine-readable health evidence.
- `/perm`: upstream `pi-permission-modes` control for `Default`, `Plan`, `Build`, and `YOLO`.
- `Alt+M`: upstream mode-cycle shortcut.
- `/aili-install-global-resources`: explicit installation/update of marker-owned global ROSE and AILI-role resources.

`pi-permission-modes` owns mode persistence, prompts, and sandbox behavior. A Linux disposable fixture verified its stock Build profile through installed Bubblewrap, while an incompatible Git-worktree fixture visibly fell back to confirmation. This is not an isolation guarantee. `YOLO` is an upstream unrestricted mode and must be treated accordingly.

## Native integrations and side effects

- `pi-web-access@0.13.0` provides its complete upstream web-search, content-fetch, curator, clone/PDF/video, and bundled-skill surface. Its provider fallback, network traffic, config/credential paths, clone cache, temporary curator service, downloads, and optional browser-cookie access are upstream behavior; inspect its tool requests and configuration before use.
- `pi-quota-status@0.3.0` is enabled by default. It may maintain `~/.pi/agent/pi-quota-status/state.json`; `/quota config` creates its configuration template.
- `pi-permission-modes@2.2.0` provides the permission UI and sandbox degradation behavior above. AILI does not retain `/aili-mode` or `Ctrl+Shift+Alt+A` as competing controls.
- `@agwab/pi-subagent@0.4.8` owns the generic `subagent` tool, child spawn, cancellation, durable run/artifact lifecycle, bounded parallel fan-out, async actions, worktrees, external `cwd`, and sandbox options. The 19 `aili.<role>` profiles are optional named agents; generic or agentless runs do not use an AILI-only result schema. AILI injects an immutable credential-path guard; child Pi processes load the ambient AILI `pi-permission-modes` registration exactly once. The upstream runner excludes recursive `subagent` exposure inside workers.
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

AILI injects a non-removable guard that denies standard Pi file-tool and parsed-bash access to credential, authentication, and private-key paths, including from an external `cwd`, a YOLO permission mode, or a caller-supplied child extension list. Child Pi processes load the ambient AILI `pi-permission-modes` registration exactly once, so vendor permission prompts and sandbox behavior remain active; headless confirmation requests fail closed. The guard does not make arbitrary third-party extension code safe: extensions remain trusted code and may have direct process authority. Neither AILI nor Pi provides a universal OS sandbox or containment: trusted extensions, user-authority processes, ambient network access, and filesystem races remain in the user trust domain. Inspect exact approval targets and do not put credentials in task text.

Use `subagent` lifecycle actions (`status`, `logs`, `wait`, `interrupt`, `mark-background`, and `reconcile`) to inspect durable async work. Upstream fan-out is version-bounded rather than capped by AILI at two; background completion is not evidence until inspected. Provider/model behavior still depends on the configured Pi environment.

## Provenance and reproducibility

- `upstream/aili-workflows.lock.json` pins the exact canonical 64-skill/471-file snapshot.
- `upstream/opencode-global-agents.lock.json` pins the global AGENTS source revision/hash and documents its Pi-native derivation.
- `manifests/skill-compatibility.json` records one compatibility state per skill.
- `manifests/roles.json` records the 19 generated Pi role profiles.
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
- **Global resources are non-pass:** run `/aili-install-global-resources` only after reviewing the exact `~/.pi/agent/` targets. A malformed marker or an unowned role collision intentionally leaves files unchanged.
- **Offline use:** the installed Package embeds the pinned skills and does not fetch `aili-workflows` at runtime. Its Pi-managed npm lifecycle synchronizes only pre-existing same-name global skills from that embedded fixed snapshot. First-time Pi/package installation still requires the relevant package sources.

See `THIRD_PARTY_NOTICES.md` for source and license details. No official endorsement by the Pi maintainers is claimed.
