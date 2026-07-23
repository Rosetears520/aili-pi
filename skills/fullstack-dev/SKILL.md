---
name: fullstack-dev
description: |
  Build a backend service or an end-to-end frontend/backend integration when service/API/data boundaries are the primary deliverable; do not trigger for pure UI, contract design only, security review, test workflow, or every feature touching both folders.
---

# Full-Stack Development Practices

## Bounded Domain Workflow

ROSE/`aili-delivery-flow` selects exactly one primary domain owner; do not also load `frontend-dev` or `frontend-ui-engineering` as process owners. This skill does not invoke API design, security, TDD, frontend, CI, review, or another process skill; return one concrete need to ROSE and stop `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Canonical lifecycle approvals and claim-matched verification override generic checklists below.

Near misses: interface shape only, pure UI/component work, marketing/media pages, isolated database design, review/hardening only, or browser/test evidence only.

### Step 0: Gather Requirements

Before scaffolding, resolve only material choices not already established by the request, repository, or accepted contract:

1. **Stack**: Language/framework for backend and frontend (e.g., Express + React, Django + Vue, Go + HTMX)
2. **Service type**: API-only, full-stack monolith, or microservice?
3. **Database**: SQL (PostgreSQL, SQLite, MySQL) or NoSQL (MongoDB, Redis)?
4. **Integration**: REST, GraphQL, tRPC, or gRPC?
5. **Real-time**: Needed? If yes — SSE, WebSocket, or polling?
6. **Auth**: Needed? If yes — JWT, session, OAuth, or third-party (Clerk, Auth.js)?

Ask one decision-shaped question only when an unresolved choice changes the implementation. Do not issue the full questionnaire by default.

### Step 1: Architectural Decisions

Based on requirements, make and state these decisions before coding:

🔴 **CHECKPOINT — architecture/security/db decisions:** stop before choosing or changing architecture, auth/session model, database/schema/migration strategy, CORS/upload behavior, or realtime transport. Proceed only when the user request or repository evidence makes the choice clear; otherwise ask for the missing decision instead of inventing it.

| Decision | Options | Reference |
|----------|---------|-----------|
| Project structure | Feature-first (recommended) vs layer-first | [Section 1](#1-project-structure--layering-critical) |
| API client approach | Typed fetch / React Query / tRPC / OpenAPI codegen | [Section 5](#5-api-client-patterns-medium) |
| Auth strategy | JWT + refresh / session / third-party | [Section 6](#6-authentication--middleware-high) |
| Real-time method | Polling / SSE / WebSocket | [Section 11](#11-real-time-patterns-medium) |
| Error handling | Typed error hierarchy + global handler | [Section 3](#3-error-handling--resilience-high) |

Briefly explain each choice (1 sentence per decision).

### Step 2: Scaffold with Checklist

Use only checklist rows applicable to the accepted scope; they are domain prompts, not an automatic expansion of the product or verification contract.

### Step 3: Implement Following Patterns

Write code following the patterns in this document. Reference specific sections as you implement each part.

### Step 4: Test & Verify

After implementation, return candidate evidence to the canonical verification owner. It selects the smallest check supporting the exact claim; the examples below are not an automatic suite:

1. **Build check**: Ensure both backend and frontend compile without errors
   ```bash
   # Backend
   cd server && npm run build
   # Frontend
   cd client && npm run build
   ```
2. **Start & smoke test**: Start the server, verify key endpoints return expected responses
   ```bash
   # Start server, then test
   curl http://localhost:3000/health
   curl http://localhost:3000/api/<resource>
   ```
3. **Integration check when affected**: Verify the exact changed frontend/backend boundary.
4. **Real-time check when affected**: Verify only the accepted synchronization claim.

If the selected check fails, make at most one in-scope targeted repair/recheck, then report the blocker.

| Failure | First response | If still failing |
|---|---|---|
| Build/typecheck fails | Fix the changed package or shared type causing the error | Do not rewrite the stack; report blocker if dependency/schema changes are needed |
| Auth/CORS/upload smoke test fails | Keep restrictive defaults and inspect middleware/order/config | Return the exact security-sensitive relaxation decision to ROSE |
| Database migration/schema mismatch | Stop and inspect existing migration pattern | Return the exact schema/API contract change to ROSE; do not edit production schema manually |
| Frontend cannot reach backend | Verify base URL, env loading, proxy, and health endpoint | Report environment gap rather than hardcoding URLs |

### Step 5: Handoff Summary

Provide a brief summary to the user:

- **What was built**: List of implemented features and endpoints
- **How to run**: Exact commands to start backend and frontend
- **What's missing / next steps**: Any deferred items, known limitations, or recommended improvements
- **Key files**: List the most important files the user should know about

---

## Scope

**USE this skill when:**
- Building a full-stack application (backend + frontend)
- Scaffolding a new backend service or API
- Designing service layers and module boundaries
- Implementing database access, caching, or background jobs
- Writing error handling, logging, or configuration management
- Explicitly implementing the accepted backend/service behavior or cross-boundary integration
- Setting up API clients, auth flows, file uploads, or real-time features

**NOT for:**
- Pure frontend/UI concerns (use your frontend framework's docs)
- Pure database schema design without backend context

## Routing Boundaries

| Request | Prefer | Boundary |
|---|---|---|
| Backend + frontend integration, API client wiring, auth flow, file upload, realtime app | `fullstack-dev` | End-to-end service/application implementation |
| Interface contract only, REST/GraphQL shape, type boundary design | `api-and-interface-design` | Design the public contract before implementation |
| Existing app UI components/layout/state only | `frontend-ui-engineering` | No backend/service integration needed |
| Marketing page, cinematic animation, AI media, persuasive copy | `frontend-dev` | Rich visual frontend experience, not app architecture |
| Threat modeling, auth hardening, untrusted input risk | `security-and-hardening` | Security review or hardening focus |
| CI, deployment pipeline, automated gates | `ci-cd-and-automation` | Automation infrastructure focus |
| Explicit TDD or accepted reproduction-first proof | return need to ROSE | Never auto-pair a test workflow with this skill |

### Trigger Validation

| User says | Trigger? | Reason |
|---|---:|---|
| "Build an Express + React CRUD app with auth" | Yes | Backend + frontend + auth integration |
| "Create a REST API and connect the frontend" | Yes | Full-stack boundary crossing |
| "Design the API response schema only" | No | Return to ROSE; contract design is the narrower candidate owner |
| "Polish this button component" | No | Return to ROSE; app UI is the narrower candidate owner |

---

## Quick Start — New Backend Service Reference Checklist

- [ ] Project scaffolded with **feature-first** structure
- [ ] Configuration **centralized**, env vars **validated at startup** (fail fast)
- [ ] **Typed error hierarchy** defined (not generic `Error`)
- [ ] **Global error handler** middleware
- [ ] **Structured JSON logging** with request ID propagation
- [ ] Database: **migrations** set up, **connection pooling** configured
- [ ] **Input validation** on all endpoints (Zod / Pydantic / Go validator)
- [ ] **Authentication middleware** in place
- [ ] **Health check** endpoints (`/health`, `/ready`)
- [ ] **Graceful shutdown** handling (SIGTERM)
- [ ] **CORS** configured (explicit origins, not `*`)
- [ ] **Security headers** (helmet or equivalent)
- [ ] `.env.example` committed (no real secrets)

## Quick Start — Frontend-Backend Integration Reference Checklist

- [ ] **API client** configured (typed fetch wrapper, React Query, tRPC, or OpenAPI generated)
- [ ] **Base URL** from environment variable (not hardcoded)
- [ ] **Auth token** attached to requests automatically (interceptor / middleware)
- [ ] **Error handling** — API errors mapped to user-facing messages
- [ ] **Loading states** handled (skeleton/spinner, not blank screen)
- [ ] **Type safety** across the boundary (shared types, OpenAPI, or tRPC)
- [ ] **CORS** configured with explicit origins (not `*` in production)
- [ ] **Refresh token** flow implemented (httpOnly cookie + transparent retry on 401)

---

## Quick Navigation

| Need to… | Jump to |
|----------|---------|
| Organize project folders | [1. Project Structure](#1-project-structure--layering-critical) |
| Manage config + secrets | [2. Configuration](#2-configuration--environment-critical) |
| Handle errors properly | [3. Error Handling](#3-error-handling--resilience-high) |
| Write database code | [4. Database Access Patterns](#4-database-access-patterns-high) |
| Set up API client from frontend | [5. API Client Patterns](#5-api-client-patterns-medium) |
| Add auth middleware | [6. Auth & Middleware](#6-authentication--middleware-high) |
| Set up logging | [7. Logging & Observability](#7-logging--observability-medium-high) |
| Add background jobs | [8. Background Jobs](#8-background-jobs--async-medium) |
| Implement caching | [9. Caching](#9-caching-patterns-medium) |
| Upload files (presigned URL, multipart) | [10. File Upload Patterns](#10-file-upload-patterns-medium) |
| Add real-time features (SSE, WebSocket) | [11. Real-Time Patterns](#11-real-time-patterns-medium) |
| Handle API errors in frontend UI | [12. Cross-Boundary Error Handling](#12-cross-boundary-error-handling-medium) |
| Harden for production | [13. Production Hardening](#13-production-hardening-medium) |
| Design API endpoints | [API Design](references/api-design.md) |
| Design database schema | [Database Schema](references/db-schema.md) |
| Auth flow (JWT, refresh, Next.js SSR, RBAC) | [references/auth-flow.md](references/auth-flow.md) |
| CORS, env vars, environment management | [references/environment-management.md](references/environment-management.md) |

---

## Core Principles (7 Iron Rules)

```
1. ✅ Organize by FEATURE, not by technical layer
2. ✅ Controllers never contain business logic
3. ✅ Services never import HTTP request/response types
4. ✅ All config from env vars, validated at startup, fail fast
5. ✅ Every error is typed, logged, and returns consistent format
6. ✅ All input validated at the boundary — trust nothing from client
7. ✅ Structured JSON logging with request ID — not console.log
```

---

## 1. Project Structure & Layering (CRITICAL)

### Feature-First Organization

```
✅ Feature-first                    ❌ Layer-first
src/                                src/
  orders/                             controllers/
    order.controller.ts                 order.controller.ts
    order.service.ts                    user.controller.ts
    order.repository.ts               services/
    order.dto.ts                        order.service.ts
    order.test.ts                       user.service.ts
  users/                              repositories/
    user.controller.ts                  ...
    user.service.ts
  shared/
    database/
    middleware/
