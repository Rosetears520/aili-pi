# Drift Log: redesign-aili-compact-lifecycle

## 2026-07-28 — authorized interim `v0.1.15`

- **Accepted contract:** the redesign remains mandatory final `v0.2.0` scope and its live/provider/historical release gates remain fail-closed.
- **Observed release constraint:** npm has no published `0.1.14`, the current implementation tree contains the completed automated P0 and redesign work together, and no trustworthy P0-only snapshot exists from which to reconstruct a historical `0.1.14` binary.
- **User decision:** publish the combined current implementation as patch `0.1.15`, do not publish `0.2.0`, and update the user's WSL Pi Package installation to the new exact version.
- **Implementation consequence:** package, lockfile, registry identity, generated SBOM, candidate review, commit, tag, npm/GitHub release, and WSL installation target exact `0.1.15`.
- **Evidence boundary:** this release exception does not convert missing real-provider, interactive, or separately-installed old-binary evidence into PASS and does not complete the final `v0.2.0` acceptance tasks. The default Compact release validator continues to report those gates truthfully.
