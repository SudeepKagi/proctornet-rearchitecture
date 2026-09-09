# Phase 26: Examination & Invigilation — Implementation Plan

> **Authoritative Specification & Design Blueprint**  
> **Status**: PENDING REVIEW  
> **Consolidated Scope**: Old Phase 26 (Faculty Examination Lifecycle) + Old Phase 27 (Invigilator Workstation)  
> **Repository Branch**: `main`  
> **Authoritative Architecture Hierarchy**:  
> 1. Notion Step 13 Final Re-Architecture (13.5 Modular Monolith & State Decoupling, 13.7 Zero-Trust Threat Model, 13.17 Defensive Engineering & Audit Immutability)  
> 2. `docs/DEVELOPMENT_PLAN.md`  
> 3. Existing Merged Repository (`main`)  
> 4. Existing Finalized Phase Plans & Documentation  
> 5. Existing Tests & Verification Artifacts  

---

## 1. Phase Objective

Phase 26 delivers the complete **Examination & Invigilation** operational layer for ProctorNet. By consolidating the academic lifecycle and live proctoring supervision into a single cohesive milestone, Phase 26 enables:

1. **Faculty Academic Lifecycle (Track 1)**: End-to-end authoring and evaluation suite including reusable Question Banks, rich question authoring (LaTeX / MathJax and syntax-highlighted code), dynamic Blueprint rule validation, multi-room session scheduling with roster controls, a dedicated subjective Manual Grading Workspace with rubrics and score-override auditing, and comprehensive Item Analytics (discrimination index, difficulty P-values, score histograms, completion-time statistics).
2. **Invigilator Live Workstation (Track 2)**: A high-density live proctoring workstation featuring a 12-stream candidate video/audio grid (WebRTC SFU integration), Candidate Detail Drawer, live anomaly violation timelines, real-time intervention engine (broadcast announcements, 1:1 candidate messaging, remote pause, remote resume, and emergency termination with mandatory documented reasons), in-session/post-session S3 evidence inspection, and non-bypassable candidate-facing intervention UX.

---

## 2. Scope Boundary

### In-Scope (Committed Capabilities):
- **Question Bank Management**: Reusable question inventories, subject/topic tagging, difficulty categorization (`EASY`, `MEDIUM`, `HARD`), Bloom's taxonomy support (`REMEMBER`, `UNDERSTAND`, `APPLY`, `ANALYZE`, `EVALUATE`, `CREATE`), question cloning, versioning, and lifecycle states (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- **Rich Question Authoring**: Question schemas supporting LaTeX / MathJax mathematical formulas, syntax-highlighted code snippets, and multimedia asset links.
- **Subjective Question Types**: Introduction of `SHORT_ANSWER`, `ESSAY`, and `CODE` question types alongside existing objective types (`MCQ`, `TRUE_FALSE`, `NUMERIC`).
- **Blueprint Rule Builder & Validation**: Topic rules with difficulty and Bloom constraints, point distribution calculation, and pre-publishing blueprint validation against active question inventories.
- **Multi-Room Scheduling & Rosters**: Session scheduling across rooms, room capacity enforcement, candidate assignment conflicts, and invigilator assignment.
- **Manual Grading Workspace**: Subjective question grading interface (`/faculty/exams/:id/grading`), rubric scoring, partial credit evaluation, score overrides with mandatory rationale, score audit history, and automatic recalculation of final results.
- **Exam & Item Analytics**: Item discrimination index ($r_{pbis}$ and upper/lower quartile discrimination), item difficulty (P-value), grade distribution histograms, candidate completion rates, and completion-time metrics.
- **Results Publication Lifecycle**: Enforcing publication policies (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) with audit tracking and protection against premature candidate release.
- **Invigilator Live Console**: Dedicated `/invigilator/sessions/:id` workspace with a 12-candidate paginated video grid, simulcast layer selection, muted-by-default audio with solo listening, WebRTC connection health indicators, and candidate risk score badges.
- **Candidate Detail Drawer**: Slide-out drawer with high-resolution video stream, audio VU meter, candidate profile, hardware readiness history, real-time violation timeline, and risk gauge.
- **Real-Time Intervention Engine**: Server endpoints and WebSocket event distribution for room announcements, candidate warnings, remote exam pause, remote exam resume, and emergency attempt termination.
- **Candidate Intervention UX**: Real-time modal displays, distraction-free pause screen with server-authoritative timer freezing and time extension, attempt termination locks, and broadcast announcement banners.
- **Evidence Inspection Modal**: In-session and post-session review of secure S3 evidence snapshots via short-lived presigned GET URLs.
- **Session Sign-Off & Incident Summary**: Invigilator session conclusion workflow and post-session incident summary reporting.

### Out-of-Scope (Explicit Non-Scope):
- **NO Developer Telemetry / Portal**: Engineering health matrix, centralized logs, topology map, and incident triage belong to **Phase 27**.
- **NO WireGuard VPN Plane**: Dedicated management network (`10.100.0.0/24`), peer CLI, and host firewall boundaries belong to **Phase 27**.
- **NO Universal Design System / WCAG 2.1 AA Normalization**: Application-wide CSS token audit, universal focus indicators, and Playwright 5-role journeys belong to **Phase 28**.
- **NO Continuous Client-Side AI Proctoring**: In-browser Web Worker inference models for continuous gaze tracking, face absence, multiple face detection, and audio environment classification belong to **Phase 28**.
- **NO Multi-AZ Managed Infrastructure Migration**: RDS PostgreSQL 16, ElastiCache Redis replication, ALB setup, and SFU clustering belong to **Phase 29**.
- **NO Final ASVS PenTesting & Compliance**: OWASP ASVS Level 2 penetration testing, DAST/SAST, and automated biometric data purging belong to **Phase 29**.

---

## 3. Requirements Traceability Matrix

Every requirement from Old Phase 26 and Old Phase 27 is mapped 1:1 into Phase 26:

