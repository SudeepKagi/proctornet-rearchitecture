# ProctorNet Frontend (React Single Page Application)

Production-grade, accessible, and resilient client frontend for the **ProctorNet Online Examination System**.

---

## 1. Tooling & Architecture Baseline

- **Framework**: React 19 (SPA)
- **Language Baseline**: JavaScript (ES Modules / JSX) — *Strict TypeScript exclusion per project guidelines*
- **Bundler & Dev Server**: Vite 6
- **Routing**: React Router DOM v7
- **Styling**: Vanilla CSS Tokens & Utilities (Light/Dark design system with zero external CSS dependencies)
- **State Architecture**: React Context (`AuthContext`, `RealtimeContext`) + Domain Hooks (`useExamTimer`, `useAutosave`, `useNetworkStatus`, `useRealtime`, `useMediaSubscription`)
- **UI State Standardization**: Standardized asynchronous states across all data views using `StateBoundary` (unified loading skeleton, error with retry, and empty state fallbacks).
- **Security Boundary**: In-memory JWT access token; HttpOnly cookie refresh token rotation; strict restriction of `localStorage` to UI preferences (`theme` only).

---

## 2. Directory Structure

```text
frontend/
├── index.html                   # SPA root document with Inter, Plus Jakarta Sans & JetBrains Mono fonts
├── package.json                 # Project manifest, scripts, and dependencies
├── vite.config.js               # Vite config with React plugin, API proxy, and Vitest jsdom setup
├── vitest.config.js             # Vitest test configuration with JSDOM environment
├── src/
│   ├── main.jsx                 # Application entry point with BrowserRouter & AuthProvider
│   ├── App.jsx                  # Central route switchboard with role guards & layout containers
│   ├── api/                     # Type-safe Fetch API client modules
│   │   ├── client.js            # Central Fetch wrapper with in-memory token & 401 refresh interceptor
│   │   ├── authApi.js           # Login, logout, silent token refresh, getMe
│   │   ├── examsApi.js          # Exam CRUD, blueprint publishing
│   │   ├── sessionsApi.js       # Sessions, rooms, rosters, invigilators
│   │   ├── attemptsApi.js       # Attempt start, questions fetch, idempotent submission
│   │   ├── answersApi.js        # Autosave, batch sync, answer clearing
│   │   ├── adminUsersApi.js     # User management, bulk CSV/XLSX import, verification queue, audit logs
│   │   ├── developerApi.js      # Subsystem health matrix, log buffer inspection, topology, incidents
│   │   ├── candidateIdentityApi.js # Document upload, biometric face enrollment
│   │   └── resultsApi.js        # Candidate results, faculty summaries, manual grade publishing
│   ├── context/                 # AuthContext and Realtime WebSocket context
│   ├── hooks/                   # Domain hooks (useAutosave, useExamTimer, useRealtime, useMediaCapture)
│   ├── routes/                  # ProtectedRoute, RoleRoute, VerifiedRoute guards
│   ├── components/
│   │   ├── common/              # StateBoundary, Button, Input, Card, Badge, Modal, OfflineBanner
│   │   ├── layout/              # AppLayout, DeveloperLayout, PublicLayout shells
│   │   ├── exam/                # QuestionRenderer, QuestionNavigator, TimerDisplay, AutosaveIndicator
│   │   ├── invigilator/         # CandidateDetailDrawer, EvidenceModal, InterventionModals, SessionSignOff
│   │   └── media/               # CandidateMediaGrid (12-stream SFU WebRTC), VideoPlayer
│   └── pages/
│       ├── auth/                # LoginPage, RegisterPage (institutional notice)
│       ├── onboarding/          # Student/Faculty onboarding, VerificationPending, VerificationRejected
│       ├── candidate/           # CandidateDashboard, PreExamReadiness, ExamTaking, CandidateResult
│       ├── faculty/             # FacultyDashboard, ExamEditor, SessionManager, QuestionBank, ManualGrading
│       ├── invigilator/         # InvigilatorDashboard, SessionMonitor (12-stream SFU grid & interventions)
│       ├── admin/               # AdminOverview, UserManagement, BulkImport, AdminVerification, AdminAudit
│       ├── developer/           # DeveloperOverview, DeveloperHealth, DeveloperLogs, DeveloperTopology, DeveloperIncidents
│       └── public/              # LandingPage, AboutPage, ContactPage, Terms, Privacy
```

