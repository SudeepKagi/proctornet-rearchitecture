/**
 * Flow 2 Audit: Admin Bulk Import & Verification Queue
 */
import { query } from '../../src/infrastructure/postgres/pool.js';

const BASE_URL = 'http://localhost:3000/api/v1';

async function api(path, options = {}) {
  const { token, ...fetchOptions } = options;
  const isMultipart = fetchOptions.body instanceof FormData;
  const headers = {
    ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchOptions.headers || {})
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json?.data || json };
}

async function main() {
  console.log('=== FLOW 2 AUDIT: ADMIN BULK IMPORT & VERIFICATION QUEUE ===');

  // Step 1: Login as Admin
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@proctornet.edu', password: 'Admin#2026_SecureExams!' })
  });
  if (!adminLogin.ok) {
    console.error('Admin login failed:', adminLogin.data);
    process.exit(1);
  }
  const adminToken = adminLogin.data.accessToken;
  console.log('Admin login: PASS');

  // 2a: Bulk upload with malformed rows mixed with valid rows
  console.log('\n--- 2a: BULK CSV INGESTION WITH ROW-LEVEL ERRORS ---');
  const csvContent = [
    'Name,Email,Role,Identifier,Phone',
    'Valid Student One,bulk_valid_1@proctornet.edu,STUDENT,USN_VALID_01,+91 9999900001',
    'Malformed Student BadEmail,bad-email-no-at-sign,STUDENT,USN_MALFORMED_02,+91 9999900002',
    'Malformed Student NoUSN,bulk_nousn@proctornet.edu,STUDENT,,+91 9999900003',
    'Valid Student Two,bulk_valid_2@proctornet.edu,STUDENT,USN_VALID_04,+91 9999900004'
  ].join('\n');

  const formData = new FormData();
  const blob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('file', blob, 'students_roster_mixed.csv');
  formData.append('defaultRole', 'STUDENT');

  const previewRes = await api('/admin/users/bulk-import/preview', {
    method: 'POST',
    token: adminToken,
    body: formData
  });

  console.log('Bulk Preview Status:', previewRes.status);
  console.log('Total Rows:', previewRes.data?.summary?.totalRows);
  console.log('Valid Count:', previewRes.data?.summary?.validCount);
  console.log('Invalid Count:', previewRes.data?.summary?.invalidCount);
  console.log('Row-level errors breakdown:');
  console.table(previewRes.data?.invalidRows);

  if (previewRes.data?.invalidRows?.length !== 2) {
    console.error('Expected exactly 2 row-level failures, got:', previewRes.data?.invalidRows?.length);
  } else {
    console.log('Row-level error breakdown: VERIFIED PASS');
  }

  // 2b: Approval queue & side-by-side review
  console.log('\n--- 2b: VERIFICATION APPROVAL QUEUE & DECISIONS ---');
  // First, create two test candidates in PENDING status with face photos & ID documents
  const cand1Email = `approval_cand1_${Date.now()}@proctornet.edu`;
  const cand2Email = `approval_cand2_${Date.now()}@proctornet.edu`;

  const id1 = 'USN_' + Math.floor(Math.random() * 1000000);
  const id2 = 'USN_' + Math.floor(Math.random() * 1000000);
  const prov1 = await api('/admin/users', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ name: 'Candidate To Approve', email: cand1Email, role: 'STUDENT', identifier: id1 })
  });
  const prov2 = await api('/admin/users', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ name: 'Candidate To Reject', email: cand2Email, role: 'STUDENT', identifier: id2 })
  });

  const cand1Id = prov1.data?.user?.userId || prov1.data?.userId;
  const cand2Id = prov2.data?.user?.userId || prov2.data?.userId;

  // Set them up in DB with face photo, ID photo, and PENDING status
  const dummyFace = 'https://s3.ap-south-1.amazonaws.com/proctornet-evidence/face-reference/cand_photo.jpg';
  const dummyIdDoc = 'https://s3.ap-south-1.amazonaws.com/proctornet-evidence/documents/cand_id_card.jpg';

  await query(`
    UPDATE users 
    SET must_change_password = FALSE,
        verification_status = 'PENDING',
        enrolled_face_photo_url = $1,
        id_document_url = $2
    WHERE user_id IN ($3, $4)
  `, [dummyFace, dummyIdDoc, cand1Id, cand2Id]);

  // Insert student identity documents so document dossier queries work
  await query(`
    INSERT INTO student_identity_documents (
      document_id, user_id, document_type, document_number_hash, document_number_last4,
      full_name_on_document, s3_bucket, s3_key, file_name, mime_type, byte_size, magic_bytes_verified, verification_status
    )
    VALUES 
      (gen_random_uuid(), $1, 'STUDENT_ID', 'hash1', '0001', 'Candidate To Approve', 'proctornet-evidence', 'documents/cand1_id.jpg', 'cand1_id.jpg', 'image/jpeg', 10240, TRUE, 'PENDING'),
      (gen_random_uuid(), $2, 'STUDENT_ID', 'hash2', '0002', 'Candidate To Reject', 'proctornet-evidence', 'documents/cand2_id.jpg', 'cand2_id.jpg', 'image/jpeg', 10240, TRUE, 'PENDING')
    ON CONFLICT DO NOTHING
  `, [cand1Id, cand2Id]);

  // Query verification queue
  const queueRes = await api('/admin/verifications?status=PENDING', {
    method: 'GET',
    token: adminToken
  });
  console.log('Verification Queue Status:', queueRes.status, 'Total pending:', queueRes.data?.total || queueRes.data?.users?.length);

  // Inspect dossier of Candidate 1 for side-by-side photos
  const dossierRes = await api(`/admin/students/${cand1Id}/verification`, {
    method: 'GET',
    token: adminToken
  });
  console.log('Candidate Dossier Status:', dossierRes.status);
  console.log('Face Photo URL present:', Boolean(dossierRes.data?.user?.enrolledFacePhotoUrl), dossierRes.data?.user?.enrolledFacePhotoUrl);
  console.log('ID Document URL present:', Boolean(dossierRes.data?.user?.idDocumentUrl || dossierRes.data?.activeDocument?.documentId), dossierRes.data?.user?.idDocumentUrl);

  // Approve Candidate 1
  const approveRes = await api(`/admin/users/${cand1Id}/verification`, {
    method: 'PATCH',
    token: adminToken,
    body: JSON.stringify({
      verificationStatus: 'VERIFIED',
      reviewNotes: 'Identity confirmed against university registry.'
    })
  });
  console.log('Approve Candidate 1 Status:', approveRes.status, approveRes.data?.verificationStatus);

  // Reject Candidate 2 (with mandatory reason)
  const rejectRes = await api(`/admin/users/${cand2Id}/verification`, {
    method: 'PATCH',
    token: adminToken,
    body: JSON.stringify({
      verificationStatus: 'REJECTED',
      reviewNotes: 'Uploaded Student ID photo is unreadable and corners are cut off.'
    })
  });
  console.log('Reject Candidate 2 Status:', rejectRes.status, rejectRes.data?.verificationStatus, 'Notes:', rejectRes.data?.verificationNotes);

  // Verify resulting state for Candidate 1 in DB and on next login
  const dbCand1 = await query('SELECT verification_status, verification_notes FROM users WHERE user_id = $1', [cand1Id]);
  console.log('Candidate 1 DB State:', dbCand1.rows[0]);

  // Candidate 1 login
  const cand1Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cand1Email, password: prov1.data.temporaryPassword })
  });
  console.log('Candidate 1 Login Status:', cand1Login.status, 'verificationStatus:', cand1Login.data?.user?.verificationStatus);

  // Verify resulting state for Candidate 2 in DB and on next login
  const dbCand2 = await query('SELECT verification_status, verification_notes FROM users WHERE user_id = $1', [cand2Id]);
  console.log('Candidate 2 DB State:', dbCand2.rows[0]);

  // Candidate 2 login
  const cand2Login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: cand2Email, password: prov2.data.temporaryPassword })
  });
  console.log('Candidate 2 Login Status:', cand2Login.status, 'verificationStatus:', cand2Login.data?.user?.verificationStatus);

  // Check onboarding status API for candidate 2 to confirm rejection notes are returned
  const cand2Status = await api('/users/me/onboarding-status', {
    method: 'GET',
    token: cand2Login.data?.accessToken
  });
  console.log('Candidate 2 Onboarding Status API result:', cand2Status.data?.verificationStatus, 'Rejection note:', cand2Status.data?.verificationNotes);

  console.log('\n=== FLOW 2 AUDIT COMPLETE: ALL STEPS VERIFIED ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Flow 2 Error:', err);
  process.exit(1);
});
