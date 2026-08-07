/**
 * Exact source and regression inventory whose current bytes are covered by the
 * Persistent Agent live release claim. Keep the capture and validator on this
 * shared owner so a changed permission, orchestration, workspace, model, or
 * sandbox boundary cannot be restored by updating only one side.
 */
export const PERSISTENT_LIVE_IMPLEMENTATION_PATHS = [
  "src/runtime/native-integrations.ts",
  "src/runtime/persistent-agents/child-sandbox.ts",
  "src/runtime/persistent-agents/hub.ts",
  "src/runtime/persistent-agents/live-evidence-contract.ts",
  "src/runtime/persistent-agents/model-selection.ts",
  "src/runtime/persistent-agents/output-delivery.ts",
  "src/runtime/persistent-agents/permission.ts",
  "src/runtime/persistent-agents/policy.ts",
  "src/runtime/persistent-agents/production.ts",
  "src/runtime/persistent-agents/runtime.ts",
  "src/runtime/persistent-agents/scheduler.ts",
  "src/runtime/persistent-agents/session-factory.ts",
  "src/runtime/persistent-agents/storage.ts",
  "src/runtime/persistent-agents/task-coordinator.ts",
  "src/runtime/persistent-agents/task-registration.ts",
  "src/runtime/persistent-agents/task-schema.ts",
  "src/runtime/persistent-agents/types.ts",
  "src/runtime/persistent-agents/workspace.ts",
  "src/vendor/pi-permission-modes/index.ts",
  "tests/integration/package-runtime.test.ts",
  "tests/integration/persistent-agent-production.test.ts",
  "tests/integration/persistent-agent-runtime.test.ts",
  "tests/integration/persistent-agent-task-collision.test.ts",
  "tests/unit/persistent-agent-child-sandbox.test.ts",
  "tests/unit/persistent-agent-permission.test.ts",
  "tests/unit/persistent-agent-policy.test.ts",
  "tests/unit/persistent-agent-task-registration.test.ts",
] as const;