```

### Three-Layer Architecture

```
Controller (HTTP) → Service (Business Logic) → Repository (Data Access)
```

| Layer | Responsibility | ❌ Never |
|-------|---------------|---------|
| Controller | Parse request, validate, call service, format response | Business logic, DB queries |
| Service | Business rules, orchestration, transaction mgmt | HTTP types (req/res), direct DB |
| Repository | Database queries, external API calls | Business logic, HTTP types |

### Dependency Injection (All Languages)

Inject repositories, clients, and side-effect services through constructors or framework providers. Services should depend on interfaces/protocols where the language supports them, not concrete HTTP or database details.

---

## 2. Configuration & Environment (CRITICAL)

### Centralized, Typed, Fail-Fast

**TypeScript:**
```typescript
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  database: { url: requiredEnv('DATABASE_URL'), poolSize: intEnv('DB_POOL_SIZE', 10) },
  auth: { jwtSecret: requiredEnv('JWT_SECRET'), expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);  // fail fast
  return value;
}
```

### Rules

```
✅ All config via environment variables (Twelve-Factor)
✅ Validate required vars at startup — fail fast
✅ Type-cast at config layer, not at usage sites
✅ Commit .env.example with dummy values

❌ Never hardcode secrets, URLs, or credentials
❌ Never commit .env files
❌ Never scatter process.env / os.environ throughout code
```

---

## 3. Error Handling & Resilience (HIGH)

### Typed Error Hierarchy

```typescript
// Base (TypeScript)
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly isOperational: boolean = true,
  ) { super(message); }
}
class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}
class ValidationError extends AppError {
  constructor(public readonly errors: FieldError[]) {
    super('Validation failed', 'VALIDATION_ERROR', 422);
  }
}
```

### Global Error Handler

```typescript
// TypeScript (Express)
app.use((err, req, res, next) => {
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      title: err.code, status: err.statusCode,
      detail: err.message, request_id: req.id,
    });
  }
  logger.error('Unexpected error', { error: err.message, stack: err.stack, request_id: req.id });
  res.status(500).json({ title: 'Internal Error', status: 500, request_id: req.id });
});
```

### Rules

```
✅ Typed, domain-specific error classes
✅ Global error handler catches everything
✅ Operational errors → structured response
✅ Programming errors → log + generic 500
✅ Retry transient failures with exponential backoff

