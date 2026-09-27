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
import { facultyRouter } from '../modules/faculty/faculty.routes.js';
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

// User Administration & Institutional Configuration
v1Router.use('/admin', adminRouter);
v1Router.use('/users/me', userSelfRouter);

// Candidate Identity Onboarding & Document Verification
v1Router.use('/candidate', candidateRouter);

// Biometric Identity — Face Enrollment, Verification & Anti-Spoofing
v1Router.use('/candidate/biometrics', candidateBiometricsRouter);
v1Router.use('/admin/biometrics', adminBiometricsRouter);

// Question Bank & Question Authoring (Gated for verified active faculty/admins)
v1Router.use('/faculty/question-bank', authenticate, requireVerifiedActiveUser, questionBankRouter);

// Faculty Portal Module (Dashboard stats, Exams, Question Pools, Scheduling, Analytics)
v1Router.use('/faculty', facultyRouter);

// Exam Authoring, Question Assignments & Publishing (Gated for verified active users)
v1Router.use('/exams', authenticate, requireVerifiedActiveUser, examsRouter);

// Examination Sessions, Scheduling, Rosters & Invigilation (Gated for verified active users)
v1Router.use('/sessions', authenticate, requireVerifiedActiveUser, sessionsRouter);

// Examination Attempts, Question Mapping & Resumption (Gated for verified active users)
v1Router.use('/attempts', authenticate, requireVerifiedActiveUser, attemptsRouter);

// Manual Grading Workspace & Subjective Evaluation
v1Router.use('/results', authenticate, requireVerifiedActiveUser, manualGradingRouter);

// Live Invigilator Realtime Interventions
v1Router.use('/interventions', authenticate, requireVerifiedActiveUser, interventionsRouter);

// Centralized Audit Logs
v1Router.use('/audit-logs', auditRouter);

// Developer Operations & Telemetry Control Plane
v1Router.use('/developer', developerRouter);

// Mount /api/v1
rootRouter.use('/api/v1', v1Router);
