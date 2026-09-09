# Runbook RB-03: Redis Outage, Degradation & Fallback Operations

## 1. Overview & Classification
- **Identifier**: `RB-03-REDIS-OUTAGE`
- **Subsystem**: In-Memory Cache & Ephemeral State (ElastiCache Redis / Containerized Redis 7.4)
- **Severity**: SEV-2 (High Degradation, Zero Data Loss)
- **Target RTO**: $< 1\text{ minute}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$ (Non-authoritative cache layer)

## 2. Invariant & Graceful Degradation Behavior
- **Authoritative Data Rule**: Redis is strictly a non-authoritative caching, rate-limiting, and Pub/Sub routing layer. All business-critical states (users, exams, attempts, answers, results, audit logs) reside authoritatively in PostgreSQL.
- **Circuit Breaking & Fallbacks**:
  - `rateLimiter.js`: Falls back to in-memory sliding-window tracker upon Redis connection failure.
  - `tokenBlacklist.js`: Falls back to database session validation.
  - `sessionCache.js`: Bypasses cache and executes direct PostgreSQL queries.

## 3. Triggering Conditions
- CloudWatch Alarm / Prometheus metric: `redis_up == 0`.
- Developer Health Matrix `/developer/health/redis` reporting `DOWN`.
- Rapid increase in Redis reconnect logs: `ioredis: Reconnecting in ...`.

## 4. Triage & Remediation
### Step A: Verify Node / Container Status
```bash
# Check Redis process status
docker ps --filter "name=proctornet-redis"
docker logs --tail 50 proctornet-redis

# Attempt ping probe
docker exec proctornet-redis redis-cli ping
```

### Step B: Restart Redis Container
```bash
docker restart proctornet-redis
```

### Step C: ElastiCache Failover (Production Managed)
If running AWS ElastiCache Replication Group:
```bash
aws elasticache test-failover \
  --replication-group-id proctornet-prod-redis \
  --node-group-id 0001
```

## 5. Verification
1. Confirm Redis ping:
   ```bash
   redis-cli -h $REDIS_HOST -p 6379 ping
   # Output: PONG
   ```
2. Verify Redis reconnect metric in Prometheus:
   - Rate limit errors drop to 0.
3. Check Developer Health dashboard:
   - `/developer/health/redis` returns `OK`.