❌ Never catch and ignore errors silently
❌ Never return stack traces to client
❌ Never throw generic Error('something')
```

---

## 4. Database Access Patterns (HIGH)

### Migrations Always

```bash
# TypeScript (Prisma)           # Python (Alembic)              # Go (golang-migrate)
npx prisma migrate dev          alembic revision --autogenerate  migrate -source file://migrations
npx prisma migrate deploy       alembic upgrade head             migrate -database $DB up
```

```
✅ Schema changes via migrations, never manual SQL
✅ Migrations must be reversible
✅ Review migration SQL before production
❌ Never modify production schema manually
```

### N+1 Prevention

```typescript
// ❌ N+1: 1 query + N queries
const orders = await db.order.findMany();
for (const o of orders) { o.items = await db.item.findMany({ where: { orderId: o.id } }); }

// ✅ Single JOIN query
const orders = await db.order.findMany({ include: { items: true } });
```

### Transactions for Multi-Step Writes

```typescript
await db.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.inventory.decrement({ productId, quantity });
  await tx.payment.create({ orderId: order.id, amount });
});
```

### Connection Pooling

Pool size = `(CPU cores × 2) + spindle_count` (start with 10-20). Always set connection timeout. Use PgBouncer for serverless.

---

## 5. API Client Patterns (MEDIUM)

The "glue layer" between frontend and backend. Choose the approach that fits your team and stack.

### Option A: Typed Fetch Wrapper (Simple, No Dependencies)

```typescript
// lib/api-client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.detail || body?.message || `API error ${status}`);
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();  // from cookie / memory / context

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
```

### Option B: React Query + Typed Client (Recommended for React)

Wrap the typed client in `useQuery` / `useMutation`, use stable query keys, invalidate affected resources on mutation success, and render loading/error states at the component boundary.

### Option C: tRPC (Same Team Owns Both Sides)

Use tRPC when both sides are TypeScript and the same team owns the contract. Keep procedures validated, protected where needed, and exported through the inferred `AppRouter` type.

### Option D: OpenAPI Generated Client (Public / Multi-Consumer APIs)

```bash
npx openapi-typescript-codegen \
  --input http://localhost:3001/api/openapi.json \
  --output src/generated/api \
  --client axios
