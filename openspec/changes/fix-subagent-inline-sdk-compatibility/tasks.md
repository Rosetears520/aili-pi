## 1. Readiness

- [x] 1.1 Record the user's 2026-07-24 acceptance of the final `test-plan.md` and repository-local BUILD authorization.
- [x] 1.2 Reconfirm the pinned Pi 0.81.1 / `@agwab/pi-subagent@0.4.8` compatibility evidence; no dependency or lockfile change was made.

## 2. Backend compatibility adapter

- [x] 2.1 Add one pure, revision-bound compatibility planner that maps ordinary omitted/`auto` runs to headless, preserves compatible selectors, and rejects the unrepresentable visible+plain parallel auto mix.
- [x] 2.2 Use the same effective parameters for upstream `renderCall` and both supported `execute` argument shapes, preserving Agent labels, credential-extension injection, and all unrelated options.
- [x] 2.3 Reject explicit inline on the incompatible pin before worker/model startup with a bounded actionable validation result rather than a generic provider/model failure.

## 3. Focused regression coverage

- [x] 3.1 Add unit coverage for single/parallel default routing, task-level visible/sandbox selectors, mixed-auto rejection, explicit backend handling, lifecycle pass-through, execute-shape safety, and renderer/executor parity.
- [x] 3.2 Add disposable fake-Pi integration coverage that omits backend, proves process-backed execution, preserves `PI_PERMISSION_MODE`, excludes recursive subagents, and leaves business files unchanged.
- [x] 3.3 Retain credential-denial, external cwd, worktree, sandbox, async lifecycle, fail-fast, cancellation, and generic/named-Agent regression coverage.

## 4. Live and release evidence

- [x] 4.1 Revise the read-only live probe to omit backend and require `backend:headless`.
- [ ] 4.1a Run the revised default-path and credential live probes only after separate exact provider authorization.
- [x] 4.2 Make schema-v2 stable-release validation reject missing, stale, inline-resolved, backend-ambiguous, or non-pass default-path evidence while keeping explicit-headless credential evidence separately classified.
- [x] 4.3 Update README/troubleshooting, provenance, adapter evidence, and compatibility state without claiming an upstream inline fix or unrun provider success.

## 5. Verification

- [x] 5.1 Run focused subagent tests, typecheck, full tests, compatibility/provenance/package checks, package dry-run, strict OpenSpec validation, and `git diff --check`; stable release correctly remains non-pass only because the separately gated live probes are unverified.
- [x] 5.2 Confirm the final diff contains no dependency/lockfile mutation, copied upstream runner, credential-path exposure, global installation, or unrelated permission-mode implementation change.
