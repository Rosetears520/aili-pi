# Approval Policy

Explicit human approval is required before core harness edits.

## Valid Approval Sources

- Direct conversation approval for the specific edit scope.
- PR review approval that names the proposed harness change.
- Approved OpenSpec or task packet that authorizes the exact files and behavior.

## Missing Approval

When approval is missing, the agent may produce or update report/proposal/spec/test-plan artifacts only if those artifacts are in allowed scope. It must not silently edit ROSE rules, commands, skills, subagent contracts, memory policy, install scripts, hooks, or harness docs.

## Approval Must Name

- files or components allowed to change;
- behavior being changed;
- verification trigger;
- rollback or rejection path.