---

## 3. Persona Portals & Workflows

### Candidate Portal (`/candidate`)
1. **Readiness & Onboarding**: Biometric face enrollment, identity card verification, environment compatibility check.
2. **Distraction-Free Exam Interface**:
   - Header with visual tabular countdown timer calibrated against server drift: $\Delta = \text{server\_time} - \text{Date.now}()$.
   - 1,000ms debounced autosave with Optimistic Concurrency Control (OCC) tracking monotonic `revision_id`.
   - In-memory offline buffer: Displays floating banner when disconnected; flushes safely upon reconnection.
   - Idempotent final submission sending mandatory `Idempotency-Key` header with automatic replay protection.
3. **Scorecard & Results**: Instant or policy-governed result access without question pool leakage.

### Faculty Console (`/faculty`)
1. **Curriculum & Questions**: Subject taxonomy, question pools with options and difficulty scoring.
2. **Exam Blueprint Authoring**: Configure duration, passing marks, and question composition.
3. **Session Scheduling & Rostering**: Schedule rooms, canonical department enrollment, and invigilator assignment.
4. **Subjective Grading & Results**: Manual grading queue for open-ended questions, release policy configuration (`IMMEDIATE`, `SCHEDULED`, `MANUAL`).

### Invigilator Matrix (`/invigilator`)
1. **Assigned Proctoring Dashboard**: View assigned proctoring rooms and active examination sessions.
2. **Live Session Monitor**:
   - 12-stream SFU multi-party candidate video grid via `mediasoup`.
   - Real-time candidate anomaly scoring and risk flags.
   - Authoritative intervention triggers: Warning broadcast, pause candidate attempt, resume, or terminate.
   - Formal session sign-off and incident log reporting.

### Administrator Console (`/admin`)
1. **Institutional Governance**: Overview metrics, department configuration, and organization settings.
2. **User Management & Bulk Ingestion**: Individual user creation and batch spreadsheet ingestion (`.xlsx`, `.csv`) with pre-commit validation and credentials manifest export.
3. **Verification Queue**: Review, approve, or reject candidate and faculty onboarding submissions with review notes.
4. **Immutable Audit Trail**: Append-only administrative mutation logs protected by database triggers.

### Developer Operations Portal (`/developer`)
1. **Operations Overview**: High-level system telemetry, health summary, and quick operational status.
2. **13-Subsystem Health Matrix**: Real-time health probes, latencies, and diagnostics across backend, database, cache, message broker, SFU, and background workers.
3. **Masked System Logs**: High-throughput circular ring buffer viewer with source-level PII redaction and W3C trace correlation.
4. **Interactive Topology**: Live SVG infrastructure service mesh with health overlays.
5. **Incident Triage**: Operational service degradation alerts with Acknowledge and Resolve workflows.

---

## 4. Development & Testing Commands

```bash
# Install frontend dependencies
npm --prefix frontend install

# Run local development dev server (Vite with /api proxy to http://localhost:3000)
npm --prefix frontend run dev

# Run automated test suite (Vitest + React Testing Library)
npm --prefix frontend test

# Run tests in watch mode
npm --prefix frontend run test:watch

# Compile production bundle
npm --prefix frontend run build

# Preview production build locally
npm --prefix frontend run preview
```

---

## 5. Automated Testing Suite

The frontend test suite is powered by **Vitest** with JSDOM and `@testing-library/react`:

```bash
npm test
```

### Test Coverage Highlights:
- **`useAutosave.test.jsx`**: Validates optimistic concurrency revision tracking, dirty state management, 409 conflict reconciliation, and offline localStorage crash recovery.
- **`StateBoundary.test.jsx`**: Validates unified asynchronous UI state rendering—loading skeleton, error message with retry trigger, and empty state presentation.
