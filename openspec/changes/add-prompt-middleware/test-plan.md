# Test Plan — Prompt Middleware

Status: accepted by the user on 2026-08-27. Repository-local BUILD authorized; dependency/Git/release operations remain absent.

1. Discovery: trusted roots, schema/hash, duplicate IDs, traversal/symlink and untrusted project denial.
2. Resolver: scope, role allowlist, requires/conflicts and stable order.
3. Assembly: stable prefix unchanged; deterministic prepend/user/append dynamic block.
4. Policy: deny/forceReadOnly/required capabilities only narrow; unknown bash fails closed.
5. Lifecycle: Alt+S and /snippets share state; preview no execution; accepted send consumes; rejection retains; session switch clears.
6. Subagents: validate before startup; one-turn scope; continuation does not persist modifier.
7. Provenance: IDs/hashes/restrictions and rejected reasons only; no private bodies or credentials.
8. Regression: File Context, context compaction, current role prompt assembly and permission approval remain working.

Focused verification: typecheck, loader/resolver/assembler/policy/TUI/sub integration tests, manifest validation and strict OpenSpec validation. No dependency or browser operation is required.

Fresh result (2026-08-28): loader/resolver/assembler/policy/provenance/extension/sub/Herdr tests PASS; full repository suite 767 passed/2 skipped; capabilities/generated/package/audit/doctor and strict OpenSpec PASS. No dependency or pi-config source was added.
