# Font Policy

[FRAME] Font choice follows controlling evidence rather than a universal default.

## Selection Order

[FRAME] Use: controlling template/brand → current user choice → accepted user presentation profile → project configuration → fonts verified in build and render environments → ask the user → explicitly approved compatibility fallback.

[FRAME] Microsoft YaHei, Arial, and Calibri are compatibility examples only. They may be used when the controlling template requires them or the user explicitly approves them as fallbacks; they are not unconditional defaults.

## Three Environments

| Environment | Required evidence | Failure behavior |
|---|---|---|
| Build | fonts available to the primary renderer | required unavailable/unknown → `need-user`; do not silently substitute |
| Render | fonts available to the current rendering tool | required unavailable/unknown → `need-user`; visual evidence is not current |
| Target | fonts available on the presentation machine/viewer | unknown may remain named `Unverified`; do not claim cross-viewer fidelity |

[FRAME] `font-contract.json` records intended families, roles, whether each is required, template-run sources, and user-approved fallbacks. `font-environment.json` separately records platform/WSL detection, renderer identity, Windows system/user registration, WSL Fontconfig visibility, mounted font files, substitutions, and evidence hashes. `font-audit.json` binds both artifacts and the current template profile hash.

[FRAME] Directory or mounted-file presence does not establish renderer visibility. Only current renderer-visible evidence satisfies build/render availability. Reading a real `C:\Windows\Fonts`, user font directory, `/mnt/c/Windows/Fonts`, or other workspace-external location requires the exact current ROSE approval; without it, `inventory_fonts.py` returns a requested-path operation packet and `need-user` rather than reading or claiming verification.

[FRAME] Run `report_font_audit.py <workspace>` after recording build/render/target evidence. Workspace readiness embeds the same deterministic audit; required build/render gaps or unapproved substitutions return `need-user`, while an unknown target remains `Unverified`.

[FRAME] An empty required-font set does not prove typography is designed. Add families before build when the design contract depends on them.
