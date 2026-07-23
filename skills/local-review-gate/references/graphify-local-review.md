# Graphify Local-Review Adapter

[FRAME] This adapter may consume already-produced output from the official globally installed Graphify skill as optional architecture context. It does not install, register, configure, launch, update, or remove Graphify.

## Positive trigger

- Use this adapter only inside an explicit `/local-review` when an existing Graphify result is already available and directly relevant to an architecture, ownership, boundary, coupling, or hotspot review question.
- Consume at most one scoped result; do not ingest a complete graph or broad report when the review question can be answered from current source and tests.
- If no usable result exists, continue without Graphify. Do not create or refresh one from this gate.

## Evidence routing

- Treat Graphify as upstream snapshot/navigation evidence only.
- Use CodeGraph or current files for exact symbols, implementations, call paths, tests, dirty-state impact, and current behavior.
- Reconcile every Graphify lead against current source, tests, accepted artifacts, and Git state before reporting a finding.
- When Graphify conflicts with current evidence or its freshness is unknown, current evidence wins and the Graphify claim remains `Unverified`.
- Do not duplicate the same discovery through Graphify, CodeGraph, and broad grep; choose one owner for the question and narrow follow-up reads.

## Upstream ownership

[KNOWN|EXTERNAL] The accepted official CLI and global Agent-Skills commands are `uv tool install graphifyy` and `graphify install --platform agents`. Source: immutable Graphify `v0.9.20` README and `graphify/install.py` recorded in `openspec/changes/improve-context-maps-and-session-handoffs/design.md`.

- Installation and global registration are owned by the guided installer, not `/local-review`, and require separate exact approvals.
- A future project build, update, query, path, or explain operation is a different operation with its own exact target/effect approval.
- This repository owns no Graphify wheel, lock, profile, venv, project index, parser, launcher, hook, plugin, backend, server, scheduler, or support/qualification claim.

## Local-review boundaries

- Never invoke `graphify`, `/graphify`, `uv`, a Graphify backend, or a Graphify server from this gate.
- Never install the OpenCode platform plugin or mutate `.opencode`, hooks, `AGENTS.md`, Git state, or project graph output.
- Never turn Graphify output into correctness, security, acceptance, completion, SHIP, merge, archive, or release evidence.
- Keep absolute paths, private data, full graph payloads, and raw logs out of the review report; cite a bounded existing artifact/result and current-file evidence instead.
- Findings remain advisory until the normal local-review evidence and verdict rules resolve them.
