# ProctorNet Overhaul Checklist

## Phase 1: Database Schema Cleanup
- [x] 1.1 Create migration `028_simplify_schema.js`
- [x] 1.2 Run migration and verify (17 legacy tables dropped, 22 core tables verified)

## Phase 2: Backend Module Cleanup
- [x] 2.1 Remove unused modules & pollers (outbox poller removed, clean boot)
- [x] 2.2 Rename `candidate` → `student` in backend APIs and routes
- [x] 2.3 Merge `interventions` into `proctoring`
- [x] 2.4 Merge `evidence` into `proctoring`
- [x] 2.5 Simplify `questions` module — embedded directly into exams (`questions.exam_id`)
- [x] 2.6 Remove faculty question pool routes & blueprint complexity
- [x] 2.7 Update `routes/index.js`
- [x] 2.8 Update user creation flow (Admin only provisions accounts with temporary passwords)
- [x] 2.9 Update onboarding service (Unified student profile setup with department, semester, face, college ID)
- [x] 2.10 Exam CRUD for faculty (inline MCQ questions + AI generation from uploaded PDF, branch & semester targeting)
- [x] 2.11 Proctoring features (Realtime WebSocket & Mediasoup SFU streamlined for Faculty monitoring)

## Phase 3: Frontend Overhaul
- [x] 3.1 Delete unused pages & components (`FacultyQuestionPoolsPage`, `QuestionBankPage`, `ManualGradingPage`, `SessionManagerPage`, `CandidateEnrollmentPage`, `CandidateDocumentUploadPage`, `StudentConfigurationPage`, `OrganizationSettingsPage`)
- [x] 3.2 Update navigation & role mapping to 4 strict roles (`STUDENT`, `FACULTY`, `ADMIN`, `DEVELOPER`)
- [x] 3.3 Simplify App.jsx routing and aliases
- [x] 3.4 Build new simplified pages:
  - [x] `StudentSetupPage.jsx`: Unified onboarding with Full Name, Branch dropdown, Semester (1-8), Face photo, College ID card
  - [x] `CreateExamPage.jsx`: Unified Exam Creator & Editor with inline MCQs and AI generation from PDF
  - [x] `FacultyDashboardPage.jsx` & `FacultyExamsPage.jsx`: Friendly English ("Create Exam", "Live Monitor", "View Results")
  - [x] `LoginPage.jsx` & `FirstLoginPasswordPage.jsx`: Quick-fills only for Admin & Developer; real-time validation warnings while typing
- [x] 3.5 Update API client files (`facultyApi.js`, `studentApi.js`, `adminUsersApi.js`)

## Phase 4: Verification & Operational Testing
- [x] 4.1 Frontend bundle compilation (`npm run build` completed with 0 errors)
- [x] 4.2 Backend server startup (`npm run dev` running with Redis, RabbitMQ, SFU, WebSocket)
- [x] 4.3 End-to-end API verification:
  - [x] Admin login & password reset
  - [x] Faculty temporary login, password change & exam creation with inline MCQs
  - [x] Student temporary login, password change, profile setup & assigned exam viewing

## Phase 5: Non-Negotiable Design & Production Launch Compliance
- [x] 5.1 Strict Design Anti-Pattern Removal:
  - Zero bubble gradients or excessive motion effects
  - Zero oversized or whale-shaped decorative buttons
  - Zero fake reviews, fake ratings, or customer quotes
  - Zero fake metrics or counters (honest technical facts only)
  - Zero vague hero marketing copy (clear academic tone)
  - Zero emojis in interface icons (100% Lucide SVG icons)
  - **Zero em dashes (`—`) across all website copy and code**
  - Zero AI-slop copy or AI photography
- [x] 5.2 Production & Launch Deliverables:
  - Custom favicon (`frontend/public/favicon.svg`) created and linked
  - Privacy Policy page (`/privacy`) verified and accessible
  - Terms of Use page (`/terms`) verified and accessible
  - Contact form (`/contact`) validation and inline confirmation verified
  - All public routes (`/`, `/about`, `/contact`, `/terms`, `/privacy`, `/cookies`) return 200 OK
  - 17 unused orphaned public files removed to eliminate dead routes
  - Strict 4 roles (`STUDENT`, `FACULTY`, `ADMIN`, `DEVELOPER`) reflected uniformly on landing page, project info, and navigation
  - Full production build (`npm run build`) passed with 0 errors (2098 modules transformed)

