# v0.1.15 Release and WSL Installation Closeout

Date: 2026-07-28

Status: `RELEASED_AND_WSL_INSTALLED_AUTOMATED_PASS_LIVE_HUMAN_HISTORICAL_UNVERIFIED`

## Outcome

`@rosetears/aili-pi@0.1.15` has been published as the authorized interim patch, promoted to npm `latest`, released on GitHub, and installed into the user's real WSL Pi Package directory. The official Pi runtime remains `0.82.1`.

This closeout records execution of the explicit `0.1.15` exception. It does not convert the final `v0.2.0` live-provider, interactive, historical-binary, or human-review gates into PASS.

## Published identity

- Release commit and npm `gitHead`: `bf7b41eef62a614d3b5dad26a71f4cebb6988dc7`
- Annotated tag: `v0.1.15`; peeled commit is the release commit above
- npm package: `@rosetears/aili-pi@0.1.15`
- npm `latest`: `0.1.15`
- npm shasum: `009b776e032b98fd3cb40abd5543273bf33f2a5f`
- npm integrity: `sha512-2z68GgGRVY26sTw+HTHf/KGIIri8W8i9Mrd6qOaBqfmQRsQ7sQ06Js85OSkOeDe6I48tgYdNHk5TEzGjtnWCdg==`
- Candidate tarball SHA-256: `758c928f05739383e045f1c5c7991ff72f356988a6c420079c629779787bc5b3`
- Candidate contents: 6,216 files; 13,812,792 bytes packed; 60,130,877 bytes locally unpacked
- GitHub Release: `https://github.com/Rosetears520/aili-pi/releases/tag/v0.1.15`
- GitHub asset: `rosetears-aili-pi-0.1.15.tgz`, 13,812,792 bytes

At publication time, `origin/main` and `origin/release/0.1.15` both pointed to the release commit. The annotated tag remains permanently bound to that release commit; later documentation-only closeout commits must not move it.

## Automated release verification

- Clean-clone full suite: 84 files PASS, 2 explicitly live-gated files skipped; 547 tests PASS, 2 skipped.
- Typecheck, bootstrap 15/15, package 6/6, generated 6/6, skills 64/471, roles 20, compatibility 45, provenance, capabilities, Linux clean-package E2E, and publish dry-run: PASS.
- Strict OpenSpec validation: five materialized changes PASS; sequential materialization 2/2 PASS.
- `npm run validate:interim-release`: PASS for exact `0.1.15` identity and the authorized evidence boundary.
- Tarball review: no project-owned `artifacts/`, `tests/`, `openspec/`, `.tmp/`, `.env*`, local absolute path, credential, private-key, or token material.
- Registry verification: exact version, `latest`, shasum, integrity, and `gitHead` all match the published release.
- GitHub verification: release is public, non-draft, non-prerelease, and has the expected tarball asset.

## WSL installation verification

The real WSL Pi Package installation was upgraded in place from `0.1.13` to `0.1.15` with:

```sh
pi install npm:@rosetears/aili-pi@0.1.15
```

Post-install facts:

- `pi --version`: `0.82.1`
- user package source: only `npm:@rosetears/aili-pi@0.1.15`
- Pi npm dependency: `@rosetears/aili-pi: ^0.1.15`
- installed package identity: `0.1.15`
- selected installed files are byte-identical to the release candidate
- Pi package resolution via `pi list`: PASS
- Pi extension-loading help smoke via `pi --help`: PASS
- real WSL Pi Package production dependency audit: 0 vulnerabilities across 120 dependencies

The pre-upgrade Pi package configuration is retained only as ignored task-local recovery material under `.tmp/release-0.1.15/real-wsl-backup/pre-0.1.15/`; it is not a committed release artifact.

## Dependency audit boundary

The real WSL Pi Package npm tree reports 0 vulnerabilities because it resolves AILI's package dependencies without duplicating the globally installed Pi runtime. The release source tree's peer-inclusive `npm audit --omit=dev` separately reports one high advisory at `@earendil-works/pi-coding-agent@0.82.1 -> minimatch@10.2.5 -> brace-expansion@5.0.7`. The published AILI tarball contains no `pi-coding-agent` or `brace-expansion` files. No dependency upgrade was authorized for this patch, so this upstream-runtime advisory remains a documented external residual rather than an undisclosed package-content change.

## Intentionally unverified or blocked

- P0 and redesign line-by-line human acceptance and interactive TUI review.
- OpenAI, Anthropic, and Google Gemini live provider rows.
- Real production `AgentSession` context-length overflow/retry evidence.
- Controlled third-party context-handler ordering before and after AILI.
- Separately installed historical `v0.1.14` binary rollback evidence; no such version was published and no trustworthy P0-only snapshot exists.
- The Pi 0.82.1 public-contract audit is post-BUILD evidence and cannot be backdated to satisfy a BUILD-before timing requirement.
- Final `v0.2.0` package, candidate evidence, sanitizer, live, and human gates. The normal final release validator therefore remains fail-closed with its eight explicit `NON_PASS` categories.

## Next-session boundary

Do not repeat the `v0.1.15` publish, move its tag, or reinstall it unless diagnosing a concrete installation problem. A future session may continue the human/live/historical evidence work or prepare a separately authorized `v0.2.0` candidate, but must preserve every remaining `Unverified`/`NON_PASS` row until the corresponding evidence is actually produced.
