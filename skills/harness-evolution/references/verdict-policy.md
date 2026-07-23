# Verdict Policy

Record a verdict after proposal review or applied verification.

| Verdict | Meaning |
|---|---|
| `pass` | Approved change was applied and verification passed. |
| `needs-review` | Proposal or applied change has partial evidence or human judgement pending. |
| `blocked` | Approval, context, scope, or verification is missing. |
| `rejected` | Proposal should not be applied. |
| `rolled-back` | Applied change was reverted or superseded after verification or review. |

Every verdict must include evidence pointer, remaining risks, and next action. Memory recording must use the approved `rose-memory` CLI workflow when requested; do not write SQLite manually.