| Req ID | Source Phase | Requirement Name | Phase 26 Workstream | Target Module / File Area | Authoritative Acceptance Criteria |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **REQ-26-01** | Old Phase 26 | Reusable Question Bank Management | Workstream A | `backend/src/modules/questions`, `frontend/src/pages/faculty/QuestionBankPage.jsx` | Faculty manage question inventories; filter by subject, topic, difficulty, Bloom level; clone questions with version increments. |
| **REQ-26-02** | Old Phase 26 | Rich Question Authoring | Workstream A | `backend/src/domain/question`, `frontend/src/components/faculty/RichQuestionEditor.jsx` | Supports LaTeX/MathJax formulas, code snippets, and multimedia asset links with validated schemas. |
| **REQ-26-03** | Old Phase 26 | Subjective Question Types | Workstream A | `backend/src/domain/question/questionTypes.js`, `backend/src/modules/evaluation` | Introduces `SHORT_ANSWER`, `ESSAY`, `CODE`; auto-evaluator marks them `PENDING_GRADING` without scoring errors. |
| **REQ-26-04** | Old Phase 26 | Blueprint Rules & Pre-Publish Validation | Workstream B | `backend/src/modules/exams/exams.service.js`, `frontend/src/pages/faculty/ExamEditorPage.jsx` | Topic rules validate question counts, difficulty, and Bloom constraints against active bank before exam publishing is permitted. |
| **REQ-26-05** | Old Phase 26 | Multi-Room Scheduling & Rosters | Workstream B | `backend/src/modules/sessions`, `frontend/src/pages/faculty/SessionManagerPage.jsx` | Validates room capacity, detects candidate double-booking, and assigns primary/secondary invigilators. |
| **REQ-26-06** | Old Phase 26 | Manual Grading Workspace | Workstream C | `backend/src/modules/evaluation`, `frontend/src/pages/faculty/ManualGradingPage.jsx` | Instructors review candidate subjective answers side-by-side with rubrics, assign partial marks, and input mandatory rationale. |
| **REQ-26-07** | Old Phase 26 | Score Overrides & Audit Trail | Workstream C | `backend/src/modules/evaluation/manualGrading.service.js`, `manual_grade_audits` | Adjustments to auto-evaluated or manual scores record previous score, new score, grader ID, and rationale in immutable audit trail. |
| **REQ-26-08** | Old Phase 26 | Item Discrimination & Analytics | Workstream D | `backend/src/modules/exams/examAnalytics.service.js`, `frontend/src/pages/faculty/FacultyResultsPage.jsx` | Computes item discrimination index ($r_{pbis}$), difficulty index (P-value), grade histograms, and completion-time stats. |
| **REQ-26-09** | Old Phase 26 | Results Publication & Policy Enforcement | Workstream D | `backend/src/modules/results`, `backend/src/modules/exams` | Enforces `IMMEDIATE`, `SCHEDULED`, and `MANUAL` policies; candidate scorecard access strictly blocked until publication conditions met. |
| **REQ-27-01** | Old Phase 27 | 12-Stream Live Video Grid | Workstream E | `frontend/src/components/media/CandidateMediaGrid.jsx`, `backend/src/infrastructure/media` | Paginated 12-candidate matrix with audio meters, simulcast layer controls (low for grid, high for focus), and health indicators. |
| **REQ-27-02** | Old Phase 27 | Candidate Detail Drawer | Workstream E | `frontend/src/components/invigilator/CandidateDetailDrawer.jsx` | Slide-out panel displaying high-res video, live VU meter, readiness history, violation timeline, and risk score gauge. |
| **REQ-27-03** | Old Phase 27 | Real-Time Anomaly Timeline | Workstream E | `backend/src/modules/proctoring`, `frontend/src/components/invigilator/ViolationTimeline.jsx` | Server-authoritative violation events stream to invigilator in real time over WebSocket with calculated severity. |
| **REQ-27-04** | Old Phase 27 | Room Broadcast Announcements | Workstream F | `backend/src/modules/interventions`, `backend/src/infrastructure/realtime` | Invigilator broadcasts urgent message to all candidates in session room over `session:<id>:candidate` channel with delivery ACK. |
| **REQ-27-05** | Old Phase 27 | 1:1 Candidate Messaging | Workstream F | `backend/src/modules/interventions`, `backend/src/infrastructure/realtime` | Proctor sends direct warning message to specific attempt over `attempt:<id>` channel; candidate client acknowledges. |
| **REQ-27-06** | Old Phase 27 | Remote Attempt Pause & Resume | Workstream F | `backend/src/modules/interventions/pauseService.js`, `exam_attempts` | Proctor pauses attempt; freezes candidate countdown timer, locks inputs, and records pause duration to extend `expires_at` on resume. |
| **REQ-27-07** | Old Phase 27 | Emergency Attempt Termination | Workstream F | `backend/src/modules/interventions/terminateService.js`, `exam_attempts` | Proctor terminates attempt with mandatory documented reason; immediately halts submission, evicts candidate, and updates status. |
| **REQ-27-08** | Old Phase 27 | Intervention Authorization & BOLA | Workstream F | `backend/src/middleware/authorize.js`, `backend/src/modules/interventions` | Strictly enforces that only assigned invigilators, exam author faculty, or admins can issue interventions. |
| **REQ-27-09** | Old Phase 27 | Candidate Intervention UX | Workstream G | `frontend/src/pages/candidate/ExamTakingPage.jsx`, `frontend/src/components/exam/InterventionModal.jsx` | Non-bypassable UI displays for pause (with frozen timer and instructions), warning toasts, and termination notification. |
| **REQ-27-10** | Old Phase 27 | Evidence Snapshot Inspection Modal | Workstream H | `backend/src/modules/evidence`, `frontend/src/components/invigilator/EvidenceModal.jsx` | Displays high-resolution S3 webcam/screen snapshots via secure presigned GET URLs with expiration. |
| **REQ-27-11** | Old Phase 27 | Invigilator Session Conclusion | Workstream H | `backend/src/modules/sessions`, `frontend/src/pages/invigilator/SessionMonitorPage.jsx` | Invigilator marks session concluded, reviews violation summary, and submits post-session incident report. |
| **REQ-26-10** | Consolidated | Automated Test Regimen (Levels 1–5) | Workstream H | `backend/tests/phase26`, `frontend/src/test/phase26` | Level 1–5 tiered test execution covering unit, integration, API, security, real-time WebSocket, and E2E UX flows. |

---

## 4. Repository Baseline Assessment

A comprehensive audit of the merged repository (`main`) confirms the following existing architectural state:

1. **Database Baseline**: 20 executed migrations (`001_extensions.js` through `020_biometric_face_enrollment_and_verification.js`). Core tables exist for `users`, `exams`, `exam_topic_rules`, `rooms`, `exam_sessions`, `session_students`, `session_invigilators`, `exam_attempts`, `attempt_questions`, `answers`, `results`, `violation_events`, `violation_flags`, `evidence_records`, and `audit_logs`.
2. **Real-Time WebSocket Control Plane**: `websocketServer.js` supports subprotocol JWT authentication, IP rate limiting, connection heartbeat tracking, and room authorization for `session:<id>`, `session:<id>:candidate`, and `attempt:<id>`. `realtimeBroadcaster.js` provides in-process routing with optional Redis Pub/Sub fan-out.
3. **WebRTC SFU Media Plane**: `sfuManager.js` and `mediaSignaling.js` implement mediasoup workers, routers, transports, producers, and consumers. `authorizeParticipant` enforces that candidates produce media while invigilators/faculty consume. `media:consume_batch` and simulcast layer controls are already built.
4. **Frontend Architecture**: React 19 + Vite application with role-based routing (`RoleRoute`, `VerifiedRoute`), unified layout (`AppLayout`), and hooks for realtime subscriptions (`useRealtime`), autosaves (`useAutosave`), and media (`useMediaSubscription`).

---

## 5. Existing Capabilities Reused

