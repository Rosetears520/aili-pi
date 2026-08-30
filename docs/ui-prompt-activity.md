# UI prompt activity projection (Pi 0.84.4)

AILI consumes Pi's notification-only `ui_prompt_start` and `ui_prompt_end`
events as observability. The production status projection reports either
`working` or `waiting-for-user`; it does not open, answer, cancel, or settle a
prompt.

Pi supplies `reason: "ui_prompt"`, the prompt `kind` (`select`, `confirm`,
`input`, `editor`, or `custom`), and an optional title. Pi coalesces nested or
overlapping prompts into one outer waiting span and invokes handlers
best-effort without awaiting them. AILI's small projection tolerates nested
notifications and clears stale display state on agent settlement or session
shutdown.

This covers extension UI uniformly, including Prompt Middleware selection
(Alt+S and `/snippets`), questionnaire UI, and Parent permission/model
confirmation. It does not alter Prompt Middleware's one-shot
pending/armed/consume state or `InteractionBroker` pending records and
answers.

Managed child approval/model prompts additionally publish the existing
backend-neutral activity vocabulary (`interaction.requested` /
`interaction.resolved`). External Herdr children bridge precise
`ui.prompt.started` / `ui.prompt.ended` events, including prompt kind/title,
to the same activity bus. The bus exposes `workState` as `working`,
`waiting-for-user`, or `idle`; its existing liveness overlay and all durable
Agent/job/turn/run lifecycle completion remain independent and authoritative.
