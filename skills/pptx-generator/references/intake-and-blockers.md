# Intake and Blockers

[FRAME] `intake.json` records the accepted delivery boundary and unresolved decisions. It informs readiness but never replaces current file/hash evidence.

## Capture

[FRAME] Record audience, purpose, setting, language, output location, controlling source/template, expected duration or count, editability, and any material brand, font, data, asset, or fidelity decision.

[FRAME] Every supplied visual deck has an explicit `controlling-template | style-reference | content-only | excluded` role, current path/hash, allowed uses (`layout`, `palette`, `fonts`, `images`, `charts`, `shape-language`), fidelity mode, and confirmed/pending user decision. `template-edit` requires exactly one confirmed controlling template; missing role or reuse permission returns `need-user` before profiling or content mapping.

## Typed Blockers

[FRAME] Each blocker has a stable `id`, `type`, `severity`, `status`, `description`, and executable `next_action`.

- [FRAME] Use `hard` when content, source, permission, required font, template, or output uncertainty prevents correct work.
- [FRAME] Use `attention` when action is required before the next gate but the source contract is not invalid.
- [FRAME] Use `open` until evidence or a user decision resolves the blocker; never mark it resolved because a placeholder exists.

[FRAME] Open hard blockers produce `blocked`. Open attention blockers produce `needs_attention`. The readiness report selects the first deterministic next action and does not infer completion from handwritten phase fields.

## Common Outcomes

- [FRAME] Missing controlling deck or report source → `provide-source`.
- [FRAME] Material audience/content/template choice → `need-user`.
- [FRAME] Required build/render font unavailable → `need-user` and block.
- [FRAME] Missing or stale outline → `compile-plan`.
- [FRAME] Missing renderer → `repair-renderer`.
- [FRAME] Missing/stale template profile → `profile-template`.
- [FRAME] External Windows/WSL font location without exact approval → `need-user`; do not create an empty verified inventory.
