## Context

See `proposal.md` for motivation. Current backend resolution already reads a global file but `/aili-agent-backend h|m` maintains only a Parent-session in-memory override. Current external CLI requests are routed to Herdr but execute through a Pi child that lets its model invoke the vendor CLI through generic Bash. Normal Pi children settle from Child Bridge `agent_settled`; direct external CUI Agents instead expose their working/input readiness through Herdr's recognized Agent lifecycle.

The existing Herdr runtime owns Agent/Job/Turn/Run records, parent-scoped surface allocation, cancellation, reconciliation, and terminal evidence rules. It must remain the single lifecycle owner for both ordinary Pi and external CLI subagents.

## Goals / Non-Goals

**Goals:**
- Persist a global backend default with the existing resolution order intact.
- Make an external CLI run a first-class Herdr subagent Run rather than a Pi-child Bash side effect.
- Reuse normal Herdr tab/pane allocation and foreground/background coordination semantics.
- Settle an external Turn when its prompted CUI Agent demonstrably transitions into work and returns to its input-ready `idle`/`done` state.
- Enable YOLO only from verified per-CLI capability evidence.

**Non-Goals:**
- New npm dependencies, vendor CLI installation or login, vendor-specific model routing, arbitrary shell execution, automatic retry/replay, external CLI access to credentials/private keys, or forced separate tabs.

## Decisions

### 1. Extend the existing backend settings family

Add an atomic global settings writer beside the existing strict parser and resolver. The command accepts `global herdr`, `global managed`, and `global clear`; it preserves a valid `herdr` block. After a successful write it sets/clears the current session override so future new Agents observe the requested result immediately.

A trusted project remains a higher-precedence default in later sessions. This preserves the current user/project ownership model instead of adding a force-global layer. Existing `h`/`m` continue to be session-only shortcuts.

### 2. Add an external CLI driver behind the existing Herdr backend

Represent an external CLI run as a distinct driver under the Herdr backend, sharing the existing Run/Job/Turn state machine and coordinator. The driver receives a validated launch plan rather than arbitrary model text. A normal Pi Agent remains `pi-cli`; an external CLI Agent records its vendor driver identity without altering `sub`'s backend field or allowing the model to select a backend.

The external driver invokes the existing Herdr surface allocator unchanged. A live run owns one pane; allocator policy may split or reuse an AILI tab and opens another tab only under the normal fallback conditions.

### 3. Use Herdr's prompted CUI lifecycle as the completion boundary

Start the supported vendor as a Herdr-recognized Agent, prompt it through the Agent surface, and require the prompt operation to observe a post-prompt lifecycle change before waiting for settlement. The Turn completes when that same targeted Agent returns to `idle` or `done`, which represents the vendor's input-ready surface after its response.

A state that was already idle before prompting cannot settle the Turn. `blocked` remains an active interaction state, and `unknown`, pane text, visibility, or tab focus are not completion evidence. This matches the requested persistent CUI experience rather than forcing the vendor process to exit after every task.

### 4. Keep CLI selection structured and policy-bounded

The Parent model interprets natural-language intent and chooses a canonical registered `sub.cli` value. Runtime code does not parse user wording or maintain a separate phrase/session authorization state. The registry resolves one supported executable, probes bounded `--version`/`--help` data, and constructs an argv from allowlisted fields only. Vendor YOLO/non-interactive flags are optional registry capabilities that become usable only after the installed binary declares them. The result records enabled or unavailable; it never fabricates success.

The runner never accepts model-generated install, login, bypass, or arbitrary flag fragments. Parent permission policy, credential/private-key denial, workspace limits, cancellation and visible failure reporting remain active.

### 5. Let the Parent auto-answer only within existing authority

External CUI interaction requests route through the existing Parent interaction/permission policy. The Parent may answer ordinary in-scope confirmations automatically when the active permission mode and accepted task already authorize the operation. It cannot convert a model judgment into new user authority. Credential/private-key access is denied, and missing authorization for destructive, Git, dependency, login, publication/release, or external-write operations produces an explicit blocked/need-user result without opening a user approval dialog.

This deliberately favors non-interruption over escalation: unsupported or unauthorized work stops rather than asking the user to click through the vendor UI.

### 6. Preserve ordinary subagent lifecycle semantics

Foreground callers await the shared coordinator until the prompted CUI lifecycle settles. Explicit background callers receive the existing accepted result, then inspect the same lifecycle through coordination commands. A denied interaction settles visibly as blocked/need-user rather than leaving a vendor dialog waiting for the user. Cancellation, shutdown, process loss and restart reconciliation use current explicit paths; no automatic external prompt retry or replay is introduced.

## Risks / Trade-offs

- Herdr lifecycle detection may fail to observe the vendor leaving or returning to its input UI → startup/prompt transition timeouts fail explicitly; no idle state existing before the prompt may count.
- Vendor flag syntax can drift → bounded runtime capability detection and explicit `yolo-unavailable` result prevent guessed flags.
- Direct vendor execution can widen access compared with a Pi child → fixed non-shell argv, controlled environment/workspace, hard credential denials and no model-supplied argv fragments.
- A CUI process may outlive its visible pane or parent → the frozen Agent/pane identity, explicit cancellation/lost state and no prompt replay prevent false completion.
- Global preference can surprise a project → existing trusted-project precedence remains visible in status and is preserved.

## Migration Plan

1. Missing global backend configuration continues to resolve to the existing default.
2. Existing valid global files remain valid; the new command modifies only `backend` and preserves valid Herdr options.
3. Existing Pi and Herdr Agent records keep their frozen backend/driver interpretation.
4. Roll back a user preference through `global clear`; roll back the package change by removing the new driver while preserving existing journals as history. No vendor process is replayed during rollback.
