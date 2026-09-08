/**
 * @file chaos-harness.js
 * @description Core fault injection, container lifecycle management, and recovery observation harness.
 * Implements strict workstation safeguards, container identity verification, and automatic cleanup hooks.
 */

import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Allowed target container names in ProctorNet local development environment
const ALLOWED_CONTAINERS = new Set([
  'proctornet-postgres',
  'proctornet-redis',
  'proctornet-rabbitmq',
  'proctornet-backend',
  'proctornet-localstack',
  'proctornet-coturn'
]);

// Registry of containers whose state has been altered during tests
const alteredContainers = new Map(); // containerName -> 'PAUSED' | 'STOPPED'

// Global teardown hooks registered across scenarios
const teardownHooks = [];

/**
 * Registers a teardown hook to run on test completion or unexpected process exit.
 * @param {Function} fn - Async or sync cleanup function
 */
export function registerTeardownHook(fn) {
  if (typeof fn === 'function') {
    teardownHooks.push(fn);
  }
}

/**
 * Executes all registered teardown hooks and restores altered containers.
 */
export async function executeTeardown() {
  // 1. Restore any paused or stopped containers
  for (const [containerName, state] of alteredContainers.entries()) {
    try {
      if (state === 'PAUSED') {
        console.log(`[ChaosHarness] Teardown: Unpausing container ${containerName}...`);
        execSync(`docker unpause ${containerName}`, { stdio: 'ignore', timeout: 10000 });
      } else if (state === 'STOPPED') {
        console.log(`[ChaosHarness] Teardown: Starting stopped container ${containerName}...`);
        execSync(`docker start ${containerName}`, { stdio: 'ignore', timeout: 15000 });
      }
    } catch (restoreErr) {
      console.error(`[ChaosHarness] Failed to restore container ${containerName}:`, restoreErr.message);
    }
  }
  alteredContainers.clear();

  // 2. Execute custom teardown hooks
  while (teardownHooks.length > 0) {
    const hook = teardownHooks.pop();
    try {
      await hook();
    } catch (hookErr) {
      console.error('[ChaosHarness] Teardown hook error:', hookErr.message);
    }
  }
}

// Attach process-level kill switches to prevent leaving containers in paused/stopped state
let killSwitchAttached = false;
export function attachKillSwitch() {
  if (killSwitchAttached) return;
  killSwitchAttached = true;

  const handleSignal = async (signal) => {
    console.warn(`\n[ChaosHarness] Received ${signal}. Executing emergency chaos cleanup...`);
    try {
      await executeTeardown();
      console.log('[ChaosHarness] Emergency cleanup completed.');
    } catch (err) {
      console.error('[ChaosHarness] Emergency cleanup encountered error:', err.message);
    }
    process.exit(1);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));
}

/**
 * Mandatory Identity Verification (Correction 5):
 * Asserts that the target container belongs to the local ProctorNet development stack.
 *
 * @param {string} containerName
 * @throws {Error} If container identity or context cannot be verified
 */
