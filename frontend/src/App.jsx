/**
 * @file App.jsx
 * @description Central routing switchboard for ProctorNet SPA.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { RoleRoute } from './routes/RoleRoute.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { RegisterPage } from './pages/auth/RegisterPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { useAuth } from './hooks/useAuth.js';
import { RealtimeProvider } from './context/RealtimeContext.jsx';

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

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

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

      {/* Distraction-Free Exam Taking Workspace (No AppLayout chrome) */}
      <Route
        path="/candidate/attempts/:attemptId"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
              <ExamTakingPage />
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
              <CandidateDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/candidate/readiness/:sessionId"
          element={
            <RoleRoute allowedRoles={['STUDENT', 'ADMIN']}>
              <PreExamReadinessPage />
            </RoleRoute>
          }
        />
        <Route
          path="/candidate/attempts/:attemptId/result"
          element={
            <RoleRoute allowedRoles={['STUDENT', 'ADMIN', 'FACULTY']}>
              <CandidateResultPage />
            </RoleRoute>
          }
        />

        {/* Faculty Routes */}
        <Route
          path="/faculty"
          element={
            <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
              <FacultyDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/faculty/exams/:examId"
          element={
            <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
              <ExamEditorPage />
            </RoleRoute>
          }
        />
        <Route
          path="/faculty/exams/:examId/results"
          element={
            <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
              <FacultyResultsPage />
            </RoleRoute>
          }
        />
        <Route
          path="/faculty/sessions"
          element={
            <RoleRoute allowedRoles={['FACULTY', 'ADMIN']}>
              <SessionManagerPage />
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
      </Route>

      {/* Unmatched routes */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </RealtimeProvider>
  );
}
