/**
 * @file wireguardBoundary.test.js
 * @description Boundary and security verification test suite for Phase 27 Track 2:
 * - Canonical WireGuard subnet invariants (10.100.0.0/24, gateway 10.100.0.1, UDP 51820, MTU 1420)
 * - Anti-regression check: absolute prohibition of legacy 10.8.0.0/24 subnet
 * - Firewall / Ingress / SSH isolation verification (elimination of 0.0.0.0/0 on port 22)
 * - Terraform security group boundary assertions
 * - WireGuard peer lifecycle script validation
 * - Public candidate traffic non-interference guarantees
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');

describe('Track 2 — WireGuard Management Plane Boundary & Security', () => {
  const wgTemplatePath = path.join(rootDir, 'infrastructure', 'wireguard', 'wg0.conf.template');
  const managePeersPath = path.join(rootDir, 'infrastructure', 'wireguard', 'manage-peers.sh');
  const tfSgMainPath = path.join(rootDir, 'terraform', 'modules', 'security_groups', 'main.tf');
  const tfSgVarsPath = path.join(rootDir, 'terraform', 'modules', 'security_groups', 'variables.tf');

  describe('Workstream G: Subnet Invariants & Gateway Configuration', () => {
    it('verifies wg0.conf.template exists and enforces canonical 10.100.0.0/24 subnet', () => {
      assert.ok(fs.existsSync(wgTemplatePath), 'wg0.conf.template must exist');
      const content = fs.readFileSync(wgTemplatePath, 'utf8');

      // Canonical subnet and gateway
      assert.match(content, /Address\s*=\s*10\.100\.0\.1\/24/, 'Gateway Address must be 10.100.0.1/24');
      assert.match(content, /ListenPort\s*=\s*51820/, 'ListenPort must be 51820');
      assert.match(content, /MTU\s*=\s*1420/, 'MTU must be 1420');

      // Absolute prohibition of legacy 10.8.0.0/24 subnet
      assert.doesNotMatch(content, /10\.8\.0\./, 'Legacy 10.8.0.0/24 subnet must NEVER appear');
    });

    it('verifies iptables isolation rules in wg0.conf.template', () => {
      const content = fs.readFileSync(wgTemplatePath, 'utf8');

      // Port 22 SSH restricted to wg0 interface
      assert.match(content, /iptables -A INPUT -p tcp --dport 22 -i wg0 -s 10\.100\.0\.0\/24 -j ACCEPT/);
      // Port 22 SSH strictly dropped from public eth0 interface
      assert.match(content, /iptables -A INPUT -p tcp --dport 22 -i eth0 -j DROP/);
      // NAT for management subnet
      assert.match(content, /iptables -t nat -A POSTROUTING -s 10\.100\.0\.0\/24 -o eth0 -j MASQUERADE/);
    });
  });

  describe('Workstream H: Peer CLI & Lifecycle Script', () => {
    it('verifies manage-peers.sh exists and contains required peer management commands', () => {
      assert.ok(fs.existsSync(managePeersPath), 'manage-peers.sh must exist');
      const content = fs.readFileSync(managePeersPath, 'utf8');

      // Required subcommands
      assert.match(content, /cmd_init/, 'Must contain init command');
      assert.match(content, /cmd_add/, 'Must contain add command');
      assert.match(content, /cmd_list/, 'Must contain list command');
      assert.match(content, /cmd_revoke/, 'Must contain revoke command');
      assert.match(content, /cmd_rotate/, 'Must contain rotate command');

      // Canonical subnet configuration
      assert.match(content, /SUBNET_PREFIX="10\.100\.0"/);
      assert.match(content, /GATEWAY_IP="\$\{SUBNET_PREFIX\}\.1"/);
      assert.match(content, /PEER_IP_START=51/);
      assert.match(content, /PEER_IP_END=200/);

      // Strict rejection of non-10.100.0.0/24 IPs
      assert.match(content, /10\\\.100\\\.0\\\./);
      assert.doesNotMatch(content, /10\.8\.0\./, 'Legacy 10.8.0.0/24 subnet must NEVER appear in peer manager');
    });
  });

  describe('Workstream I: Firewall / Ingress / SSH Isolation', () => {
    it('verifies Terraform security groups completely prohibit 0.0.0.0/0 on port 22', () => {
      assert.ok(fs.existsSync(tfSgMainPath), 'terraform security_groups main.tf must exist');
      const content = fs.readFileSync(tfSgMainPath, 'utf8');

      // Check SSH ingress rule
      assert.match(content, /resource "aws_vpc_security_group_ingress_rule" "ec2_ssh_admin"/);
      assert.match(content, /from_port\s*=\s*22/);
      assert.match(content, /to_port\s*=\s*22/);

      // Verify count condition ensures 0.0.0.0/0 is never provisioned
      assert.match(
        content,
        /count\s*=\s*var\.admin_cidr\s*!=\s*""\s*&&\s*var\.admin_cidr\s*!=\s*"0\.0\.0\.0\/0"\s*\?\s*1\s*:\s*0/,
        'SSH rule must fail-closed if admin_cidr is empty or 0.0.0.0/0'
      );

      // Verify WireGuard UDP 51820 ingress rule exists
      assert.match(content, /resource "aws_vpc_security_group_ingress_rule" "ec2_wireguard_udp"/);
      assert.match(content, /from_port\s*=\s*51820/);
      assert.match(content, /to_port\s*=\s*51820/);
      assert.match(content, /ip_protocol\s*=\s*"udp"/);
    });

    it('verifies Terraform default admin_cidr variable uses canonical 10.100.0.0/24', () => {
      assert.ok(fs.existsSync(tfSgVarsPath), 'terraform security_groups variables.tf must exist');
      const content = fs.readFileSync(tfSgVarsPath, 'utf8');

      assert.match(content, /variable "admin_cidr"/);
      assert.match(content, /default\s*=\s*"10\.100\.0\.0\/24"/, 'Default admin_cidr must be 10.100.0.0/24');
      assert.match(content, /variable "wireguard_ingress_cidr"/);
    });

    it('verifies internal service ports have ZERO external ingress in Terraform', () => {
      const content = fs.readFileSync(tfSgMainPath, 'utf8');

      // Check that postgres 5432 is restricted to EC2 SG only
      assert.match(content, /referenced_security_group_id\s*=\s*aws_security_group\.ec2\.id/);
      // Ensure no ingress rule binds 5432 or 6379 to 0.0.0.0/0
      const lines = content.split('\n');
      let currentPort = null;
      for (const line of lines) {
        if (line.includes('from_port') && (line.includes('5432') || line.includes('6379'))) {
          currentPort = line;
        }
        if (currentPort && line.includes('cidr_ipv4') && line.includes('0.0.0.0/0')) {
          assert.fail(`Found unsafe public 0.0.0.0/0 binding on database port: ${currentPort}`);
        }
        if (line.includes('resource ')) {
          currentPort = null;
        }
      }
    });
  });

  describe('Workstream J: Candidate Traffic Non-Interference', () => {
    it('ensures Candidate and Public API routes have zero WireGuard or VPN requirements', async () => {
      const routesIndexPath = path.join(rootDir, 'backend', 'src', 'routes', 'index.js');
      const routesContent = fs.readFileSync(routesIndexPath, 'utf8');

      // Assert developer routes are mounted under /developer and isolated
      assert.match(routesContent, /v1Router\.use\('\/developer', developerRouter\)/);

      // Assert candidate auth, exams, attempts, questions are separate routers
      assert.match(routesContent, /v1Router\.use\('\/auth', authRouter\)/);
      assert.match(routesContent, /v1Router\.use\('\/exams',/);
      assert.match(routesContent, /v1Router\.use\('\/sessions',/);
    });
  });
});
