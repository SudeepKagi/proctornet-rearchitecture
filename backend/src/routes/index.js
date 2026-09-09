import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { examsRouter } from '../modules/exams/exams.routes.js';
import { sessionsRouter } from '../modules/sessions/sessions.routes.js';
import { attemptsRouter } from '../modules/attempts/attempts.routes.js';
import { auditRouter } from '../modules/audit/audit.routes.js';
import { adminRouter, userSelfRouter } from '../modules/users/user.routes.js';
import { candidateRouter } from '../modules/candidate/candidateIdentity.routes.js';
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

// Phase 5: Exam Authoring, Topic Rules & Publishing (Gated for verified active users)
v1Router.use('/exams', authenticate, requireVerifiedActiveUser, examsRouter);

// Phase 5: Sessions, Scheduling, Rosters & Invigilation (Gated for verified active users)
v1Router.use('/sessions', authenticate, requireVerifiedActiveUser, sessionsRouter);

// Phase 6: Attempts, Question Mapping & Resumption (Gated for verified active users)
v1Router.use('/attempts', authenticate, requireVerifiedActiveUser, attemptsRouter);

// Phase 13: Centralized Audit Logs
v1Router.use('/audit-logs', auditRouter);

// Mount /api/v1
rootRouter.use('/api/v1', v1Router);
