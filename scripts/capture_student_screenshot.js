import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const artifactDir = 'C:\\Users\\sudee\\.gemini\\antigravity-ide\\brain\\e7dc7a50-fad8-41d0-a28c-391fd9852bb6';
  const outputPath = path.join(artifactDir, 'student_dashboard_three_sections.png');
  const port = 9355;

  console.log('1. Admin logging in to provision fresh verified student...');
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@proctornet.edu', password: 'Admin#2026_SecureExams!' })
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.data.accessToken;

  const deptsRes = await fetch(`${baseUrl}/student/departments`);
  const deptsData = await deptsRes.json();
  const dept = (deptsData.data?.departments || deptsData.data)[0];

  const tag = Date.now().toString().slice(-4);
  const usn = `1MS21CS${tag}`;
  const studentEmail = `student_snap_${tag}@proctornet.edu`;
  const studentPass = 'SecurePass2026!';

  const createRes = await fetch(`${baseUrl}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ email: studentEmail, role: 'STUDENT', identifier: usn })
  });
  const createData = await createRes.json();
  const tempPass = createData.data?.temporaryPassword || createData.temporaryPassword;
  const studentId = (createData.data?.user || createData.user)?.userId;

  // Student change password
  const sLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: studentEmail, password: tempPass })
  });
  const sLoginData = await sLoginRes.json();
  const sTempToken = sLoginData.data.accessToken;

  await fetch(`${baseUrl}/users/me/first-login/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sTempToken}` },
    body: JSON.stringify({ currentPassword: tempPass, newPassword: studentPass })
  });

  // Re-login with new password
  const sLoginNewRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: studentEmail, password: studentPass })
  });
  const sLoginNewData = await sLoginNewRes.json();
  const sNewToken = sLoginNewData.data.accessToken;
  const setCookieHeader = sLoginNewRes.headers.get('set-cookie') || '';
  const match = setCookieHeader.match(/refreshToken=([^;]+)/);
  const refreshToken = match ? match[1] : '';

  // Submit setup
  const mockB64 = 'data:image/jpeg;base64,' + Buffer.from('mock photo').toString('base64');
  await fetch(`${baseUrl}/student/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sNewToken}` },
    body: JSON.stringify({
      name: 'Aditya Sharma',
      departmentId: dept.department_id || dept.id,
      semester: 4,
      facePhotoUrl: mockB64,
      collegeIdUrl: mockB64
    })
  });

  // Admin approves setup
  const reviewRes = await fetch(`${baseUrl}/admin/users/${studentId}/verification`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ verificationStatus: 'VERIFIED', reviewNotes: 'Verified institutional identity' })
  });
  const reviewData = await reviewRes.json();
  console.log('Admin approval result:', reviewData);

  console.log(`Fresh verified student provisioned: ${studentEmail} (Refresh Token: ${refreshToken.slice(0, 10)}...)`);

  // Spawning Chrome
  console.log(`2. Spawning headless Chrome on port ${port}...`);
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,1100',
    'about:blank'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('Could not find page target in Chrome');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;

    function sendCmd(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (event) => {
          const res = JSON.parse(event.data);
          if (res.id === id) {
            ws.removeEventListener('message', handler);
            if (res.error) reject(new Error(JSON.stringify(res.error)));
            else resolve(res.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((resolve) => ws.addEventListener('open', resolve));
    await sendCmd('Page.enable');
    await sendCmd('Network.enable');

    console.log('3. Injecting refreshToken cookie via CDP Network.setCookie...');
    if (refreshToken) {
      await sendCmd('Network.setCookie', {
        name: 'refreshToken',
        value: refreshToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax'
      });
    }

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('Browser Exception:', JSON.stringify(msg.params.exceptionDetails));
      }
    });

    console.log('4. Navigating to Student Dashboard (http://localhost:5173/candidate)...');
    await sendCmd('Page.navigate', { url: 'http://localhost:5173/candidate' });

    console.log('5. Waiting 4.5s for dashboard to render...');
    await new Promise((r) => setTimeout(r, 4500));

    const pageText = await sendCmd('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    });
    console.log('\n--- Student Dashboard Content ---\n', pageText.result?.value, '\n----------------------------------\n');

    console.log('6. Capturing full page screenshot...');
    const result = await sendCmd('Page.captureScreenshot', { format: 'png' });
    const imageBuffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(outputPath, imageBuffer);

    console.log('SUCCESS: Captured verified Student Dashboard screenshot at:', outputPath);
    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error('Failed to capture screenshot:', err);
  process.exit(1);
});