Phase 26 directly reuses existing infrastructure without unnecessary rewrites:
- **Auth & RBAC**: Reuses `authenticate`, `requireRole`, and `requireVerifiedActiveUser` middleware.
- **WebSocket Infrastructure**: Reuses `realtimeBroadcaster.broadcastToRoom()` and `channelManager` room subscriptions (`session:<id>:candidate` and `attempt:<id>`).
- **WebRTC SFU Media**: Reuses `defaultSfuManager`, `mediaSignaling.js`, and `CandidateMediaGrid.jsx`.
- **Evidence Storage**: Reuses S3 presigned URL generation from `evidence.service.js` and metadata in `evidence_records`.
- **Audit Logging**: Reuses `recordAuditEvent` and database-enforced append-only `audit_logs` table (SQLSTATE 20000).
- **Outbox & Messaging**: Reuses transactional outbox for publishing evaluation and notification jobs.

---

## 6. Missing Capabilities to Implement

The following components do not exist in the codebase and must be built:
1. **Migration 021**: Schema updates for question banks, subjective question types, attempt pause states, manual grading records, score audit logs, and proctor interventions.
2. **Question Bank Module**: Backend service, repository, and controller for `/api/v1/faculty/question-bank` with tagging, difficulty, Bloom levels, and cloning.
3. **Subjective Question Evaluator**: Updating `evaluator.js` to recognize `SHORT_ANSWER`, `ESSAY`, and `CODE`, marking them as `PENDING_GRADING`.
4. **Manual Grading Module**: Backend endpoints (`GET /api/v1/results/:id/evaluation`, `POST /api/v1/results/:id/manual-grade`) with rubric scoring and score override audits.
5. **Exam Item Analytics Engine**: Computing discrimination index ($r_{pbis}$), difficulty index (P-value), histograms, and completion-time percentiles (`/api/v1/exams/:id/analytics`).
6. **Intervention Service & Endpoints**: Endpoints for announcements, candidate messages, remote pause, resume, and terminate with WebSocket broadcasting.
7. **Candidate Intervention UX**: Handling `candidate:paused`, `candidate:resumed`, `candidate:terminated`, `candidate:message`, and `session:announcement` in `ExamTakingPage.jsx`.
8. **Invigilator UI Controls**: Candidate Detail Drawer, Intervention Modals, Evidence Snapshot Modal, and Session Incident Summary in `SessionMonitorPage.jsx`.
9. **Faculty UI Pages**: `QuestionBankPage.jsx` and `ManualGradingPage.jsx`.

---

## 7. Domain Model Changes

```
+------------------------------------------------------------------------------------+
|                             PHASE 26 DOMAIN MODEL EXTENSIONS                       |
+------------------------------------------------------------------------------------+
| 1. QuestionBankAggregate                                                           |
|    - BankId (UUID), Title, Description, SubjectId, CreatedBy, IsShared             |
|                                                                                    |
| 2. QuestionEntity (Enhanced)                                                       |
|    - BankId, Difficulty, BloomLevel, Tags, Version, ParentQuestionId, Status        |
|    - QuestionType extended: MCQ, TRUE_FALSE, NUMERIC, SHORT_ANSWER, ESSAY, CODE     |
|    - RubricDefinition: criteria[], max_points, scoring_guidelines                  |
|                                                                                    |
| 3. ExamAttemptAggregate (Enhanced)                                                 |
|    - Status extended: READY, ACTIVE, PAUSED, SUBMITTED, TERMINATED, EXPIRED        |
|    - PausedAt, TotalPausedMs, PauseReason, PausedByUserId                          |
|    - TerminationReason, TerminatedByUserId                                         |
|                                                                                    |
| 4. ManualGradeEntity                                                               |
|    - GradeId, AttemptQuestionId, GraderUserId, PointsAwarded, MaxPoints, Feedback  |
|    - RubricScores (JSONB), Rationale (Mandatory)                                   |
|                                                                                    |
| 5. ProctorInterventionEntity                                                       |
|    - InterventionId, SessionId, AttemptId, InvigilatorUserId                       |
|    - Type: ANNOUNCEMENT, WARNING_MESSAGE, PAUSE, RESUME, TERMINATE                 |
|    - Message, Reason, Metadata                                                     |
+------------------------------------------------------------------------------------+
```

---

## 8. Database Schema & Migration Changes (Migration 021)

File: `backend/migrations/021_phase26_examination_and_invigilation.js`

```sql
-- 1. Create question_banks table
CREATE TABLE IF NOT EXISTS question_banks (
  bank_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject_id UUID REFERENCES subjects(subject_id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_banks_created_by ON question_banks(created_by);
CREATE INDEX IF NOT EXISTS idx_question_banks_subject ON question_banks(subject_id);

-- 2. Extend questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES question_banks(bank_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(32) NOT NULL DEFAULT 'REMEMBER',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES questions(question_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS rubric JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_question_type_check,
  ADD CONSTRAINT questions_question_type_check 
    CHECK (question_type IN ('MCQ', 'TRUE_FALSE', 'NUMERIC', 'SHORT_ANSWER', 'ESSAY', 'CODE')),
  ADD CONSTRAINT check_question_difficulty 
    CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  ADD CONSTRAINT check_question_bloom_level 
    CHECK (bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE')),
  ADD CONSTRAINT check_question_status 
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  ADD CONSTRAINT check_question_version 
    CHECK (version >= 1);

CREATE INDEX IF NOT EXISTS idx_questions_bank ON questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_bloom ON questions(bloom_level);

-- 3. Extend exam_topic_rules table
ALTER TABLE exam_topic_rules
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(32) NOT NULL DEFAULT 'ANY' 
    CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD', 'ANY')),
  ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(32) NOT NULL DEFAULT 'ANY' 
    CHECK (bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', 'ANY'));

-- 4. Extend exam_attempts table for Pause / Resume / Terminate lifecycle
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_paused_ms BIGINT NOT NULL DEFAULT 0 CHECK (total_paused_ms >= 0),
  ADD COLUMN IF NOT EXISTS pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS terminated_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE exam_attempts
  DROP CONSTRAINT IF EXISTS exam_attempts_status_check,
  ADD CONSTRAINT exam_attempts_status_check 
    CHECK (status IN ('READY', 'ACTIVE', 'PAUSED', 'SUBMITTED', 'TERMINATED', 'EXPIRED'));

CREATE INDEX IF NOT EXISTS idx_exam_attempts_session_status ON exam_attempts(session_id, status);

-- 5. Create manual_grades table
CREATE TABLE IF NOT EXISTS manual_grades (
  grade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_question_id UUID NOT NULL REFERENCES attempt_questions(attempt_question_id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
  grader_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  points_awarded NUMERIC(6, 2) NOT NULL CHECK (points_awarded >= 0),
  max_points NUMERIC(6, 2) NOT NULL CHECK (max_points > 0),
  rubric_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  feedback TEXT,
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_manual_grades_attempt_question UNIQUE (attempt_question_id)
);

CREATE INDEX IF NOT EXISTS idx_manual_grades_attempt ON manual_grades(attempt_id);
CREATE INDEX IF NOT EXISTS idx_manual_grades_grader ON manual_grades(grader_user_id);

-- 6. Create manual_grade_audits table (Immutable score override history)
CREATE TABLE IF NOT EXISTS manual_grade_audits (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES manual_grades(grade_id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
  grader_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  previous_points NUMERIC(6, 2),
  new_points NUMERIC(6, 2) NOT NULL CHECK (new_points >= 0),
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manual_grade_audits_grade ON manual_grade_audits(grade_id);
CREATE INDEX IF NOT EXISTS idx_manual_grade_audits_attempt ON manual_grade_audits(attempt_id);

-- 7. Create proctor_interventions table
CREATE TABLE IF NOT EXISTS proctor_interventions (
  intervention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(session_id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
  invigilator_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  type VARCHAR(32) NOT NULL 
    CHECK (type IN ('ANNOUNCEMENT', 'WARNING_MESSAGE', 'PAUSE', 'RESUME', 'TERMINATE')),
  message TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proctor_interventions_session_time 
  ON proctor_interventions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proctor_interventions_attempt 
  ON proctor_interventions(attempt_id);

-- 8. Create exam_analytics_cache table
CREATE TABLE IF NOT EXISTS exam_analytics_cache (
  exam_id UUID PRIMARY KEY REFERENCES exams(exam_id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sample_size INT NOT NULL CHECK (sample_size >= 0),
  score_histogram JSONB NOT NULL DEFAULT '[]'::jsonb,
  completion_time_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_metrics JSONB NOT NULL DEFAULT '[]'::jsonb
);
```

