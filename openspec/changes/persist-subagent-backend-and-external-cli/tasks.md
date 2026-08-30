## 1. External CLI runner contract

- [x] 1.1 Verify the current Herdr Agent surface supports the named external CUI Agent kinds, normal pane allocation, prompt lifecycle waiting, cancellation, and state inspection; record that `idle|done` is input-ready while `blocked|unknown` is non-terminal for this contract.
- [x] 1.2 Define the external CLI launch plan, frozen Agent/pane identity, post-prompt working-transition guard, and bounded settlement projection; verify a pre-existing idle state and mismatched Agent identity cannot settle the Turn.
- [x] 1.3 Extend the registered CLI capability registry to derive supported non-interactive/YOLO options only from bounded `--version`/`--help` evidence; verify unsupported and malformed capability evidence reports `yolo-unavailable` without adding a bypass flag.

## 2. Persistent backend preference

- [x] 2.1 Add an atomic, lock-protected global backend settings writer that preserves valid unrelated Herdr options and supports clearing only `backend`; verify write, clear, malformed input, lock contention, and failed replacement fixtures.
- [x] 2.2 Extend `/aili-agent-backend` with `global herdr|managed|clear`, preserve `s|h|m` compatibility, and synchronize the current session override after a successful global operation; verify new-versus-existing Agent behavior and the existing precedence matrix.
- [x] 2.3 Update the backend status output and persistent-Agent documentation for global preference, project precedence, clearing, and frozen existing Agents; verify command examples match parser fixtures.

## 3. Direct external CLI Herdr Agent

- [x] 3.1 Route an exact current-user-authorized `cli` request to the external CLI driver rather than a Pi child model/Bash path; verify stale, mismatched, unavailable, and unsupported requests allocate neither surface nor vendor process.
- [x] 3.2 Launch the verified vendor executable with fixed non-shell argv, constrained environment/workspace, run metadata, and no model-supplied runner flags; verify fake executables cover argv, environment, login/install/bypass rejection, credential/private-key denial, and nonzero exit.
- [x] 3.3 Reuse the normal Herdr tab/pane allocator for external CLI Agents while reserving one active pane per live run; verify same-tab split/reuse behavior, normal new-tab fallback, and no active-pane collision.
- [x] 3.4 Bind foreground settlement to the targeted CUI Agent entering work after the prompt and returning to `idle|done`, while preserving explicit-background accepted-then-settled semantics; verify pre-existing idle, blocked/unknown, text-only output, success, cancellation, parent shutdown, process loss, and no automatic prompt replay.
- [ ] 3.5 Route external CUI confirmations through policy-bounded Parent auto-decisions; blocked because Herdr exposes only `blocked`, not a bounded operation packet. Current implementation safely denies blocked interactions without a user dialog, and enables a verified YOLO flag only when the Parent is already in AILI YOLO mode; it cannot prove an ordinary operation is authorized well enough to auto-confirm it.

## 4. Integration evidence and closeout

- [x] 4.1 Update Agent/Job/Turn/Run rendering and documentation with external driver, YOLO enabled/unavailable, pane allocation, and CUI lifecycle settlement projections; verify bounded output never exposes credentials, raw command payloads, or unbounded vendor output.
- [x] 4.2 Run focused unit/integration suites and `npm run typecheck`; inspect the scoped diff and record failures or unavailable checks without a passing claim.
- [x] 4.3 After separate exact authorization, run one real Herdr plus already-installed-and-authenticated vendor CLI smoke scenario; Agy CLI 1.1.22 started with Herdr kind `agy` and its verified YOLO flag in a same-tab sibling pane, accepted a no-tool prompt, returned the expected marker, and settled back to input-ready `idle`; the task-owned pane was then closed.
