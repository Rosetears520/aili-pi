# Codex and GitHub Review Compatibility

## Provenance

| Field | Value |
|---|---|
| Source type | Official OpenAI Codex documentation and GitHub PR review behavior, used as behavior-only guidance |
| Copy/adapt scope | No official documentation prose is copied; this file summarizes compatibility behaviors for AILI. |
| Rationale | `/local-review` should produce evidence and reports that remain compatible with external Codex/GitHub PR review flows without depending on cloud mutation. |

## OpenCode / AILI adaptation boundaries

- Do not copy official Codex or GitHub documentation text.
- Do not require Codex Cloud, GitHub automatic review, PR comments, PR reviews, or push permissions for local review.
- Do not run `gh api`, `gh pr checkout`, `gh pr comment`, `gh pr review`, `gh pr merge`, `gh pr create`, `gh repo clone`, or equivalent remote-mutating commands in `/local-review --pr`.
- Do not treat GitHub PR comment style as the only report format; AILI keeps persistent local reports first.

## Activated AILI behavior

- Keep `AGENTS.md` and project-local rules review-friendly: local review lanes must read the nearest applicable rules when they constrain findings.
- Support PR-style focus instructions through `/local-review --focus <text>` and report the focus in the target metadata.
- In PR mode, gather metadata and diff only through the exact GitHub CLI allowlist `gh pr view`, `gh pr diff`, and `gh pr list --head` when available.
- Map high-priority PR-style findings into AILI `Critical` or `Important` findings with concrete failure modes and fixes.
- Preserve review/fix parity locally: review produces a categorized report first; approved repair creates scoped edit/test packages; affected findings require re-review before closure.
- Keep GitHub mutation as a separate, explicit, non-default user action outside `/local-review`.
- If Codex/GitHub metadata is unavailable, mark that lane skipped or `Unverified` with reason and risk instead of claiming PR parity.
