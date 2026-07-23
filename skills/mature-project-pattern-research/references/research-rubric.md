# Mature Project Pattern Research Rubric

## Delegation Packet for `web-researcher`

```text
Research mature public project patterns for: <question>

Constraints:
- Read-only public web research only.
- Prefer official docs, official repositories, releases, issues, PRs, and maintainer-authored sources.
- Do not copy upstream text, code, prompts, assets, or templates.
- No GitHub MCP, write APIs, comments, labels, command creation, dependencies, or implementation.

Return:
- sources with URLs/titles and date/version/release if visible
- maturity signals for each project
- evidence anchors for each pattern
- applicable patterns
- not-recommended patterns
- license, security, maintenance, complexity, and adoption risks
- uncertainty labels and unsupported claims
- recommended next decision
```

## Lightweight Scoring

Use this rubric to compare candidates. It is guidance, not a numeric gate.

| Dimension | Strong signal | Weak or risky signal |
|---|---|---|
| Source authority | official docs, maintainer notes, repository history | blog-only, copied snippets, unclear provenance |
| Maintenance | recent releases/activity, clear changelog | stale releases, abandoned issues, unclear maintainers |
| Adoption | broad ecosystem use or visible production users | popularity without use evidence, unknown consumers |
| Governance | contribution/security/release policies | single-maintainer bus factor with no process |
| Stability | versioning, migration/deprecation docs | undocumented breaking changes |
| Fit | matches current project constraints and non-goals | requires new infrastructure, dependencies, or product shifts |
| Complexity | simple pattern with bounded cost | framework-sized adoption for a small problem |
| Risk | compatible license and security posture | license ambiguity, untrusted inputs, hidden operational burden |

## Boundary Checklist

- Pattern descriptions must be original synthesis, not copied upstream wording.
- Evidence anchors must support the claim they are attached to.
- Lack of evidence is reported as `[UNVERIFIED]`, not softened into confidence.
- A mature pattern may still be not recommended when it mismatches scope, maintenance capacity, security posture, or project phase.