```

### Decision: Which API Client?

| Approach | When | Type Safety | Effort |
|----------|------|-------------|--------|
| Typed fetch wrapper | Simple apps, small teams | Manual types | Low |
| React Query + fetch | React apps, server state | Manual types | Medium |
| tRPC | Same team, TypeScript both sides | Automatic | Low |
| OpenAPI generated | Public API, multi-consumer | Automatic | Medium |
| GraphQL codegen | GraphQL APIs | Automatic | Medium |

---

## 6. Authentication & Middleware (HIGH)

> **Full reference:** [references/auth-flow.md](references/auth-flow.md) — JWT bearer flow, automatic token refresh, Next.js server-side auth, RBAC pattern, backend middleware order.

### Standard Middleware Order

```
Request → 1.RequestID → 2.Logging → 3.CORS → 4.RateLimit → 5.BodyParse
       → 6.Auth → 7.Authz → 8.Validation → 9.Handler → 10.ErrorHandler → Response
```

### JWT Rules

```
✅ Short expiry access token (15min) + refresh token (server-stored)
✅ Minimal claims: userId, roles (not entire user object)
✅ Rotate signing keys periodically

❌ Never store tokens in localStorage (XSS risk)
❌ Never pass tokens in URL query params
```

### RBAC Pattern

```typescript
function authorize(...roles: Role[]) {
  return (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.some(r => req.user.roles.includes(r))) throw new ForbiddenError();
    next();
  };
}
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);
```

### Auth Token Automatic Refresh

On 401, call the refresh endpoint once with the httpOnly refresh cookie, update in-memory access token state, retry the original request once, then fail closed and redirect to login if refresh fails.

---

## 7. Logging & Observability (MEDIUM-HIGH)

### Structured JSON Logging

Log structured objects (`logger.info('Order created', { orderId, userId, duration_ms })`) instead of string interpolation. Include request IDs and never log passwords, tokens, PII, or secrets.

### Log Levels

| Level | When | Production? |
|-------|------|------------|
| error | Requires immediate attention | ✅ Always |
| warn | Unexpected but handled | ✅ Always |
| info | Normal operations, audit trail | ✅ Always |
| debug | Dev troubleshooting | ❌ Dev only |

### Rules

```
✅ Request ID in every log entry (propagated via middleware)
✅ Log at layer boundaries (request in, response out, external call)
❌ Never log passwords, tokens, PII, or secrets
❌ Never use console.log in production code
```

---

## 8. Background Jobs & Async (MEDIUM)

### Rules

```
✅ All jobs must be IDEMPOTENT (same job running twice = same result)
✅ Failed jobs → retry (max 3) → dead letter queue → alert
✅ Workers run as SEPARATE processes (not threads in API server)

