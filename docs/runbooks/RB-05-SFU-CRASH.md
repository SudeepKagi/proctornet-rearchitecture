# Runbook RB-05: Mediasoup SFU Worker Crash & Session Recovery

## 1. Overview & Classification
- **Identifier**: `RB-05-SFU-CRASH`
- **Subsystem**: Real-Time Media Plane (mediasoup v3 SFU / WebRTC Worker Pool)
- **Severity**: SEV-2 (High Degradation, Zero Exam State Loss)
- **Target RTO**: $< 30\text{ seconds}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$ (Media streams are ephemeral; no exam state lost)

## 2. Architectural Resilience
- **Separation of Control vs Media Plane**:
  - Examination taking and question answers operate via HTTPS/REST + WebSocket.
  - An SFU crash disrupts audio/video/screen streaming temporarily, but does NOT pause, corrupt, or disrupt candidate answer progression.
- **Dynamic Announced IP**:
  - Each SFU host automatically resolves its reachable public media IP via AWS IMDSv2 (`http://169.254.169.254/latest/api/token` $\to$ `public-ipv4`).
- **Worker Crash Supervisor**:
  - `sfuManager.js` listens to worker `died` events, spawns replacement workers, resets the epoch fence, and triggers client ICE renegotiation via WebSocket notification.

## 3. Triage & Diagnosis
1. Check SFU worker metrics and system errors in backend logs:
   ```bash
   docker logs --tail 100 proctornet-backend | grep -E "mediasoup|Worker died|renegotiation"
   ```
2. Verify host UDP port bindings (10000 - 10100 for media):
   ```bash
   netstat -u -l -p -n | grep -E "100[0-9]{2}"
   ```
3. Check IMDSv2 token retrieval from host:
   ```bash
   TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
   curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4
   ```

## 4. Remediation Procedure
### Step A: Automated Worker Recovery Verification
Observe if `sfuManager.js` worker supervisor auto-recovers:
```bash
# Check Developer Health Matrix
curl -s -H "Authorization: Bearer $DEV_TOKEN" http://localhost:4000/api/v1/developer/health/media | jq .
```

### Step B: Manual Worker Pool Reset
If workers enter an unrecoverable deadlock or port exhaustion:
```bash
# Gracefully reload the application worker process
docker exec proctornet-backend kill -HUP 1
# Or restart container
docker restart proctornet-backend
```

### Step C: Client Session Auto-Renegotiation
- Connected candidates and invigilators receive a WebSocket event:
  `{ type: "MEDIA_EPOCH_RESET", epoch: N, reason: "WORKER_RECOVERY" }`
- Client WebRTC peer connections automatically execute renegotiation and ICE restart without requiring candidate page reload.

## 5. Verification
1. Open Invigilator Dashboard `/session/:id/monitor`.
2. Verify video tiles reconnect and display live webcam/screen streams.
3. Check `/developer/health/media` reporting:
   `status: "OK", workers: N, routers: M, transports: T`.
