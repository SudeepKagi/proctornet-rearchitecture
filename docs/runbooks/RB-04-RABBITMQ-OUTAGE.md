# Runbook RB-04: RabbitMQ Broker Disconnection & Outbox Backlog Triage

## 1. Overview & Classification
- **Identifier**: `RB-04-RABBITMQ-OUTAGE`
- **Subsystem**: Asynchronous Message Broker (RabbitMQ 3.13 Quorum Queues)
- **Severity**: SEV-2 (High Degradation, Zero Data Loss)
- **Target RTO**: $< 3\text{ minutes}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$ (Protected by PostgreSQL Transactional Outbox)

## 2. Architectural Resilience & Invariants
- **Transactional Outbox Protection**: When a student submits an exam, the event is atomically written to PostgreSQL `outbox_events` table inside the same transaction.
- If RabbitMQ is down, submissions succeed unconditionally! Events accumulate in `PENDING` state until broker recovery.
- **Publisher Confirms**: Outbox dispatcher marks events `PUBLISHED` only after RabbitMQ confirms persistent disk write.
- **Idempotent Consumers**: Evaluation consumer enforces `unique_attempt_result` on `results(attempt_id)`.

## 3. Triage & Diagnosis
1. Check RabbitMQ container status:
   ```bash
   docker ps --filter "name=proctornet-rabbitmq"
   docker exec proctornet-rabbitmq rabbitmqctl status
   ```
2. Inspect queue depths and consumer counts:
   ```bash
   docker exec proctornet-rabbitmq rabbitmqctl list_queues name messages consumers
   ```
3. Inspect outbox backlog in PostgreSQL:
   ```bash
   SELECT status, COUNT(*) FROM outbox_events GROUP BY status;
   ```

## 4. Remediation Procedure
### Step A: Restart RabbitMQ Container
```bash
docker restart proctornet-rabbitmq
```
Wait for management plugin initialization (30s):
```bash
curl -u guest:guest http://localhost:15672/api/overview
```

### Step B: Reconnect Application Outbox Workers
The application automatically retries connections with exponential backoff (`registerReconnectHook`). If workers remain in disconnected loop:
```bash
docker restart proctornet-backend
```

### Step C: Trigger Outbox Flush & Backlog Drain
Query outbox table to observe status transitioning from `PENDING` $\to$ `PUBLISHED`:
```bash
SELECT status, COUNT(*) FROM outbox_events WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status;
```

## 5. Verification
1. Verify Dead Letter Queue (`evaluation.dlq`) count is 0:
   ```bash
   docker exec proctornet-rabbitmq rabbitmqctl list_queues name messages | grep dlq
   ```
2. Verify all evaluated results exist:
   ```bash
   SELECT COUNT(*) FROM results WHERE created_at > NOW() - INTERVAL '1 hour';
   ```
3. Confirm Developer Health `/developer/health/rabbitmq` reports `OK`.
