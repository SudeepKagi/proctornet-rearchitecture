# Results Domain Module

**Phase:** Phase 9 — Results  
**Architecture Authority:** Notion Step 13.5 & Step 13.7

## Overview

The Results module implements candidate result visibility, staff results inspection, aggregated summary statistics, administrative manual publication, and release policy lifecycle management.

## Key Architectural Principles

1. **Decoupling of Evaluation & Publication:**
   - Evaluated results are generated asynchronously by the Phase 8 Evaluation Worker and stored in the `results` table.
   - Candidate visibility is decoupled from result row existence and governed authoritatively by PostgreSQL `CASE` expressions evaluating exam state, release policy, and authoritative database timestamps (`transaction_timestamp()`).

2. **Immediate Visibility Invariant (Correction 1):**
   - Under an `IMMEDIATE` release policy, candidates can only inspect results once the exam has concluded (`status IN ('ENDED', 'EVALUATED', 'RESULT_PUBLISHED')`).
   - While an exam is `LIVE`, early candidate submissions remain shielded from score inspection (`403 RESULT_NOT_PUBLISHED`), eliminating answer and score leakage to peers who are still testing.

3. **Authoritative PostgreSQL Time (Correction 2):**
   - Scheduled release (`SCHEDULED`) and policy immutability checks are evaluated strictly against PostgreSQL `transaction_timestamp()`.
   - Node.js system time and HTTP timestamps are never used for correctness-critical visibility decisions.

4. **Primary Database Correctness (Correction 3):**
   - All result visibility determinations and mutation locks are enforced against the PostgreSQL primary database.

5. **Single Source of Truth (Correction 4):**
   - The PostgreSQL query predicate is the authoritative runtime enforcement.
   - `backend/src/domain/results/resultsVisibility.js` is the pure reference specification used for unit testing and domain invariants.

6. **Release Policy Immutability (Correction 7):**
   - Once results have become candidate-visible under any policy, the release policy is strictly immutable (`409 RESULT_ALREADY_RELEASED`).
   - While an exam is `LIVE` with evaluated results under `IMMEDIATE`, policy mutations remain allowed because candidates have not yet gained visibility.

7. **Scoped Invigilator Authorization:**
   - Invigilators must provide `sessionId` and are verified against `session_invigilators` in both the service layer and SQL queries.
   - Invigilators cannot publish results or mutate release policies (`403 Forbidden`).

## API Endpoints

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/v1/attempts/:attemptId/result` | `STUDENT` | Retrieve own attempt result (subject to release policy) |
| `GET` | `/api/v1/exams/:examId/results` | `ADMIN`, `FACULTY`, `INVIGILATOR` | Paginated list of evaluated results (scoped) |
| `GET` | `/api/v1/exams/:examId/results/summary` | `ADMIN`, `FACULTY`, `INVIGILATOR` | Aggregated statistics (total, evaluated, pass/fail, avg) |
| `POST` | `/api/v1/exams/:examId/results/publish` | `ADMIN`, `FACULTY` (Owner) | Explicit administrative publication (`RESULT_PUBLISHED`) |
| `PATCH` | `/api/v1/exams/:examId/results/policy` | `ADMIN`, `FACULTY` (Owner) | Update release policy (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) |
