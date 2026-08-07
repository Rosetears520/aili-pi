## ADDED Requirements

### Requirement: Active migration evidence supersedes the nonexistent v0.1.14 row
The active `0.2.0` migration matrix SHALL use the externally verified real published predecessor for installed-package rollback. Historical documents MAY retain the old `v0.1.14` claim as superseded context, but validators, generated evidence, release summaries, and PASS decisions MUST NOT require or assert a nonexistent `v0.1.14` artifact.

#### Scenario: Release evidence is regenerated
- **WHEN** candidate-bound migration and release artifacts are produced
- **THEN** they name the verified predecessor, exact candidate, exact implementation hash, and real rehearsal result
