## ADDED Requirements

### Requirement: Fast is a service-tier state, not a model identity
AILI SHALL represent Fast as a runtime service-tier state separate from provider/model identity. It SHALL NOT create `fast-gpt-*` models or another provider. Supported OpenAI Codex requests may receive `service_tier: "priority"`; unsupported provider/model pairs SHALL remain unmodified and visibly inactive or unsupported.

#### Scenario: Supported Codex request
- **WHEN** Fast is active for a supported `openai-codex/gpt-5.6-terra` turn
- **THEN** the provider request payload contains `service_tier: "priority"` while its model identity remains unchanged

#### Scenario: Unsupported provider
- **WHEN** Fast is active for an unsupported provider/model
- **THEN** its request payload is not changed and runtime state reports unsupported or inactive

### Requirement: Fast inherits through direct Parent resolution
A child without a user-owned or confirmed one-shot speed-tier override SHALL inherit its direct Parent's active Fast/Priority state. Runtime audit evidence SHALL distinguish configured state from observed provider payload adaptation.

#### Scenario: Fast Worker request
- **WHEN** a Fast Parent starts a supported Worker without override
- **THEN** the Worker request includes `service_tier: "priority"` and audit evidence associates it with the Worker turn
