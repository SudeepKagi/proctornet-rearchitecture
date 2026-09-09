# Operational Runbook: WireGuard Management Boundary & Bastion Operations

## 1. Architectural Boundary & Security Model
- **Canonical Management Subnet**: `10.100.0.0/24` (Gateway / Bastion: `10.100.0.1`).
- **Strict Prohibition**: Subnet `10.8.0.0/24` is strictly prohibited in ProctorNet architecture.
- **Zero Public SSH**: SSH port 22 is completely blocked from the public internet (`0.0.0.0/0`).
- **Access Path**: All operator, developer, and administrative access to EC2 hosts, database clusters, and internal services MUST traverse the encrypted WireGuard VPN tunnel (`wg0`) or AWS SSM Session Manager.

## 2. IP Assignment Table
| Host / Role | WireGuard IP | Subnet | Allowed Traffic |
|---|---|---|---|
| **WireGuard Bastion Gateway** | `10.100.0.1/24` | Management | UDP 51820 (Public Endpoint) |
| **Operator / Engineer Peer** | `10.100.0.2 - 10.100.0.50` | Management | SSH (22), Admin Tools |
| **Backend App Host 1 (AZ-a)** | `10.100.0.10/24` | Management | WireGuard peer, Internal VPC |
| **Backend App Host 2 (AZ-b)** | `10.100.0.11/24` | Management | WireGuard peer, Internal VPC |
| **SFU Media Host 1** | `10.100.0.20/24` | Management | WireGuard peer, Internal VPC |
| **SFU Media Host 2** | `10.100.0.21/24` | Management | WireGuard peer, Internal VPC |

## 3. Operator Connection Guide
1. Generate WireGuard configuration (`/etc/wireguard/wg0.conf` or client config).
2. Connect to WireGuard tunnel:
   ```bash
   # On operator workstation:
   wg-quick up wg0
   ```
3. Verify reachability of gateway:
   ```bash
   ping -c 3 10.100.0.1
   ```
4. Connect to backend application node via SSH:
   ```bash
   ssh -i ~/.ssh/proctornet_prod.pem ec2-user@10.100.0.10
   ```

## 4. Host Firewall Hardening Verification
On every managed EC2 host:
```bash
# Verify iptables rules:
sudo iptables -L INPUT -v -n
```
Expected output:
- `ACCEPT tcp -- wg0 * 10.100.0.0/24 0.0.0.0/0 tcp dpt:22`
- `DROP tcp -- eth0 * 0.0.0.0/0 0.0.0.0/0 tcp dpt:22`

## 5. Out-of-Band Redundancy (AWS SSM Session Manager)
If an AZ disruption or WireGuard gateway degradation prevents connection to `10.100.0.1`:
- Connect directly via AWS Systems Manager Session Manager (IAM-authenticated, zero open ports required):
```bash
aws ssm start-session --target $TARGET_INSTANCE_ID
```
This ensures emergency access is always guaranteed without weakening network boundaries.
