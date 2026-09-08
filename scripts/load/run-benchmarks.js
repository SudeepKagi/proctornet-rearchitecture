/**
 * @file run-benchmarks.js
 * @description Master load test orchestration runner for Phase 21.
 * Coordinates data generation, k6 scenario execution, metrics collection,
 * data integrity verification, and report synthesis.
 *
 * Usage:
 *   node scripts/load/run-benchmarks.js --vus=25 --duration=15s
 *   node scripts/load/run-benchmarks.js --full (runs 2,500 candidate full benchmark)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// CLI options
const args = process.argv.slice(2);
const isFull = args.includes('--full');
const isSmoke = args.includes('--smoke');
const isDryRun = args.includes('--dry-run');
const skipCleanup = args.includes('--skip-cleanup');
const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'prepared';
let baseUrl = process.env.BASE_URL || 'http://localhost:4000';

let vus = isFull ? 2500 : (isSmoke ? 10 : 25);
let duration = isFull ? '5m' : (isSmoke ? '5s' : '15s');

for (const arg of args) {
  if (arg.startsWith('--vus=')) {
    vus = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--duration=')) {
    duration = arg.split('=')[1];
  } else if (arg.startsWith('--base-url=')) {
    baseUrl = arg.split('=')[1];
  }
}

const reportsDir = path.resolve(rootDir, 'benchmarks/reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log('===============================================================');
console.log('       PROCTORNET PHASE 21 BENCHMARK ORCHESTRATOR             ');
console.log('===============================================================');
console.log(`Configuration: VUs=${vus}, Target Duration=${duration}, Mode=${isFull ? 'FULL BENCHMARK' : (isSmoke ? 'SMOKE' : 'VALIDATION')}`);
console.log(`Target Host Base URL: ${baseUrl}`);
if (isDryRun) {
  console.log('Mode: DRY-RUN CONFIGURATION VALIDATION (NO LOAD WILL RUN)');
}

const executionReport = {
  started_at: new Date().toISOString(),
  configuration: { vus, duration, isFull },
  stages: {}
};

function runStep(name, command, argsArr, envVars = {}) {
  console.log(`\n▶ [Stage: ${name}] Running: ${command} ${argsArr.join(' ')}`);
  const startTime = Date.now();

  const env = { ...process.env, ...envVars };
  // Ensure k6 is in PATH on Windows if installed in default winget location
  if (process.platform === 'win32' && !env.PATH.includes('C:\\Program Files\\k6')) {
    env.PATH = `C:\\Program Files\\k6;${env.PATH}`;
  }

  const result = spawnSync(command, argsArr, {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: true
  });

  const elapsedSec = +((Date.now() - startTime) / 1000).toFixed(2);
  const passed = result.status === 0;

  executionReport.stages[name] = {
    status: passed ? 'PASSED' : 'FAILED',
    exit_code: result.status,
    elapsed_sec: elapsedSec
  };

  if (!passed) {
    console.error(`✖ [Stage: ${name}] FAILED with exit code ${result.status} after ${elapsedSec}s`);
  } else {
    console.log(`✔ [Stage: ${name}] COMPLETED in ${elapsedSec}s`);
  }

  return passed;
}

async function main() {
  if (isDryRun) {
    console.log('\n[Dry-Run] Validating benchmark runner configuration and scenario readiness...');
    console.log(`  - Target Concurrency: ${vus} VUs`);
    console.log(`  - Target Base URL: ${baseUrl}`);
    console.log(`  - Target Duration: ${duration}`);
    console.log(`  - Mode: ${mode}`);
    console.log(`  - Reports Directory: ${reportsDir}`);

    const scenarioFiles = [
      'scripts/load/k6/login-burst.js',
      'scripts/load/k6/autosave-contention.js',
      'scripts/load/k6/submission-surge.js',
      'scripts/load/seed-benchmark-data.js',
      'scripts/load/verify-data-integrity.js',
      'scripts/load/cleanup-benchmark-data.js'
    ];
    let allFilesExist = true;
    for (const rel of scenarioFiles) {
      const p = path.resolve(rootDir, rel);
      if (!fs.existsSync(p)) {
        console.error(`  ✖ Missing scenario/script file: ${rel}`);
        allFilesExist = false;
      } else {
        console.log(`  ✔ Verified script: ${rel}`);
      }
    }
    if (!allFilesExist) {
      process.exit(1);
    }
    console.log('\n✔ [Dry-Run] Configuration, scenario files, and runner options are VALID.');
    console.log('No benchmark workload was executed (dry-run mode).');
    return;
  }

  let allPassed = true;
  console.log(`\n▶ [Pre-Flight] Checking backend readiness at ${baseUrl}/ready...`);
  try {
    const res = await fetch(`${baseUrl}/ready`);
    const data = await res.json();
    if (data.status !== 'READY') {
      console.error(`✖ Backend reported unready status: ${JSON.stringify(data)}`);
      process.exit(1);
    }
    console.log(`✔ Backend is READY (DB: ${data.checks.database.status}, Redis: ${data.checks.redis.status}, RabbitMQ: ${data.checks.rabbitmq.status})`);
  } catch (err) {
    console.error(`✖ Unable to connect to backend on ${baseUrl}: ${err.message}`);
    process.exit(1);
  }

  // 1. Seed Benchmark Data
  const seedPassed = runStep('1. Seed Benchmark Fixtures', 'node', [
    'scripts/load/seed-benchmark-data.js',
    `--count=${vus}`,
    `--mode=${mode}`
  ]);
  if (!seedPassed) allPassed = false;

  // 2. Run k6 Login Burst
  const loginPassed = runStep('2. Login Burst Scenario', 'k6', [
    'run',
    'scripts/load/k6/login-burst.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `VUS=${vus}`,
    '-e', 'RAMP=5s',
    '-e', 'HOLD=10s'
  ]);
  if (!loginPassed) allPassed = false;

  // 3. Run k6 Autosave Contention
  const autosavePassed = runStep('3. Autosave Contention Scenario', 'k6', [
    'run',
    'scripts/load/k6/autosave-contention.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `VUS=${vus}`,
    '-e', `DURATION=${duration}`,
    '-e', 'PACING=0.5'
  ]);
  if (!autosavePassed) allPassed = false;

  // 4. Run k6 Submission Surge
  const submitPassed = runStep('4. Submission Surge & Idempotency Replay', 'k6', [
    'run',
    'scripts/load/k6/submission-surge.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `VUS=${vus}`,
    '-e', `DURATION=${duration}`
  ]);
  if (!submitPassed) allPassed = false;

  // 5. Run Post-Benchmark Data Integrity Audit
  const integrityPassed = runStep('5. Post-Benchmark Data Integrity Audit', 'node', [
    'scripts/load/verify-data-integrity.js'
  ]);
  if (!integrityPassed) allPassed = false;

  // 6. Cleanup Benchmark Data (unless skipped)
  if (!skipCleanup) {
    const cleanupPassed = runStep('6. Database & Fixture Cleanup', 'node', [
      'scripts/load/cleanup-benchmark-data.js'
    ]);
    if (!cleanupPassed) allPassed = false;
  }

  executionReport.completed_at = new Date().toISOString();
  executionReport.overall_status = allPassed ? 'PASSED' : 'FAILED';

  const reportPath = path.resolve(reportsDir, 'phase-21-benchmark-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(executionReport, null, 2), 'utf8');

  console.log('\n===============================================================');
  console.log(`BENCHMARK HARNESS EXECUTION COMPLETE: [${executionReport.overall_status}]`);
  console.log(`Execution report written to: ${reportPath}`);
  console.log('===============================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal orchestrator exception:', err);
  process.exit(1);
});