---

## 9. Backend Service & Module Changes

```
backend/src/modules/
├── questions/                  # [EXPAND] Question Bank Management
│   ├── questions.controller.js
│   ├── questions.repository.js
│   ├── questions.routes.js
│   ├── questions.schemas.js
│   └── questions.service.js
├── evaluation/                 # [EXPAND] Manual Grading & Subjective Review
│   ├── evaluator.js            # Update for SHORT_ANSWER, ESSAY, CODE
│   ├── manualGrading.controller.js
│   ├── manualGrading.repository.js
│   ├── manualGrading.service.js
│   └── manualGrading.schemas.js
├── exams/                      # [EXPAND] Analytics & Blueprint Engine
│   ├── examAnalytics.service.js
│   └── blueprintValidator.js
└── interventions/              # [NEW] Proctor Live Interventions
    ├── interventions.controller.js
    ├── interventions.repository.js
    ├── interventions.routes.js
    ├── interventions.schemas.js
    ├── interventions.service.js
    └── index.js
```

---

## 10. REST API Changes

### Faculty Question Bank Endpoints (`/api/v1/faculty/question-bank`):
- `GET /api/v1/faculty/question-bank/banks`: List question banks owned or shared with user.
- `POST /api/v1/faculty/question-bank/banks`: Create new question bank (`title`, `description`, `subject_id`, `is_shared`).
- `GET /api/v1/faculty/question-bank/banks/:bankId`: Get bank details and question inventory.
- `GET /api/v1/faculty/question-bank/questions`: Search questions with filters (`topic_id`, `difficulty`, `bloom_level`, `status`, `tag`, `search`).
- `POST /api/v1/faculty/question-bank/questions`: Author question with rich text, LaTeX, code snippet, options, and rubric.
- `PUT /api/v1/faculty/question-bank/questions/:id`: Update question definition (increments version).
- `POST /api/v1/faculty/question-bank/questions/:id/clone`: Clone question into new copy with reset parent linkage.
- `DELETE /api/v1/faculty/question-bank/questions/:id`: Archive question (`status = 'ARCHIVED'`).

### Faculty Manual Grading Endpoints (`/api/v1/results`):
- `GET /api/v1/results/:resultId/evaluation`: Fetch complete evaluated attempt breakdown, candidate submitted subjective answers, question rubrics, and automated score.
- `POST /api/v1/results/:resultId/manual-grade`: Submit manual grading for a question:
  ```json
  {
    "attemptQuestionId": "uuid",
    "pointsAwarded": 4.5,
    "rubricScores": { "accuracy": 3.0, "clarity": 1.5 },
    "feedback": "Clear explanation of acid-base titration curve",
    "rationale": "Awarded partial credit for correct initial equivalence equation"
  }
  ```
- `GET /api/v1/exams/:examId/analytics`: Returns item discrimination ($r_{pbis}$), difficulty index (P-value), score histograms, and completion-time statistics.

### Invigilator Intervention Endpoints:
- `POST /api/v1/sessions/:sessionId/announcements`: Broadcast room alert to all candidates (`message`, `severity`).
- `POST /api/v1/attempts/:attemptId/messages`: Send direct 1:1 message to candidate (`message`, `type: 'WARNING'|'INFO'`).
- `POST /api/v1/attempts/:attemptId/pause`: Pause active attempt (`reason: string`). Freezes timer and locks client.
- `POST /api/v1/attempts/:attemptId/resume`: Resume paused attempt. Re-activates client and extends `expires_at`.
- `POST /api/v1/attempts/:attemptId/terminate`: Emergency terminate attempt (`reason: string` mandatory).

---

## 11. WebSocket Event Changes

Standard event envelopes (`EventEnvelopeSchema`) broadcasted via `RealtimeBroadcaster`:

| Event Name | Room Scope | Direction | Payload Structure | Producer | Consumer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `session:announcement` | `session:<id>:candidate` | Outbound | `{ announcementId, message, severity, timestamp, invigilatorName }` | Intervention Service | All Candidates in Session |
| `candidate:message` | `attempt:<id>` | Outbound | `{ messageId, message, type, timestamp, invigilatorName }` | Intervention Service | Candidate Client |
| `candidate:paused` | `attempt:<id>` | Outbound | `{ attemptId, reason, pausedAt, instructions }` | Intervention Service | Candidate Client |
| `candidate:resumed` | `attempt:<id>` | Outbound | `{ attemptId, resumedAt, newExpiresAt, totalPausedMs }` | Intervention Service | Candidate Client |
| `candidate:terminated` | `attempt:<id>` | Outbound | `{ attemptId, reason, terminatedAt }` | Intervention Service | Candidate Client |
| `invigilator:intervention_logged` | `session:<id>` | Outbound | `{ interventionId, type, attemptId, studentId, invigilatorId, timestamp }` | Intervention Service | Invigilator Console |

---

## 12. WebRTC / SFU Integration Changes

Reusing the Phase 17 mediasoup infrastructure:
1. **12-Stream Video Grid**: Muted-by-default audio policy prevents feedback loops. Video streams subscribe at spatial layer 0 or 1 (low/medium resolution, $\approx 150\text{ kbps}$) to conserve bandwidth across 12 concurrent feeds.
2. **Candidate Detail Drawer**: Switching to focused candidate automatically requests spatial layer 2 (high resolution, $720\text{p}$) via `media:consumer_set_layers` and unmutes solo listening for that stream.
3. **Disconnection Handling**: WebRTC ICE disconnects trigger immediate `candidate:presence_changed` status update in the grid with a yellow reconnecting badge.

---

## 13. Frontend Changes

### New Pages:
- `frontend/src/pages/faculty/QuestionBankPage.jsx`: Question bank manager, search, filtering by difficulty/Bloom, formula preview, cloning.
- `frontend/src/pages/faculty/ManualGradingPage.jsx`: Subjective manual grading workspace with side-by-side answer display, rubric scoring, and feedback.

