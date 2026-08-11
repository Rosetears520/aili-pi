# Design: AILI Pi preview trial

## Decision

The repository will not convert the incomplete stable `0.2.0` candidate into a verified stable release. It may prepare one explicitly pre-release candidate, `@rosetears/aili-pi@0.2.0-preview.0`, for a bounded local user trial. A later npm publication must use the non-`latest` `preview` dist-tag and requires its own exact approval.

The preview has three independent evidence classes:

```text
deterministic local proof
  -> exact prerelease candidate identity
  -> user-owned Pi trial and explicit acceptance
  -> separately approved npm preview publication
```

No class substitutes for another. In particular, a deterministic controlled Provider does not establish real model usefulness, and a user trial does not satisfy the existing stable release gates.

## Preview evidence model

### Deterministic local proof

The repository owns two bounded checks:

1. A quality-enabled official-Pi vertical slice uses the production `extensions/index.ts` entry, official Pi `AgentSession`, a disposable session/project/agent root, and a deterministic non-network Provider. It executes `aili_compact_status`, makes one exact contiguous source mutation with default `quality.enabled=true`, verifies accepted source-bound quality metadata and a tierless active block, verifies one intentionally incomplete summary fails without appending, observes the next provider request, and reopens the session. It does not establish repeated semantic growth, real Provider behavior, or human summary quality.
2. A package-discovery smoke uses a locally packed candidate, disposable HOME, and the repository-local Pi CLI without network access. It proves package discovery and registration of `/aili-compact doctor`; it must not invoke a Provider, prompt, real HOME, registry package, or bootstrap path. Existing `scripts/local-package-e2e.ts` mechanics may be reused only after an exact disposable-install approval.

The generated candidate identity must bind the exact prerelease version, package contents/tarball identity, and implementation hash. Any source, version, generated-output, or packaging change after local proof invalidates the affected proof.

### User-owned Pi trial

The user chooses the exact local Pi target and whether a configured Provider may be used. The trial briefing must state the exact candidate version and identity, the installation route, rollback/removal instructions, privacy/cost exposure, a short behavior checklist, and known limitations. The user need return only a redacted result: accepted/rejected plus reproducible symptoms and no raw session content, credentials, or provider logs.

Manual acceptance establishes only that this exact candidate is suitable for the requested preview trial. It does not establish a stable release, `latest`, Provider compatibility generally, overflow recovery, or all active-block compositions.

### Preview publication

Only after current deterministic evidence and the user's explicit manual-trial acceptance may ROSE ask for one exact operation to publish `@rosetears/aili-pi@0.2.0-preview.0` with the `preview` dist-tag. That approval does not imply commit, push, tag, GitHub release, stable publication, or future version publication.

## Known limitation

The preview must disclose the current controlled-production limitation exactly:

> A second bounded active-block attempt in the official-Pi controlled fixture was rejected with `quality-rejected`; no controlled-production PASS artifact was produced. Historical sanitized evidence recorded two hard facts and one missing hard fact for refs `m000012` through `m000019`. This observation does not establish the cause and does not prove a Pi API incompatibility.

The preview must not promise automatic repeated active-block growth or characterize the limitation as fixed until fresh evidence establishes that claim.

## Stable-track separation

`openspec/changes/reconcile-aili-compact-release-lineage/` remains the stable `0.2.0` contract. Its unchecked items, including candidate-bound controlled-production, real-boundary, human stable review, `npm run validate:release`, and all package/release prerequisites, remain non-PASS. This change neither edits its checkboxes nor reclassifies evidence from this preview as stable evidence.

The stable `latest` bootstrap route remains out of scope. Preview instructions must use an exact prerelease version or a local tarball; preview support in `install.sh` or `scripts/bootstrap.sh` would be a separate product/CLI change.