❌ Never put long-running tasks in request handlers
❌ Never assume job runs exactly once
```

### Idempotent Job Pattern

```typescript
async function processPayment(data: { orderId: string }) {
  const order = await orderRepo.findById(data.orderId);
  if (order.paymentStatus === 'completed') return;  // already processed
  await paymentGateway.charge(order);
  await orderRepo.updatePaymentStatus(order.id, 'completed');
}
```

---

## 9. Caching Patterns (MEDIUM)

### Cache-Aside (Lazy Loading)

```typescript
async function getUser(id: string): Promise<User> {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await userRepo.findById(id);
  if (!user) throw new NotFoundError('User', id);

  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 900);  // 15min TTL
  return user;
}
```

### Rules

```
✅ ALWAYS set TTL — never cache without expiry
✅ Invalidate on write (delete cache key after update)
✅ Use cache for reads, never for authoritative state

❌ Never cache without TTL (stale data is worse than slow data)
```

| Data Type | Suggested TTL |
|-----------|---------------|
| User profile | 5-15 min |
| Product catalog | 1-5 min |
| Config / feature flags | 30-60 sec |
| Session | Match session duration |

---

## 10. File Upload Patterns (MEDIUM)

### Option A: Presigned URL (Recommended for Large Files)

```
Client → GET /api/uploads/presign?filename=photo.jpg&type=image/jpeg
Server → { uploadUrl: "https://s3.../presigned", fileKey: "uploads/abc123.jpg" }
Client → PUT uploadUrl (direct to S3, bypasses your server)
Client → POST /api/photos { fileKey: "uploads/abc123.jpg" }  (save reference)
```

Backend returns a short-lived upload URL and storage key after validating auth, filename, content type, and size policy. Frontend uploads directly to storage, then sends the returned key to the API to create the domain record.

### Option B: Multipart (Small Files < 10MB)

```typescript
// Frontend
const formData = new FormData();
formData.append('file', file);
formData.append('description', 'Profile photo');
const res = await fetch('/api/upload', { method: 'POST', body: formData });
// Note: do NOT set Content-Type header — browser sets boundary automatically
```

### Decision

| Method | File Size | Server Load | Complexity |
|--------|-----------|-------------|------------|
| Presigned URL | Any (recommended > 5MB) | None (direct to storage) | Medium |
| Multipart | < 10MB | High (streams through server) | Low |
| Chunked / Resumable | > 100MB | Medium | High |

---

## 11. Real-Time Patterns (MEDIUM)

### Option A: Server-Sent Events (SSE) — One-Way Server → Client

Best for notifications, live feeds, and streaming AI responses. Authenticate the stream, send typed events, clean up subscriptions on close, and rely on browser reconnection with bounded backoff.

### Option B: WebSocket — Bidirectional

Best for chat, collaborative editing, and gaming. Authenticate during connection, validate every message, heartbeat idle sockets, clean up user state on close, and reconnect on the client with backoff.

### Option C: Polling (Simplest, No Infrastructure)

Use bounded polling for simple status checks. Stop polling when terminal state is reached and avoid using it as a substitute for high-volume realtime workloads.

### Decision

| Method | Direction | Complexity | When |
|--------|-----------|------------|------|
| Polling | Client → Server | Low | Simple status checks, < 10 clients |
| SSE | Server → Client | Medium | Notifications, feeds, AI streaming |
| WebSocket | Bidirectional | High | Chat, collaboration, gaming |

---

## 12. Cross-Boundary Error Handling (MEDIUM)

### API Error → User-Facing Message

```typescript
// lib/error-handler.ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401: return 'Please log in to continue.';
      case 403: return 'You don\'t have permission to do this.';
      case 404: return 'The item you\'re looking for doesn\'t exist.';
      case 409: return 'This conflicts with an existing item.';
      case 422:
        const fields = error.body?.errors;
        if (fields?.length) return fields.map((f: any) => f.message).join('. ');
        return 'Please check your input.';
      case 429: return 'Too many requests. Please wait a moment.';
      default: return 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Cannot connect to server. Check your internet connection.';
  }
  return 'An unexpected error occurred.';
}
```

### React Query Global Error Handler

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { onError: (error) => toast.error(getErrorMessage(error)) },
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 3;
      },
    },
  },
});
```

