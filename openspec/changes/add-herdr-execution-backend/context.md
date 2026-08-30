# Context — add-herdr-execution-backend

## Change identity

- Name: `add-herdr-execution-backend`
- Schema: spec-driven
- Created: 2026-08-26
- Lifecycle phase: DEFINE (planning artifacts complete; awaiting user acceptance of the final `test-plan.md` before any BUILD authorization)
- Scope: Phases 0–4 of the integrated redesign plan — dual execution backends (managed + herdr), Herdr surface integration, child bridge, InteractionBroker, ActivityBus/white-box observability. Native Browser, Prompt Middleware, and Observational Memory are explicitly out of scope and reserved for separate future changes.

## Maintained user intent (decisions from the 2026-08-26 session)

1. **Scope**: one change covering Phase 0–4 only; Browser/Prompt Middleware/Observational Memory get their own changes later.
2. **Management surface**: do not revive `hub`. `sub` stays the only model-facing delegation tool; Herdr management actions (focus/activity/interactions/answer/inspect) live in a new user-level slash-command family.
3. **Deliverables**: proposal/design/tasks/specs plus `context.md`, `progress.txt`, and a `test-plan.md` draft explicitly marked 未接受; BUILD starts only after the user accepts the test plan and separately authorizes implementation.
4. **Herdr installation posture**: detect binary + Pi integration + Pi-side skill; when missing, install via the official three commands in order —
   - `curl -fsSL https://herdr.dev/install.sh | sh`
   - `herdr integration install pi`
   - `npx skills add herdrdev/herdr --skill herdr -g -a pi`
   Detection is idempotent; failures are explicit; installation failure never silently switches backend. Herdr remains an external Apache-2.0 runtime (no vendoring); the installed skill is a user-level external artifact outside this repo's pinned skill snapshot.

## Frozen evidence

- Primary input: `/home/rosetears/code/aili-pi/aili-pi-herdr-integrated-redesign-plan.md` (the integrated redesign plan; Phases 0–4 adopted, Phases 5–6 deferred to future changes).
- Current-state audit (2026-08-26): control plane fully in `src/runtime/persistent-agents/` (17 files, ≈8,700 lines), no backend seam, no `hub` (removed by `simplify-subagent-runtime-remove-hub`), `questionnaire` (not `ask-user-question.ts`) is the ask surface, no `aili.*` settings keys.
- Herdr behavior reference: `~/.agents/skills/herdr/SKILL.md` (CLI semantics, live-name rule `[a-z][a-z0-9_-]{0,31}`, settled lifecycle states that do not track turns). The raw socket API (`session.snapshot`, `events.subscribe`, …) is an unverified assumption gated by task 1.2.
- Design references (clean-room, no code copied): `amosblomqvist/pi-config` (no license file — behavior reference only), `amosblomqvist/pi-interactive-subagents` (MIT), `amosblomqvist/pi-observational-memory` (MIT); runtime `herdrdev/herdr` (Apache-2.0).

## Relationship to other changes

- `integrate-pi-web-ui-and-upstream-extensions` (BUILD): owns Web presentation; this change adds display-field requirements only and must not modify that change's specs. Coordination happens in Phase 4 tasks.
- `simplify-subagent-runtime-remove-hub`: this change preserves its outcome (no `hub` revival).
- Future changes: Native Browser, Prompt Middleware, Observational Memory + MemPalace layering.
