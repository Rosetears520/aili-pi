<!-- AILI_AGENTS_TEMPLATE_VERSION: 2 -->
<!-- AILI_AGENTS_TEMPLATE_SOURCE: templates/AGENTS.md -->
<!-- AILI_AGENTS_TEMPLATE_MODE: generated-project-local-file -->

# AGENTS.md

This file is the project-level instruction contract for AI coding agents working in this repository.

It contains project facts, local commands, local artifact placement, and repository-specific exceptions. Reusable workflow and safety invariants are installed globally by `rose-aili` from `templates/opencode-global-AGENTS.md`.

Do not copy broad global operating rules into this file unless this project intentionally overrides or strengthens them.

## Project Overview

<!-- Fill this section during initialization. Use facts from repository files only. Do not invent missing details. -->

- Project purpose: TODO
- Primary language/runtime: TODO
- Package manager: TODO
- Main application entry points: TODO
- Main test framework: TODO
- Important directories: TODO
- Generated/build output directories: TODO
- Deployment/runtime environment: TODO

## Setup Commands

<!-- Fill with verified commands from package manifests, README, docs, Makefile, CI, or equivalent project files. Use "unknown" only when the repository does not provide enough evidence. -->

- Install dependencies: TODO
- Start development server: TODO
- Build: TODO
- Lint: TODO
- Typecheck: TODO
- Test all: TODO
- Test focused: TODO
- Format: TODO
- Clean: TODO

## Architecture and Project Structure

<!-- Summarize only facts discovered from repository files. Do not invent architecture. -->

- `src/`: TODO
- `tests/`: TODO
- `docs/`: TODO
- `scripts/`: TODO
- Configuration files: TODO
- CI/CD files: TODO
- Generated files: TODO
- External integrations: TODO

## Project-Specific Rules

<!-- Add rules that are specific to this repository. Do not add personal preferences, temporary task notes, or generic advice. -->

- TODO

## Project-Specific Testing and Artifact Placement

<!-- Record repository-specific test locations and artifact placement decisions. Keep global verification discipline in the global AGENTS file. -->

- Unit tests: TODO
- Integration tests: TODO
- CLI tests: TODO
- API / contract tests: TODO
- GUI / browser / Playwright tests: TODO
- Test fixtures: TODO
- Snapshots / golden files: TODO
- Test reports / traces / screenshots: TODO
- Temporary test output: TODO

Rules:

- Do not place new test files in the repository root unless this section explicitly allows it.
- Unless the user explicitly requests an external or temporary-only artifact, user-visible test files, test plans, reports, traces, screenshots, generated fixtures, golden files, and verification artifacts must be written inside the repository at a project-defined path or after a placement decision.
- If a new test category is introduced, ask the user for its repository-local location once, then record the chosen convention here.

## Local Overrides

<!-- Optional. Add local overrides only when this repository needs to strengthen or specialize the global AGENTS rules. Do not weaken global safety, evidence, git, security, or completion rules. -->

- None documented.
