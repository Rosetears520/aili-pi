---
name: ci-cd-and-automation
description: Configure or modify concrete CI/CD pipelines, jobs, quality gates, test runners, or deployment automation; do not trigger merely because an existing CI gate failed or ordinary source code needs repair.
---

# CI/CD and Automation

## Overview

Use this skill only when pipeline configuration or deployment automation is the selected task. Derive triggers, jobs, commands, environments, and gates from the repository and accepted request rather than installing a universal pipeline.

This skill does not own ordinary source repair, the active task's verification strategy, Git operations, or deployment approval. Return those needs to ROSE unless they are already part of the accepted pipeline configuration scope.

## When to Use

- Setting up a new project's CI pipeline
- Adding or modifying automated checks
- Configuring deployment pipelines
- Changing concrete pipeline triggers, matrices, artifacts, caching, or environment policy

**When NOT to use:** Repairing one existing lint/type/test/build failure, ordinary source implementation, running a local check, or preparing a release without a pipeline-configuration request.

## Pipeline-Specific Quality Gates

Configure only the checks required by the repository's documented commands, branch policy, affected risk, and accepted pipeline contract. Lint, typecheck, unit, integration, E2E, security, build, or bundle checks are candidates, not a mandatory universal chain.

```text
Concrete pipeline request
    → inspect existing workflow and repository commands
    → select only contract-relevant triggers, jobs, and environments
    → preserve existing required checks and exact safety gates
    → validate the changed configuration and report remaining gaps
```

Do not weaken an existing required gate to make a run green. A request to diagnose or repair the failing source belongs to ROSE's narrow direct or failure-repair owner rather than becoming CI/CD configuration work.

🔴 **CHECKPOINT · Gate Integrity:** Stop before disabling checks, relaxing branch protection, or marking a failing required status as optional. Continue only when the owner explicitly accepts the risk and records the temporary exception, owner, expiry date, and restoration plan.

## GitHub Actions Configuration

The following snippets are optional starting points. Do not copy jobs, versions, commands, triggers, dependencies, secrets, or environments that the repository and accepted request do not require.

### Basic CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm test -- --coverage

      - name: Build
        run: npm run build

      - name: Security audit
        run: npm audit --audit-level=high
```

### With Database Integration Tests

```yaml
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: ci_user
          POSTGRES_PASSWORD: ${{ secrets.CI_DB_PASSWORD }}
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://ci_user:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/testdb
      - name: Integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://ci_user:${{ secrets.CI_DB_PASSWORD }}@localhost:5432/testdb
```

> **Note:** Even for CI-only test databases, use GitHub Secrets for credentials rather than hardcoding values. This builds good habits and prevents accidental reuse of test credentials in other contexts.

### E2E Tests

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps chromium
      - name: Build
        run: npm run build
      - name: Run E2E tests
        run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## CI Failure Handoff

When an existing CI run fails, capture the exact job/check, target ref or tree, relevant bounded output, and whether the failure is reproducible. Return that evidence to ROSE for the narrow repair owner. Do not automatically edit source, commit, push, rerun external CI, weaken the gate, or deploy under this skill.

**CI failure fallback:**

| Trigger | First action | If still failing |
|---|---|---|
| Failure log is missing or truncated | Return the missing-log need and exact failing job to ROSE | Mark the cause `Unverified`; do not rerun external CI or weaken the gate under this skill |
| Failure is flaky | Return the flake evidence and any quarantine option to ROSE | Keep the required gate red unless the correct owner approves a temporary exception with replacement coverage |
| Failure comes from secrets or environment config | Return the missing secret/environment metadata to the CI/platform owner without reading the value | Keep the job blocked; never paste or hardcode the secret |
| Failure blocks an urgent release | Return the exact rollback/hotfix and approval need to ROSE | Do not disable branch protection or required checks without the Gate Integrity checkpoint |

## Deployment Strategies

### Preview Deployments

Configure preview deployments only when the repository already uses them or the accepted request explicitly adds them. Define the exact event, environment, secret scope, provider command, teardown/retention behavior, and approval boundary. A generic PR does not imply deployment authority, and examples must not introduce an undeclared dependency or external operation.

### Feature Flags

Feature flags decouple deployment from release. Deploy incomplete or risky features behind flags so you can:

- **Ship code without enabling it.** Merge to main early, enable when ready.
- **Roll back without redeploying.** Disable the flag instead of reverting code.
- **Canary new features.** Enable for 1% of users, then 10%, then 100%.
- **Run A/B tests.** Compare behavior with and without the feature.

```typescript
// Simple feature flag pattern
if (featureFlags.isEnabled('new-checkout-flow', { userId })) {
  return renderNewCheckout();
}
return renderLegacyCheckout();
```

**Flag lifecycle:** Create → Enable for testing → Canary → Full rollout → Remove the flag and dead code. Flags that live forever become technical debt — set a cleanup date when you create them.

### Staged Rollouts

🔴 **CHECKPOINT · Production Deploy:** Stop before granting CI access to production secrets, enabling automatic production deployment, or deploying without branch protection and required checks. Production deploys need environment-scoped secrets, protected branches, required status checks, and a rollback path.

```
PR merged to main
    │
    ▼
  Staging deployment (auto)
    │ Manual verification
    ▼
  Production deployment (manual trigger or auto after staging)
    │
    ▼
  Monitor for errors (15-minute window)
    │
    ├── Errors detected → Rollback
    └── Clean → Done