### Rules

```
✅ Map every API error code to a human-readable message
✅ Show field-level validation errors next to form inputs
✅ Auto-retry on 5xx (max 3, with backoff), never on 4xx
✅ Redirect to login on 401 (after refresh attempt fails)
✅ Show "offline" banner when fetch fails with TypeError

❌ Never show raw API error messages to users ("NullPointerException")
❌ Never silently swallow errors (show toast or log)
❌ Never retry 4xx errors (client is wrong, retrying won't help)
```

### Integration Decision Tree

```
Same team owns frontend + backend?
│
├─ YES, both TypeScript
│   └─ tRPC (end-to-end type safety, zero codegen)
│
├─ YES, different languages
│   └─ OpenAPI spec → generated client (type safety via codegen)
│
├─ NO, public API
│   └─ REST + OpenAPI → generated SDKs for consumers
│
└─ Complex data needs, multiple frontends
    └─ GraphQL + codegen (flexible queries per client)

Real-time needed?
│
├─ Server → Client only (notifications, feeds, AI streaming)
│   └─ SSE (simplest, auto-reconnect, works through proxies)
│
├─ Bidirectional (chat, collaboration)
│   └─ WebSocket (need heartbeat + reconnection logic)
│
└─ Simple status polling (< 10 clients)
    └─ React Query refetchInterval (no infrastructure needed)
```

---

## 13. Production Hardening (MEDIUM)

### Health Checks