### Enhanced Pages:
- `frontend/src/pages/faculty/ExamEditorPage.jsx`: Topic rule builder with difficulty and Bloom taxonomy constraints and blueprint validation calculator.
- `frontend/src/pages/faculty/FacultyResultsPage.jsx`: Analytics tab with score distribution histograms, completion-time stats, and question discrimination table.
- `frontend/src/pages/invigilator/SessionMonitorPage.jsx`: Integrated Candidate Detail Drawer, Intervention Modals, Evidence Snapshot Inspection Modal, and session conclusion workflow.
- `frontend/src/pages/candidate/ExamTakingPage.jsx`: Real-time listeners for `candidate:paused`, `candidate:resumed`, `candidate:terminated`, `candidate:message`, and `session:announcement`.

### New Components:
- `frontend/src/components/faculty/RichQuestionEditor.jsx`: Rich-text editor with MathJax preview and code block styling.
- `frontend/src/components/faculty/RubricScorer.jsx`: Interactive rubric scoring widget with criteria sliders and rationale text area.
- `frontend/src/components/faculty/ItemAnalyticsTable.jsx`: Question performance table showing discrimination index and P-values.
- `frontend/src/components/invigilator/CandidateDetailDrawer.jsx`: High-res stream, VU meter, violation timeline, and quick intervention buttons.
- `frontend/src/components/invigilator/InterventionModals.jsx`: Modals for Warning, Broadcast Announcement, Pause, Resume, and Terminate.
- `frontend/src/components/invigilator/EvidenceInspectionModal.jsx`: Modal for previewing S3 snapshots with presigned URLs.
- `frontend/src/components/exam/CandidatePauseModal.jsx`: Non-dismissible full-screen overlay for paused candidates.
- `frontend/src/components/exam/CandidateTerminatedModal.jsx`: Modal notifying student of termination with reason and exit action.

---

## 14. Faculty Workflows

```
FACULTY WORKFLOW LIFECYCLE:
1. QUESTION AUTHORING:
   Create Bank -> Author Questions (Rich text / MathJax / Code) -> Set Difficulty & Bloom -> Set Rubrics -> Publish.
2. BLUEPRINT COMPOSITION:
   Create Blueprint -> Define Topic Rules (Counts, Difficulty, Bloom) -> Validate Blueprint Sufficiency -> Publish Exam.
3. SESSION SCHEDULING:
   Create Session -> Select Room (Capacity Check) -> Assign Roster -> Assign Invigilators.
4. MANUAL EVALUATION:
   Exam Concludes -> Open Manual Grading Workspace -> Review Subjective Submissions -> Apply Rubric -> Input Rationale -> Recalculate Results.
5. ANALYTICS & PUBLICATION:
   Inspect Item Discrimination & Histograms -> Trigger Results Publication (or let Scheduled/Immediate take effect).
```

---

## 15. Invigilator Workflows

```
INVIGILATOR LIVE WORKSTATION WORKFLOW:
1. SESSION ENTRY:
   Login -> Invigilator Dashboard -> Select Assigned Session -> Enter Session Monitor Console.
2. LIVE SUPERVISION:
   12-Stream Video Grid (Muted Audio) -> Observe Stream Health & Risk Badges -> Filter by High Risk.
3. CANDIDATE INSPECTION:
   Click Candidate Card -> Slide Open Candidate Detail Drawer -> High-Res Feed & Solo Audio -> Review Violation Timeline & Evidence Snapshots.
4. REAL-TIME INTERVENTION:
   - Suspicious noise -> Send 1:1 Warning Message.
   - Room disturbance -> Broadcast Session Announcement.
   - Hardware / Identity Check -> Remote Pause (Candidate Timer Freezes).
   - Identity Resolved -> Remote Resume (Candidate Timer Extended).
   - Egregious Cheating -> Emergency Terminate Attempt (Mandatory Rationale Recorded).
5. POST-SESSION SIGN-OFF:
   All Submissions Received -> Conclude Session -> Review Session Incident Summary -> Submit Sign-Off.
```

---

## 16. Candidate Intervention Workflows

```
CANDIDATE CLIENT INTERVENTION HANDLING:
1. WARNING RECEIVED:
   WebSocket receives 'candidate:message' -> Non-intrusive warning toast with acknowledge button -> Logged locally.
2. ATTEMPT PAUSED:
   WebSocket receives 'candidate:paused' -> Timer freezes immediately -> Input fields disabled -> Fullscreen CandidatePauseModal locks UI -> Autosave dirty buffer flushed.
3. ATTEMPT RESUMED:
   WebSocket receives 'candidate:resumed' -> CandidatePauseModal dismissed -> Timer updated with extended expires_at -> Inputs re-enabled.
4. ATTEMPT TERMINATED:
   WebSocket receives 'candidate:terminated' -> All exam inputs permanently locked -> Autosave terminated -> Fullscreen CandidateTerminatedModal displays documented reason -> Redirect to candidate dashboard after 10s.
```

---

## 17. Authorization & RBAC Matrix

| Endpoint / Action | STUDENT | FACULTY | INVIGILATOR | ADMIN | DEVELOPER |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Author / Edit Questions in Bank | Denied | **Allowed** (Own Bank) | Denied | **Allowed** | Denied |
| Compose & Publish Exam Blueprint | Denied | **Allowed** (Own Exam) | Denied | **Allowed** | Denied |
| Schedule Session & Assign Proctors | Denied | **Allowed** (Own Exam) | Denied | **Allowed** | Denied |
| Manual Subjective Grading & Overrides | Denied | **Allowed** (Own Exam) | Denied | **Allowed** | Denied |
| View Exam Item Analytics | Denied | **Allowed** (Own Exam) | Denied | **Allowed** | Denied |
| Subscribe to Invigilator Room (`session:<id>`) | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Consume Video Streams in SFU | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Broadcast Room Announcement | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Send 1:1 Warning Message | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Remote Pause / Resume Attempt | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Emergency Terminate Attempt | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |
| Inspect S3 Evidence Snapshots | Denied | **Allowed** (Own Exam) | **Allowed** (Assigned) | **Allowed** | Denied |

---

## 18. State-Machine Definitions

### Attempt Lifecycle (Updated with Pause):
- **States**: `READY`, `ACTIVE`, `PAUSED`, `SUBMITTED`, `TERMINATED`, `EXPIRED`.
- **Allowed Transitions**:
  - `READY` $\to$ `ACTIVE` (Candidate begins exam).
  - `ACTIVE` $\to$ `PAUSED` (Invigilator pauses attempt).
  - `PAUSED` $\to$ `ACTIVE` (Invigilator resumes attempt).
  - `PAUSED` $\to$ `TERMINATED` (Invigilator terminates attempt).
  - `ACTIVE` $\to$ `SUBMITTED` (Candidate submits exam).
  - `ACTIVE` $\to$ `TERMINATED` (Invigilator terminates attempt).
  - `ACTIVE` $\to$ `EXPIRED` (Timer expires without submission).
  - `PAUSED` $\to$ `EXPIRED` (Session reaches absolute cutoff limit).