```

### Rollback Plan

Every deployment should be reversible:

```yaml
# Manual rollback workflow
name: Rollback
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to rollback to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Rollback deployment
        run: |
          # Deploy the specified previous version
          npx vercel rollback ${{ inputs.version }}
```

## Environment Management

```
.env.example       → Committed (template for developers)
.env                → NOT committed (local development)
.env.test           → Committed (test environment, no real secrets)
CI secrets          → Stored in GitHub Secrets / vault
Production secrets  → Stored in deployment platform / vault
```

CI should never have production secrets. Use separate secrets for CI testing.

## Automation Beyond CI

### Dependabot / Renovate

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

### Build Cop Role

Designate someone responsible for keeping CI green. When the build breaks, the Build Cop's job is to fix or revert — not the person whose change caused the break. This prevents broken builds from accumulating while everyone assumes someone else will fix it.

### PR Checks

- **Required reviews:** Preserve the repository's configured review policy.
- **Required status checks:** Bind only the checks selected by the accepted pipeline contract.
- **Branch protection:** Preserve existing protected-branch behavior unless an exact approved policy change says otherwise.
- **Auto-merge:** Configure only on explicit request with the repository's merge and approval rules; never merge automatically from this skill.

Do not remove branch protection, required reviews, or required status checks to unblock a merge. Use a documented temporary exception only after the Gate Integrity checkpoint.

## CI Optimization

When a measured pipeline target is missed, select optimizations supported by current timing evidence and repository constraints:

```
Slow CI pipeline?
├── Cache dependencies
│   └── Use actions/cache or setup-node cache option for node_modules
├── Run jobs in parallel
│   └── Split lint, typecheck, test, build into separate parallel jobs
├── Only run what changed
│   └── Use path filters to skip unrelated jobs (e.g., skip e2e for docs-only PRs)
├── Use matrix builds
│   └── Shard test suites across multiple runners
├── Optimize the test suite
│   └── Remove slow tests from the critical path, run them on a schedule instead
└── Use larger runners
    └── GitHub-hosted larger runners or self-hosted for CPU-heavy builds
```

**Example: caching and parallelism**
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm test -- --coverage
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "CI is too slow" | Measure the affected jobs, then optimize the accepted critical path rather than deleting required coverage. |
| "This change is trivial, so add or remove every gate" | Pipeline scope comes from repository policy and the accepted request, not a generic task-size rule. |
| "The test is flaky, just re-run" | Record the flake and return source repair or quarantine decisions to the appropriate owner; do not silently weaken the gate. |
| "We'll add every possible check now" | Add only repository-supported checks with a named purpose and expected evidence. |
| "Manual testing is enough" | Decide automation from the pipeline contract and affected claim; this skill does not impose one universal mix. |

## Red Flags

- An accepted pipeline task lacks the requested trigger or job
- Required CI failures are ignored or silenced
- Tests disabled in CI to make the pipeline pass
- Required status checks or branch protection disabled to merge a change
- Production deploys without staging verification
- CI jobs using production secrets outside a protected deployment environment
- No rollback mechanism
- Secrets stored in code or CI config files (not secrets manager)
- A measured pipeline target is missed without evidence-guided diagnosis

## Verification

After setting up or modifying CI:

- [ ] The configured triggers, jobs, commands, and environments match the accepted pipeline request
- [ ] Repository-required status checks and branch protections remain intact
- [ ] Any secret, external service, protected environment, or deployment effect has its exact approval and scoped configuration
- [ ] Failure output identifies the job/check and returns source-repair needs to ROSE
- [ ] Deployment automation, when in scope, has the required rollback path
- [ ] The smallest repository-supported syntax/configuration or dry-run check for the changed pipeline passes, or the exact limitation is reported
