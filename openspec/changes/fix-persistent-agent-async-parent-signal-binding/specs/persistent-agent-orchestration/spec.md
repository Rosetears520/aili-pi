## MODIFIED Requirements

### Requirement: Top-level tasks support bounded async and synchronous execution
`task` SHALL default non-blocking roles to async and SHALL allow the model-facing caller to request sync or background execution. Role `blocking` MUST force sync. Active Agent turns under one parent SHALL be limited to 32; excess work SHALL enter a FIFO queue. An accepted top-level async task SHALL NOT be bound to the AbortSignal of the tool call or turn that submitted it; that signal SHALL propagate cancellation only to synchronous and nested tasks of the same submission.

#### Scenario: Default non-blocking task starts
- **WHEN** a non-blocking task omits `async`
- **THEN** `task` returns Agent/job IDs without waiting and the parent can continue while the child runs

#### Scenario: Caller requests synchronous execution
- **WHEN** a task sets `async:false`
- **THEN** the tool waits for settlement and returns the result directly without a duplicate async delivery

#### Scenario: Concurrency is saturated
- **WHEN** 32 turns are active and another task is accepted
- **THEN** the new job is durably marked queued and starts in FIFO order after a permit is released

#### Scenario: Long task exceeds no Agent budget
- **WHEN** a turn runs longer than previous timeout defaults or exceeds 200 assistant requests
- **THEN** AILI does not stop it because `maxRuntimeMs` and `softRequestBudget` default to zero, while manual cancel and provider/tool safeguards remain active

#### Scenario: Parent turn signal aborts after async acceptance
- **WHEN** a top-level async task has returned `accepted` and the submitting parent's tool-call/turn signal later aborts
- **THEN** the async job keeps running and settles on its own without a scheduler cancellation

#### Scenario: Parent turn signal aborts synchronous submission
- **WHEN** the submitting parent's signal aborts while a top-level synchronous task is queued or running
- **THEN** that task is cancelled through the scheduler and records its aborted lifecycle

#### Scenario: Mixed batch partially bound
- **WHEN** one submission contains a synchronous item and an async item and the parent signal aborts
- **THEN** only the synchronous item is cancelled while the async item continues

#### Scenario: Parent signal is already aborted at submission
- **WHEN** a submission arrives whose parent signal has already aborted
- **THEN** synchronous and nested tasks are cancelled immediately while an async task is created and runs normally

### Requirement: Async results are durable and exactly once in the parent transcript
Before parent delivery, AILI SHALL persist child output and a stable pending delivery record. On parent availability it SHALL inject a custom result message containing a stable delivery ID. Recovery SHALL scan the parent transcript for that ID so the same completion is visible at most once while remaining queryable through `hub`. When an async executor has already produced its output, the end or abort of the submitting parent turn SHALL NOT cause that output to be discarded.

#### Scenario: Parent is active when job completes
- **WHEN** an async job settles successfully or unsuccessfully
- **THEN** AILI stores the output, injects one result message, and marks the delivery complete

#### Scenario: Parent is unavailable when job completes
- **WHEN** the parent session is closed or being replaced
- **THEN** AILI leaves a durable pending delivery and injects it when the same parent resumes

#### Scenario: Crash occurs after message append before acknowledgement
- **WHEN** the parent JSONL already contains the delivery ID but the coordinator journal lacks its delivered event
- **THEN** recovery marks it delivered without injecting a duplicate message

#### Scenario: Completion races the submitting turn's abort
- **WHEN** an async executor returns its result at the same time the submitting parent turn's signal aborts
- **THEN** the async settlement retains the generated output and evidence instead of recording an empty aborted result

### Requirement: Cancellation is explicit and transcript preserving
`hub cancel` SHALL hard-abort a running job, mark its Agent terminal `aborted`, and retain available transcript/output. Canceling an idle or parked Agent with no job SHALL release/unregister the live identity without deleting transcript/artifacts. An accepted top-level async task SHALL be terminated only by an explicit `hub cancel`, a runtime/session shutdown, a scheduler close, or its own failure; the end of the submitting parent turn SHALL NOT be a cancellation source.

#### Scenario: Running job is cancelled
- **WHEN** an authorized owner invokes `hub cancel` for a running job
- **THEN** AILI propagates abort, records job/turn/Agent terminal state, and prevents future revive

#### Scenario: Idle Agent is cancelled
- **WHEN** an authorized owner cancels an idle Agent with no job
- **THEN** AILI disposes and unregisters it while `history` remains readable from disk

#### Scenario: Cross-parent cancellation is attempted
- **WHEN** a caller targets an Agent outside its owned descendant scope
- **THEN** AILI returns not-found/unauthorized without disclosing or changing that Agent

#### Scenario: Parent turn ends while async job runs
- **WHEN** the parent Agent turn that submitted an accepted async task completes or is aborted
- **THEN** the async job is not cancelled, keeps running, and remains inspectable through `hub`

#### Scenario: Nested task follows its parent task's cancellation
- **WHEN** a nested task is running and its parent task's signal aborts
- **THEN** the nested task is cancelled and records its aborted lifecycle
