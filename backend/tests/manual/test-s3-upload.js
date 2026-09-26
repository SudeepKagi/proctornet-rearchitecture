import fs from 'node:fs';

const API_BASE = 'http://localhost:3000/api/v1';

async function main() {
  console.log('--- Testing End-to-End S3 Upload & Confirmation Flow ---');

  // 1. Student Login
  const studentEmail = '1nt23ec158.sudeep@nmit.ac.in';
  const studentPassword = 'Student#2026_SecureExams!';

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: studentEmail, password: studentPassword })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  const token = loginData.data.accessToken;
  console.log('1. Student logged in successfully.');

  // 2. Request upload URL
  const imagePath = 'C:\\Users\\sudee\\.gemini\\antigravity-ide\\brain\\902954e6-3108-4de3-bd81-2ff44b0d18d1\\.user_uploaded\\media_1789740929266.png';
  const fileBuffer = fs.readFileSync(imagePath);

  console.log('2. Requesting document presigned URL...');
  const ticketRes = await fetch(`${API_BASE}/candidate/identity/document-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      documentType: 'STUDENT_ID',
      documentNumber: '1NT23EC158',
      fullNameOnDocument: 'Sudeep Shankaranand Kagi',
      fileName: 'student_id_card.png',
      mimeType: 'image/png',
      byteSize: fileBuffer.length,
      issueCountry: 'Nitte Meenakshi Institute Of Technology',
      expiryDate: '2027-07-31'
    })
  });
  const ticketData = await ticketRes.json();
  console.log('Ticket Response Status:', ticketRes.status);
  console.log('Ticket Data:', JSON.stringify(ticketData, null, 2));
  if (!ticketRes.ok) throw new Error(`Ticket request failed: ${JSON.stringify(ticketData)}`);

  const { documentId, uploadUrl } = ticketData;

  // 3. Upload binary to S3
  console.log('3. Uploading binary to S3 via PUT to:', uploadUrl);
  const s3UploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png'
    },
    body: fileBuffer
  });
  console.log('S3 Upload Status:', s3UploadRes.status);
  if (!s3UploadRes.ok) {
    const s3ErrText = await s3UploadRes.text();
    throw new Error(`S3 upload failed (HTTP ${s3UploadRes.status}): ${s3ErrText}`);
  }

  // 4. Confirm document
  console.log('4. Confirming document upload...');
  const confirmRes = await fetch(`${API_BASE}/candidate/identity/confirm-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ documentId })
  });
  const confirmData = await confirmRes.json();
  console.log('Confirm Response Status:', confirmRes.status);
  console.log('Confirm Response Data:', JSON.stringify(confirmData, null, 2));
  if (!confirmRes.ok) throw new Error(`Confirmation failed: ${JSON.stringify(confirmData)}`);

  // 5. Check identity status
  console.log('5. Checking candidate identity status...');
  const statusRes = await fetch(`${API_BASE}/candidate/identity/status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const statusData = await statusRes.json();
  console.log('Identity Status:', JSON.stringify(statusData, null, 2));

  console.log('\n=== ALL END-TO-END S3 UPLOAD & CONFIRMATION TESTS PASSED! ===');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
