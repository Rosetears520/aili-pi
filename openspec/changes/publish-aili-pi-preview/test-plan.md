# Test Plan: publish-aili-pi-preview

**Target:** `@rosetears/aili-pi@0.2.0-preview.0` on official Pi `0.82.1` for Linux, proposed npm dist-tag `preview`.

**Status:** `ACCEPTED` — the user accepted this final plan on 2026-08-11. It clears only the preview DEFINE test-plan gate; affected BUILD still requires fresh explicit implementation authorization. Provider/network, installation, version/lockfile, Git, npm, and release operations remain separately gated.

## Scope

This plan establishes the minimum honest evidence for a user-tested preview. It does not reduce, replace, or satisfy the stable `0.2.0` release contract in `reconcile-aili-compact-release-lineage`. Stable release remains non-PASS while its unchecked gates remain unchecked.

## Acceptance checks

| ID | Behavior | Minimal proof | Evidence owner |
|---|---|---|---|
| PP-1 | The preview identity is exact and consistently bound across package metadata, generated provenance, tarball, tests, and trial briefing. | Candidate identity validation and a locally generated tarball digest. | Repository-owned; version/lockfile change separately approved. |
| PP-2 | Default quality-enabled Compact can make one exact, source-backed active-block mutation through the official Pi extension entry; rejected incomplete quality input appends nothing; the next request and a reopened session retain the valid block. | Focused official-Pi deterministic-provider integration test. | Repository-owned, safe-local after BUILD authorization. |
| PP-3 | A locally packed candidate is discovered by the actual local Pi CLI in a disposable HOME and `/aili-compact doctor` responds without a Provider request. | Isolated package/CLI smoke, sanitized result. | Repository-owned; disposable installation separately approved. |
| PP-4 | The user can evaluate the exact candidate in an explicitly chosen local Pi target and understands the privacy/cost/rollback boundary. | User's redacted acceptance or rejection against exact candidate identity. | User-owned; exact target/provider approval required. |
| PP-5 | Preview instructions use an exact prerelease version or local tarball, identify the preview limitation, and never imply stable readiness or `latest` installation. | Documentation inspection and package-content review. | Repository-owned. |
| PP-6 | Preview evidence cannot be misrepresented as stable release evidence. | Inspect this change and confirm every stable gate remains non-PASS in the stable-track contract. | Repository-owned. |

## Verification sequence

### Safe-local BUILD checks after final acceptance and implementation authorization

```bash
openspec validate publish-aili-pi-preview --strict
npm test -- --run tests/integration/aili-compact-quality-enabled-active-block.test.ts
npm run typecheck
```

Focused package/metadata validation is added only after the exact prerelease metadata owner is approved and implemented. No full stable release suite or `npm run validate:release` result may be relabeled as preview success.

### Separately approved operations

1. Update the exact prerelease version and lockfile/generated identity owners.
2. Locally pack/install the exact candidate in a disposable HOME and execute the package/CLI smoke.
3. Install/run the candidate in the user's exact chosen Pi target; any configured Provider use, cost, privacy, and session target must be explicitly approved by the user first.
4. Publish the exact accepted candidate to npm with the `preview` dist-tag.

## Manual trial charter

Before the trial, provide the user with the exact version, tarball/implementation digest, install and removal steps, known limitation, and rollback boundary. The user checks only:

1. Pi starts with the candidate and `/aili-compact doctor` reports the extension.
2. One ordinary compact action can be attempted and the session can continue afterward.
3. Reopening the session does not crash or silently discard the observed state.
4. The resulting context behavior is useful enough for the user's work.

The user should report only accepted/rejected, a short symptom description, and whether a configured Provider was used. Do not request raw session transcripts, credentials, cookies, or provider logs.

## Known limitation

The controlled official-Pi fixture currently rejects a second bounded active-block attempt with `quality-rejected`; no controlled-production PASS artifact is available. Historical sanitized evidence recorded two hard facts and one missing hard fact for refs `m000012` through `m000019`. Cause and real-world prevalence are `Unverified`.

## Stable-track non-substitution

The following remain explicitly outside preview completion: stable candidate artifacts, real-provider stable boundary, controlled production-path matrix, stable human review, installed rollback, full stable validation, `latest`, commit, push, tag, GitHub release, and stable npm publication.

## Acceptance record

- 2026-08-11: The user selected “local trial → user manual acceptance → preview publication” and accepted the proposed identity `0.2.0-preview.0` with the `preview` dist-tag. This records direction only. It is not acceptance of this final test plan, BUILD authorization, version/lockfile authority, installation authority, or publication authority.
- 2026-08-11: The user explicitly accepted this final preview test plan. This clears the DEFINE test-plan gate only; it does not authorize implementation, version/lockfile mutation, installation, Provider/network access, Git, npm publication, or release.
