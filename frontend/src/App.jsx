/**
 * @file App.jsx
 * @description Central routing switchboard for ProctorNet SPA.
 */

import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { VerifiedRoute } from './routes/VerifiedRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { useAuth } from './hooks/useAuth.js';
import { RealtimeProvider } from './context/RealtimeContext.jsx';
import { ScreenStreamProvider } from './context/ScreenStreamContext.jsx';

import { resolvePostLoginDestination } from './routes/roleNavigation.js';

const lazyNamed = (load, name) => lazy(async () => {
  const module = await load();
  return { default: module[name] };
});

const LoginPage = lazyNamed(() => import('./pages/auth/LoginPage.jsx'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./pages/auth/RegisterPage.jsx'), 'RegisterPage');
const FirstLoginPasswordPage = lazyNamed(() => import('./pages/onboarding/FirstLoginPasswordPage.jsx'), 'FirstLoginPasswordPage');
const StudentOnboardingPage = lazyNamed(() => import('./pages/onboarding/StudentOnboardingPage.jsx'), 'StudentOnboardingPage');
const FacultyOnboardingPage = lazyNamed(() => import('./pages/onboarding/FacultyOnboardingPage.jsx'), 'FacultyOnboardingPage');
const CandidateDocumentUploadPage = lazyNamed(() => import('./pages/onboarding/CandidateDocumentUploadPage.jsx'), 'CandidateDocumentUploadPage');
const VerificationPendingPage = lazyNamed(() => import('./pages/onboarding/VerificationPendingPage.jsx'), 'VerificationPendingPage');
const VerificationRejectedPage = lazyNamed(() => import('./pages/onboarding/VerificationRejectedPage.jsx'), 'VerificationRejectedPage');
const CandidateDashboardPage = lazyNamed(() => import('./pages/candidate/CandidateDashboardPage.jsx'), 'CandidateDashboardPage');
const CandidateExamsPage = lazyNamed(() => import('./pages/candidate/CandidateExamsPage.jsx'), 'CandidateExamsPage');
const CandidateProfilePage = lazyNamed(() => import('./pages/candidate/CandidateProfilePage.jsx'), 'CandidateProfilePage');
const PreExamReadinessPage = lazyNamed(() => import('./pages/candidate/PreExamReadinessPage.jsx'), 'PreExamReadinessPage');
const ExamLobbyPage = lazyNamed(() => import('./pages/candidate/ExamLobbyPage.jsx'), 'ExamLobbyPage');
const ExamTakingPage = lazyNamed(() => import('./pages/candidate/ExamTakingPage.jsx'), 'ExamTakingPage');
const CandidateResultPage = lazyNamed(() => import('./pages/candidate/CandidateResultPage.jsx'), 'CandidateResultPage');
const CandidateFaceEnrollmentPage = lazy(() => import('./pages/candidate/CandidateFaceEnrollmentPage.jsx'));
const CandidateEnrollmentPage = lazyNamed(() => import('./pages/candidate/CandidateEnrollmentPage.jsx'), 'CandidateEnrollmentPage');
const FacultyDashboardPage = lazyNamed(() => import('./pages/faculty/FacultyDashboardPage.jsx'), 'FacultyDashboardPage');
const FacultyExamsPage = lazyNamed(() => import('./pages/faculty/FacultyExamsPage.jsx'), 'FacultyExamsPage');
const FacultyQuestionPoolsPage = lazyNamed(() => import('./pages/faculty/FacultyQuestionPoolsPage.jsx'), 'FacultyQuestionPoolsPage');
const ExamEditorPage = lazyNamed(() => import('./pages/faculty/ExamEditorPage.jsx'), 'ExamEditorPage');
const FacultyResultsPage = lazyNamed(() => import('./pages/faculty/FacultyResultsPage.jsx'), 'FacultyResultsPage');
const SessionManagerPage = lazyNamed(() => import('./pages/faculty/SessionManagerPage.jsx'), 'SessionManagerPage');
const QuestionBankPage = lazyNamed(() => import('./pages/faculty/QuestionBankPage.jsx'), 'QuestionBankPage');
const ManualGradingPage = lazyNamed(() => import('./pages/faculty/ManualGradingPage.jsx'), 'ManualGradingPage');
const InvigilatorDashboardPage = lazyNamed(() => import('./pages/invigilator/InvigilatorDashboardPage.jsx'), 'InvigilatorDashboardPage');
const SessionMonitorPage = lazyNamed(() => import('./pages/invigilator/SessionMonitorPage.jsx'), 'SessionMonitorPage');
const AdminOverviewPage = lazyNamed(() => import('./pages/admin/AdminOverviewPage.jsx'), 'AdminOverviewPage');
const UserManagementPage = lazyNamed(() => import('./pages/admin/UserManagementPage.jsx'), 'UserManagementPage');
const CreateUserPage = lazyNamed(() => import('./pages/admin/CreateUserPage.jsx'), 'CreateUserPage');
const BulkImportPage = lazyNamed(() => import('./pages/admin/BulkImportPage.jsx'), 'BulkImportPage');
const AdminVerificationPage = lazyNamed(() => import('./pages/admin/AdminVerificationPage.jsx'), 'AdminVerificationPage');
const StudentConfigurationPage = lazyNamed(() => import('./pages/admin/StudentConfigurationPage.jsx'), 'StudentConfigurationPage');
const UserDetailPage = lazyNamed(() => import('./pages/admin/UserDetailPage.jsx'), 'UserDetailPage');
const OrganizationSettingsPage = lazyNamed(() => import('./pages/admin/OrganizationSettingsPage.jsx'), 'OrganizationSettingsPage');
const AdminAuditPage = lazyNamed(() => import('./pages/admin/AdminAuditPage.jsx'), 'AdminAuditPage');
const DeveloperLayout = lazyNamed(() => import('./components/layout/DeveloperLayout.jsx'), 'DeveloperLayout');
const ExamLayout = lazyNamed(() => import('./components/layout/ExamLayout.jsx'), 'ExamLayout');
const DeveloperOverviewPage = lazyNamed(() => import('./pages/developer/DeveloperOverviewPage.jsx'), 'DeveloperOverviewPage');
const DeveloperHealthPage = lazyNamed(() => import('./pages/developer/DeveloperHealthPage.jsx'), 'DeveloperHealthPage');
const DeveloperLogsPage = lazyNamed(() => import('./pages/developer/DeveloperLogsPage.jsx'), 'DeveloperLogsPage');
const DeveloperAuditPage = lazyNamed(() => import('./pages/developer/DeveloperAuditPage.jsx'), 'DeveloperAuditPage');
const DeveloperTopologyPage = lazyNamed(() => import('./pages/developer/DeveloperTopologyPage.jsx'), 'DeveloperTopologyPage');
const DeveloperIncidentsPage = lazyNamed(() => import('./pages/developer/DeveloperIncidentsPage.jsx'), 'DeveloperIncidentsPage');
const PublicLayout = lazyNamed(() => import('./components/public/PublicLayout.jsx'), 'PublicLayout');
const LandingPage = lazyNamed(() => import('./pages/public/LandingPage.jsx'), 'LandingPage');
const AboutPage = lazyNamed(() => import('./pages/public/AboutPage.jsx'), 'AboutPage');
const ContactPage = lazyNamed(() => import('./pages/public/ContactPage.jsx'), 'ContactPage');
const TermsPage = lazyNamed(() => import('./pages/public/TermsPage.jsx'), 'TermsPage');
const PrivacyPage = lazyNamed(() => import('./pages/public/PrivacyPage.jsx'), 'PrivacyPage');
const CookiesPage = lazyNamed(() => import('./pages/public/CookiesPage.jsx'), 'CookiesPage');
const PublicNotFoundPage = lazyNamed(() => import('./pages/public/PublicNotFoundPage.jsx'), 'PublicNotFoundPage');

function RouteLoadingSkeleton() {
  return <main className="min-h-screen bg-slate-50 p-6 sm:p-10"><div className="mx-auto max-w-6xl animate-pulse space-y-6"><div className="h-8 w-56 rounded bg-slate-200" /><div className="grid gap-5 md:grid-cols-3"><div className="h-32 rounded-xl bg-slate-200" /><div className="h-32 rounded-xl bg-slate-200" /><div className="h-32 rounded-xl bg-slate-200" /></div><div className="h-72 rounded-xl bg-slate-200" /></div></main>;
}

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const destination = resolvePostLoginDestination(user);
  return <Navigate to={destination} replace />;
}

export function App() {
  return (
    <RealtimeProvider>
      <ScreenStreamProvider>
        <Suspense fallback={<RouteLoadingSkeleton />}>
        <Routes>
        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/student/login" element={<Navigate to="/login" replace />} />
        <Route path="/faculty/login" element={<Navigate to="/login" replace />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/invigilator-login" element={<Navigate to="/login" replace />} />
        <Route path="/invigilator/login" element={<Navigate to="/login" replace />} />

        {/* Dashboard redirect for authenticated users */}
        <Route path="/dashboard" element={<RootRedirect />} />

        {/* Onboarding Routes (Protected, without standard operational dashboard chrome) */}
        <Route
          path="/onboarding/first-login"
          element={
            <ProtectedRoute>
              <FirstLoginPasswordPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/candidate/enrollment"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <CandidateEnrollmentPage />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/candidate/biometrics/enroll"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <CandidateEnrollmentPage />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/student"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <Navigate to="/candidate/enrollment" replace />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/document-upload"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <Navigate to="/candidate/enrollment" replace />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/faculty"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <FacultyOnboardingPage />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/pending"
          element={
            <ProtectedRoute>
              <VerificationPendingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/rejected"
          element={
            <ProtectedRoute>
              <VerificationRejectedPage />
            </ProtectedRoute>
          }
        />

        {/* Distraction-Free Exam Taking Workspace */}
        <Route
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <ExamLayout />
                </VerifiedRoute>
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route path="/candidate/attempts/:attemptId" element={<ExamTakingPage />} />
          <Route path="/candidate/exam/:attemptId" element={<ExamTakingPage />} />
        </Route>

        {/* Standard Authenticated Layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Candidate Routes */}
          <Route
            path="/candidate"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <CandidateDashboardPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/student"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <Navigate to="/candidate" replace />
              </RoleRoute>
            }
          />
          <Route
            path="/candidate/readiness/:sessionId"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <PreExamReadinessPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/candidate/lobby/:sessionId"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <ExamLobbyPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/candidate/lobby/exam/:examId"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <ExamLobbyPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/candidate/attempts/:attemptId/result"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN', 'FACULTY']}>
                <VerifiedRoute>
                  <CandidateResultPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />

          {/* Candidate: My Exams */}
          <Route
            path="/candidate/exams"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <CandidateExamsPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />

          {/* Candidate: Results */}
          <Route
            path="/candidate/results"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <CandidateExamsPage defaultTab="completed" />
                </VerifiedRoute>
              </RoleRoute>
            }
          />

          {/* Candidate: Profile */}
          <Route
            path="/candidate/profile"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <CandidateProfilePage />
              </RoleRoute>
            }
          />


          {/* Faculty Routes */}
          <Route
            path="/faculty"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <FacultyDashboardPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/exams"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <FacultyExamsPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/question-pools"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <FacultyQuestionPoolsPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <ExamEditorPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/exams/:examId/results"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <FacultyResultsPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/sessions"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <SessionManagerPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/question-banks"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <QuestionBankPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/questions"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <QuestionBankPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/grading/:resultId"
            element={
              <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
                <VerifiedRoute>
                  <ManualGradingPage />
                </VerifiedRoute>
              </RoleRoute>
            }
          />

          {/* Invigilator Routes */}
          <Route
            path="/invigilator"
            element={
              <RoleRoute allowedRoles={['INVIGILATOR', 'FACULTY', 'ADMIN']}>
                <InvigilatorDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/invigilator/sessions/:sessionId"
            element={
              <RoleRoute allowedRoles={['INVIGILATOR', 'FACULTY', 'ADMIN']}>
                <SessionMonitorPage />
              </RoleRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <AdminOverviewPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <UserManagementPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/users/create"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <CreateUserPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/users/bulk"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <BulkImportPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <UserDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/verifications"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <AdminVerificationPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/students/:id/configuration"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <StudentConfigurationPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RoleRoute allowedRoles={['ADMIN']}>
                <OrganizationSettingsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RoleRoute allowedRoles={['ADMIN', 'DEVELOPER']}>
                <AdminAuditPage />
              </RoleRoute>
            }
          />

          {/* Developer Operations Routes */}
          <Route
            path="/developer"
            element={
              <RoleRoute allowedRoles={['DEVELOPER']}>
                <DeveloperLayout />
              </RoleRoute>
            }
          >
            <Route index element={<Navigate to="/developer/overview" replace />} />
            <Route path="overview" element={<DeveloperOverviewPage />} />
            <Route path="health" element={<DeveloperHealthPage />} />
            <Route path="logs" element={<DeveloperLogsPage />} />
            <Route path="audit" element={<DeveloperAuditPage />} />
            <Route path="topology" element={<DeveloperTopologyPage />} />
            <Route path="incidents" element={<DeveloperIncidentsPage />} />
          </Route>
        </Route>

        {/* Standalone Landing Page (matching reference ProctorNet architecture) */}
        <Route path="/" element={<LandingPage />} />

        {/* Public Educational Website Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/cookies" element={<CookiesPage />} />

          {/* Accessible Public 404 Catch-All */}
          <Route path="*" element={<PublicNotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
      </ScreenStreamProvider>
    </RealtimeProvider>
  );
}