### Manual Grading Lifecycle:
- **States**: `PENDING_GRADING`, `GRADED`, `OVERRIDDEN`.
- **Transitions**:
  - `PENDING_GRADING` $\to$ `GRADED` (First subjective score submission with rubric and rationale).
  - `GRADED` $\to$ `OVERRIDDEN` (Subsequent score adjustment recording previous points, new points, and rationale in `manual_grade_audits`).

---

## 19. Concurrency & Race-Condition Strategy

1. **Pause vs. Submit Race**: If candidate clicks submit simultaneously with an invigilator pause command:
   - Database update uses Optimistic Concurrency Control: `UPDATE exam_attempts SET status = 'PAUSED' WHERE attempt_id = $1 AND status = 'ACTIVE'`.
   - If submission committed first (`status = 'SUBMITTED'`), pause command fails with `409 Conflict` (`ATTEMPT_ALREADY_SUBMITTED`).
   - If pause committed first, submission fails with `409 Conflict` (`ATTEMPT_IS_PAUSED`).
2. **Resume Timer Calculation**: When an attempt is resumed:
   $$\Delta t = \text{now}() - \text{paused\_at}$$
   $$\text{expires\_at} = \text{expires\_at} + \Delta t$$
   $$\text{total\_paused\_ms} = \text{total\_paused\_ms} + \Delta t$$
   Executed atomically in PostgreSQL:
   ```sql
   UPDATE exam_attempts
   SET status = 'ACTIVE',
       expires_at = expires_at + (CURRENT_TIMESTAMP - paused_at),
       total_paused_ms = total_paused_ms + EXTRACT(MILLISECONDS FROM (CURRENT_TIMESTAMP - paused_at)),
       paused_at = NULL
   WHERE attempt_id = $1 AND status = 'PAUSED';
   ```
3. **Concurrent Faculty Grading**: Score overrides lock the row using `SELECT ... FOR UPDATE` within the transaction, ensuring atomic updates to `manual_grades`, `manual_grade_audits`, and `results`.

---

## 20. Idempotency Strategy

- **Intervention Idempotency**: All intervention endpoints (`/pause`, `/resume`, `/terminate`, `/messages`, `/announcements`) require an `Idempotency-Key` header. Duplicate requests within 60 seconds return the cached result without duplicate WebSocket events or duplicate audit entries.
- **WebSocket Message Delivery**: Real-time event envelopes include a unique `eventId` (UUID). Clients deduplicate received events using a sliding window of recent event IDs.

---

## 21. Audit & Observability Requirements

Every intervention and score override records an immutable row in `audit_logs` and domain-specific audit tables:
- `FACULTY_QUESTION_CREATED` / `FACULTY_QUESTION_UPDATED` / `FACULTY_QUESTION_CLONED`
- `EXAM_BLUEPRINT_VALIDATED` / `EXAM_PUBLISHED`
- `PROCTOR_ROOM_ANNOUNCEMENT_BROADCAST`
- `PROCTOR_DIRECT_MESSAGE_SENT`
- `PROCTOR_ATTEMPT_PAUSED` / `PROCTOR_ATTEMPT_RESUMED`
- `PROCTOR_ATTEMPT_TERMINATED`
- `MANUAL_SCORE_OVERRIDDEN` (in `manual_grade_audits`)
- `EVIDENCE_SNAPSHOT_VIEWED`

---

## 22. Security & Privacy Requirements

1. **Strict BOLA Protection**: Invigilator endpoints strictly check `session_invigilators` to prevent unauthorized cross-session intervention. Faculty endpoints check `exams.created_by`.
2. **PII Redaction**: Application logs never write candidate subjective answers, proctor messages, or facial embeddings.
3. **Presigned URL Expiry**: Evidence snapshot URLs generated for the Invigilator Evidence Inspection Modal have a maximum TTL of 300 seconds.

---

## 23. Performance Considerations

- **SFU Ingress & Egress**: 12-grid consumes $\le 1.8\text{ Mbps}$ total per invigilator by utilizing simulcast layer 0/1. High-resolution layer 2 is requested only when a candidate is opened in the Candidate Detail Drawer.
- **Analytics Caching**: Exam analytics computations are cached in `exam_analytics_cache`. Cached records are invalidated only when a manual grade is modified or when results are re-evaluated.

---

## 24. Failure & Recovery Behavior

- **Candidate Disconnect during Pause**: If a candidate refreshes or disconnects while paused, their attempt status remains `PAUSED` in PostgreSQL. Upon reconnecting, `GET /api/v1/sessions/:id/my-attempt` returns `status: 'PAUSED'`, immediately re-opening the `CandidatePauseModal`.
- **WebSocket Fallback**: If WebSocket connection drops, candidate client polls `GET /api/v1/sessions/:id/my-attempt` every 10 seconds to detect pause or termination states.

---

## 25. Tiered Test Strategy (Levels 1–5)

To prevent redundant test overhead while guaranteeing zero quality degradation, testing is strictly tiered:

- **LEVEL 1: Fast Static & Syntax Checks**:
  - `npm run lint` (ESLint on backend and frontend).
  - Schema validation unit tests (`zod` schema unit tests for question bank, grading, and interventions).
- **LEVEL 2: Targeted Workstream Tests**:
  - Question bank CRUD unit tests (`backend/tests/phase26/questionBank.test.js`).
  - Evaluator subjective question unit tests (`backend/tests/phase26/subjectiveEvaluator.test.js`).
  - Item analytics formula calculation tests ($r_{pbis}$, P-value).
  - Candidate intervention modal component tests (`frontend/src/test/phase26/InterventionModals.test.jsx`).
- **LEVEL 3: Subsystem Integration & DB Tests**:
  - Database migration 021 rollback and migration integrity tests.
  - Manual grading API and score audit trail tests (`backend/tests/phase26/manualGrading.test.js`).
  - Blueprint rule validation against question inventories.
  - Multi-room session scheduling capacity & conflict tests.
- **LEVEL 4: Cross-Module & Real-Time Integration Tests**:
  - Real-time pause/resume WebSocket propagation and timer freeze tests (`backend/tests/phase26/realtimeInterventions.test.js`).
  - Pause vs. Submit race condition tests.
  - BOLA authorization tests (unassigned proctor intervention rejection).
  - Evidence snapshot presigned URL generation and access tests.
- **LEVEL 5: Phase Completion Regression Gate**:
  - Full backend test suite execution (`npm test`).
  - Frontend Vitest execution (`npm test`).
  - Playwright E2E journey for Faculty authoring & manual grading.
  - Playwright E2E journey for Invigilator 12-grid monitoring & intervention issuance.

---

## 26. Data Migration & Backward Compatibility Strategy

- Existing questions with `MCQ`, `TRUE_FALSE`, or `NUMERIC` remain unaffected; defaults for `difficulty` (`MEDIUM`) and `bloom_level` (`REMEMBER`) are applied automatically via `DEFAULT` column constraints.
- Existing exams and sessions remain fully compatible. The new `PAUSED` attempt status is backward-compatible with all existing terminal checks.

---

## 27. Deployment Considerations

