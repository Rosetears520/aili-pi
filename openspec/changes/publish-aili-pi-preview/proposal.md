## Why

The existing `reconcile-aili-compact-release-lineage` change is the stable-release contract for `@rosetears/aili-pi@0.2.0`. Its unchecked release gates remain non-PASS, including fresh controlled-production evidence. The current controlled AgentSession fixture has repeatedly rejected a second bounded active-block attempt at the quality gate, and no controlled-production PASS artifact exists for the exact candidate.

The user selected a narrower route: first try one exact local preview candidate in a real Pi workflow, then decide whether it is useful, and only then consider a non-`latest` preview publication. This is not a stable-release bypass. It separates evidence that can be obtained deterministically in this repository from real Provider and human-workflow evidence that must be observed and accepted by the user.

## What Changes

- Define `@rosetears/aili-pi@0.2.0-preview.0` as the proposed preview identity and reserve the `preview` npm dist-tag for a later separately approved publication. Neither operation is authorized by this change.
- Add a quality-enabled, official-Pi controlled vertical slice that proves one exact source-backed Compact mutation, next-request projection, and session reopen without a network Provider.
- Add an isolated package-discovery smoke using a locally packed candidate, disposable HOME, and local Pi CLI. It proves discovery and `/aili-compact doctor` registration only; it does not use a Provider, registry, real HOME, or public npm package.
- Define a user-owned manual Pi trial and a redacted acceptance record bound to one exact candidate identity.
- Preserve the stable `0.2.0` release contract and every unpassed stable gate as non-PASS. Preview evidence cannot satisfy `npm run validate:release`, authorize `latest`, or establish stable readiness.

## Boundaries

- No Provider/network call, installation, version or lockfile mutation, package publish, Git action, or release action is authorized by this draft.
- The preview command path must use an exact prerelease version or locally packed tarball. `scripts/bootstrap.sh` continues to target `latest` and is not a preview-install route.
- The known controlled quality rejection remains an explicit limitation, not an assumed Pi API defect or a claimed root cause.
- This draft requires strict validation and explicit final `test-plan.md` acceptance before any affected BUILD work resumes. Installation and publication remain separate exact approvals after that acceptance.
