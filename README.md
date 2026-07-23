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

Removal is destructive for this Package. It does not remove Pi and must not be presented as rollback when replacing a pre-existing AILI installation.

### Explicit global resources

The package does not write global AILI resources during extension load. After reviewing the target, explicitly run:

```text
/aili-install-global-resources
```

That command creates or updates only the AILI marker block in `~/.pi/agent/APPEND_SYSTEM.md` and installs the 19 packaged profiles at `~/.pi/agent/agents/aili/`. It preserves unrelated prompt content, rejects malformed markers or an unowned profile collision, and reports stale profiles without pruning them.

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
- `@agwab/pi-subagent@0.4.8` owns child spawn, cancellation, JSONL handling, and artifacts. AILI adds only role/tool/path policy projection, a two-child ceiling, and structured-result normalization. AILI children do not expose resume, worktree, background, recursive dispatch, or automatic retry.

## Optional capability packs

The core package does not install optional providers automatically.

- `web-research`: public web retrieval and source verification.
- `browser-qa`: browser-rendered inspection.
- `artifact-runtime`: durable artifacts and format transformations.
- `project-memory`: project-local durable memory after a separate project contract.

When unavailable, runtime and doctor output use explicit `SKIP`/`WARN` results and must not claim the work ran. Enable guidance and side effects are recorded in `manifests/capabilities.json`.

## Security boundary

AILI adds role/tool/path projection and structured-result redaction around the native integrations. Vendor permission and sandbox behavior remains vendor-owned. Neither AILI nor Pi provides a universal OS sandbox: trusted extensions, user-authority processes, ambient network access, and filesystem races remain in the user trust domain. Inspect exact approval targets and do not put credentials in task text.

Child roles are fresh, single-use processes with no resume, chaining, background continuation, recursive delegation, or automatic retry. At most two child processes run concurrently. Output and diagnostics are bounded and redacted; provider/model behavior still depends on the configured Pi environment.

## Provenance and reproducibility

- `upstream/aili-workflows.lock.json` pins the exact canonical 64-skill/471-file snapshot.
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
- **Offline use:** the installed Package embeds the pinned skills and does not fetch `aili-workflows` at runtime. First-time Pi/package installation still requires the relevant package sources.

See `THIRD_PARTY_NOTICES.md` for source and license details. No official endorsement by the Pi maintainers is claimed.
