# ProctorNet Backend Workspace

Production-grade modular monolith backend API service for the ProctorNet Examination Platform.

---

## 1. Tooling & Runtime Baseline

- **Runtime**: Node.js 24 LTS (or higher)
- **Language**: JavaScript (ES Modules, strictly `.js` with `import`/`export`)
- **TypeScript**: Not used (strictly forbidden by architectural governance)
- **Web Framework**: Express 4.x
- **Authoritative Database**: PostgreSQL 16 (`pg` pool)
- **Cache & Ephemeral State**: Redis 7 (`ioredis`)
- **Message Broker**: RabbitMQ 3.13 (`amqplib`)
- **Media Plane**: `mediasoup` v3 (WebRTC SFU)
- **Test Runner**: Vitest 5

---

## 2. Architecture & Domain Modules

ProctorNet backend is organized as a **Modular Monolith** with clean domain encapsulation under `src/modules/`:

| Module | Primary Scope & Responsibilities |
| :--- | :--- |
| **`auth`** | Institutional login, password rotation, JWT issuance, silent token refresh |
| **`users`** | User management, multi-role RBAC authorization, profile storage |
| **`candidate`** | Candidate document verification, biometric facial recognition embedding extraction |
| **`departments`** | Canonical academic departments master catalog and discipline resolution |
| **`exams`** | Blueprint authoring, question composition, timing constraints, exam state machine |
| **`sessions`** | Session scheduling, physical room allocation, candidate roster enrollment, invigilator assignments |
| **`attempts`** | Attempt lifecycle state machine (`READY` $\to$ `ACTIVE` $\to$ `SUBMITTED` / `EXPIRED`), drift-calibrated countdowns |
| **`questions`** | Question repository (MCQ, True/False, Numeric, Short Answer, Coding), options management |
| **`evaluation`** | Asynchronous automated grading consumers, subjective manual grading queues, grade release policies |
| **`proctoring`** | Real-time candidate telemetry ingestion, anomaly scoring ($0–100$), risk flags |
| **`interventions`**| Invigilator live controls (warning announcements, pause, resume, attempt termination) |
| **`evidence`** | Presigned S3 evidence upload URL issuance, metadata hashing, evidence inspection |
| **`outbox`** | Transactional outbox pattern poller and dispatcher guaranteeing at-least-once message delivery to RabbitMQ |
| **`audit`** | Immutable append-only audit trail logging administrative actions, protected by PostgreSQL trigger |

---

## 3. Available Scripts

```bash
# Start production HTTP and WebSocket server
npm start

# Start development server with file watching and local .env loading
npm run dev

# Run all automated tests (Vitest)
npm test

# Run tests in interactive watch mode
npm run test:watch

# Execute database migrations forward
npm run db:migrate

# Roll back the most recent migration batch
npm run db:rollback

# Create a new migration file
npm run db:create <migration_name>

# Seed pre-configured evaluation accounts (Admin, Dev, Faculty, Invigilator, Student)
npm run seed:users
```

---

## 4. Automated Testing Suite

The backend test suite is powered by **Vitest** with 7 dedicated test suites covering domain critical paths:

```bash
npm test
```

### Test Coverage Highlights:
- **`attemptStateMachine.test.js`**: Validates legal attempt transitions, zero-countdown expirations, and rejection of invalid states.
- **`examStateMachine.test.js`**: Validates blueprint publishing, scheduling, live transitions, and evaluation workflows.
- **`userStateMachine.test.js`**: Validates user onboarding verification states (`PENDING`, `VERIFIED`, `REJECTED`).
- **`resultsReleasePolicy.test.js`**: Validates result publication policies (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) and student visibility rules.
- **`authRbac.test.js`**: Enforces strict role-based access control across all 5 roles (`ADMIN`, `DEVELOPER`, `FACULTY`, `INVIGILATOR`, `STUDENT`).
- **`autosaveOcc.test.js`**: Validates Optimistic Concurrency Control (OCC) revision tracking, 409 conflict detection, and answer persistence invariants.
- **`schedulingDepartment.test.js`**: Validates canonical department resolution and referential integrity enforcement.

---

## 5. Environment Configuration

Copy `.env.example` to `.env` in the repository root and configure:

| Key | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Backend HTTP API port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5433/proctornet_db` |
| `REDIS_URL` | Redis cache connection string | `redis://localhost:6379` |
| `RABBITMQ_URL` | RabbitMQ broker connection string | `amqp://guest:guest@localhost:5672` |
| `JWT_SECRET` | Secret key for signing access tokens | `your-cryptographic-secret-key` |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens | `your-refresh-secret-key` |
| `S3_BUCKET` | AWS S3 evidence storage bucket | `proctornet-evidence` |
| `S3_REGION` | AWS S3 region | `us-east-1` |
| `SFU_LISTEN_IP` | Mediasoup SFU listen address | `127.0.0.1` |
