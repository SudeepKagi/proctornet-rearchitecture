import 'dotenv/config';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const API_BASE = 'http://localhost:3000/api/v1';

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== AUDIT FLOW 7: Developer Health Dashboard Telemetry ===\n');

  // 1. Authenticate Developer
  console.log('1. Authenticating as Developer...');
  const devLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'developer@proctornet.edu',
      password: 'Dev#2026_SecureExams!'
    })
  });
  if (devLogin.status !== 200 || !devLogin.data?.data?.accessToken) {
    throw new Error(`Developer login failed: ${JSON.stringify(devLogin.data)}`);
  }
  const devToken = devLogin.data.data.accessToken;
  console.log('Developer authenticated successfully.');

  // 2. State A: Baseline Health with Redis running
  console.log('\n2. Fetching baseline health (Redis running)...');
  const baselineRes = await api('/developer/health?refresh=true', {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  console.log(`Baseline Health Status: HTTP ${baselineRes.status}`);
  const baseline = baselineRes.data.data;
  console.log(`Overall Health: ${baseline.status} (Up: ${baseline.upCount}, Degraded: ${baseline.degradedCount}, Down: ${baseline.downCount})`);
  console.log(`Redis Subsystem: Status: ${baseline.subsystems.redis.status}, Latency: ${baseline.subsystems.redis.latencyMs}ms, Clients: ${baseline.subsystems.redis.details.connectedClients}, Memory: ${baseline.subsystems.redis.details.usedMemory}`);

  if (baseline.subsystems.redis.status !== 'UP') {
    throw new Error('Expected Redis to be UP initially');
  }

  // 3. State B: Stop Redis container
  console.log('\n3. Stopping Redis container (docker stop proctornet-redis)...');
  await execAsync('docker stop proctornet-redis');
  console.log('Redis container stopped.');
  await sleep(1500);

  console.log('Fetching health while Redis is STOPPED (refresh=true)...');
  const stoppedRes = await api('/developer/health?refresh=true', {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  console.log(`Stopped Health Status: HTTP ${stoppedRes.status}`);
  const stopped = stoppedRes.data.data;
  console.log(`Overall Health: ${stopped.status} (Up: ${stopped.upCount}, Degraded: ${stopped.degradedCount}, Down: ${stopped.downCount})`);
  console.log(`Redis Subsystem: Status: ${stopped.subsystems.redis.status}, Latency: ${stopped.subsystems.redis.latencyMs}ms, Error: ${stopped.subsystems.redis.details.error}`);

  const redisDowntimeObserved = stopped.subsystems.redis.status === 'DOWN' && stopped.downCount > baseline.downCount;
  console.log(`Telemetry detected Redis DOWN dynamically: ${redisDowntimeObserved}`);

  // 4. State C: Restart Redis container
  console.log('\n4. Restarting Redis container (docker start proctornet-redis)...');
  await execAsync('docker start proctornet-redis');
  console.log('Redis container started.');
  await sleep(2500);

  console.log('Fetching health after Redis RESTART (refresh=true)...');
  const restoredRes = await api('/developer/health?refresh=true', {
    headers: { Authorization: `Bearer ${devToken}` }
  });
  console.log(`Restored Health Status: HTTP ${restoredRes.status}`);
  const restored = restoredRes.data.data;
  console.log(`Overall Health: ${restored.status} (Up: ${restored.upCount}, Degraded: ${restored.degradedCount}, Down: ${restored.downCount})`);
  console.log(`Redis Subsystem: Status: ${restored.subsystems.redis.status}, Latency: ${restored.subsystems.redis.latencyMs}ms, Clients: ${restored.subsystems.redis.details.connectedClients}, Memory: ${restored.subsystems.redis.details.usedMemory}`);

  const redisRecoveryObserved = restored.subsystems.redis.status === 'UP' && restored.downCount === baseline.downCount;
  console.log(`Telemetry detected Redis UP/RECOVERY dynamically: ${redisRecoveryObserved}`);

  if (!redisDowntimeObserved || !redisRecoveryObserved) {
    throw new Error('Health telemetry did not dynamically reflect container stop and restart!');
  }

  console.log('\n>>> FLOW 7 RESULT: 100% PASS - Health dashboard numbers are dynamic, actively responding to real container stoppage and recovery <<<');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nFlow 7 Error:', err);
  // Ensure Redis is running in case of test failure
  try {
    await execAsync('docker start proctornet-redis');
  } catch {}
  process.exit(1);
});
