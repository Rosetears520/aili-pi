## Context

MemPalace is the only accepted durable provider; current context routing already has one frozen compaction owner. No observation ledger or internal memory worker exists.

## Goals / Non-Goals

**Goals:** branch-aware observations, bounded internal consolidation, explicit promotion, deterministic recall, opt-in control.

**Non-Goals:** replacing compaction, creating fallback storage, making memory authoritative, exposing raw memory in activity logs, or using public Herdr panes for observer work.

## Decisions

1. Store atomic observations in a versioned parent-owned ledger; derive branch views instead of rewriting history.
2. Run observer/consolidator through a fixed managed-internal scheduler with no public spawn surface.
3. Treat every durable write as separately authorized; automatic observation never implies MemPalace promotion authority.
4. Compose a read-only MemoryContextProvider around current context routing; compaction remains with its existing owner.
5. Default automatic observation off and persist only bounded configuration/status.

## Risks / Trade-offs

- Stale memory → current evidence always wins and conflicts remain explicit.
- Recursive observation → origin marker and internal-worker exclusion.
- Context growth → deterministic token budget and omitted counts.
- Provider unavailable → explicit unavailable state, no fallback writes.

## Migration Plan

Add schemas/ledger first, then internal worker, promotion adapter, recall provider and controls. Rollback disables automatic observation and preserves existing MemPalace data.
