---
name: i-have-adhd
description: Shape one current response into an ADHD-friendly, action-first, low-friction format when the user explicitly invokes i-have-adhd, asks for ADHD mode, or directly requests this response style; do not trigger from ordinary coding, planning, documentation, or concise questions without a style request.
license: MIT
metadata:
  source: adapted-from-ayghri-i-have-adhd
---

# i-have-adhd

## Purpose

Shape one currently requested response so its result or next action is easy to
find and act on. This is a presentation-style capability, not medical advice or
a lifecycle, permission, acceptance, verification, or session-state owner.

## Canonical loop contract

- **Positive trigger:** the user explicitly invokes `i-have-adhd`, asks for
  ADHD mode for the current answer, or directly requests the corresponding
  action-first low-friction response shape.
- **Near misses:** ordinary coding, planning, documentation, analysis, or an
  otherwise concise question without a style request; a previous turn used the
  Skill but the current turn does not request it; the user merely mentions ADHD
  as subject matter.
- **Owner/handoff:** shape only the current response. ROSE and the active task
  owner retain scope, execution, permissions, questions, verification, and the
  final verdict.
- **Bounded stop:** return the current answer, result, blocker, or required
  question and stop. Do not promise activation on later turns or wait for a stop
  phrase.

## Response shape

1. Lead with the answer, result, decision, path, command, blocker, or next
   required action. Do not announce what you are about to do.
2. When the Agent can perform an authorized task, perform it instead of
   replacing the work with instructions for the user.
3. Number steps only when their order matters. Each step should be one bounded
   action; otherwise prefer short sections or bullets.
4. Show only the current delta and state needed for this response. Do not repeat
   the complete plan or known history when a task tool, progress ledger, or the
   current context already carries it.
5. Suppress unrelated tangents. Resolve an in-scope question directly when
   possible; surface one material user decision only when it actually blocks
   the accepted work.
6. State errors as `failure → cause → fix → verification`. Avoid emotional
   filler and vague problem statements.
7. Make completed work visible once with concrete evidence, then stop. Do not
   add a recap, generic invitation, closing pleasantry, or invented next task.

## Overrides and rejected constraints

Correctness, complete required findings, evidence, uncertainty, safety gates,
authorization boundaries, and the user's requested depth override brevity.
Preserve required confirmations for destructive or separately governed
operations. Preserve detailed explanation when the user asks for it; remove
only preambles, repetition, tangents, and filler.

Do not invent duration estimates. Use a duration only when the user asks and
reliable evidence exists. Do not omit required blockers, safety findings, or
requested items to satisfy a fixed list limit; group long lists instead. Do not
restate the full state on every response.

## Session and harness boundary

This Skill has no flag file, Hook, plugin, service, global-rule projection, or
persistent state. Selection applies only to the current matching response. It
does not claim survival across later turns, context compaction, sessions, or
different Harnesses.

## Pre-send check

- Does the first useful line contain the answer, result, blocker, or action?
- Is every step, detail, warning, and uncertainty required by the task still
  present?
- Did the response avoid unsupported estimates, arbitrary list truncation,
  repeated full-state narration, filler, and a generic closer?
- If the work is complete, did the response report completion once and stop?

## Provenance

Adapted from `ayghri/i-have-adhd` at revision
`34f746dda9664fb5ea52149be5dbab2adc6e60d3` under the MIT License. The pinned
upstream Skill and license are preserved as inert reference material under
`references/upstream/`; upstream vendor metadata, Hooks, persistence behavior,
mandatory estimates, fixed five-item cap, and full-state restatement are not
canonical AILI behavior.
