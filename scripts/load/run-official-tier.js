/**
 * @file run-official-tier.js
 * @description Official Stage 21C tier benchmark runner executing clean baseline setup,
 * isolated data generation, k6 scenario execution, real-time metrics collection,
 * integrity verification, and cascading cleanup for a single concurrency tier.
 *
 * Usage:
 *   node scripts/load/run-official-tier.js --vus=500
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const reportsDir = path.resolve(rootDir, 'benchmarks/reports');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Parse CLI flags
const args = process.argv.slice(2);
let vus = 500;
let autosaveDuration = '20s';
let poolDuration = '15s';
let submissionDuration = '20s';
let isDryRun = false;
let baseUrl = process.env.BASE_URL || 'http://localhost:4000';
let benchmarkPassword = process.env.BENCHMARK_PASSWORD || 'BenchPass#123!';

for (const arg of args) {
  if (arg.startsWith('--vus=')) {
    vus = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--autosave-duration=')) {
    autosaveDuration = arg.split('=')[1];
  } else if (arg.startsWith('--pool-duration=')) {
    poolDuration = arg.split('=')[1];
  } else if (arg.startsWith('--submission-duration=')) {
    submissionDuration = arg.split('=')[1];
  } else if (arg.startsWith('--base-url=')) {
    baseUrl = arg.split('=')[1];
  } else if (arg === '--dry-run') {
    isDryRun = true;
  }
}

console.log('===============================================================');
console.log(` PROCTORNET OFFICIAL BENCHMARK EXECUTION: TIER ${vus} VUs`);
console.log(` Target Host Base URL: ${baseUrl}`);
if (isDryRun) {
  console.log(' MODE: DRY-RUN CONFIGURATION VALIDATION (NO LOAD WILL RUN)');
}
console.log('===============================================================');

function runCommand(command, argsArr, envVars = {}) {
  const env = { ...process.env, ...envVars };
  if (process.platform === 'win32' && !env.PATH.includes('C:\\Program Files\\k6')) {
    env.PATH = `C:\\Program Files\\k6;${env.PATH}`;
  }

  const safeArgs = argsArr.map(arg => {
    if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
      return `"${arg}"`;
    }
    return arg;
  });

  console.log(`\n▶ Running: ${command} ${safeArgs.join(' ')}`);
  const startTime = Date.now();
  const res = spawnSync(command, safeArgs, {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: true
  });

  const elapsedSec = +((Date.now() - startTime) / 1000).toFixed(2);
  const passed = res.status === 0;

  if (!passed) {
    console.warn(`✖ Command exited with status ${res.status} after ${elapsedSec}s`);
  } else {
    console.log(`✔ Command completed successfully in ${elapsedSec}s`);
  }

  return { passed, exitCode: res.status, elapsedSec };
}

function parseK6Summary(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const m = raw.metrics || {};
    const reqs = m.http_reqs || {};
    const dur = m.http_req_duration || {};
    const failed = m.http_req_failed || {};

    return {
      total_requests: reqs.count || 0,
      throughput_rps: +(reqs.rate || 0).toFixed(2),
      error_rate_pct: +((failed.value || 0) * 100).toFixed(2),
      latency_p50_ms: +(dur.med || 0).toFixed(2),
      latency_p95_ms: +(dur['p(95)'] || 0).toFixed(2),
      latency_p99_ms: +(dur['p(99)'] || 0).toFixed(2),
      latency_avg_ms: +(dur.avg || 0).toFixed(2),
      latency_max_ms: +(dur.max || 0).toFixed(2)
    };
  } catch (err) {
    console.error(`Failed parsing ${filePath}:`, err.message);
    return null;
  }
}

async function main() {
  if (isDryRun) {
    console.log('\n[Dry-Run] Validating Stage 21C configuration and runner readiness...');
    console.log(`  - Target Concurrency: ${vus} VUs`);
    console.log(`  - Target Base URL: ${baseUrl}`);
    console.log(`  - Autosave Duration: ${autosaveDuration}`);
    console.log(`  - Pool Duration: ${poolDuration}`);
    console.log(`  - Submission Duration: ${submissionDuration}`);
    console.log(`  - Reports Directory: ${reportsDir}`);

    const scenarioFiles = [
      'scripts/load/k6/login-burst.js',
      'scripts/load/k6/autosave-contention.js',
      'scripts/load/k6/pool-saturation.js',
      'scripts/load/k6/submission-surge.js',
      'scripts/load/k6/full-exam-lifecycle.js',
      'scripts/load/seed-benchmark-data.js',
      'scripts/load/verify-data-integrity.js',
      'scripts/load/cleanup-benchmark-data.js',
      'scripts/load/collect-metrics.js'
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

  const tierReport = {
    tier_vus: vus,
    benchmark_run_id: `run_${vus}_${Date.now()}`,
    started_at: new Date().toISOString(),
    git_commit: '',
    scenarios: {},
    system_metrics: null,
    integrity_audit: null,
    verdict: 'UNKNOWN'
  };

  try {
    const gitRes = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
    tierReport.git_commit = gitRes.stdout?.trim() || 'unknown';
  } catch {}

  // 1. Establish Clean Baseline & Pre-Flight Check
  console.log(`\n[Baseline] Verifying application readiness at ${baseUrl}/ready & clean database state...`);
  try {
    const readyRes = await fetch(`${baseUrl}/ready`);
    const readyData = await readyRes.json();
    if (readyData.status !== 'READY') {
      console.error('Fatal: Backend not ready:', readyData);
      process.exit(1);
    }
    console.log('✔ Backend and subsystems are READY.');
  } catch (err) {
    console.error(`Fatal: Backend connection error (${baseUrl}/ready):`, err.message);
    process.exit(1);
  }

  // Ensure zero leftover benchmark data
  runCommand('node', ['scripts/load/cleanup-benchmark-data.js']);

  // 2. Start System Metrics Collector in Background
  const metricsOutputFile = path.resolve(reportsDir, `tier-${vus}-system-metrics.json`);
  const metricsCollector = spawn(
    'node',
    ['scripts/load/collect-metrics.js', '--duration=600', `--output=benchmarks/reports/tier-${vus}-system-metrics.json`],
    { cwd: rootDir, env: process.env, stdio: 'ignore' }
  );
  console.log(`[Collector] System metrics collector started in background (PID: ${metricsCollector.pid}).`);

  // PART 1: PREPARED WORKLOAD SCENARIOS
  console.log(`\n===============================================================`);
  console.log(` PART 1: PREPARED WORKLOADS (${vus} Candidates)`);
  console.log(`===============================================================`);

  // Seed prepared fixtures
  runCommand('node', [
    'scripts/load/seed-benchmark-data.js',
    `--count=${vus}`,
    '--mode=prepared'
  ]);

  // Scenario A: Login Burst
  const loginSummaryRel = `benchmarks/reports/tier-${vus}-login-burst-summary.json`;
  const loginRes = runCommand('k6', [
    'run',
    'scripts/load/k6/login-burst.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `BENCHMARK_PASSWORD=${benchmarkPassword}`,
    '-e', `VUS=${vus}`,
    '-e', 'RAMP=10s',
    '-e', 'HOLD=15s',
    '-e', 'DOWN=5s',
    `--summary-export=${loginSummaryRel}`
  ]);
  tierReport.scenarios.login_burst = {
    ...loginRes,
    metrics: parseK6Summary(path.resolve(rootDir, loginSummaryRel))
  };

  // Scenario B: Autosave Contention
  const autosaveSummaryRel = `benchmarks/reports/tier-${vus}-autosave-summary.json`;
  const autosaveRes = runCommand('k6', [
    'run',
    'scripts/load/k6/autosave-contention.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `BENCHMARK_PASSWORD=${benchmarkPassword}`,
    '-e', `VUS=${vus}`,
    '-e', `DURATION=${autosaveDuration}`,
    '-e', 'PACING=1.0',
    `--summary-export=${autosaveSummaryRel}`
  ]);
  tierReport.scenarios.autosave_contention = {
    ...autosaveRes,
    metrics: parseK6Summary(path.resolve(rootDir, autosaveSummaryRel))
  };

  // Scenario C: Pool Saturation
  const poolSummaryRel = `benchmarks/reports/tier-${vus}-pool-saturation-summary.json`;
  const poolRes = runCommand('k6', [
    'run',
    'scripts/load/k6/pool-saturation.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `BENCHMARK_PASSWORD=${benchmarkPassword}`,
    '-e', `VUS=${vus}`,
    '-e', `DURATION=${poolDuration}`,
    `--summary-export=${poolSummaryRel}`
  ]);
  tierReport.scenarios.pool_saturation = {
    ...poolRes,
    metrics: parseK6Summary(path.resolve(rootDir, poolSummaryRel))
  };

  // Scenario D: Submission Surge
  const submissionSummaryRel = `benchmarks/reports/tier-${vus}-submission-summary.json`;
  const submissionRes = runCommand('k6', [
    'run',
    'scripts/load/k6/submission-surge.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `BENCHMARK_PASSWORD=${benchmarkPassword}`,
    '-e', `VUS=${vus}`,
    '-e', `DURATION=${submissionDuration}`,
    `--summary-export=${submissionSummaryRel}`
  ]);
  tierReport.scenarios.submission_surge = {
    ...submissionRes,
    metrics: parseK6Summary(path.resolve(rootDir, submissionSummaryRel))
  };

  // Post-Prepared Integrity Audit & Teardown
  const prepIntegrity = runCommand('node', ['scripts/load/verify-data-integrity.js']);
  runCommand('node', ['scripts/load/cleanup-benchmark-data.js']);

  // PART 2: REAL CANDIDATE LIFECYCLE WORKLOAD
  console.log(`\n===============================================================`);
  console.log(` PART 2: REAL CANDIDATE LIFECYCLE (${vus} Candidates)`);
  console.log(`===============================================================`);

  // Seed lifecycle fixtures
  runCommand('node', [
    'scripts/load/seed-benchmark-data.js',
    `--count=${vus}`,
    '--mode=lifecycle'
  ]);

  // Scenario E: Full Candidate Lifecycle
  const lifecycleSummaryRel = `benchmarks/reports/tier-${vus}-lifecycle-summary.json`;
  const lifecycleRes = runCommand('k6', [
    'run',
    'scripts/load/k6/full-exam-lifecycle.js',
    '-e', `BASE_URL=${baseUrl}`,
    '-e', `BENCHMARK_PASSWORD=${benchmarkPassword}`,
    '-e', `VUS=${vus}`,
    '-e', 'ITERATIONS=1',
    `--summary-export=${lifecycleSummaryRel}`
  ]);
  tierReport.scenarios.full_candidate_lifecycle = {
    ...lifecycleRes,
    metrics: parseK6Summary(path.resolve(rootDir, lifecycleSummaryRel))
  };

  // Post-Lifecycle Integrity Audit & Teardown
  const lifeIntegrity = runCommand('node', ['scripts/load/verify-data-integrity.js']);
  runCommand('node', ['scripts/load/cleanup-benchmark-data.js']);

  // Stop background collector cleanly
  const stopFile = path.resolve(reportsDir, '.stop_collector');
  try {
    fs.writeFileSync(stopFile, 'stop', 'utf8');
    await new Promise(r => setTimeout(r, 2000));
    metricsCollector.kill();
  } catch {}

  if (fs.existsSync(metricsOutputFile)) {
    try {
      tierReport.system_metrics = JSON.parse(fs.readFileSync(metricsOutputFile, 'utf8')).summary;
    } catch {}
  }

  tierReport.integrity_audit = {
    prepared_mode_audit: prepIntegrity.passed ? 'PASSED' : 'FAILED',
    lifecycle_mode_audit: lifeIntegrity.passed ? 'PASSED' : 'FAILED'
  };

  tierReport.completed_at = new Date().toISOString();

  // Evaluate Tier Performance Classification
  const autoMet = tierReport.scenarios.autosave_contention?.metrics;
  const subMet = tierReport.scenarios.submission_surge?.metrics;
  const lifeMet = tierReport.scenarios.full_candidate_lifecycle?.metrics;

  const scenariosArr = Object.values(tierReport.scenarios);
  const allScenariosHaveMetrics = scenariosArr.every(s => s && s.metrics !== null);
  const allScenariosPassed = scenariosArr.every(s => s && s.passed);

  const maxErrRate = Math.max(
    autoMet?.error_rate_pct || 0,
    subMet?.error_rate_pct || 0,
    lifeMet?.error_rate_pct || 0
  );

  const maxP95 = Math.max(
    autoMet?.latency_p95_ms || 0,
    subMet?.latency_p95_ms || 0,
    lifeMet?.latency_p95_ms || 0
  );

  if (!allScenariosHaveMetrics || !prepIntegrity.passed || !lifeIntegrity.passed) {
    tierReport.verdict = 'FAILURE';
  } else if (allScenariosPassed && maxErrRate === 0 && maxP95 < 500) {
    tierReport.verdict = 'SUSTAINABLE';
  } else if (maxErrRate < 2.0 && maxP95 < 2000) {
    tierReport.verdict = 'DEGRADED';
  } else {
    tierReport.verdict = 'SATURATION';
  }

  const reportPath = path.resolve(reportsDir, `tier-${vus}-official-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(tierReport, null, 2), 'utf8');

  console.log('\n===============================================================');
  console.log(`TIER ${vus} VUs OFFICIAL BENCHMARK COMPLETE: [${tierReport.verdict}]`);
  console.log(`Full report saved to: ${reportPath}`);
  console.log('===============================================================\n');
}

main().catch(err => {
  console.error('Fatal tier runner error:', err);
  process.exit(1);
});
