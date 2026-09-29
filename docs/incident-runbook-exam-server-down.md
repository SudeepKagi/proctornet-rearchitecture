# Emergency Runbook: Mid-Exam Server Outage

**Document ID:** RUNBOOK-INCIDENT-01  
**Severity:** P0 (Critical — Active Examination Interruption)  
**Target Audience:** System Administrators, DevOps On-Call, Course Coordinators

---

## 1. What Happens Automatically on Student Screens (0–60 Seconds)

When the backend server or network connection drops during an active exam:
- **Automatic Client Offline Draft Buffering:** The candidate's browser immediately detects the network disruption. The answer submission queue switches to local offline storage.
- **Offline Banner:** Students see an offline banner indicating that connectivity was lost and reassuring them that answers are saved locally.
- **CRITICAL INSTRUCTION FOR STUDENTS:** **Do NOT refresh or close the browser tab.** Answers remain safely in browser storage and will sync automatically once connection is restored.

---

## 2. Immediate Diagnostic Triage (Minutes 1–3)

### Step 2.1: Verify Outage Scope
Check whether the application is responding to health probes:
```bash
curl -I https://<your-exam-domain>/health
# Or locally via SSH:
curl -I http://localhost:4000/health
```

### Step 2.2: Connect to Host
Connect to the EC2 host via AWS Systems Manager (SSM) Session Manager or SSH:
```bash
cd /opt/proctornet
docker compose -f docker-compose.prod.yml ps
```

Identify container states:
- If **`backend`** is exited or restarting: check `docker compose -f docker-compose.prod.yml logs --tail=100 backend`
- If **`postgres`** is unhealthy: check `docker compose -f docker-compose.prod.yml logs --tail=100 postgres`
- If **`redis`** is down: check `docker compose -f docker-compose.prod.yml logs --tail=50 redis`

---

## 3. Rapid Recovery Procedures (Minutes 3–7)

### Scenario A: Backend Node.js Process Crash (OOM or Unhandled Exception)
Restart the backend container:
```bash
docker compose -f docker-compose.prod.yml restart backend
# Follow startup logs:
docker compose -f docker-compose.prod.yml logs -f --tail=50 backend
```
*Expected Recovery Time:* < 15 seconds.

### Scenario B: Database Connection Exhaustion or Lock Hang
If PostgreSQL max_connections (default 200) was saturated:
```bash
# Restart application and database containers cleanly:
docker compose -f docker-compose.prod.yml restart postgres redis backend
```
*Expected Recovery Time:* ~30 seconds.

### Scenario C: Complete EC2 Host Unresponsiveness
If the host does not respond to SSH or SSM:
1. Navigate to **AWS EC2 Console** > Select instance `proctornet-production-instance`.
2. Check CloudWatch `StatusCheckFailed` alarm.
3. Click **Instance State** > **Reboot instance** (preserves EBS volumes and data).
4. Systemd services (`docker.service`, `proctornet-backup.timer`) start automatically upon reboot.

---

## 4. Student Resumption & Session Extension (Minutes 7–10)

Once `/health` returns `200 OK`:
1. **Automatic Sync:** As students remain on the exam screen, the frontend sync worker detects reconnected status and flushes queued offline drafts with version conflict protection.
2. **Compensate Exam Time (Mandatory):**
   - Course coordinators should log in to the Faculty / Invigilator Console.
   - Extend the session end time by the total outage duration + 15 minutes buffer to eliminate student panic.
3. **Broadcast In-Room Announcement:**
   - Use the Invigilator Console Announcement tool to broadcast:
     *"The server connection has been fully restored. All your answers have synced. The exam timer has been extended by 15 minutes."*

---

## 5. Escalation Contacts & Worst-Case Contingency

- **Database Backup Location:**
  - Local disk: `/opt/proctornet/backups/proctornet_db_<timestamp>.sql.gz`
  - S3 cloud archive: `s3://<project>-production-backup-<account-id>/postgres/`
- **Catastrophic Database Recovery (RPO 24h, RTO 15m):**
  If the database volume was corrupted, restore the latest daily snapshot:
  ```bash
  gunzip -c /opt/proctornet/backups/latest.sql.gz | docker compose exec -T postgres psql -U postgres proctornet
  ```
- **Post-Incident Review:** Document root cause (OOM, traffic surge, network partition) in an internal post-mortem within 24 hours.
