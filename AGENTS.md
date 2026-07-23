<!-- AILI_AGENTS_TEMPLATE_VERSION: 2 -->
<!-- AILI_AGENTS_TEMPLATE_SOURCE: templates/AGENTS.md -->
<!-- AILI_AGENTS_TEMPLATE_MODE: generated-project-local-file -->

# AGENTS.md

This file is the project-level instruction contract for AI coding agents working in this repository.

It contains project facts, local commands, local artifact placement, and repository-specific exceptions. Reusable workflow and safety invariants are installed globally by `rose-aili` from `templates/opencode-global-AGENTS.md`.

Do not copy broad global operating rules into this file unless this project intentionally overrides or strengthens them.

## Project Overview

- Project purpose: Publish the `@rosetears/aili-pi` Package and thin Unix bootstrap on top of official Pi while keeping `pi` as the user CLI.
- Primary language/runtime: TypeScript on Node.js `>=22.19.0`, aligned with the fresh official Pi `0.81.1` package baseline.
- Package manager: npm with a committed `package-lock.json` once commit approval is granted.
- Main application entry points: `extensions/index.ts` is the single Pi Extension entry; `install.sh` and `scripts/bootstrap.sh` implement the thin Linux-only bootstrap.
- Main test framework: Vitest `4.1.9`; the accepted verification interfaces are recorded in `openspec/changes/create-aili-pi-distribution/test-plan.md`.
- Important directories: `openspec/changes/create-aili-pi-distribution/` owns the active change contract; `.opencode/` contains local OpenSpec integration state.
- Generated/build output directories: Not established.
- Deployment/runtime environment: Official Pi on Linux. macOS and native Windows are explicitly outside the current change.

## Setup Commands

- Install dependencies: `npm install --ignore-scripts` (the initial approved baseline used this command).
- Start development server: unknown; this project is planned as a Pi Package rather than a standalone server.
- Build: unknown.
- Lint: unknown.
- Typecheck: `npm run typecheck`.
- Test all: `npm test`.
- Test focused: `npm run validate:package` and `npm run validate:generated`; more accepted interfaces remain to be implemented from `openspec/changes/create-aili-pi-distribution/test-plan.md`.
- Format: unknown.
- Clean: unknown.

## Architecture and Project Structure

- `src/`: Planned home of the single owned Pi Extension and internal runtime modules; directory does not exist yet.
- `tests/`: Vitest unit tests currently live under `tests/unit/`; other accepted test categories remain to be implemented.
- `docs/`: Planned user documentation area; directory does not exist yet.
- `scripts/`: Planned validation, skill synchronization, and bootstrap tooling area; directory does not exist yet.
- Configuration files: The active OpenSpec change is configured by `openspec/changes/create-aili-pi-distribution/.openspec.yaml`.
- CI/CD files: None established.
- Generated files: The accepted design requires generated role profiles and an exact canonical skill snapshot; neither exists yet. `npm run validate:generated` currently enforces paired lock/snapshot presence.
- External integrations: Official Pi is the runtime/package manager; `aili-workflows` is the separately governed canonical source for shared skill bodies.

## Project-Specific Rules

- Treat `openspec/changes/create-aili-pi-distribution/` as the accepted contract for the current BUILD.
- Do not add a replacement `pi`, `aili`, or `omp` agent CLI, a Pi fork, theme implementation, native Windows support, or an OS-sandbox claim in this change.
- Shared skill bodies are owned only by `aili-workflows`; this repository may contain only an exact pinned snapshot and Pi-owned adapters, manifests, and evidence.
- Dependency/lockfile changes, `aili-workflows` attachment or writes, commit, push, publish, and release require separate exact approval.
- Keep BUILD progress in `openspec/changes/create-aili-pi-distribution/progress.txt`; use `drift-log.md` only for actual spec drift, trade-offs, unresolved assumptions, or required DEFINE write-back.

## Project-Specific Testing and Artifact Placement

- Unit tests: Place under `tests/unit/` once the test framework is approved and established.
- Integration tests: Place under `tests/integration/`.
- CLI tests: Place bootstrap and Pi command fixtures under `tests/bootstrap/`.
- API / contract tests: Place Pi Extension/runtime contract tests under `tests/integration/`.
- GUI / browser / Playwright tests: Not part of the current accepted change.
- Test fixtures: Place under `tests/fixtures/`, including disposable HOME and fault-injection fixtures.
- Snapshots / golden files: Place under `tests/fixtures/snapshots/` only when a focused test requires stable human/JSON output evidence.
- Test reports / traces / screenshots: Place durable reports under `artifacts/test-results/`; do not commit secrets or raw credential-bearing logs.
- Temporary test output: Use ignored repository-local `.tmp/` and remove only task-owned scratch output.

Rules:

- Do not place new test files in the repository root unless this section explicitly allows it.
- Unless the user explicitly requests an external or temporary-only artifact, user-visible test files, test plans, reports, traces, screenshots, generated fixtures, golden files, and verification artifacts must be written inside the repository at a project-defined path or after a placement decision.
- If a new test category is introduced, ask the user for its repository-local location once, then record the chosen convention here.

## Local Overrides

- None documented.
