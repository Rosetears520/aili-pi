## MODIFIED Requirements

### Requirement: Model and thinking decisions are explicit and never silently dropped
Every model/thinking request reaching the persistent-agent runtime SHALL produce one recorded decision: applied directly, applied after one confirmation, auto-approved under YOLO bypass mode, rejected with a bounded reason, or inherited. When the active permission mode is `yolo`, the model/thinking override confirmation and the `AILI Agent model change` confirmation SHALL auto-approve without prompting (bypass mode also serves as the confirmation channel for headless sessions), and the recorded decision SHALL be `auto-approved-bypass`.

#### Scenario: Model override under YOLO
- **WHEN** a task carries a model/thinking request under `inherit-only` authority while the session's active permission mode is `yolo`
- **THEN** no UI prompt appears (or blocks headless runs), the override applies, and the decision is audited as `auto-approved-bypass`
