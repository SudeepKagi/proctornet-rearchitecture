#!/usr/bin/env node

/**
 * ProctorNet Infrastructure Invariant Verification Script
 * Validates non-negotiable architectural rules for Phase 20:
 * 1. Zero DynamoDB references in active Terraform code (native S3 lockfile locking)
 * 2. use_lockfile = true present in production and staging backend configs
 * 3. Zero external ingress (0.0.0.0/0) for internal ports (4000, 5432, 6379, 5672, 15672)
 * 4. Persistent EBS data volume protected by prevent_destroy = true
 * 5. Migration count remains exactly 17
 * 6. Single EC2 baseline (RDS, ElastiCache, ALB default to false)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('==> [Verify] Starting ProctorNet Infrastructure Invariant Assertions...');

// 1. Assert zero DynamoDB state-lock references in active terraform/
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith('.')) {
        scanDir(full);
      }
    } else if (e.isFile() && e.name.endsWith('.tf')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('dynamodb_table') || content.includes('aws_dynamodb_table')) {
        console.error(`[FAIL] Forbidden DynamoDB state locking found in: ${full}`);
        process.exit(1);
      }
    }
  }
}
scanDir(path.join(ROOT_DIR, 'terraform'));
console.log('✅ [PASS] Rule 1: Zero DynamoDB state lock resources found in terraform/');

// 2. Assert use_lockfile = true in backend configs
const prodBackend = fs.readFileSync(path.join(ROOT_DIR, 'terraform/environments/production/backend.tf'), 'utf8');
const stagingBackend = fs.readFileSync(path.join(ROOT_DIR, 'terraform/environments/staging/backend.tf'), 'utf8');
if (!prodBackend.includes('use_lockfile = true') || !stagingBackend.includes('use_lockfile = true')) {
  console.error('[FAIL] backend.tf in production and staging must specify use_lockfile = true');
  process.exit(1);
}
console.log('✅ [PASS] Rule 2: Native S3 lockfile locking (use_lockfile = true) configured');

// 3. Assert zero external ingress for ports 4000, 5432, 6379, 5672, 15672
const sgTf = fs.readFileSync(path.join(ROOT_DIR, 'terraform/modules/security_groups/main.tf'), 'utf8');
const blockedPorts = [4000, 5432, 6379, 5672, 15672];
for (const port of blockedPorts) {
  const regex = new RegExp(`from_port\\s*=\\s*${port}\\b[\\s\\S]*?cidr_ipv4\\s*=\\s*"0\\.0\\.0\\.0/0"`);
  if (regex.test(sgTf)) {
    console.error(`[FAIL] Unacceptable public ingress found for port ${port}`);
    process.exit(1);
  }
}
console.log('✅ [PASS] Rule 3: Zero public ingress for internal ports (4000, 5432, 6379, 5672, 15672)');

// 4. Assert prevent_destroy on persistent EBS data volume
const ec2Tf = fs.readFileSync(path.join(ROOT_DIR, 'terraform/modules/ec2/main.tf'), 'utf8');
if (!ec2Tf.includes('prevent_destroy = true')) {
  console.error('[FAIL] Persistent EBS data volume must have prevent_destroy = true');
  process.exit(1);
}
console.log('✅ [PASS] Rule 4: Persistent EBS data volume protected by prevent_destroy = true');

// 5. Assert exactly 17 migrations remain in backend/migrations
const migrationsDir = path.join(ROOT_DIR, 'backend/migrations');
const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js') || f.endsWith('.sql'));
if (migrations.length !== 17) {
  console.error(`[FAIL] Expected exactly 17 migrations, found ${migrations.length}`);
  process.exit(1);
}
console.log(`✅ [PASS] Rule 5: Migration count verified at exactly 17 (found: ${migrations.length})`);

// 6. Assert scale-ready modules default to disabled (false)
const prodVars = fs.readFileSync(path.join(ROOT_DIR, 'terraform/environments/production/variables.tf'), 'utf8');
if (!prodVars.includes('variable "enable_rds" {\n  type        = bool\n  description = "Feature toggle for Amazon RDS PostgreSQL 16 (default false in Phase 20; containerized DB active)"\n  default     = false') &&
    !prodVars.match(/variable\s+"enable_rds"[\s\S]*?default\s*=\s*false/)) {
  console.error('[FAIL] enable_rds must default to false in production variables.tf');
  process.exit(1);
}
if (!prodVars.match(/variable\s+"enable_elasticache"[\s\S]*?default\s*=\s*false/)) {
  console.error('[FAIL] enable_elasticache must default to false in production variables.tf');
  process.exit(1);
}
if (!prodVars.match(/variable\s+"enable_alb"[\s\S]*?default\s*=\s*false/)) {
  console.error('[FAIL] enable_alb must default to false in production variables.tf');
  process.exit(1);
}
console.log('✅ [PASS] Rule 6: Managed services (RDS, ElastiCache, ALB) default to disabled (false)');

console.log('==> [Verify] ALL INFRASTRUCTURE INVARIANTS SATISFIED (6/6 PASS).');
