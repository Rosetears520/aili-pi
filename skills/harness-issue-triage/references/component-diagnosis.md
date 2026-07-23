# Component Diagnosis Reference

Use this map to locate harness behavior problems before proposing a change.

| Signal | Primary component | First evidence to check | Typical fix path |
|---|---|---|---|
| User input after `/ideate`, `/define`, `/build`, or `/ship` is lost | command | `commands/*.md` | command prompt/frontmatter fix |
| Command enters the wrong lifecycle mode | command, delivery skill | `commands/*.md`, `.agents/skills/aili-delivery-flow/references/lifecycle.md` | command route or lifecycle wording fix |
| Skill triggers too often or not enough | skill routing | target `SKILL.md` frontmatter/body, `agents/rose.md`, `.agents/skills/aili-delivery-flow/SKILL.md` | narrow trigger/body or canonical routing fix |
| Agent skips required lifecycle gate | delivery skill, command, agent runtime charter | `.agents/skills/aili-delivery-flow/**`, `agents/rose.md` only if always-loaded invariant is missing | lifecycle reference fix first; prompt fix only with approval |
| Subagent result lacks evidence or scope | subagent packet/result protocol | `.agents/skills/aili-delivery-flow/references/protocols/subagent-*.md`, relevant agent file | packet/result contract fix |
| Completion claim lacks proof | verification/tool policy | global Goal-Driven Verification rules, `.agents/skills/aili-delivery-flow/**`, `.agents/skills/review-pipeline`, `docs/harness/tool-policies.md` if in source repo | canonical claim-matched verification or closeout fix |
| Memory writeback/retrieval is missing or unsafe | memory | `.agents/skills/rose-memory/SKILL.md`, memory CLI evidence | memory workflow fix, no raw DB edits |
| Installed runtime cannot find a skill/command | install/setup | `scripts/install_opencode.sh`, `docs/opencode-setup.md` if in source repo | installer or setup doc fix |
| OpenCode runtime cannot read harness docs | packaging/context | installed skill `references/`, source repo path, setup docs | move required rules into skill references or document repo-local lookup |
| Tool misuse, secret exposure, or destructive command risk | tool policy, security | agent permissions, tool policy docs, installer script | safety guard/security review |
| User says ROSE itself is wrong or not obeying | agent/system prompt only after narrower checks | `agents/rose.md`, project `AGENTS.md`, relevant skill references | prompt change only in explicit harness maintenance task with approval |

## Rules

- Prefer the narrowest component that can explain the failure.
- Do not treat `agents/rose.md` as an editable target during normal tasks.
- Consider `agents/rose.md` only when an always-loaded invariant is genuinely missing and the user has approved a harness maintenance change.
- Mark uncertainty explicitly when evidence is incomplete.
- Triage reports are safe; core harness edits require approval.
