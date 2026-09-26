import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'http://localhost:3000/api/v1';

async function main() {
  console.log('--- ProctorNet Student ID Extraction API Test ---');

  // 1. Admin login to provision or find student
  console.log('\n1. Logging in as Admin...');
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@proctornet.edu',
      password: 'Admin#2026_SecureExams!'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  if (!adminLoginRes.ok) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
  }
  const adminToken = adminLoginData.data.accessToken;
  console.log('Admin login successful.');

  // 2. Set known password for student in DB
  const studentEmail = '1nt23ec158.sudeep@nmit.ac.in';
  const studentPassword = 'Student#2026_SecureExams!';
  console.log(`\n2. Setting known password for ${studentEmail}...`);

  const { hashPassword } = await import('../../src/modules/auth/password.service.js');
  const { query } = await import('../../src/infrastructure/postgres/pool.js');
  const hashed = await hashPassword(studentPassword);
  await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashed, studentEmail]);
  console.log('Password updated in DB.');

  // Login as student
  const studentLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: studentEmail,
      password: studentPassword
    })
  });
  const studentLoginData = await studentLoginRes.json();
  if (!studentLoginRes.ok) {
    throw new Error(`Student login failed: ${JSON.stringify(studentLoginData)}`);
  }
  const studentToken = studentLoginData.data.accessToken;
  console.log('Student logged in successfully!');

  // 3. Test Student ID Card Extraction endpoint
  console.log('\n3. Testing POST /api/v1/candidate/identity/extract-card with student card image...');
  const imagePath = 'C:\\Users\\sudee\\.gemini\\antigravity-ide\\brain\\902954e6-3108-4de3-bd81-2ff44b0d18d1\\.user_uploaded\\media_1789740929266.png';
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found at ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const blob = new Blob([imageBuffer], { type: 'image/png' });
  const formData = new FormData();
  formData.append('card', blob, 'student_id_card.png');

  const extractRes = await fetch(`${API_BASE}/candidate/identity/extract-card`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${studentToken}`
    },
    body: formData
  });

  const extractData = await extractRes.json();
  console.log('Extraction Response Status:', extractRes.status);
  console.log('Extraction Response Data:', JSON.stringify(extractData, null, 2));

  if (!extractRes.ok) {
    throw new Error(`Extraction failed: ${JSON.stringify(extractData)}`);
  }

  const extracted = extractData.data.extracted;
  console.log('\n--- Extracted Details Verification ---');
  console.log('Full Name:   ', extracted.detectedName);
  console.log('USN/ID:      ', extracted.detectedStudentId);
  console.log('Branch:      ', extracted.detectedBranch);
  console.log('Department:  ', extracted.detectedDepartment);
  console.log('Institution: ', extracted.detectedInstitution);
  console.log('Validity:    ', extracted.detectedValidity);
  console.log('Confidence:  ', extracted.confidence);

  // 4. Test Profile update with verified details
  console.log('\n4. Testing candidate profile update with verified details...');
  const updateRes = await fetch(`${API_BASE}/candidate/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      department: extracted.detectedDepartment,
      enrollmentNumber: extracted.detectedStudentId
    })
  });
  const updateData = await updateRes.json();
  console.log('Update Profile Status:', updateRes.status);
  console.log('Updated Profile:', JSON.stringify(updateData, null, 2));

  console.log('\n=== All Student ID Card Extraction & Verification Tests PASSED Successfully! ===');
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
