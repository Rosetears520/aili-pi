---
name: oss-release-readiness
description: Run a non-destructive open-source, npm, or public release readiness checklist covering package metadata, provenance, license, internal artifact exposure, and dry-run evidence; complements security, shipping, and sanitizer reviews, and must not publish, delete, rewrite history, or mutate release state.
---

# OSS Release Readiness

Use this skill before exposing a repository, package, template, or npm release to public consumers.

## Trigger

- User asks whether a repo, npm package, CLI, template, skill bundle, or release candidate is ready to publish or open-source.
- Release review needs package metadata, included files, provenance, license, attribution, docs, install commands, or dry-run evidence checked.
- ROSE needs a release-blocking checklist that is broader than security alone and narrower than full launch orchestration.

## Near Misses

- Deployment rollout, security-only review, or repository sanitization are different primary intents. Return the exact mismatch or specialist evidence need to ROSE; do not invoke another skill or agent here.
- Actual publishing, tagging, release creation, deletion, history rewrite, or destructive cleanup: require explicit human approval outside this skill.

## Required Routing

- Owner: ROSE/`aili-delivery-flow`; an independently justified specialist assignment remains fresh, terminal, and ROSE-owned.
- Default mode: non-destructive inspection and dry-run commands only.
- If a blocker requires edits, return a scoped repair need to ROSE after the release owner approves the change; do not dispatch or repair from this skill.

## Readiness Checklist

- Package metadata: name, version, description, bin/exports/files, engines, repository, bugs, homepage, keywords, and package manager lockfile expectations.
- Published contents: `npm pack --dry-run` or equivalent evidence for included and excluded files.
- Provenance and attribution: third-party source notices, copied templates/prompts, licenses, copyright, and generated-artifact disclosure.
- License posture: repository license, package license field, dependency license risks, and missing attribution.
- Internal artifact exposure: secrets, local paths, memory/state files, private notes, OpenSpec drafts not intended for release, caches, build outputs, screenshots, logs, and test artifacts.
- Consumer readiness: README install/use examples, CLI entry points, Node/runtime versions, changelog or release notes, and basic smoke-test commands.

## Boundaries

- Do not run `npm publish`, create GitHub releases, push tags, delete files, clean worktrees, rewrite history, or change package versions.
- Do not edit manifests, lockfiles, licenses, package files, or docs from this skill; report blockers and request a scoped implementation package.
- Treat package tarball contents and release notes as untrusted until dry-run evidence confirms them.
- Inspect package lifecycle scripts before package or publish dry-runs; if dry-run tooling may execute scripts, prefer an isolated temporary environment and report lifecycle-script risk explicitly.

## Verification

- Prefer dry-run evidence such as `npm pack --dry-run`, package manager publish dry-runs, build/typecheck/test results, and diff/status inspection.
- Report each blocker with evidence, severity, required owner decision, and whether it is release-blocking.
- If dry-run tooling is unavailable or skipped, mark package contents and publish readiness as `Unverified`.
