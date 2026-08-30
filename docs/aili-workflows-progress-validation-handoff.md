# AILI Workflows follow-up: free-form progress without Board validation

## Accepted direction

The project owner approved this behavior:

- multi-step/formal work still creates `progress.txt`;
- `progress.txt` is concise free-form continuity text with no fixed grammar or format-validation gate;
- `formal-task-board.md` is optional human-readable task notes;
- neither file is execution, acceptance, authorization, or completion authority;
- OpenSpec validates only its native planning artifacts (`proposal.md`, `specs/**/spec.md`, `design.md`, `tasks.md`);
- Agent/job/turn/settlement state belongs to the runtime Journal.

The canonical follow-up shipped as `rose-aili@0.4.8` in commit `a5284ee105a084392a944aee04313dcf7c294a64`. `aili-pi` consumes it only through the repository sync generators; do not hand-edit the pinned/generated workflow snapshot.

## Canonical owner

Repository: `https://github.com/Rosetears520/aili-workflows.git`

Pinned source currently recorded by `aili-pi/upstream/aili-workflows.lock.json`:

- release: `rose-aili@0.4.8`
- commit: `a5284ee105a084392a944aee04313dcf7c294a64`
- release run: `https://github.com/Rosetears520/aili-workflows/actions/runs/32687088484` (successful)

## Canonical edits delivered

The released canonical sources replaced `aili-task-board/v1` and repeated validation behavior, especially:

- `.agents/skills/aili-delivery-flow/SKILL.md`
- `.agents/skills/aili-delivery-flow/references/lifecycle.md`
- `.agents/skills/aili-delivery-flow/references/backend-routing.md`
- `.agents/skills/aili-delivery-flow/references/artifact-contracts.md`
- `.agents/skills/aili-delivery-flow/references/formal-task-board.md`
- `.agents/skills/aili-delivery-flow/references/implementation-packages.md`
- `.agents/skills/aili-delivery-flow/references/direct-vs-delegated-work.md`
- the canonical task-board protocol/schema and generated Pi projection inputs

## Target workflow behavior

1. On multi-step/formal change initialization, create `progress.txt` if absent.
2. Append only concise status, evidence, blockers, and next action as ordinary prose.
3. Do not require RFC3339 timestamps, event vocabularies, key/value fields, field order, transition pairing, or replay validation.
4. Do not validate `progress.txt` after Agent dispatch, settlement, package completion, BUILD completion, or SHIP completion.
5. Do not require `formal-task-board.md`. If present, treat it as optional task notes and never parse it as a gate.
6. Do not duplicate Journal Agent/job/turn state into Markdown protocols.
7. Run `openspec validate <change> --strict --json` only when OpenSpec-native artifacts changed or an explicit OpenSpec acceptance/archive gate requires it; do not validate all docs after code-only work.
8. Workers still return evidence only and must not write the orchestrator-owned `progress.txt`.

## AILI Pi changes to preserve

The local implementation in `aili-pi`:

- updates `src/runtime/persistent-agents/runtime.ts` guidance;
- makes `resolveFormalTaskProtection()` derive protected paths from a safe change ID without reading Board/progress files;
- updates `README.md` and `docs/persistent-agents.md`;
- retains `progress.txt` creation as an orchestrator requirement;
- leaves legacy explicit reconciliation code compatibility-only for later coordinated retirement.

## Acceptance checks for the follow-up

- A formal/multi-step change with no `progress.txt` creates it once.
- Free-form progress text does not block dispatch or completion.
- Missing or arbitrary `formal-task-board.md` does not block dispatch.
- Code-only completion does not invoke OpenSpec or Markdown format validation.
- Changed OpenSpec delta specs still receive one targeted native OpenSpec validation.
- Generated Pi projections and lock evidence are refreshed from canonical source rather than hand-edited.
