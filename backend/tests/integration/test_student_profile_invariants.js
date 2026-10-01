/**
 * Live integration test for Student Profile Invariants and Photo Re-Verification
 */
async function run() {
  const baseUrl = 'http://localhost:3000/api/v1';

  // 1. Admin login
  console.log('1. Admin login...');
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@proctornet.edu', password: 'Admin#2026_SecureExams!' })
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.data.accessToken;

  // 2. Fetch canonical department
  const deptsRes = await fetch(`${baseUrl}/student/departments`);
  const deptsData = await deptsRes.json();
  const departments = deptsData.data?.departments || deptsData.data || [];
  const dept = departments[0];

  // 3. Create a test student
  const usn = `1MS21CS${Date.now().toString().slice(-3)}`;
  const email = `student_inv_${Date.now().toString().slice(-4)}@proctornet.edu`;
  console.log(`2. Admin creating student ${usn} (${email})...`);
  const createRes = await fetch(`${baseUrl}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      email,
      role: 'STUDENT',
      identifier: usn
    })
  });
  const createData = await createRes.json();
  const tempPassword = createData.temporaryPassword || createData.data?.temporaryPassword;
  const studentId = (createData.user || createData.data?.user)?.userId;

  // 4. Student login & change temp password
  const studentLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: tempPassword })
  });
  const studentLoginData = await studentLoginRes.json();
  const initialStudentToken = studentLoginData.data.accessToken;

  const newPassword = 'SecureStudentPass123!';
  await fetch(`${baseUrl}/users/me/first-login/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${initialStudentToken}`
    },
    body: JSON.stringify({ currentPassword: tempPassword, newPassword })
  });

  // Re-login with new password
  const reLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: newPassword })
  });
  const reLoginData = await reLoginRes.json();
  let studentToken = reLoginData.data.accessToken;

  // 5. Complete Student Setup
  console.log('3. Student submitting initial setup (College ID + Face Photo)...');
  const initialFacePhoto = 'data:image/jpeg;base64,INITIAL_TRUSTED_PHOTO_DATA';
  const initialCollegeId = 'data:image/jpeg;base64,INITIAL_COLLEGE_ID_DATA';
  const setupRes = await fetch(`${baseUrl}/student/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      name: 'Invariant Student Tester',
      departmentId: dept.department_id,
      semester: 4,
      facePhotoUrl: initialFacePhoto,
      collegeIdUrl: initialCollegeId
    })
  });
  const setupData = await setupRes.json();
  if (!setupRes.ok) throw new Error(`Student setup failed: ${JSON.stringify(setupData)}`);
  console.log('Initial setup submitted.');

  // 6. Admin approves initial verification
  console.log('4. Admin approving initial enrollment...');
  await fetch(`${baseUrl}/admin/users/${studentId}/verification`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ verificationStatus: 'VERIFIED' })
  });
  console.log('Student account is now fully VERIFIED.');

  // 7. INVARIANT TEST: Student tries to mutate semester or department via PATCH /student/profile
  console.log('5. Testing read-only invariant on PATCH /student/profile...');
  const illegalPatchRes = await fetch(`${baseUrl}/student/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      name: 'Attempted Mutator',
      semester: 8
    })
  });
  const illegalPatchData = await illegalPatchRes.json();
  console.log(`Response status for illegal semester edit: ${illegalPatchRes.status}`);
  if (illegalPatchRes.status !== 400) {
    throw new Error(`Expected 400 Bad Request for semester mutation, got ${illegalPatchRes.status}: ${JSON.stringify(illegalPatchData)}`);
  }
  console.log('PASSED: Server strictly rejected unauthorized semester mutation:', illegalPatchData.message || illegalPatchData.error?.message);

  // 8. LEGAL UPDATE: Student updates their display name and phone
  console.log('6. Student updating allowed profile fields (name and phone)...');
  const legalPatchRes = await fetch(`${baseUrl}/student/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      name: 'Verified Student Jane',
      phone: '+91 98765 00000'
    })
  });
  const legalPatchData = await legalPatchRes.json();
  if (!legalPatchRes.ok) throw new Error(`Legal profile update failed: ${JSON.stringify(legalPatchData)}`);
  console.log('PASSED: Allowed fields updated successfully. Name:', legalPatchData.data?.name);

  // 9. PHOTO RE-VERIFICATION: Student requests a photo update
  console.log('7. Student submitting photo update request...');
  const newPhotoData = 'data:image/jpeg;base64,NEW_PENDING_FACE_PHOTO_DATA';
  const photoUpdateRes = await fetch(`${baseUrl}/student/photo-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      photoUrl: newPhotoData
    })
  });
  const photoUpdateData = await photoUpdateRes.json();
  if (!photoUpdateRes.ok) throw new Error(`Photo update request failed: ${JSON.stringify(photoUpdateData)}`);
  console.log('Photo update request response:', photoUpdateData.data?.message);

  // Verify that active face photo is UNCHANGED and pending photo is stored
  const profileAfterReqRes = await fetch(`${baseUrl}/student/profile`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const profileAfterReq = (await profileAfterReqRes.json()).data;
  console.log('Active face photo remains:', profileAfterReq.face_photo_url.slice(0, 35));
  console.log('Pending face photo is:', profileAfterReq.pending_face_photo_url.slice(0, 35));
  console.log('Photo review status is:', profileAfterReq.photo_review_status);

  if (profileAfterReq.face_photo_url !== initialFacePhoto) {
    throw new Error('Active face photo was silently overwritten before admin review!');
  }
  if (profileAfterReq.pending_face_photo_url !== newPhotoData) {
    throw new Error('Pending face photo was not saved properly!');
  }
  if (profileAfterReq.photo_review_status !== 'PENDING') {
    throw new Error(`Expected photo_review_status PENDING, got ${profileAfterReq.photo_review_status}`);
  }
  console.log('PASSED: Active face photo was NOT overwritten; pending review status set correctly.');

  // 10. Admin approves photo update
  console.log('8. Admin reviewing and approving photo update...');
  const adminPhotoApproveRes = await fetch(`${baseUrl}/admin/users/${studentId}/verification`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ verificationStatus: 'VERIFIED' })
  });
  const adminPhotoApproveData = await adminPhotoApproveRes.json();
  if (!adminPhotoApproveRes.ok) throw new Error(`Admin photo approval failed: ${JSON.stringify(adminPhotoApproveData)}`);

  // Verify that active face photo is now updated and pending is cleared
  const profileAfterApprovalRes = await fetch(`${baseUrl}/student/profile`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const profileAfterApproval = (await profileAfterApprovalRes.json()).data;
  console.log('Active face photo after admin approval:', profileAfterApproval.face_photo_url.slice(0, 35));
  console.log('Pending face photo after admin approval:', profileAfterApproval.pending_face_photo_url);
  console.log('Photo review status after admin approval:', profileAfterApproval.photo_review_status);

  if (profileAfterApproval.face_photo_url !== newPhotoData) {
    throw new Error('Active face photo was not promoted to approved new photo!');
  }
  if (profileAfterApproval.pending_face_photo_url !== null) {
    throw new Error('Pending face photo was not cleared after approval!');
  }
  if (profileAfterApproval.photo_review_status !== 'APPROVED') {
    throw new Error(`Expected photo_review_status APPROVED, got ${profileAfterApproval.photo_review_status}`);
  }

  console.log('ALL STUDENT INVARIANT AND PHOTO RE-VERIFICATION CHECKS PASSED WITH FLYING COLORS!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
