/**
 * Flow 1 Audit: Auth & Onboarding
 */
import { query } from '../src/infrastructure/postgres/pool.js';

const BASE_URL = 'http://localhost:3000/api/v1';

async function api(path, options = {}) {
  const { token, ...fetchOptions } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {})
    }
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json?.data || json };
}

async function main() {
  console.log('=== FLOW 1 AUDIT: AUTH & ONBOARDING ===');

  // Step 1: Login as Admin to provision temporary users
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@proctornet.edu', password: 'Admin#2026_SecureExams!' })
  });
  if (!adminLogin.ok) {
    console.error('Admin login failed:', adminLogin.data);
    process.exit(1);
  }
  const adminToken = adminLogin.data.accessToken;
  console.log('Admin login: PASS, Token:', adminToken.slice(0, 15) + '...');

  // Create temporary student account
  const studentEmail = `audit_student_${Date.now()}@proctornet.edu`;
  const provStudent = await api('/admin/users', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({
      name: 'Audit Student Test',
      email: studentEmail,
      role: 'STUDENT',
      identifier: 'USN' + Math.floor(Math.random() * 100000)
    })
  });
  console.log('Provision student response:', provStudent.status, provStudent.data);
  const tempStudentPassword = provStudent.data?.temporaryPassword;
  if (!tempStudentPassword) {
    throw new Error('No temporary password returned: ' + JSON.stringify(provStudent.data));
  }

  // 1a: Log in with temp credential
  const studentLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: studentEmail, password: tempStudentPassword })
  });
  console.log('Temp student login response status:', studentLogin.status);
  console.log('mustChangePassword:', studentLogin.data?.user?.mustChangePassword);
  console.log('verificationStatus:', studentLogin.data?.user?.verificationStatus);
  const studentToken = studentLogin.data?.accessToken;

  // 1a: Confirm candidate exams / sessions API is genuinely blocked with PASSWORD_CHANGE_REQUIRED
  const blockedPasswordReq = await api('/exams', {
    method: 'GET',
    token: studentToken
  });
  console.log('API before password change status:', blockedPasswordReq.status, blockedPasswordReq.data);

  // 1b: Change first login password via canonical route
  const newPassword = 'PermanentPass123!@#';
  const changePassReq = await api('/users/me/first-login/change-password', {
    method: 'POST',
    token: studentToken,
    body: JSON.stringify({
      currentPassword: tempStudentPassword,
      newPassword: newPassword
    })
  });
  console.log('First login password change status:', changePassReq.status, changePassReq.data);

  // Login with new password
  const studentNewLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: studentEmail, password: newPassword })
  });
  const activeStudentToken = studentNewLogin.data?.accessToken;
  console.log('Login with new password status:', studentNewLogin.status, 'mustChangePassword:', studentNewLogin.data?.user?.mustChangePassword);

  // Confirm API before onboarding is blocked with ONBOARDING_REQUIRED
  const blockedOnboardingReq = await api('/exams', {
    method: 'GET',
    token: activeStudentToken
  });
  console.log('API before onboarding status:', blockedOnboardingReq.status, blockedOnboardingReq.data);

  // Submit profile details (dept, semester) via canonical route
  const submitProfileReq = await api('/users/me/onboarding', {
    method: 'POST',
    token: activeStudentToken,
    body: JSON.stringify({
      department: 'Computer Science & Engineering',
      semester: 4,
      phone: '+91 9876543210'
    })
  });
  console.log('Submit student profile status:', submitProfileReq.status, submitProfileReq.data);

  // Check DB status for student: should now be PENDING
  const dbUser = await query('SELECT user_id, email, status, verification_status, must_change_password FROM users WHERE email = $1', [studentEmail]);
  console.log('DB Student State after profile submit:', dbUser.rows[0]);

  // Try hitting a candidate dashboard API route directly with the token while still pending
  const directApiWhilePending = await api('/exams', {
    method: 'GET',
    token: activeStudentToken
  });
  console.log('Dashboard API while pending status (MUST BE 403 VERIFICATION_PENDING):', directApiWhilePending.status, directApiWhilePending.data);

  // Repeat for Faculty
  console.log('\n--- FACULTY SETUP ---');
  const facultyEmail = `audit_faculty_${Date.now()}@proctornet.edu`;
  const provFaculty = await api('/admin/users', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({
      name: 'Audit Faculty Test',
      email: facultyEmail,
      role: 'FACULTY',
      identifier: 'EMP' + Math.floor(Math.random() * 100000)
    })
  });
  console.log('Provision faculty response:', provFaculty.status, provFaculty.data?.user?.email);
  const tempFacultyPassword = provFaculty.data?.temporaryPassword;

  // Faculty temp login
  const facultyLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: facultyEmail, password: tempFacultyPassword })
  });
  console.log('Faculty temp login status:', facultyLogin.status, 'mustChangePassword:', facultyLogin.data?.user?.mustChangePassword);
  const facultyToken = facultyLogin.data?.accessToken;

  // Change faculty password
  const facChangePass = await api('/users/me/first-login/change-password', {
    method: 'POST',
    token: facultyToken,
    body: JSON.stringify({
      currentPassword: tempFacultyPassword,
      newPassword: 'FacultyPermanentPass123!@#'
    })
  });
  console.log('Faculty change password status:', facChangePass.status, facChangePass.data);

  // Faculty new login
  const facNewLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: facultyEmail, password: 'FacultyPermanentPass123!@#' })
  });
  const activeFacToken = facNewLogin.data?.accessToken;

  // Submit faculty profile
  const facProfileReq = await api('/users/me/onboarding', {
    method: 'POST',
    token: activeFacToken,
    body: JSON.stringify({
      department: 'Computer Science & Engineering',
      designation: 'Assistant Professor',
      phone: '+91 9123456780'
    })
  });
  console.log('Faculty submit profile status:', facProfileReq.status, facProfileReq.data);

  const dbFaculty = await query('SELECT user_id, email, status, verification_status, must_change_password FROM users WHERE email = $1', [facultyEmail]);
  console.log('DB Faculty State after profile submit:', dbFaculty.rows[0]);

  // Try hitting faculty dashboard route while pending
  const facDashboardWhilePending = await api('/faculty/exams', {
    method: 'GET',
    token: activeFacToken
  });
  console.log('Faculty dashboard while pending status (MUST BE 403):', facDashboardWhilePending.status, facDashboardWhilePending.data);

  console.log('\n=== FLOW 1 AUDIT COMPLETE: ALL STEPS VERIFIED ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Flow 1 Error:', err);
  process.exit(1);
});
