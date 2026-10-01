/**
 * Live test of full Teacher account creation -> first login -> onboarding -> admin approval
 */
async function run() {
  const baseUrl = 'http://localhost:3000/api/v1';

  // 1. Admin Login
  console.log('1. Logging in as Admin...');
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@proctornet.edu',
      password: 'Admin#2026_SecureExams!'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  if (!adminLoginRes.ok) throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
  const adminToken = adminLoginData.data.accessToken;
  console.log('Admin logged in successfully.');

  // 2. Fetch canonical departments
  const deptsRes = await fetch(`${baseUrl}/student/departments`);
  const deptsData = await deptsRes.json();
  const departments = deptsData.data?.departments || deptsData.data || [];
  if (!departments.length) throw new Error('No departments found');
  const chosenDept = departments[0];
  console.log(`2. Sourced canonical branch: ${chosenDept.name} (${chosenDept.department_id})`);

  // 3. Admin creates Teacher
  const empId = `EMP-${Date.now().toString().slice(-5)}`;
  const teacherEmail = `teacher_${Date.now().toString().slice(-5)}@proctornet.edu`;
  console.log(`3. Admin creating teacher ${empId} (${teacherEmail})...`);
  const createRes = await fetch(`${baseUrl}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      email: teacherEmail,
      role: 'FACULTY',
      identifier: empId
    })
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(`Teacher creation failed: ${JSON.stringify(createData)}`);
  const tempPassword = createData.temporaryPassword || createData.data?.temporaryPassword;
  const teacherId = (createData.user || createData.data?.user)?.userId;
  console.log(`Teacher created. Temp password: ${tempPassword}, User ID: ${teacherId}`);

  // 4. Teacher first login
  console.log('4. Logging in as Teacher with temporary password...');
  const teacherLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: tempPassword
    })
  });
  const teacherLoginData = await teacherLoginRes.json();
  if (!teacherLoginRes.ok) throw new Error(`Teacher login failed: ${JSON.stringify(teacherLoginData)}`);
  const teacherToken = teacherLoginData.data.accessToken;
  console.log(`Teacher logged in. mustChangePassword: ${teacherLoginData.data.user.mustChangePassword}`);
  if (!teacherLoginData.data.user.mustChangePassword) throw new Error('Expected mustChangePassword to be true');

  // 5. Change password
  console.log('5. Teacher changing temporary password...');
  const newPassword = 'SecureTeacherPass123!';
  const changePassRes = await fetch(`${baseUrl}/users/me/first-login/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`
    },
    body: JSON.stringify({
      currentPassword: tempPassword,
      newPassword
    })
  });
  const changePassData = await changePassRes.json();
  if (!changePassRes.ok) throw new Error(`Change password failed: ${JSON.stringify(changePassData)}`);
  console.log('Password successfully changed.');

  // 6. Submit onboarding profile
  console.log('6. Teacher submitting onboarding profile with canonical branch & designation...');
  const submitOnboardingRes = await fetch(`${baseUrl}/users/me/onboarding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`
    },
    body: JSON.stringify({
      departmentId: chosenDept.department_id,
      department: chosenDept.name,
      designation: 'Associate Professor',
      phone: '+91 9123456780'
    })
  });
  const submitData = await submitOnboardingRes.json();
  if (!submitOnboardingRes.ok) throw new Error(`Submit onboarding failed: ${JSON.stringify(submitData)}`);
  console.log(`Onboarding submitted. Verification status: ${submitData.data?.verificationStatus || submitData.status}`);

  // 7. Admin reviews and approves teacher
  console.log('7. Admin approving teacher verification...');
  const approveRes = await fetch(`${baseUrl}/admin/users/${teacherId}/verification`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      verificationStatus: 'VERIFIED'
    })
  });
  const approveData = await approveRes.json();
  if (!approveRes.ok) throw new Error(`Admin approval failed: ${JSON.stringify(approveData)}`);
  console.log('Admin approval successful. Teacher is now VERIFIED.');

  // 8. Verify Teacher profile
  const profileRes = await fetch(`${baseUrl}/users/me/onboarding-status`, {
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const profileData = await profileRes.json();
  console.log('Final Teacher Onboarding Status:', JSON.stringify(profileData.data, null, 2));
  console.log('ALL TEACHER ONBOARDING CHECKS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
