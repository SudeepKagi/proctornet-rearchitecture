# ProctorNet Re-Architecture — Development Rules & Governance

These rules govern all engineering workflows, architectural decisions, and contributions to the ProctorNet re-architecture. Adherence is mandatory for all contributors and automated agents.

---

## 1. Architectural Integrity & Scope Control

1. **Finalized Architecture as Source of Truth**: All implementation work must strictly conform to the system design specified in `docs/ARCHITECTURE.md` and the master architecture specification.
2. **One Phase at a Time**: Development proceeds sequentially according to `docs/DEVELOPMENT_PLAN.md`. Do not start or implement future phases prematurely.
3. **No Scope Expansion Without Approval**: Do not introduce unrequested features, libraries, or frameworks.
4. **No Hidden Architecture Changes**: Never alter core architectural patterns (e.g., swapping a database, adding microservices, changing messaging semantics) without explicit review and approval.
5. **Mandatory ADRs**: Any intentional deviation from or addition to the architectural baseline must be documented as an **Architectural Decision Record (ADR)** in `docs/ADR/` prior to or alongside the implementation.

---

## 2. Core Engineering Principles

1. **PostgreSQL is the Authoritative Store**: PostgreSQL is the single source of truth for all business-critical state (users, exams, attempts, answers, submissions, grades).
2. **Redis is Strictly Non-Authoritative**: Redis is used solely for transient caching, rate limiting, and pub/sub. Redis failure must never result in lost exam answers or broken submission state.
3. **RabbitMQ is Asynchronous Only**: RabbitMQ queues asynchronous background work (evaluation, notifications, transcoding). It is not an authoritative state store.
4. **Client State is Untrusted**: Browsers/clients are completely untrusted. All timings, authorizations, question assignments, and state transitions are validated server-side.
5. **Durable Writes Before Acknowledgement**: Critical write operations (answer saves, submissions) must be committed to PostgreSQL disk storage before returning an HTTP `200/201` success response to the client.
6. **Correctness Over Superficial Availability**: Ensuring data integrity, atomic state transitions, and zero data loss on candidate answers takes precedence over false superficial availability.
7. **Security Rules are Non-Negotiable**: Resource-level authorization (RBAC/ABAC), input sanitization, parameterized queries, and least privilege access must be enforced on every endpoint.
8. **Measure Before Optimizing**: Do not introduce premature optimizations or complex caching layers without empirical benchmark measurements.
9. **Backend Runtime & Language Baseline**: The backend technology baseline is strictly **Node.js 24 LTS**, **JavaScript**, **Express**, and **ES Modules** (`import`/`export`). All backend source files must use `.js`. TypeScript is strictly excluded from this project (no `ts-node`, `tsx`, `tsconfig.json`, or TypeScript build tooling). The frontend will also remain JavaScript-based unless a future architectural decision explicitly changes this. Future implementation phases must not silently introduce TypeScript or change the runtime baseline without an approved ADR.

---

## 3. Testing Discipline

1. **Tests Accompany Implementation**: Implementation of any feature must be paired with corresponding automated tests (unit, integration, or concurrency).
2. **Never Skip Tests**: A milestone or branch cannot be merged into `main` without passing all relevant automated tests.
3. **Test Critical Failure Modes**: Explicitly test concurrency races (autosave overwrites, double submit), network timeouts, token expiry, and error recovery.

---

## 4. Git & GitHub Workflow

### 4.1 Branch Strategy
- `main` is the protected, production-ready branch. **Direct development on `main` is strictly prohibited.**
- All implementation work must take place on short-lived branches created from `main`.
- **Branch Naming Conventions**:
  - Feature branches: `feature/<phase>-<short-description>`  
    *Example:* `feature/phase-1-backend-foundation`, `feature/phase-7-answer-autosave`
  - Bug-fix branches: `fix/<phase>-<short-description>`  
    *Example:* `fix/phase-7-answer-revision-race`
- Keep branches focused on a single logical phase or milestone. Do not mix unrelated tasks.
- Keep branch lifetimes short to avoid merge conflicts.

### 4.2 Pull Requests & Merging
- All changes merge into `main` exclusively through Pull Requests (PRs).
- Direct push to `main` must be disabled / bypassed under no circumstances.
- Every PR must clearly document:
  1. **What changed**
  2. **Why it changed**
  3. **Tests executed and results**
  4. **Architecture impact**
  5. **Relevant ADR (if any)**
  6. **Known limitations or technical debt**
- PR titles must follow Conventional Commit style.

### 4.3 Commit Message Standards
All commits must follow the **Conventional Commits** specification:

```
<type>(<scope>): <description>
```

#### Allowed Types:
- `feat`: A new feature or major capability
- `fix`: A bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `docs`: Documentation updates only
- `chore`: Maintenance tasks, tool configurations, dependencies
- `build`: Changes affecting the build system or package configuration
- `ci`: CI/CD pipeline and workflow configuration
- `perf`: Performance improvements
- `revert`: Reverting a previous commit

#### Commit Rules:
- Keep commits small, focused, and logically atomic. One commit = one coherent change.
- Commits must leave the codebase in a buildable and testable state whenever practical.
- Never write vague messages (e.g., `update`, `fix stuff`, `wip`, `final`, `done`).
- Do not mix refactoring, feature work, and documentation changes in a single commit.

---

## 5. Secrets Management & Security

1. **Never Commit Secrets**:
   - Never commit `.env`, `.env.local`, API keys, private keys, database passwords, JWT secrets, or cloud credentials.
2. **Configuration Templates**:
   - Provide `.env.example` files containing variable names and safe placeholder values only.
3. **Automated Secret Scanning**:
   - Ensure repository ignores all credential patterns and runs secret scanning in CI.
