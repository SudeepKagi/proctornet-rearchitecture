import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { examsRouter } from '../modules/exams/exams.routes.js';
import { sessionsRouter } from '../modules/sessions/sessions.routes.js';
import { attemptsRouter } from '../modules/attempts/attempts.routes.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { adminRouter, userSelfRouter } from '../modules/users/user.routes.js';
import { candidateRouter } from '../modules/candidate/candidateIdentity.routes.js';
import { candidateBiometricsRouter, adminBiometricsRouter } from '../modules/biometrics/biometrics.routes.js';
import { questionBankRouter } from '../modules/questions/questions.routes.js';
import { manualGradingRouter } from '../modules/evaluation/manualGrading.routes.js';
import { interventionsRouter } from '../modules/interventions/interventions.routes.js';
import { developerRouter } from '../modules/developer/developer.routes.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireVerifiedActiveUser } from '../middleware/verificationGate.js';

export const rootRouter = Router();

// Liveness & Readiness checks
rootRouter.use(healthRouter);

// Versioned API namespace (/api/v1)
const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.status(200).json({
    name: 'ProctorNet API',
    version: 'v1',
    status: 'ACTIVE'
  });
});

// Authentication & Session endpoints
v1Router.use('/auth', authRouter);

// Phase 23: User Administration & Institutional Configuration
v1Router.use('/admin', adminRouter);
v1Router.use('/users/me', userSelfRouter);

// Phase 24: Candidate Identity Onboarding & Document Verification
v1Router.use('/candidate', candidateRouter);

// Phase 25: Biometric Identity — Face Enrollment, Verification & Anti-Spoofing
v1Router.use('/candidate/biometrics', candidateBiometricsRouter);
v1Router.use('/admin/biometrics', adminBiometricsRouter);


// Phase 26: Question Bank & Question Authoring (Gated for verified active faculty/admins)
v1Router.use('/faculty/question-bank', authenticate, requireVerifiedActiveUser, questionBankRouter);

// Phase 5: Exam Authoring, Topic Rules & Publishing (Gated for verified active users)
v1Router.use('/exams', authenticate, requireVerifiedActiveUser, examsRouter);

// Phase 5: Sessions, Scheduling, Rosters & Invigilation (Gated for verified active users)
v1Router.use('/sessions', authenticate, requireVerifiedActiveUser, sessionsRouter);

// Phase 6: Attempts, Question Mapping & Resumption (Gated for verified active users)
v1Router.use('/attempts', authenticate, requireVerifiedActiveUser, attemptsRouter);

// Phase 26: Manual Grading Workspace & Subjective Evaluation
v1Router.use('/results', authenticate, requireVerifiedActiveUser, manualGradingRouter);

// Phase 26: Live Invigilator Realtime Interventions
v1Router.use('/interventions', authenticate, requireVerifiedActiveUser, interventionsRouter);

// Phase 13: Centralized Audit Logs
v1Router.use('/audit-logs', auditRouter);

// Phase 27: Developer Operations & Telemetry Control Plane
v1Router.use('/developer', developerRouter);

// Mount /api/v1
rootRouter.use('/api/v1', v1Router);
