# Component Taxonomy

Classify one primary component before proposing a fix.

| Component | Scope | First evidence |
|---|---|---|
| system-rules | ROSE/runtime charter, AGENTS template | `agents/rose.md`, `templates/AGENTS.md` |
| command | top-level command prompts | `commands/*.md` |
| skill | reusable workflow instructions | `.agents/skills/*/SKILL.md` and references |
| subagent-config | specialist roles, packets, results | `agents/*.md`, `.agents/skills/aili-delivery-flow/references/protocols/subagent-*.md` |
| memory | retrieval/writeback/provenance policy | `.agents/skills/rose-memory/SKILL.md` |
| tool-policy | bash/git/browser/file safety | `docs/harness/tool-policies.md` |
| middleware/hooks | runtime interception and hooks | `.opencode/`, setup docs |
| environment | host constraints and capabilities | setup docs, verification logs |
| workflow-pattern | lifecycle and review/repair sequencing | `aili-delivery-flow` references |
| docs/protocol | templates and architecture docs | `docs/harness/**`, `.agents/skills/aili-delivery-flow/references/protocols/**` |
| install/setup | distribution and installation paths | install scripts, setup docs |

Use the narrowest-fix rule: propose `system-rules` changes only when a narrower component cannot solve the root cause.
