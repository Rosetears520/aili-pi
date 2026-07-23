# Drift Log: fix-quota-animation-subagent-label

## 2026-07-23 — Codex exposes one weekly paid-user quota

- **User correction:** Codex paid users no longer have a 5-hour limit; only the 7-day quota should be shown.
- **Evidence:** The current `pi-quota-status` observation is named `5h`, but its `observedAt` to `resetAt` span is approximately 5.6 days. Dependency source `parseOpenAICodexUsage()` hard-codes `primary_window` as `5h`, confirming upstream label drift rather than a real five-hour reset.
- **Accepted behavior:** Show exactly one `codex <percent> <reset>` segment. Prefer explicit `weekly`/`Wk`; use legacy-mislabeled `5h` only when explicit weekly is absent. Never show duplicate `codex` and `7d` segments.
- **User acceptance:** The user confirmed “可以，只展示一个就可以了”.
- **Resolution:** Written back to proposal, context, design, requirement delta, tasks, test plan, and implementation plan before quota code changes.
