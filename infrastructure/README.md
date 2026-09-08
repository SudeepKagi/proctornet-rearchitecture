# ProctorNet Infrastructure & Deployment Operations Runbook

This directory contains the containerization, orchestration, and delivery infrastructure for the ProctorNet Examination Platform, adhering strictly to the modular monolith architecture established in Phase 19.

---

## 1. Architectural Topology Overview

ProctorNet defines two explicit container topologies to balance developer ergonomics with high-throughput WebRTC production delivery:

### 1.1 Local Development Topology (Hybrid Bridge-First with Host Coturn)
- **Application & Data Services (`proctornet-net`)**: `frontend`, `backend`, `backend-migrate`, `postgres`, `redis`, `rabbitmq`, and `localstack` run on a dedicated internal Docker bridge network (`proctornet-net`).
- **WebRTC SFU Media Plane**: Ports `40000–40050/udp` are published from the host to the `backend` container via bridge port forwarding. Advertised ICE IP: `${MEDIA_ANNOUNCED_IP:-127.0.0.1}`.
- **Coturn Media Relay**: Runs in host networking mode (`network_mode: "host"`), binding to port 3478 (TCP/UDP) and relay ports `49152–49250` (UDP). Ephemeral TURN credentials are generated offline by the backend using `TURN_STATIC_AUTH_SECRET`. Advertised TURN URL: `turn:${TURN_ANNOUNCED_HOST:-127.0.0.1}:3478`.
- **Reachability Semantics**:
  - *Same-host testing* (browser on development machine): `127.0.0.1` routes directly to the container/host ports.
  - *Multi-device / LAN testing* (external devices/browsers): Set `MEDIA_ANNOUNCED_IP` and `TURN_ANNOUNCED_HOST` in `.env` to the host machine's LAN IP address, and open UDP 40000–40050 and UDP/TCP 3478 in the host firewall.

### 1.2 Production AWS EC2 Topology (Bridge Frontend with Host-Networked Backend)
- **Frontend / Nginx**: Runs on `proctornet-net` bridge network. Binds host port 80 to container port 8080 (HTTP redirect & ACME challenge) and host port 443 to container port 8443 (HTTPS TLS termination). Communicates with backend via Docker host-gateway (`http://host.docker.internal:4000`).
- **Backend (Modular Monolith)**: Runs in host networking mode (`network_mode: "host"`), enabling zero-copy UDP throughput for native `mediasoup-worker` processes across the 10,000 UDP port range (`40000–49999/udp`).
- **Port 4000 Ingress Isolation**: Port 4000 is **strictly internal**. Inbound traffic from `0.0.0.0/0` on port 4000 is physically dropped at the AWS EC2 Security Group and host firewall (`ufw`/`iptables`). It is accessible only by Nginx via Docker host-gateway and host loopback.
- **Persistence Isolation**: PostgreSQL (`5432`), Redis (`6379`), and RabbitMQ (`5672`) bind strictly to `127.0.0.1` on the host, preventing any external ingress from `0.0.0.0/0`.
- **Coturn**: Runs in host networking mode (`network_mode: "host"`), binding to public signaling port 3478 and relay ports `49152–49250/udp`.

---

## 2. Service Inventory

| Stack | Total Services | Long-Running Services | One-Shot Initialization Services | Excluded Services |
|---|---|---|---|---|
| **Local / CI (`docker-compose.yml`)** | **8** | `postgres`, `redis`, `rabbitmq`, `localstack`, `coturn`, `backend`, `frontend` (7 total) | `backend-migrate` (1 total) | None |
| **Production (`docker-compose.prod.yml`)** | **7** | `postgres`, `redis`, `rabbitmq`, `coturn`, `backend`, `frontend` (6 total) | `backend-migrate` (1 total) | `localstack` (Production uses real AWS S3) |

---

## 3. Lifecycle Contracts

### 3.1 Cold-Start Startup Dependency Ordering
When bootstrapping the platform from a cold stop, Compose `depends_on` conditions enforce the following deterministic chain:
```
postgres (service_healthy via pg_isready)
    ↓
backend-migrate (service_completed_successfully / exit code 0)
    ↓
backend (service_healthy on /ready)
    ↓
frontend (accepts external HTTP/HTTPS traffic)
```
*Fail-Fast Rule*: If database migrations fail, `backend-migrate` exits with a non-zero code, and Compose immediately halts startup, preventing `backend` from ever launching against an invalid schema.

### 3.2 Targeted Deployment Replacement Ordering (`deploy.sh`)
When updating an active production EC2 host with new container images:
```
1. Pull latest images: docker compose pull
2. Run migrations: docker compose run --rm backend-migrate
3. Replace frontend: docker compose up -d --no-deps frontend
4. Replace backend: docker compose up -d --no-deps backend
5. Verify readiness: poll http://127.0.0.1:4000/ready for "status":"READY"
```
*Isolation Rule*: The `--no-deps` flag is intentionally used so upstream persistent services (`postgres`, `redis`, `rabbitmq`) are not restarted during targeted application replacement.

*Frontend Replacement Timing*: Stateless single-container frontend replacement may introduce a brief serving interruption during container recreation; the interruption duration is environment-dependent and must be measured during deployment verification. True zero-downtime frontend replacement requires overlapping container replicas or an external load-balancing layer (e.g. AWS ALB), which is outside Phase 19 single-host scope.

