/**
 * @file roleNavigation.js
 * @description Centralized single source of truth for role-based routing, portal resolution,
 * and workspace layout determination across ProctorNet.
 */

/**
 * Authoritative default dashboard routes for the five application roles.
 */
export const ROLE_DEFAULT_ROUTES = {
  ADMIN: '/admin',
  DEVELOPER: '/developer/overview',
  FACULTY: '/faculty',
  INVIGILATOR: '/invigilator',
  STUDENT: '/candidate',
};

/**
 * Role permissions matrix for top-level path prefixes.
 */
export const ROUTE_ROLE_PERMISSIONS = {
  '/admin': ['ADMIN'],
  '/developer': ['DEVELOPER'],
  '/faculty': ['FACULTY', 'ADMIN'],
  '/invigilator': ['INVIGILATOR', 'ADMIN'],
  '/candidate': ['STUDENT', 'ADMIN'],
  '/student': ['STUDENT', 'ADMIN'],
};

/**
 * Returns the canonical dashboard route for a given authenticated user based strictly on roles.
 * @param {Object|null} user - The authenticated user object
 * @returns {string} The canonical route
 */
export function getDefaultRouteForUser(user) {
  if (!user || !Array.isArray(user.roles)) {
    return '/login';
  }

  if (user.roles.includes('ADMIN')) return ROLE_DEFAULT_ROUTES.ADMIN;
  if (user.roles.includes('DEVELOPER')) return ROLE_DEFAULT_ROUTES.DEVELOPER;
  if (user.roles.includes('FACULTY')) return ROLE_DEFAULT_ROUTES.FACULTY;
  if (user.roles.includes('INVIGILATOR')) return ROLE_DEFAULT_ROUTES.INVIGILATOR;
  if (user.roles.includes('STUDENT')) return ROLE_DEFAULT_ROUTES.STUDENT;

  return ROLE_DEFAULT_ROUTES.STUDENT;
}

/**
 * Validates whether the authenticated user has explicit permission to access the target path.
 * @param {string} pathname - Target URL pathname
 * @param {Object|null} user - The authenticated user object
 * @returns {boolean} True if authorized
 */
export function isPathAuthorizedForUser(pathname, user) {
  if (!pathname || !user || !Array.isArray(user.roles)) {
    return false;
  }

  // Common public or onboarding paths are handled by their own route wrappers
  if (pathname === '/' || pathname === '/login' || pathname.startsWith('/onboarding')) {
    return true;
  }

  // Check matching prefixes against the role permissions matrix
  for (const [prefix, allowedRoles] of Object.entries(ROUTE_ROLE_PERMISSIONS)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return user.roles.some((role) => allowedRoles.includes(role));
    }
  }

  // If path is not recognized in protected matrix, do not allow arbitrary redirect
  return false;
}

/**
 * Determines the authoritative post-login destination for a newly authenticated user.
 * Considers onboarding states first, then deep links (only if authorized for the user's role),
 * and defaults to the user's canonical role dashboard.
 *
 * @param {Object} user - Authenticated user object
 * @param {string|null} [attemptedPath] - Path from location.state.from
 * @returns {string} Destination URL path
 */
export function resolvePostLoginDestination(user, attemptedPath = null) {
  if (!user) return '/login';

  // 1. Enforce mandatory password change for first-time logins
  if (user.mustChangePassword) {
    return '/onboarding/first-login';
  }

  // 2. Enforce academic verification gating for Student and Faculty (Admins bypass)
  const isAcademic = user.roles?.some((r) => ['STUDENT', 'FACULTY'].includes(r));
  if (isAcademic && !user.roles?.includes('ADMIN')) {
    if (user.verificationStatus === 'UNVERIFIED') {
      return user.roles.includes('FACULTY') ? '/onboarding/faculty' : '/onboarding/student';
    }
    if (user.verificationStatus === 'PENDING') {
      return '/onboarding/pending';
    }
    if (user.verificationStatus === 'REJECTED') {
      return '/onboarding/rejected';
    }
  }

  // 3. Evaluate deep-link candidate: ONLY if safe, explicitly permitted, and matches the user's role domain
  if (
    attemptedPath &&
    attemptedPath !== '/login' &&
    attemptedPath !== '/' &&
    !attemptedPath.startsWith('/login') &&
    isPathAuthorizedForUser(attemptedPath, user)
  ) {
    // If an Admin logs in, do not redirect to student/candidate portal left over from a previous session
    if (user.roles?.includes('ADMIN') && !attemptedPath.startsWith('/admin')) {
      return ROLE_DEFAULT_ROUTES.ADMIN;
    }
    if (user.roles?.includes('DEVELOPER') && !attemptedPath.startsWith('/developer')) {
      return ROLE_DEFAULT_ROUTES.DEVELOPER;
    }
    if (user.roles?.includes('FACULTY') && !user.roles?.includes('ADMIN') && !attemptedPath.startsWith('/faculty')) {
      return ROLE_DEFAULT_ROUTES.FACULTY;
    }
    if (
      user.roles?.includes('STUDENT') &&
      !user.roles?.includes('ADMIN') &&
      !attemptedPath.startsWith('/candidate') &&
      !attemptedPath.startsWith('/student') &&
      !attemptedPath.startsWith('/onboarding')
    ) {
      return ROLE_DEFAULT_ROUTES.STUDENT;
    }

    return attemptedPath;
  }

  // 4. Default: Canonical role dashboard
  return getDefaultRouteForUser(user);
}

/**
 * Determines which workspace navigation and layout should be rendered by AppLayout.
 * Non-admin users are strictly locked to their authorized workspace regardless of path.
 *
 * @param {string} pathname - Current window pathname
 * @param {Object|null} user - Authenticated user
 * @returns {'admin'|'faculty'|'invigilator'|'developer'|'student'} Workspace key
 */
export function resolveWorkspace(pathname, user) {
  if (!user || !Array.isArray(user.roles)) {
    return 'student';
  }

  // Admin users have cross-portal inspection rights
  if (user.roles.includes('ADMIN')) {
    if (pathname.startsWith('/faculty')) return 'faculty';
    if (pathname.startsWith('/invigilator')) return 'invigilator';
    if (pathname.startsWith('/developer')) return 'developer';
    if (pathname.startsWith('/candidate') || pathname.startsWith('/student')) return 'student';
    return 'admin';
  }

  // Non-admin roles strictly display their own workspace navigation
  if (user.roles.includes('FACULTY')) return 'faculty';
  if (user.roles.includes('INVIGILATOR')) return 'invigilator';
  if (user.roles.includes('DEVELOPER')) return 'developer';
  return 'student';
}