```typescript
app.get('/health', (req, res) => res.json({ status: 'ok' }));           // liveness
app.get('/ready', async (req, res) => {                                   // readiness
  const checks = {
    database: await checkDb(), redis: await checkRedis(),
  };
  const ok = Object.values(checks).every(c => c.status === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  server.close();              // stop new connections
  await drainConnections();    // finish in-flight
  await closeDatabase();
  process.exit(0);
});
```

### Security Checklist

```
✅ CORS: explicit origins (never '*' in production)
✅ Security headers (helmet / equivalent)
✅ Rate limiting on public endpoints
✅ Input validation on ALL endpoints (trust nothing)
✅ HTTPS enforced
❌ Never expose internal errors to clients
```

---

## Anti-Patterns

| # | ❌ Don't | ✅ Do Instead |
|---|---------|--------------|
| 1 | Business logic in routes/controllers | Move to service layer |
| 2 | `process.env` scattered everywhere | Centralized typed config |
| 3 | `console.log` for logging | Structured JSON logger |
| 4 | Generic `Error('oops')` | Typed error hierarchy |
| 5 | Direct DB calls in controllers | Repository pattern |
| 6 | No input validation | Validate at boundary (Zod/Pydantic) |
| 7 | Catching errors silently | Log + rethrow or return error |
| 8 | No health check endpoints | `/health` + `/ready` |
| 9 | Hardcoded config/secrets | Environment variables |
| 10 | No graceful shutdown | Handle SIGTERM properly |
| 11 | Hardcode API URL in frontend | Environment variable (`NEXT_PUBLIC_API_URL`) |
| 12 | Store JWT in localStorage | Memory + httpOnly refresh cookie |
| 13 | Show raw API errors to users | Map to human-readable messages |
| 14 | Retry 4xx errors | Only retry 5xx (server failures) |
| 15 | Skip loading states | Skeleton/spinner while fetching |
| 16 | Upload large files through API server | Presigned URL → direct to S3 |
| 17 | Poll for real-time data | SSE or WebSocket |
| 18 | Duplicate types frontend + backend | Shared types, tRPC, or OpenAPI codegen |

---

## Common Issues

### Issue 1: "Where does this business rule go?"

**Rule:** If it involves HTTP (request parsing, status codes, headers) → controller. If it involves business decisions (pricing, permissions, rules) → service. If it touches the database → repository.

### Issue 2: "Service is getting too big"

**Symptom:** One service file > 500 lines with 20+ methods.

**Fix:** Split by sub-domain. `OrderService` → `OrderCreationService` + `OrderFulfillmentService` + `OrderQueryService`. Each focused on one workflow.

### Issue 3: "Tests are slow because they hit the database"

**Fix:** Unit tests mock the repository layer (fast). Integration tests use test containers or transaction rollback (real DB, still fast). Never mock the service layer in integration tests.

---

## Reference Documents

This skill includes deep-dive references for specialized topics. Read the relevant reference when you need detailed guidance.

| Need to… | Reference |
|----------|-----------|
| Write backend tests (unit, integration, e2e, contract, performance) | [references/testing-strategy.md](references/testing-strategy.md) |
| Validate a release before deployment (6-gate checklist) | [references/release-checklist.md](references/release-checklist.md) |
| Choose a tech stack (language, framework, database, infra) | [references/technology-selection.md](references/technology-selection.md) |
| Build with Django / DRF (models, views, serializers, admin) | [references/django-best-practices.md](references/django-best-practices.md) |
| Design REST/GraphQL/gRPC endpoints (URLs, status codes, pagination) | [references/api-design.md](references/api-design.md) |
| Design database schema, indexes, migrations, multi-tenancy | [references/db-schema.md](references/db-schema.md) |
| Auth flow (JWT bearer, token refresh, Next.js SSR, RBAC, middleware order) | [references/auth-flow.md](references/auth-flow.md) |
| CORS config, env vars per environment, common CORS issues | [references/environment-management.md](references/environment-management.md) |
