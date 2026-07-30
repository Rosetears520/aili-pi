# Drift Log

## 2026-07-30 — BUILD_MATERIAL_DISCOVERY: bootstrap evidence compatibility

- [COMPUTED] Packages 2.1–2.3 implement a strict persistent-runtime contract requiring raw Agent/job/turn identities plus `agent://` output and `history://` history references, ordered INSPECTED/DONE evidence, and a jointly valid current pair before mutation.
- [COMPUTED] Fresh self-validation of this change's active bootstrap `tasks.md`/`progress.txt` returned 23 diagnostics. The board was created before the parser existed and its external Task runner exposes only `agent://ses_*`; raw job/turn/history values are unavailable. Several historical progress blocks also predate the fixed event-field and terminal-anchor validation.
- [INFERRED] Fabricating unavailable IDs, silently weakening the strict persistent contract, or rewriting append-only history would violate the accepted evidence model.
- [OPEN QUESTION] DEFINE must choose whether v1 adds an honest bounded external-runtime/bootstrap reconciliation form or remains strict persistent-only and therefore cannot use this current bootstrap board to continue formal BUILD.
- [COMPUTED] Affected BUILD stopped before package 3.1. No dependency, lockfile, Git, publish, release, or unrelated source operation was performed.

### Resolution

- [KNOWN|USER] The user selected the recommended bounded bootstrap bridge in the current session on 2026-07-30.
- [COMPUTED] DEFINE write-back adds an exact identity/decision opt-in, real external session ref, explicit unavailable job/turn/history, append-only BOARD/package RECONCILED evidence, and `dispatch_timing=unverified-before-return`; strict persistent validation remains the default.
- [KNOWN|USER] The user explicitly accepted the Round-2 regenerated final test plan with “接受并继续（推荐）” in the current session.
- [COMPUTED] Package 2.3a and the BOOT verification matrix are authorized for BUILD; dependency/lockfile, Git, publish, and release operations remain unapproved.

## 2026-07-30 — BUILD_MATERIAL_DISCOVERY: production formal-root input

- [COMPUTED] Package 2.4 stopped before edits. Production `registerPersistentAgentRuntime`, workspace leases, and `createWorkspaceMutationGuard` receive no exact active `FormalTaskBoardRootPaths`; package 3.3's guidance provider carries phase/profiles/Owners only.
- [COMPUTED] The current guard intercepts `write`/`edit`, but ordinary child bash requires the permission sandbox for filesystem enforcement. Hidden prompt/session inference, broad OpenSpec scanning, and heuristic bash command parsing cannot support the accepted immutable-owning-file claim.
- [INFERRED] Completing production protection therefore requires a bounded task input plus fail-closed bash handling, which changes the previously accepted “no public task schema field” boundary.
- [KNOWN|USER] The user selected “Add formal task context (Recommended)” in the current session on 2026-07-30.
- [COMPUTED] DEFINE write-back adds optional `formalContext: { changeId }`, exact same-root v1 validation, persistent protected paths, pre-write `write`/`edit` denial, exact sandbox `denyWrite` for formal bash, and formal-bash removal when that enforcement is unavailable. Ordinary task/default/permission behavior remains unchanged.
- [COMPUTED] Package 2.4 and affected BUILD remain blocked until the regenerated Round-3 final test plan is explicitly accepted. Package 4.1 was not started.

### Resolution

- [KNOWN|USER] The user explicitly accepted the Round-3 regenerated final test plan by selecting “Accept and continue (Recommended)” in the current session on 2026-07-30.
- [COMPUTED] Packages 2.4 and 4.1 may return to ready under the accepted sync execution contract; package 2.4 is selected first. Dependency, Git, publish, and release operations remain unapproved.
