# WT-001 Worktree Context Protocol

Repository source path: `.agents/skills/aili-delivery-flow/references/protocols/worktree-context.md`. Installed runtime target: `$HOME/.agents/skills/aili-delivery-flow/references/protocols/worktree-context.md`.

`WT-001` is the single authority for attached-repository target identity and parent-observed evidence. Task packets, results, implementation packages, and backend adapters reference one context by id; they must not copy, rebind, or independently reinterpret roots, keys, Git identity, approvals, permission boundaries, or evidence.

Every envelope has exactly one mode:

- `a30-a31-external-read`: historical, non-gating evidence only. Its external-path ask, shared-common-dir, and A30 provider-probe fields remain valid only inside that historical record.
- `a33-attached-shared-trust-domain`: current authority. Mixed A30 fields or guarantees, managed-subagent external ask, cross-repository common-dir equality, and use of an A30 probe as A33 proof are invalid.

## Canonical context

```text
WT-001:
- context_id:
- evidence_version:
- freshness:
- mode: a30-a31-external-read | a33-attached-shared-trust-domain
- source_session_root:
- repo_key:
- worktree_key:
- target_repo_root:
- target_worktree_root:
- branch:
- base_ref:
- branch_mode: existing | create
- reflog_policy: enabled | disabled
- operation_class: driver_fixture | real
- trusted_code_risk: accepted | declined | unavailable | not_applicable | null
- host_identity: A33Identity
- source_identity: A33Identity
- target_identity_pre: A33Identity
- target_identity_post: A33Identity
- expected_delta:
- observed_delta:
- allowed_paths:
- forbidden_paths:
- artifact_paths:
- target_rules_read_at: operation | dispatch
- operation_approval_ref:
- soft_boundary_disclosure:
- containment_status: ready | blocked | Unverified
- blocked_reasons:
- unverified:
```

The A33 host is the Git repository where the user started OpenCode. AILI does not rank, move, broadly scan for, or auto-select a host. Every target is exactly `<session-root>/.worktrees/<repo_key>/<worktree_key>`; visible `worktrees/` and historical `.tmp/worktrees/` are not aliases. `repo_key` and `worktree_key` are nonempty and match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. Empty, `.`, `..`, `.git`, `.worktrees`, path-like, absolute, control, newline, NUL, separator, reserved, colliding, tracked, or ambiguous values block without suffixing, guessing, forcing, `-B`, orphan creation, remote guessing, or implicit ref selection.

Admission requires a Git session root, the exact prospective destination ignored through root `/.worktrees/` with no re-inclusion, no tracked destination, and safe non-submodule topology. Tracked `.gitmodules`, mode-160000 gitlinks, source/superproject relations, malformed topology, and symlink/junction/mount/path escape ambiguity block. AILI never silently edits the host ignore file.

Every PREPARE pending operation, ADD/REMOVE operation, and approval carries both exact keys. Every operation binds explicit nonempty source, destination, branch, base ref, `branch_mode`, source `reflog_policy`, and `operation_class`. PREPARE is descriptor-only and grants no authority. Each attachment ADD requires one fresh exact approval and `trusted_code_risk:accepted`; each later non-force REMOVE requires a different fresh exact approval after complete deletion inventory and uses observed `trusted_code_risk:not_applicable`. Missing, declined, unavailable, stale, expired, mismatched, wrong-operation, wrong-class, wrong-risk, wrong-key, or reused approval has zero effect. Fixture and real approvals are never interchangeable.

## Exact A33 identity and deltas

`A33Identity` has all and only:

`identity_state, declared_root, path_state, canonical_root, git_toplevel, git_private_dir, git_common_dir, git_head, git_branch, detached_head, worktree_membership, dirty_state, tracked_files, untracked_files, ignored_files, artifact_files, unknown_files`.

`identity_state` is `populated | absent`; `declared_root` is always a nonempty canonical absolute string; `path_state` is `present | absent`; and membership is `main | linked | absent`. Populated identities require present path, nonempty canonical/Git roots and HEAD, boolean detached state agreeing with branch nullability, main/linked membership, exact typed dirty state `{tracked_modified:boolean,tracked_deleted:boolean,untracked_count:nonnegative_integer,ignored_count:nonnegative_integer}`, and duplicate-free sorted canonical repository-relative file arrays. Absent identities keep only `identity_state`, `declared_root`, `path_state`, and `worktree_membership` non-null; every other field is JSON `null`. Host/source are populated. ADD target is absent→populated; REMOVE target is populated→absent. No identity hash/digest field or string sentinel is valid.

