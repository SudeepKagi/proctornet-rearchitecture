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
import { VerificationPendingPage } from './pages/onboarding/VerificationPendingPage.jsx';
import { VerificationRejectedPage } from './pages/onboarding/VerificationRejectedPage.jsx';

// Candidate Pages
import { CandidateDashboardPage } from './pages/candidate/CandidateDashboardPage.jsx';
import { PreExamReadinessPage } from './pages/candidate/PreExamReadinessPage.jsx';
import { ExamTakingPage } from './pages/candidate/ExamTakingPage.jsx';
import { CandidateResultPage } from './pages/candidate/CandidateResultPage.jsx';

// Faculty Pages
import { FacultyDashboardPage } from './pages/faculty/FacultyDashboardPage.jsx';
import { ExamEditorPage } from './pages/faculty/ExamEditorPage.jsx';
import { FacultyResultsPage } from './pages/faculty/FacultyResultsPage.jsx';
import { SessionManagerPage } from './pages/faculty/SessionManagerPage.jsx';

// Invigilator Pages
import { InvigilatorDashboardPage } from './pages/invigilator/InvigilatorDashboardPage.jsx';
import { SessionMonitorPage } from './pages/invigilator/SessionMonitorPage.jsx';

// Admin Pages
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.jsx';
import { UserManagementPage } from './pages/admin/UserManagementPage.jsx';
import { CreateUserPage } from './pages/admin/CreateUserPage.jsx';
import { BulkImportPage } from './pages/admin/BulkImportPage.jsx';
import { AdminVerificationPage } from './pages/admin/AdminVerificationPage.jsx';
import { UserDetailPage } from './pages/admin/UserDetailPage.jsx';
import { OrganizationSettingsPage } from './pages/admin/OrganizationSettingsPage.jsx';
import { AdminAuditPage } from './pages/admin/AdminAuditPage.jsx';

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

        {/* Root redirect */}
        <Route path="/" element={<RootRedirect />} />

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
        </Route>

        {/* Unmatched routes */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RealtimeProvider>
  );
}