- Database migration 021 adds nullable columns and non-blocking indexes (`CREATE INDEX IF NOT EXISTS`).
- Zero downtime required; backend modular monolith handles new endpoints immediately upon process boot.

---

## 28. Documentation Updates

- Update `docs/DEVELOPMENT_PLAN.md` marking Phase 26 as active.
- Generate Phase 26 walkthrough upon completion (`docs/PHASE_26_WALKTHROUGH.md`).

---

## 29. Workstream Decomposition

### TRACK 1 — FACULTY ACADEMIC DOMAIN
- **Workstream A: Reusable Question Bank & Rich Question Authoring**:
  - Migration 021 tables `question_banks`, enhanced `questions`.
  - Question bank service, repository, and controller (`/api/v1/faculty/question-bank`).
  - Frontend `QuestionBankPage.jsx` and `RichQuestionEditor.jsx`.
- **Workstream B: Blueprint Engine & Scheduling**:
  - Enhanced `exam_topic_rules` (difficulty/Bloom constraints).
  - Blueprint validation logic in `exams.service.js`.
  - Frontend `ExamEditorPage.jsx` and `SessionManagerPage.jsx` updates.
- **Workstream C: Assessment Oversight & Manual Grading**:
  - Migration 021 tables `manual_grades` and `manual_grade_audits`.
  - Updating `evaluator.js` for subjective question types.
  - Manual grading service, controller, and routes (`/api/v1/results/:id/manual-grade`).
  - Frontend `ManualGradingPage.jsx` and `RubricScorer.jsx`.
- **Workstream D: Exam Analytics & Grade Distribution**:
  - Analytics calculation service for item discrimination ($r_{pbis}$) and P-values.
  - Migration 021 table `exam_analytics_cache`.
  - Endpoint `GET /api/v1/exams/:id/analytics`.
  - Frontend `FacultyResultsPage.jsx` analytics tab and histogram charts.

### TRACK 2 — INVIGILATION LIVE DOMAIN
- **Workstream E: Invigilator Workstation & 12-Stream Video Grid**:
  - Enhancing `SessionMonitorPage.jsx` with paginated 12-stream grid controls.
  - Implementing `CandidateDetailDrawer.jsx` with high-res feed, VU meter, and violation timeline.
  - Simulcast layer controls (layer 0/1 for grid, layer 2 for focused candidate).
- **Workstream F: Real-Time Intervention Engine**:
  - Migration 021 table `proctor_interventions`.
  - Interventions service, controller, and routes (`/announcements`, `/messages`, `/pause`, `/resume`, `/terminate`).
  - WebSocket event emitters for real-time distribution.
  - BOLA authorization checks in `authorizeIntervention`.
- **Workstream G: Candidate Intervention UX & State Handling**:
  - Updating `ExamTakingPage.jsx` with WebSocket event handlers for pause, resume, message, and termination.
  - Implementing `CandidatePauseModal.jsx` (timer freeze and lock overlay).
  - Implementing `CandidateTerminatedModal.jsx` and warning toast display.
- **Workstream H: Evidence Inspection, Audit & Test Regimen**:
  - Implementing `EvidenceInspectionModal.jsx` with presigned S3 URLs.
  - Session conclusion workflow and post-session incident summary reporting.
  - Level 1–5 tiered automated test suite implementation and execution.

---

## 30. Dependency Graph