Compare typed identity fields, sorted file arrays, and explicit admin delta records directly. `expected_delta` and `observed_delta` contain all of `target_path,worktree_membership,common_dir_identity,common_dir_admin_entry,branch_ref,branch_reflog,unrelated_common_dir_entries,unrelated_refs,config,hooks,unrelated_worktree_records,unrelated_prunable_entries,other_files`; each value is exactly `{before,after,change}` with JSON `null` for absence and `change:created|deleted|unchanged`. Common-dir canonical identity always remains unchanged. ADD creates only the declared admin entry/membership plus the bound create-mode ref and, only when policy is enabled, reflog. Existing mode creates neither ref nor reflog. REMOVE deletes only the declared admin entry/membership and preserves branch ref/reflog. All unrelated/prunable entries, refs, reflogs, config, hooks, worktree records, and other files remain unchanged.

Every declared result field is present. JSON `null` represents absent or inapplicable data; omission, wrong types, or string sentinels are invalid. The only A33 `not_applicable` enum is `trusted_code_risk` on an observed REMOVE approval. Joined static rows keep outer identity/delta/operation/approval/cleanup fields JSON `null`.

## Required boundary evidence

Re-read target `AGENTS.md` and applicable rules at every operation/dispatch boundary. Target rules may narrow tools, paths, web, and permissions but never broaden them; same-level conflicts block. Each lane targets one declared repository/cwd, performs no recursive host scan, and writes user-visible artifacts only in the owning target repository. Missing/stale identity, rules, operation, approval, or delta evidence blocks.

Historical A30 read-only snapshots and provider behavior remain non-gating and cannot satisfy A33 identity, operation, runtime, or join evidence.

Only redacted metadata commands may be pre-approved for identity capture: `git status --short --branch`, `git status --porcelain=v1`, `git branch --show-current`, `git rev-parse --show-toplevel`, `git rev-parse --git-common-dir`, `git rev-parse --verify HEAD`, `git symbolic-ref --short -q HEAD`, and `git worktree list --porcelain`. Content-emitting Git commands, shell search commands, command substitution, pipelines, redirects, metacharacters, and subprocess launchers are not metadata evidence.

## Permission intersection and deny precedence

Effective authority comes from the final runtime-merged child permission rules and their provenance. The conceptual intersection is:

`effective_allow = parent_allow ∩ base_role_allow ∩ task_allow − any_deny`

Any parent, base-role, task-overlay, runtime, external-directory, path, operation, or protocol deny wins. Missing, ambiguous, unsupported, stale, or conflicting permission evidence is a deny. `role_overlay` is evidence and narrowing text, never permission authority: it cannot turn `ask` or `deny` into `allow`, add a tool, clone ROSE permissions, expand external-directory access, or prove the final effective child rules.

Admission and operation approval are separate. Only ROSE owns exact add/non-force-remove operations. Add/remove approval never authorizes test, debug, verification, integration, cleanup, another attachment, or another operation. Prune, move, repair, lock/unlock, force remove, clean/reset, merge/rebase, commit/push, branch deletion, automatic integration, and real-repository cleanup remain excluded.

Delegation is non-transitive. Every non-ROSE subagent has `task: deny` and `external_directory: deny`; no packet can copy ROSE permission or turn ask/deny into allow. Built-in `explore` and `general` remain outside A33 guarantees until effective profile and provenance are proven.

## Managed-role and Git boundary

The canonical inventory is exactly ROSE plus 19 managed Agent files. All 19 managed profiles deny `external_directory` and Task. `web-researcher` remains deny-by-default, local/external/mutation/delegation denied, and only `webfetch`/`websearch` ask. Where OpenCode patterns can express them without disabling legitimate same-root task work, managed profiles deny direct `.git` reads/edits and Git mutation commands. Read-only Git metadata may still reach the trusted common-dir. These are policy controls, not process containment.

## Soft boundary and fail-closed rule

The host and attachments are one explicitly trusted same-owner, same-sensitivity, mutually readable/writable trust domain. OpenCode path/cwd/permission rules are a soft coordination boundary, not hard repository isolation or an OS sandbox. Trusted Git hooks/config/filters/tests can execute with user privileges and ambient network. A33 provides no sandbox, DLP, network isolation, universal TOCTOU guarantee, or arbitrary-process containment. Different repositories need not and normally do not share a Git common-dir; never claim cross-common-dir equality.

Static A33 evidence cannot prove effective runtime profiles, installed equality, nested operation behavior, or UV-007. Staged runtime modes may use only driver-owned temporary repositories. Usage exits `2`; unavailable mandatory runtime evidence or a missing/declined/unavailable required-valid-operation approval exits `3`; schema/set/key/identity/null/class/risk/mutation or observed effect/ref/reflog/delta/cleanup violations exit `5`. Narrow exit `0` does not upgrade the soft-boundary residuals above.

## Reference-only use

Packets and results carry only:

```text
worktree_context_ref:
  protocol_path: .agents/skills/aili-delivery-flow/references/protocols/worktree-context.md
  context_id:
  evidence_version:
  freshness:
  mode: a33-attached-shared-trust-domain
```

If a packet or result duplicates/rebinds WT-001 identity, approval, path, Git, dirty-state, command/cwd, or containment facts, the duplicate is non-authoritative and the operation is blocked for reconciliation.
