# Migration: replace-pi-native-fallback-with-aili-emergency-checkpoint

## Migration State

This revised DEFINE contract requires no persisted-data or configuration migration. No live HOME, Session, settings, dependency, version, Git, provider, installation or release mutation is authorized.

## Compatibility Principles

- Existing canonical `checkpoint.mode="hybrid"`, `deterministic=true`, `nativeFallback=true` and `autoRescue=true` remain valid.
- Runtime configuration remains read-only. No `aili-only` value is introduced, removed or reverse-migrated because the superseded draft was never implemented.
- Official Pi settings remain unchanged.
- Existing custom and native Pi `CompactionEntry` records continue to replay. Their IDs continue to define epochs.
- Session JSONL/tree remains append-only; no entry is deleted, rewritten, relocated or copied to a raw sidecar.
- Unknown AILI metadata remains bounded and ignorable by prior readers without rewriting history.

## Forward Adoption

1. Sequentially validate the base, P0 recovery, lifecycle redesign and current delta.
2. Confirm the public hook total matrix and persisted custom/native origin handling.
3. Align pressure/suffix/status behavior only where tests show a difference from the revised contract.
4. Run copied-session reload/tree/fork and append-only evidence.
5. Run production `AgentSession` custom and native recovery paths.

No step writes user HOME or provider configuration.

## Compatibility Matrix

| Input | Revised behavior | Rollback behavior |
|---|---|---|
| missing AILI config | existing hybrid defaults | unchanged |
| valid hybrid/native true | parse read-only | unchanged bytes |
| unsafe native false | reject value; effective native fallback stays enabled | unchanged bytes |
| malformed/symlink/non-regular config | bounded diagnostic; no write | unchanged target |
| existing custom entry | adopt entry ID as epoch; validate custom origin | prior reader keeps entry |
| existing native entry | adopt entry ID as epoch; record native origin | prior reader keeps entry |
| ambiguous origin | `Unverified` | no history rewrite |
| `activeBlocks=0` | deterministic ineligible; Pi native available | existing Pi behavior |
| branch/tree operation | Pi host owns summary; AILI rebuilds state | existing Pi behavior |

## Rollback

Rollback disables only any bounded pressure/status refinement introduced by BUILD. It does not need a data transform: raw history, custom/native CompactionEntries, branch ancestry and existing hybrid configuration remain valid. Pi native recovery is present before, during and after rollback.

## Rehearsal Evidence

Copied-session evidence may record fixture ID, schema/version, config and Session byte-prefix digests, branch/epoch IDs, bounded origin/status codes and pass/fail. It must not contain raw Session bodies, provider requests, credentials, private paths or full logs.

Required rehearsals after revised BUILD authorization:

- custom and native persisted epochs across reload;
- empty catalog and complete deterministic coverage;
- stale branch/epoch/callback invalidation;
- parent/child/fork/tree isolation;
- config no-write and append-only byte-prefix checks.

## Acceptance

- [x] No-migration compatibility contract accepted through the revised final test plan on 2026-08-02.
- [ ] Copied-session rehearsal authorized by revised BUILD scope.
- [ ] Any real HOME, installed-package or provider operation receives separate exact approval.