export function verifyTargetIdentity(containerName) {
  if (!ALLOWED_CONTAINERS.has(containerName)) {
    throw new Error(
      `[ChaosHarness] Security Violation: Target '${containerName}' is not in the allowed container registry. Aborting.`
    );
  }

  try {
    const output = execSync(
      `docker inspect --format="{{.Name}} {{.Config.Image}} {{.State.Running}}" ${containerName}`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (!output || output.length === 0) {
      throw new Error(`Target container '${containerName}' does not exist or is not recognized.`);
    }

    const [name, image, running] = output.split(' ');
    // Verify container name matches
    if (!name.includes(containerName)) {
      throw new Error(`Target container name mismatch: expected ${containerName}, got ${name}`);
    }

    return {
      name: containerName,
      image,
      running: running === 'true'
    };
  } catch (err) {
    throw new Error(
      `[ChaosHarness] Identity verification failed for '${containerName}': ${err.message}. Aborting scenario.`
    );
  }
}

/**
 * Pauses a target container with automatic unpause safety timeout.
 *
 * @param {string} containerName
 * @param {number} [maxDurationMs=15000] - Safety cap after which container is automatically unpaused
 * @returns {Promise<void>}
 */
export async function pauseContainer(containerName, maxDurationMs = 15000) {
  verifyTargetIdentity(containerName);
  attachKillSwitch();

  console.log(`[ChaosHarness] Pausing container: ${containerName} (max safety duration: ${maxDurationMs}ms)...`);
  execSync(`docker pause ${containerName}`, { stdio: 'pipe', timeout: 10000 });
  alteredContainers.set(containerName, 'PAUSED');

  // Automatic unpause safety fallback
  const timer = setTimeout(() => {
    if (alteredContainers.get(containerName) === 'PAUSED') {
      console.warn(`[ChaosHarness] Safety timeout expired for ${containerName}. Forcing unpause.`);
      unpauseContainer(containerName).catch(() => {});
    }
  }, maxDurationMs);
  timer.unref();
}

/**
 * Unpauses a previously paused container.
 *
 * @param {string} containerName
 * @returns {Promise<void>}
 */
export async function unpauseContainer(containerName) {
  verifyTargetIdentity(containerName);

  console.log(`[ChaosHarness] Unpausing container: ${containerName}...`);
  try {
    execSync(`docker unpause ${containerName}`, { stdio: 'pipe', timeout: 10000 });
  } finally {
    alteredContainers.delete(containerName);
  }
}

/**
 * Stops a target container with graceful timeout.
 *
 * @param {string} containerName
 * @param {number} [timeoutSec=5]
 * @returns {Promise<void>}
 */
export async function stopContainer(containerName, timeoutSec = 5) {
  verifyTargetIdentity(containerName);
  attachKillSwitch();

  console.log(`[ChaosHarness] Stopping container: ${containerName} (timeout: ${timeoutSec}s)...`);
  execSync(`docker stop -t ${timeoutSec} ${containerName}`, { stdio: 'pipe', timeout: (timeoutSec + 5) * 1000 });
  alteredContainers.set(containerName, 'STOPPED');
}

/**
 * Starts a previously stopped container.
 *
 * @param {string} containerName
 * @returns {Promise<void>}
 */
export async function startContainer(containerName) {
  verifyTargetIdentity(containerName);

  console.log(`[ChaosHarness] Starting container: ${containerName}...`);
  try {
    execSync(`docker start ${containerName}`, { stdio: 'pipe', timeout: 15000 });
  } finally {
    alteredContainers.delete(containerName);
  }
}

/**
 * Restarts a target container with bounded timeout.
 *
 * @param {string} containerName
 * @param {number} [timeoutSec=5]
 * @returns {Promise<void>}
 */
export async function restartContainer(containerName, timeoutSec = 5) {
  verifyTargetIdentity(containerName);
  attachKillSwitch();

  console.log(`[ChaosHarness] Restarting container: ${containerName}...`);
  execSync(`docker restart -t ${timeoutSec} ${containerName}`, { stdio: 'pipe', timeout: (timeoutSec + 10) * 1000 });
  alteredContainers.delete(containerName);
}

/**
 * Polls an HTTP endpoint until the expected status code is received or timeout is reached.
 *
 * @param {string} url - Target URL (e.g. 'http://localhost:4000/ready')
 * @param {number} expectedStatus - HTTP status (e.g. 200 or 503)
 * @param {number} [timeoutMs=15000] - Total polling timeout
 * @param {number} [intervalMs=500] - Interval between checks
 * @returns {Promise<{ ok: boolean, status: number, body: any, durationMs: number }>}
 */
export async function waitForEndpoint(url, expectedStatus, timeoutMs = 15000, intervalMs = 500) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(intervalMs * 2) });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => null);
      }

      if (res.status === expectedStatus) {
        return {
          ok: true,
          status: res.status,
          body,
          durationMs: Date.now() - startTime
        };
      }
    } catch {
      // Endpoint may be down/unreachable during fault; retry until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    ok: false,
    status: -1,
    body: null,
    durationMs: Date.now() - startTime
  };
}

/**
 * Measures Fault Detection Time and Fault Recovery Time accurately per Correction 3.
 *
 * @param {Function} probeFn - Async function returning { detected: boolean, recovered: boolean }
 * @param {object} [options]
 * @param {number} [options.maxDetectionMs=5000]
 * @param {number} [options.maxRecoveryMs=15000]
 * @param {number} [options.intervalMs=250]
 * @returns {Promise<{ faultDetectionTimeMs: number, faultRecoveryTimeMs: number, recovered: boolean }>}
 */
export async function measureRecoveryMetrics(probeFn, options = {}) {
  const intervalMs = options.intervalMs || 250;
  const maxDetectionMs = options.maxDetectionMs || 5000;
  const maxRecoveryMs = options.maxRecoveryMs || 15000;

  // 1. Measure Fault Detection Time
  const detectionStart = Date.now();
  let faultDetectionTimeMs = -1;

  while (Date.now() - detectionStart < maxDetectionMs) {
    try {
      const state = await probeFn('detection');
      if (state.detected) {
        faultDetectionTimeMs = Date.now() - detectionStart;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  // 2. Measure Fault Recovery Time
  const recoveryStart = Date.now();
  let faultRecoveryTimeMs = -1;
  let recovered = false;

  while (Date.now() - recoveryStart < maxRecoveryMs) {
    try {
      const state = await probeFn('recovery');
      if (state.recovered) {
        faultRecoveryTimeMs = Date.now() - recoveryStart;
        recovered = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    faultDetectionTimeMs: faultDetectionTimeMs >= 0 ? faultDetectionTimeMs : maxDetectionMs,
    faultRecoveryTimeMs: faultRecoveryTimeMs >= 0 ? faultRecoveryTimeMs : maxRecoveryMs,
    recovered
  };
}

// Automatically attach kill switch on module load
attachKillSwitch();
