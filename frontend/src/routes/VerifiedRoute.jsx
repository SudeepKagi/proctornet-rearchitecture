/**
 * @file VerifiedRoute.jsx
 * @description Route wrapper ensuring candidate and faculty users have completed mandatory first-login password change
 * and achieved VERIFIED status before accessing operational dashboards and features.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export function VerifiedRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Mandatory password change check (applies to all users)
  if (user.mustChangePassword) {
    return <Navigate to="/onboarding/first-login" replace />;
  }

  // Admins and Developers bypass academic verification
  const isPrivileged = user.roles?.some((r) => ['ADMIN', 'DEVELOPER'].includes(r));
  if (isPrivileged) {
    return children;
  }

  // Academic verification gating for Student and Faculty
  const isAcademicRole = user.roles?.some((r) => ['STUDENT', 'FACULTY'].includes(r));
  if (isAcademicRole) {
    const isStudent = user.roles?.includes('STUDENT');
    const isVerified = user.isVerified === true || user.verificationStatus === 'VERIFIED';

    if (isStudent && (!isVerified || !user.enrolledFacePhotoUrl)) {
      return <Navigate to="/candidate/enrollment" replace />;
    }

    if (user.verificationStatus === 'UNVERIFIED') {
      if (user.roles.includes('FACULTY')) {
        return <Navigate to="/onboarding/faculty" replace />;
      }
      return <Navigate to="/candidate/enrollment" replace />;
    }

    if (user.verificationStatus === 'PENDING') {
      return <Navigate to="/onboarding/pending" replace />;
    }

    if (user.verificationStatus === 'REJECTED') {
      return <Navigate to="/onboarding/rejected" replace />;
    }

    if (!isVerified) {
      return <Navigate to="/candidate/enrollment" replace />;
    }
  }

  return children;
}