The following SVG diagram models the logical progression and parallelization across Track 1 and Track 2:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 480" width="100%" height="100%">
  <defs>
    <style>
      .bg { fill: #0f172a; }
      .box { fill: #1e293b; stroke: #3b82f6; stroke-width: 2; rx: 6; }
      .box-track1 { fill: #1e293b; stroke: #10b981; stroke-width: 2; rx: 6; }
      .box-track2 { fill: #1e293b; stroke: #8b5cf6; stroke-width: 2; rx: 6; }
      .box-final { fill: #1e293b; stroke: #f59e0b; stroke-width: 2; rx: 6; }
      .title { fill: #f8fafc; font-family: sans-serif; font-size: 14px; font-weight: bold; }
      .text { fill: #94a3b8; font-family: sans-serif; font-size: 12px; }
      .line { stroke: #64748b; stroke-width: 2; marker-end: url(#arrow); }
      .track-header { fill: #38bdf8; font-family: sans-serif; font-size: 16px; font-weight: bold; }
    </style>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
    </marker>
  </defs>

  <rect width="900" height="480" class="bg" />

  <!-- Base -->
  <rect x="50" y="210" width="180" height="60" class="box" />
  <text x="70" y="235" class="title">Phase 25 Merged</text>
  <text x="70" y="255" class="text">Auth, Identity, SFU, DB</text>

  <!-- Track 1: Faculty -->
  <text x="310" y="50" class="track-header">Track 1: Faculty Academic Domain</text>
  
  <rect x="300" y="70" width="220" height="60" class="box-track1" />
  <text x="315" y="95" class="title">Workstream A: Question Bank</text>
  <text x="315" y="115" class="text">Rich Editor, Taxonomy, Cloning</text>

  <rect x="580" y="70" width="220" height="60" class="box-track1" />
  <text x="595" y="95" class="title">Workstream B: Blueprints</text>
  <text x="595" y="115" class="text">Validation, Multi-Room Sched</text>

  <rect x="300" y="150" width="220" height="60" class="box-track1" />
  <text x="315" y="175" class="title">Workstream C: Manual Grading</text>
  <text x="315" y="195" class="text">Subjective Rubrics & Audits</text>

  <rect x="580" y="150" width="220" height="60" class="box-track1" />
  <text x="595" y="175" class="title">Workstream D: Analytics</text>
  <text x="595" y="195" class="text">Discrimination & Histograms</text>

  <!-- Track 2: Invigilation -->
  <text x="310" y="260" class="track-header">Track 2: Invigilation Live Domain</text>

  <rect x="300" y="280" width="220" height="60" class="box-track2" />
  <text x="315" y="305" class="title">Workstream E: Video Grid</text>
  <text x="315" y="325" class="text">12-Stream Grid, Detail Drawer</text>

  <rect x="580" y="280" width="220" height="60" class="box-track2" />
  <text x="595" y="305" class="title">Workstream F: Interventions</text>
  <text x="595" y="325" class="text">Warn, Pause, Resume, Terminate</text>

  <rect x="300" y="360" width="220" height="60" class="box-track2" />
  <text x="315" y="385" class="title">Workstream G: Candidate UX</text>
  <text x="315" y="405" class="text">Pause Overlays & Timer Freeze</text>

  <rect x="580" y="360" width="220" height="60" class="box-track2" />
  <text x="595" y="385" class="title">Workstream H: Evidence & Tests</text>
  <text x="595" y="405" class="text">S3 Preview & Tiered Regressions</text>

  <!-- Connectors -->
  <line x1="230" y1="230" x2="290" y2="100" class="line" />
  <line x1="230" y1="250" x2="290" y2="310" class="line" />
  <line x1="520" y1="100" x2="570" y2="100" class="line" />
  <line x1="520" y1="180" x2="570" y2="180" class="line" />
  <line x1="520" y1="310" x2="570" y2="310" class="line" />
  <line x1="520" y1="390" x2="570" y2="390" class="line" />
</svg>
```

---

## 31. Safe Parallelization Opportunities

Consolidation enables high-velocity parallel development across two independent tracks:
1. **Track 1 (Faculty Academic Domain)**: Workstreams A, B, C, and D touch the academic question authoring, blueprinting, manual grading, and analytics modules. They have zero direct runtime dependencies on live WebRTC or proctoring interventions.
2. **Track 2 (Invigilation Live Domain)**: Workstreams E, F, G, and H touch the real-time WebSocket intervention dispatcher, SFU video matrix, candidate pause/terminate overlays, and evidence modals.
3. **Merge Boundaries**: Both tracks converge at Migration 021 and the Level 5 Phase Completion Regression Gate.

---

## 32. Phase Completion Criteria

Phase 26 is considered **COMPLETE** when:
1. [ ] Migration 021 applies and rolls back cleanly without data loss.
2. [ ] Faculty can author, tag, clone, and manage reusable questions with rich LaTeX and code blocks.
3. [ ] Blueprints validate topic, difficulty, and Bloom taxonomy rules before publishing.
4. [ ] Faculty can schedule multi-room exam sessions with capacity and assignment checks.
5. [ ] Instructors can evaluate subjective submissions in the Manual Grading Workspace with rubrics, and score overrides record an immutable audit trail.
6. [ ] Item discrimination index ($r_{pbis}$), P-values, histograms, and completion-time metrics calculate accurately.
7. [ ] Results release policies (`IMMEDIATE`, `SCHEDULED`, `MANUAL`) prevent premature scorecard leaks.
8. [ ] Invigilators can monitor 12 candidate WebRTC streams simultaneously with audio meters and simulcast controls.
9. [ ] Candidate Detail Drawer displays high-resolution live video, violation timeline, and risk score.
10. [ ] Invigilators can broadcast room announcements and send 1:1 messages over WebSocket.
11. [ ] Invigilators can pause attempts (freezing student timer and input) and resume attempts (extending duration).
12. [ ] Invigilators can emergency-terminate attempts with mandatory documented reasons.
13. [ ] Candidate workspace immediately responds to pause, resume, warning, and termination events without client bypass.
14. [ ] Invigilators can view high-res S3 evidence snapshots via secure presigned URLs.
15. [ ] 100% of Level 1–5 tests pass with green status.

---

## 33. Risks and Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Simultaneous Pause & Submit** | Candidate submits at the exact second proctor clicks pause. | Optimistic Concurrency Control on `exam_attempts.status`. The first committed state wins; the second receives a clean 409 Conflict with descriptive code. |
| **Timer Drift on Resume** | Extended pause causes clock skew or lost student time. | Server atomically recalculates `expires_at = expires_at + (now - paused_at)` in PostgreSQL. Candidate client syncs with server timestamp. |
| **Network Loss during Pause** | Candidate loses internet while paused and misses resume event. | Client polling fallback (`GET /api/v1/sessions/:id/my-attempt` every 10s) immediately detects when attempt status changes to `ACTIVE`. |
| **BOLA on Interventions** | Malicious proctor attempts to pause another room's candidate. | Server-side `authorizeIntervention` verifies that `session_invigilators` explicitly includes the caller's `user_id`. |
| **12-Stream Bandwidth Saturation** | 12 high-res video streams overwhelm invigilator connection. | Simulcast defaults to low resolution (spatial layer 0) in the grid; full $720\text{p}$ is requested only upon opening the Candidate Detail Drawer. |

---

## 34. Explicit Non-Scope

The following items are deferred to future consolidated phases:
- **Phase 27**: Developer telemetry portal (6 screens) and WireGuard management plane (`10.100.0.0/24`).
- **Phase 28**: Comprehensive WCAG 2.1 AA accessibility remediation, cross-role design normalization, and continuous client-side Web Worker AI models (gaze, multi-face, voice).
- **Phase 29**: Multi-AZ RDS/ElastiCache managed migrations, SFU clustering, OWASP ASVS Level 2 penetration testing, OpenAPI 3.1, and final release handover.

---

## 35. Files & Modules Expected to Change

### Backend:
- `backend/migrations/021_phase26_examination_and_invigilation.js` [NEW]
- `backend/src/domain/question/questionTypes.js` [MODIFY]
- `backend/src/domain/attempt/attemptStates.js` [MODIFY]
- `backend/src/domain/attempt/attemptStateMachine.js` [MODIFY]
- `backend/src/modules/questions/*` [NEW / EXPAND]
- `backend/src/modules/evaluation/evaluator.js` [MODIFY]
- `backend/src/modules/evaluation/manualGrading.*` [NEW]
- `backend/src/modules/exams/examAnalytics.service.js` [NEW]
- `backend/src/modules/interventions/*` [NEW]
- `backend/src/infrastructure/realtime/websocketServer.js` [MODIFY]
- `backend/src/infrastructure/realtime/realtimeBroadcaster.js` [MODIFY]
- `backend/src/routes/index.js` [MODIFY]

### Frontend:
- `frontend/src/App.jsx` [MODIFY]
- `frontend/src/pages/faculty/QuestionBankPage.jsx` [NEW]
- `frontend/src/pages/faculty/ManualGradingPage.jsx` [NEW]
- `frontend/src/pages/faculty/ExamEditorPage.jsx` [MODIFY]
- `frontend/src/pages/faculty/FacultyResultsPage.jsx` [MODIFY]
- `frontend/src/pages/invigilator/SessionMonitorPage.jsx` [MODIFY]
- `frontend/src/pages/candidate/ExamTakingPage.jsx` [MODIFY]
- `frontend/src/components/faculty/RichQuestionEditor.jsx` [NEW]
- `frontend/src/components/faculty/RubricScorer.jsx` [NEW]
- `frontend/src/components/invigilator/CandidateDetailDrawer.jsx` [NEW]
- `frontend/src/components/invigilator/InterventionModals.jsx` [NEW]
- `frontend/src/components/invigilator/EvidenceInspectionModal.jsx` [NEW]
- `frontend/src/components/exam/CandidatePauseModal.jsx` [NEW]
- `frontend/src/components/exam/CandidateTerminatedModal.jsx` [NEW]

---

## 36. Commit & PR Strategy

Following repository governance:
1. **Plan Review & Approval**: This plan must be approved before any code is authored.
2. **Implementation Branch**: `feature/phase-26-examination-and-invigilation` cut from clean `main`.
3. **Internal Workstream Milestones**:
   - Milestone 1: Migration 021 & Track 1 Backend (Question Bank, Manual Grading, Analytics).
   - Milestone 2: Track 1 Frontend (Question Bank UI, Manual Grading UI, Analytics Tabs).
   - Milestone 3: Track 2 Backend (Interventions Service, WebSocket Events).
   - Milestone 4: Track 2 Frontend (12-Stream Grid, Detail Drawer, Intervention Modals, Candidate UX).
   - Milestone 5: Tiered Test Regimen (Levels 1–5), Verification Artifacts & Walkthrough.
4. **Pull Request**: Comprehensive PR with atomic commits, zero broken intermediate states, and 100% green tests.
