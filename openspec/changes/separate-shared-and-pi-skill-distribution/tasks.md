## 1. Readiness and upstream prerequisite

- [ ] 1.1 Record explicit acceptance of the final `test-plan.md` and fresh BUILD intent before package/install changes.
  - Verify: acceptance is written to `interview.md`, `context.md`, `test-plan.md` and `progress.txt`; affected files are reread; strict OpenSpec validation passes.
- [ ] 1.2 Verify one exact `rose-aili` candidate that contains the required generic formal task-board/delegation semantics.
  - Blocker: observed `rose-aili@0.4.0` lacks `formal-task-board.md`; no `aili-pi` install-path removal before an exact successor passes.
  - Forbidden: no external repository write, npm publish, moving-tag trust, Pi-specific upstream leakage or automatic attachment.

## 2. Remove shared-skill installation from aili-pi

- [ ] 2.1 Obtain separate exact approval for the required `package-lock.json` mutation and any file deletions.
  - Expected lock delta: root `hasInstallScript` reconciliation only; no dependency graph/version/integrity change.
- [ ] 2.2 Remove `package.json#postinstall` and retire the installed global-sync script/type/test owner.
  - Verify: no npm lifecycle or installed executable path writes `~/.agents/skills` or invokes `rose-aili`.
- [ ] 2.3 Exclude generic `skills/` from npm `files` while retaining repository-local snapshot/lock/compatibility verification.
  - Verify: source `npm run verify:skills` remains usable; tarball contains no generic snapshot.

## 3. Pi-owned resource and compatibility boundaries

- [ ] 3.1 Define `pi-skills/**` as the only future AILI-owned Pi Skill source and enforce explicit `pi.skills` registration without creating a placeholder Skill.
  - Preserve: dependency-owned `./node_modules/pi-web-access/skills` registration.
- [ ] 3.2 Add bounded read-only doctor classification for shared workflow presence/compatibility and exact remediation guidance.
  - Forbidden: fetch, install, rewrite, fallback activation or integrated PASS on missing evidence.
- [ ] 3.3 Update README/bootstrap completion guidance and provenance/package ownership text for the two explicit independent latest commands.
  - Preserve: `install.sh` installs Pi/aili-pi only and never runs `rose-aili`.

## 4. Verification and closeout

- [ ] 4.1 Add package/tarball/disposable-HOME regressions for no `.agents` mutation, no implicit network child and no generic snapshot publication.
- [ ] 4.2 Run focused package, bootstrap, doctor, generated/provenance and Pi resource-discovery checks plus typecheck.
- [ ] 4.3 Run `npm pack --dry-run --json`, strict OpenSpec validation and `git diff --check`; inspect that all changed lines belong to this change.
- [ ] 4.4 Record remaining `@latest`, real HOME and future Pi-specific Skill limitations without Git, publish or release actions.
