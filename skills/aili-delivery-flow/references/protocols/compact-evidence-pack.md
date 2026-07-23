# Compact Evidence Pack Protocol

Repository source path: `.agents/skills/aili-delivery-flow/references/protocols/compact-evidence-pack.md`. Installed runtime target: `$HOME/.agents/skills/aili-delivery-flow/references/protocols/compact-evidence-pack.md`.

Use a compact evidence pack when evidence is noisy, long, broad, multi-source, or otherwise too bulky for a concise BUILD/SHIP report, memory writeback, or subagent result. Compression is not proof by itself; every pack must preserve a source, result, and a rerun path or safe raw-artifact path when raw evidence is needed.

```text
Compact evidence pack:
- Evidence id:
- Source: command / file inspection / subagent trace / artifact path
- Scope: files, directories, package, or workflow area covered
- Freshness: fresh / stale / rerun-needed / unverified
- Result: pass / fail / partial / blocked / not-run
- Exit code: <code or N/A>
- Key observations:
  - <fact with anchor>
- Key failure excerpt:
  - <minimal relevant error lines, or N/A>
- Raw evidence access: rerun command / repository-local artifact path / unavailable with reason
- Unverified items:
  - <item or N/A>
```

## When required

Use a compact evidence pack for:

- verbose test, build, lint, typecheck, CI, or shell output;
- failed commands with long logs;
- broad search, grep, diff, or repository-scout evidence;
- multi-package or multi-review reconciliation;
- SHIP closeout evidence that would otherwise paste raw logs or long dumps.

Short successful checks may be reported directly when the command, scope, result, and remaining `Unverified` items are clear without the full pack shape.

## Raw evidence rules

- Do not paste full raw logs, long grep dumps, long diffs, or full file contents into final reports, memory, or subagent results by default.
- Include only the minimal key failure excerpt needed for action.
- If raw evidence must be user-visible, the active contract or project rules must name a repository-local placement. For OpenSpec changes, use `openspec/changes/<change-id>/evidence/` only when explicitly approved or required by the task packet.
- If raw evidence is available only in tool output, record the rerun command instead of inventing an artifact path.
- Redact or exclude secrets, credentials, cookies, tokens, private keys, and production-sensitive data.

## Final-report rule

BUILD and SHIP reports must cite compact evidence for noisy evidence claims, list skipped checks and remaining `Unverified` items, and avoid complete logs unless the user explicitly requests them and the content has been checked as safe to show.