*Graceful Backend Replacement*: Backend replacement causes a graceful container recreation (~2-5s) while client WebSocket and WebRTC connections automatically reconnect.

---

## 4. Operational Runbooks

### 4.1 Local Development Quickstart

1. Clone the repository and navigate to root:
   ```bash
   cp .env.example .env
   ```
2. Review `.env`. Default credentials work out-of-the-box for same-host testing (`127.0.0.1`).
3. Start the entire 8-service local stack:
   ```bash
   docker compose up -d
   ```
4. Check service status:
   ```bash
   docker compose ps
   ```
   All 7 long-running services will report `healthy`. `backend-migrate` will report `exited (0)`.
5. Access the application:
   - Frontend SPA: `http://localhost:8080/`
   - Backend API Health: `http://localhost:4000/health`
   - Backend Deep Readiness: `http://localhost:4000/ready`
   - RabbitMQ Management: `http://localhost:15672/` (User: `guest`, Pass: `guest`)

### 4.2 Production EC2 Host Setup

Target Host: AWS EC2 `t3.xlarge` / `c6i.xlarge` running Ubuntu 24.04 LTS.

1. **Install Docker and Docker Compose v2**:
   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. **Install Certbot via Snap**:
   ```bash
   sudo snap install core && sudo snap refresh core
   sudo snap install --classic certbot
   sudo ln -s /snap/bin/certbot /usr/bin/certbot
   ```

3. **Configure File System & Directory Structure**:
   ```bash
   sudo mkdir -p /opt/proctornet/backups /opt/proctornet/data /var/www/certbot
   sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
   ```

4. **Provision Let's Encrypt TLS Certificate**:
   ```bash
   sudo certbot certonly --webroot -w /var/www/certbot \
     -d "${DOMAIN_NAME}" \
     --agree-tos -m "${ADMIN_EMAIL}" --non-interactive
   ```

5. **Apply Mandatory Non-World-Readable Permissions (Mode 0640)**:
   The unprivileged Nginx container runs as UID 101 with primary GID 101 (`nginx`). Set group ownership to GID 101 and mode `0640`:
   ```bash
   sudo chown -R root:101 /etc/letsencrypt/archive /etc/letsencrypt/live
   sudo chmod 0750 /etc/letsencrypt/archive /etc/letsencrypt/live
   sudo chmod 0644 /etc/letsencrypt/archive/*/fullchain*.pem /etc/letsencrypt/archive/*/cert*.pem
   sudo chmod 0640 /etc/letsencrypt/archive/*/privkey*.pem
   ```
   > **CRITICAL SECURITY REQUIREMENT**: Setting private keys to world-readable mode (`0644`) is **strictly prohibited**. It exposes cryptographic credentials to unprivileged local users and adjacent processes.

6. **Automated Renewal Deploy Hook**:
   Create `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`:
   ```bash
   #!/bin/sh
   set -e
   # Re-assert group ownership and 0640 permissions on renewed certs
   chown -R root:101 /etc/letsencrypt/archive /etc/letsencrypt/live
   chmod 0750 /etc/letsencrypt/archive /etc/letsencrypt/live
   chmod 0640 /etc/letsencrypt/archive/*/privkey*.pem
   chmod 0644 /etc/letsencrypt/archive/*/fullchain*.pem
   # Gracefully reload Nginx workers in-memory
   docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T frontend nginx -s reload
   ```
   Make the hook executable:
   ```bash
   sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   ```

7. **Install and Enable Systemd Service**:
   ```bash
   sudo cp infrastructure/proctornet.service /etc/systemd/system/proctornet.service
   sudo systemctl daemon-reload
   sudo systemctl enable proctornet.service
   ```

### 4.3 Deployment Execution

To deploy a new release on the host:
```bash
sudo /opt/proctornet/deploy.sh
```

### 4.4 Backup & Disaster Recovery Runbook

1. **Perform On-Demand Backup**:
   ```bash
   sudo /opt/proctornet/backup-db.sh
   ```
2. **Restore Database from Backup**:
   ```bash
   # Stop application traffic
   docker compose -f /opt/proctornet/docker-compose.prod.yml stop backend frontend
   # Restore schema and data
   gunzip < /opt/proctornet/backups/proctornet_db_<TIMESTAMP>.sql.gz | \
     docker compose -f /opt/proctornet/docker-compose.prod.yml exec -T postgres \
     psql -U "${DB_USER}" -d "${DB_NAME}"
   # Restart application
   docker compose -f /opt/proctornet/docker-compose.prod.yml up -d backend frontend
   ```

### 4.5 Health Verification & Diagnostics

- **Backend Readiness**:
  ```bash
  curl -sf http://127.0.0.1:4000/ready
  ```
- **Coturn Protocol STUN Check**:
  ```bash
  docker exec -t proctornet-coturn turnutils_stunclient 127.0.0.1
  ```
- **Coturn TCP Port Connectivity**:
  ```bash
  nc -z 127.0.0.1 3478
  ```
- **TLS Certificate Expiration & Permissions**:
  ```bash
  stat -c "%a %U:%G %n" /etc/letsencrypt/live/*/privkey.pem
  openssl x509 -in /etc/letsencrypt/live/*/fullchain.pem -noout -dates
  ```
