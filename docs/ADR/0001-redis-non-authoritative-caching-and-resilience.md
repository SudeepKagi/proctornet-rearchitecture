# ADR-0001: Redis Non-Authoritative Caching, Sliding-Window Rate Limiting, and Resilience

## Status
Accepted

## Date
2026-09-07

## Context & Problem Statement
In high-concurrency online examination scenarios, repetitive read access to static or low-churn entities (e.g. published exam blueprints, candidate-scoped sanitized question bundles) places substantial read pressure on the authoritative PostgreSQL database. Furthermore, rapid authentication attempts, autosave requests, and exam submissions require distributed abuse boundaries across horizontal monolith application nodes. Finally, user logout and administrative session revocations must be recognized immediately across all application instances without issuing costly database queries on every authenticated API request.

However, treating an in-memory datastore as an authoritative source of truth poses severe operational and consistency hazards, including potential data loss, split-brain states, and authorization bypasses if cache entries are shared across tenants or served before security checks.

## Decision Drivers
1. **PostgreSQL as the Sole Source of Truth:** Zero business data, transactional records, attempt states, OCC answer revisions, deadlines, or evaluation results may ever originate from or terminate solely in Redis.
2. **Strict Authorization Precedence:** Authentication, role verification, and Broken Object-Level Authorization (BOLA) resource scoping must strictly precede any cache lookup or return.
3. **Candidate Attempt Isolation:** Question bundles contain candidate-specific deterministic display orders and attempt-scoped primary keys (`attempt_question_id`); keys must never be shared across candidates.
4. **Resilience & Graceful Degradation:** Redis is disposable. Total Redis failure must never crash the application or prevent candidates from completing and submitting exams.
5. **Session Revocation Security:** Session revocations must fast-fail in Redis, fall back authoritatively to PostgreSQL `user_sessions.is_revoked` if Redis is down, and fail closed if both stores are unreachable.

## Considered Options
1. **Option 1: PostgreSQL-Only Architecture (Status Quo)**
   - All reads, session checks, and rate limits handled directly via PostgreSQL or single-node memory.
   - *Rejected:* Single-node rate limiting does not scale horizontally across load-balanced application instances. Repetitive read queries during high-concurrency exams overload the PostgreSQL pool.
2. **Option 2: Redis as Write-Through / Authoritative Cache**
   - Storing answers and attempt timers in Redis and flushing asynchronously to PostgreSQL.
   - *Rejected:* Violates core ACID requirements and introduces severe risk of candidate answer loss during ungraceful process or network failures.
3. **Option 3: Redis as Strictly Non-Authoritative Cache-Aside, Ephemeral Sliding-Window Rate Limiter, and Revocation Accelerator (Chosen)**
   - Redis operates strictly alongside PostgreSQL as an ephemeral acceleration layer.
   - Cache-aside for published exam metadata (`v1:exam:{examId}`) with 1-hour TTL.
   - Attempt-scoped question cache (`v1:attempt:{attemptId}:questions`) with dynamic TTL bounded by attempt expiration (`remainingSeconds = ceil((expires_at - now)/1000)`).
   - Distributed atomic sliding-window rate limiting via Redis Lua script with local in-memory fallback.
   - Session revocation blacklist (`v1:blacklist:session:{sessionId}`) with PostgreSQL `user_sessions` fallback and dual-failure fail-closed semantics.

## Decision Outcome
Chosen option: **Option 3**, because it provides the required sub-millisecond read acceleration and horizontally coordinated rate limiting while rigorously preserving PostgreSQL as the single authoritative source of truth.

### Architectural Invariants:
1. **Cache Scope & Exclusions:**
   - Caching is permitted ONLY for `v1:exam:{examId}` (published exams) and `v1:attempt:{attemptId}:questions` (attempt-scoped sanitized bundles).
   - Candidate result scorecards, staff result summaries, and session rosters are **100% UNCACHED and PostgreSQL-authoritative**.
2. **Authorization Ordering:**
   - Every request executes `authenticate` and route-level authorization (BOLA/ownership checks) **before** querying Redis for cached data.
3. **Question Cache Dynamic TTL Policy:**
   - `remainingSeconds = ceil((attempt.expires_at - currentTime) / 1000)`. If `remainingSeconds <= 0`, caching in Redis is skipped. Redis TTL never exceeds or outlives the authoritative deadline.
4. **Cache Invalidation:**
   - Write mutations execute post-commit best-effort invalidation (`DEL v1:exam:{examId}`). Stale data exposure is bounded by key TTL.
5. **Distributed Rate Limiting:**
   - Sliding-window checks execute via an atomic Redis Lua script returning `[allowed, remaining, retryAfterSeconds]`. On Redis outage, degrades to local in-memory sliding window limiter.
6. **Session Revocation Semantics:**
   - JWT signature and expiration verified first. Redis blacklist fast-path checked second. If Redis is down, PostgreSQL `user_sessions.is_revoked` is queried. If both stores are down, the system **fails closed** (rejects request).
7. **Graceful Degradation:**
   - On Redis outage, `cacheService` fails open (returns `null` miss); core business endpoints seamlessly fetch from PostgreSQL with zero 500 errors.

### Positive Consequences
- Sub-millisecond response times for published exam reads and active attempt question reloads.
- Horizontal, race-free rate limiting coordinated across multi-node deployments.
- Instant cross-node session logout propagation without querying the database on every authenticated request.
- Complete platform availability during Redis server downtime.

### Negative Consequences / Trade-offs
- Operational dependency on Redis alongside PostgreSQL.
- Distributed rate limiting degrades to per-node enforcement when Redis is unavailable.
- Dual failure of Redis and PostgreSQL during authentication triggers fail-closed rejection.

## Compliance & Validation
- Validated via unit test suite (`tests/redis/redisClient.test.js`, `cacheService.test.js`, `tokenBlacklist.test.js`, `rateLimiter.unit.test.js`).
- Validated via real Redis Lua concurrency integration test (`tests/redis/rateLimiter.integration.test.js`) testing 30 concurrent promises with 10-request limits.
- Validated via outage simulation (`tests/redis/redisFallback.test.js`) verifying zero 500 errors and seamless PostgreSQL fallback.
- Validated via full backend test regression (351 existing tests + new Phase 11 tests) and frontend test suite (25 tests).
