# ProctorNet Frontend (React Single Page Application)

Production-grade, accessible, and resilient client frontend for the **ProctorNet Online Examination System**, implemented in **Phase 10 — Frontend**.

---

## 1. Tooling & Architecture Baseline

- **Framework**: React 19 (SPA)
- **Language Baseline**: JavaScript (ES Modules / JSX) — *Strict TypeScript exclusion per project guidelines*
- **Bundler & Dev Server**: Vite 6
- **Routing**: React Router DOM v7
- **Styling**: Vanilla CSS + CSS Custom Properties (Light-First Design Tokens)
- **State Architecture**: React Context (`AuthContext`) + Domain Hooks (`useExamTimer`, `useAutosave`, `useNetworkStatus`, `useAuth`)
- **Testing Harness**: Vitest + React Testing Library + `@testing-library/jest-dom` + `jsdom`
- **Security Boundary**: In-memory JWT access token; HttpOnly cookie refresh token rotation; strict restriction of `localStorage` to UI preferences (`theme` only).

---

## 2. Directory Structure

```text
frontend/
├── index.html                   # SPA root document with Inter & JetBrains Mono fonts
├── package.json                 # Project manifest, scripts, and dependencies
├── vite.config.js               # Vite config with React plugin, API proxy, and Vitest jsdom setup
├── src/
│   ├── main.jsx                 # Application entry point with BrowserRouter & AuthProvider
│   ├── App.jsx                  # Route switchboard with role guards & layout containers
│   ├── api/
│   │   ├── client.js            # Central Fetch wrapper with in-memory token & 401 refresh interceptor
│   │   ├── authApi.js           # Login, register, refresh, logout, getMe
│   │   ├── examsApi.js          # Exam CRUD, topic rules, blueprint publish
│   │   ├── sessionsApi.js       # Sessions, rooms, student rosters, invigilators
│   │   ├── attemptsApi.js       # Attempt start, questions fetch, idempotent submission
│   │   ├── answersApi.js        # Autosave, batch sync, clear, get answers
│   │   └── resultsApi.js        # Candidate results, staff summaries, manual publish, release policy
│   ├── context/
│   │   └── AuthContext.jsx      # React context managing auth state & silent session restoration
│   ├── hooks/
│   │   ├── useAuth.js           # Hook exposing AuthContext
│   │   ├── useExamTimer.js      # Drift-calibrated countdown hook with zero-expiration trigger
│   │   ├── useAutosave.js       # 1,000ms debounced autosave with OCC revision tracking
│   │   └── useNetworkStatus.js  # Online/offline network event listener
│   ├── routes/
│   │   ├── ProtectedRoute.jsx   # Route guard enforcing authentication
│   │   └── RoleRoute.jsx        # Route guard enforcing role permissions (STUDENT, FACULTY, etc.)
│   ├── styles/
│   │   ├── reset.css            # Margin/padding normalization
│   │   ├── variables.css        # Light-first design tokens (colors, radii, elevation, typography)
│   │   ├── typography.css       # Font scales and tabular monospace digits
│   │   └── global.css           # Global layout containers, animations, and WCAG accessibility rules
│   ├── utils/
│   │   └── uuid.js              # Cryptographically secure UUID generator utility
│   ├── components/
│   │   ├── common/              # Accessible UI primitives (Button, Input, Card, Badge, Modal, Spinner, OfflineBanner)
│   │   ├── layout/              # Navbar, Sidebar, and AppLayout shell
│   │   └── exam/                # QuestionRenderer, QuestionNavigator, TimerDisplay, AutosaveIndicator, SubmitConfirmModal
│   └── pages/
│       ├── auth/                # LoginPage, RegisterPage
│       ├── candidate/           # CandidateDashboardPage, PreExamReadinessPage, ExamTakingPage, CandidateResultPage
│       ├── faculty/             # FacultyDashboardPage, ExamEditorPage, SessionManagerPage, FacultyResultsPage
│       ├── invigilator/         # InvigilatorDashboardPage, SessionMonitorPage
│       ├── admin/               # AdminOverviewPage
│       └── NotFoundPage.jsx     # 404 handler
└── tests/
    ├── setup.js                 # Vitest test setup importing jest-dom
    ├── components/              # Component unit tests (QuestionRenderer, QuestionNavigator, TimerDisplay, AutosaveIndicator)
    ├── hooks/                   # Hook unit tests (useExamTimer, useAutosave)
    └── pages/                   # Page integration tests (LoginPage, ExamTakingPage, CandidateResultPage, FacultyResultsPage)
```

---

## 3. Key Persona Workflows

### Candidate Examination Experience
1. **Dashboard & Readiness Check**: Lists enrolled sessions with live/scheduled status. Candidate reviews integrity rules, confirms compliance, and starts or resumes attempt.
2. **Distraction-Free Exam Taking**:
   - Header with visual tabular countdown timer calibrated against server drift: $\Delta = \text{server\_time} - \text{Date.now}()$.
   - Input locking at zero countdown; automatic expiry-triggered submission using mandatory `Idempotency-Key` header.
   - Question navigator palette dynamically scaling to $N$ questions.
   - Autosave debounced at 1,000ms with Optimistic Concurrency Control (OCC) tracking `revision_id`.
   - In-memory offline buffer: Displays floating amber banner informing candidate that unsynchronized answers remain in this tab only.
   - Idempotent Final Submission: Both manual and auto-expiry submission send a mandatory UUID `Idempotency-Key` and reuse that exact same key across retries upon network failure. OFFLINE $\neq$ SUBMITTED: backend confirmation (`200 OK`) is required before showing success.
3. **Scorecard & Results**: Handles all 10 visibility matrix combinations from Phase 9 without answer key leakage. Provides user-driven manual refresh for `404 RESULT_NOT_FOUND` (no unapproved polling).

### Faculty & Assessment Administration
1. **Exam Editor**: Author exam metadata, configure topic rules by difficulty/points, balance points against `total_marks`, and publish/freeze blueprints.
2. **Session Scheduling**: Allocate exam execution windows, configure physical campus rooms with capacity validation, enroll candidate rosters, and assign invigilators.
3. **Results Oversight**: Pre-release evaluated score tables, summary statistics KPI cards, manual publication trigger, and release policy modal (`IMMEDIATE`, `SCHEDULED`, `MANUAL`).

### Invigilator Console
1. **Session-Scoped Roster**: Roster of enrolled candidates showing attempt lifecycle state (`READY`, `ACTIVE`, `SUBMITTED`, `EXPIRED`).
2. **Evaluation Inspection**: Session-filtered evaluated scores with zero administrative controls.

---

## 4. Development & Verification Commands

```bash
# Install frontend dependencies
npm --prefix frontend install

# Run local development dev server (Vite with /api proxy to http://localhost:3000)
npm --prefix frontend run dev

# Run full Vitest unit and integration test suite
npm --prefix frontend test

# Build production bundle
npm --prefix frontend run build
```
