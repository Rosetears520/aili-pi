# Preview Gates: publish-aili-pi-preview

Target: `@rosetears/aili-pi@0.2.0-preview.0`, proposed npm dist-tag `preview`. This checklist authorizes no version, lockfile, installation, network, Provider, Git, npm, or release operation.

## Preview gates

- [x] Final preview `test-plan.md` is strictly validated and explicitly accepted.
- [ ] Exact prerelease package, lockfile, generated provenance, tarball, and implementation identity agree.
- [ ] Quality-enabled official-Pi one-block vertical slice passes with a deterministic non-network Provider.
- [ ] Disposable local package/CLI discovery smoke passes, including `/aili-compact doctor` registration.
- [ ] Preview instructions name the exact prerelease/local-tarball route, the known limitation, and removal/rollback boundaries; they do not use `latest`.
- [ ] The user explicitly accepts the exact candidate after a redacted manual Pi trial or rejects it; rejection stops publication.
- [ ] The user separately authorizes exact npm publication of the accepted version with the non-`latest` `preview` dist-tag.

## Stable-track boundary

The preview cannot check any row in `openspec/changes/reconcile-aili-compact-release-lineage/release-gates.md`. In particular, this preview cannot claim a stable candidate, satisfy `npm run validate:release`, publish to `latest`, or close stable human-review, real-provider, controlled-production, rollback, full-regression, Git, or release gates.
