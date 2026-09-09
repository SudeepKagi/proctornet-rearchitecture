/**
 * @file App.jsx
 * @description Central routing switchboard for ProctorNet SPA.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { VerifiedRoute } from './routes/VerifiedRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { RegisterPage } from './pages/auth/RegisterPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { useAuth } from './hooks/useAuth.js';
import { RealtimeProvider } from './context/RealtimeContext.jsx';

// Onboarding Pages
import { FirstLoginPasswordPage } from './pages/onboarding/FirstLoginPasswordPage.jsx';
import { StudentOnboardingPage } from './pages/onboarding/StudentOnboardingPage.jsx';
import { FacultyOnboardingPage } from './pages/onboarding/FacultyOnboardingPage.jsx';
import { CandidateDocumentUploadPage } from './pages/onboarding/CandidateDocumentUploadPage.jsx';
import { VerificationPendingPage } from './pages/onboarding/VerificationPendingPage.jsx';
import { VerificationRejectedPage } from './pages/onboarding/VerificationRejectedPage.jsx';

// Candidate Pages
import { CandidateDashboardPage } from './pages/candidate/CandidateDashboardPage.jsx';
import { PreExamReadinessPage } from './pages/candidate/PreExamReadinessPage.jsx';
import { ExamTakingPage } from './pages/candidate/ExamTakingPage.jsx';
import { CandidateResultPage } from './pages/candidate/CandidateResultPage.jsx';
import CandidateFaceEnrollmentPage from './pages/candidate/CandidateFaceEnrollmentPage.jsx';

// Faculty Pages
import { FacultyDashboardPage } from './pages/faculty/FacultyDashboardPage.jsx';
import { ExamEditorPage } from './pages/faculty/ExamEditorPage.jsx';
import { FacultyResultsPage } from './pages/faculty/FacultyResultsPage.jsx';
import { SessionManagerPage } from './pages/faculty/SessionManagerPage.jsx';
import { QuestionBankPage } from './pages/faculty/QuestionBankPage.jsx';
import { ManualGradingPage } from './pages/faculty/ManualGradingPage.jsx';

// Invigilator Pages
import { InvigilatorDashboardPage } from './pages/invigilator/InvigilatorDashboardPage.jsx';
import { SessionMonitorPage } from './pages/invigilator/SessionMonitorPage.jsx';

// Admin Pages
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.jsx';
import { UserManagementPage } from './pages/admin/UserManagementPage.jsx';
import { CreateUserPage } from './pages/admin/CreateUserPage.jsx';
import { BulkImportPage } from './pages/admin/BulkImportPage.jsx';
import { AdminVerificationPage } from './pages/admin/AdminVerificationPage.jsx';
import { StudentConfigurationPage } from './pages/admin/StudentConfigurationPage.jsx';
import { UserDetailPage } from './pages/admin/UserDetailPage.jsx';
import { OrganizationSettingsPage } from './pages/admin/OrganizationSettingsPage.jsx';
import { AdminAuditPage } from './pages/admin/AdminAuditPage.jsx';

// Developer Operations Pages
import { DeveloperLayout } from './components/layout/DeveloperLayout.jsx';
import { DeveloperOverviewPage } from './pages/developer/DeveloperOverviewPage.jsx';
import { DeveloperHealthPage } from './pages/developer/DeveloperHealthPage.jsx';
import { DeveloperLogsPage } from './pages/developer/DeveloperLogsPage.jsx';
import { DeveloperAuditPage } from './pages/developer/DeveloperAuditPage.jsx';
import { DeveloperTopologyPage } from './pages/developer/DeveloperTopologyPage.jsx';
import { DeveloperIncidentsPage } from './pages/developer/DeveloperIncidentsPage.jsx';

// Public Educational Website Pages
import { PublicLayout } from './components/public/PublicLayout.jsx';
import { LandingPage } from './pages/public/LandingPage.jsx';
import { AboutPage } from './pages/public/AboutPage.jsx';
import { FeaturesPage } from './pages/public/FeaturesPage.jsx';
import { HowItWorksPage } from './pages/public/HowItWorksPage.jsx';
import { ForStudentsPage } from './pages/public/ForStudentsPage.jsx';
import { ForFacultyPage } from './pages/public/ForFacultyPage.jsx';
import { ForInstitutionsPage } from './pages/public/ForInstitutionsPage.jsx';
import { AiProctoringPage } from './pages/public/AiProctoringPage.jsx';
import { SecurityPage } from './pages/public/SecurityPage.jsx';
import { AccessibilityPage } from './pages/public/AccessibilityPage.jsx';
import { ArchitecturePage } from './pages/public/ArchitecturePage.jsx';
import { DocumentationHubPage } from './pages/public/DocumentationHubPage.jsx';
import { FaqPage } from './pages/public/FaqPage.jsx';
import { ContactPage } from './pages/public/ContactPage.jsx';
import { ProjectInterestPage } from './pages/public/ProjectInterestPage.jsx';
import { ProjectFeedbackPage } from './pages/public/ProjectFeedbackPage.jsx';
import { ThankYouPage } from './pages/public/ThankYouPage.jsx';
import { TermsPage } from './pages/public/TermsPage.jsx';
import { PrivacyPage } from './pages/public/PrivacyPage.jsx';
import { CookiesPage } from './pages/public/CookiesPage.jsx';
import { AcceptableUsePage } from './pages/public/AcceptableUsePage.jsx';
import { AcademicIntegrityPage } from './pages/public/AcademicIntegrityPage.jsx';
import { AiProctoringNoticePage } from './pages/public/AiProctoringNoticePage.jsx';
import { AccessibilityStatementPage } from './pages/public/AccessibilityStatementPage.jsx';
import { PublicNotFoundPage } from './pages/public/PublicNotFoundPage.jsx';

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Enforce first login password change
  if (user?.mustChangePassword) {
    return <Navigate to="/onboarding/first-login" replace />;
  }

  // Enforce academic verification for student/faculty
  const isAcademic = user?.roles?.some((r) => ['STUDENT', 'FACULTY'].includes(r));
  if (isAcademic && !user?.roles?.includes('ADMIN')) {
    if (user?.verificationStatus === 'UNVERIFIED') {
      if (user?.roles?.includes('FACULTY')) {
        return <Navigate to="/onboarding/faculty" replace />;
      }
      return <Navigate to="/onboarding/student" replace />;
    }
    if (user?.verificationStatus === 'PENDING') {
      return <Navigate to="/onboarding/pending" replace />;
    }
    if (user?.verificationStatus === 'REJECTED') {
      return <Navigate to="/onboarding/rejected" replace />;
    }
  }

  if (user?.roles?.includes('ADMIN')) return <Navigate to="/admin" replace />;
  if (user?.roles?.includes('DEVELOPER')) return <Navigate to="/developer/overview" replace />;
  if (user?.roles?.includes('FACULTY')) return <Navigate to="/faculty" replace />;
  if (user?.roles?.includes('INVIGILATOR')) return <Navigate to="/invigilator" replace />;
  return <Navigate to="/candidate" replace />;
}

export function App() {
  return (
    <RealtimeProvider>
      <Routes>
        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

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
          path="/onboarding/student"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <StudentOnboardingPage />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/document-upload"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <CandidateDocumentUploadPage />
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
          path="/candidate/attempts/:attemptId"
          element={
            <ProtectedRoute>
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <ExamTakingPage />
                </VerifiedRoute>
              </RoleRoute>
            </ProtectedRoute>
          }
        />

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
            path="/candidate/biometrics/enroll"
            element={
              <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
                <VerifiedRoute>
                  <CandidateFaceEnrollmentPage />
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
              <RoleRoute allowedRoles={['INVIGILATOR', 'ADMIN']}>
                <InvigilatorDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/invigilator/sessions/:sessionId"
            element={
              <RoleRoute allowedRoles={['INVIGILATOR', 'ADMIN']}>
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

          {/* Developer Operations Routes (Phase 27) */}
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

        {/* Public Educational Website Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/for-students" element={<ForStudentsPage />} />
          <Route path="/for-faculty" element={<ForFacultyPage />} />
          <Route path="/for-institutions" element={<ForInstitutionsPage />} />
          <Route path="/ai-proctoring" element={<AiProctoringPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/accessibility" element={<AccessibilityPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/documentation" element={<DocumentationHubPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/project-interest" element={<ProjectInterestPage />} />
          <Route path="/project-feedback" element={<ProjectFeedbackPage />} />
          <Route path="/thank-you" element={<ThankYouPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/acceptable-use" element={<AcceptableUsePage />} />
          <Route path="/academic-integrity" element={<AcademicIntegrityPage />} />
          <Route path="/ai-proctoring-notice" element={<AiProctoringNoticePage />} />
          <Route path="/accessibility-statement" element={<AccessibilityStatementPage />} />

          {/* Accessible Public 404 Catch-All */}
          <Route path="*" element={<PublicNotFoundPage />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}
