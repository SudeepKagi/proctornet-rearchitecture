# Runbook RB-07: Authentication & Dual-JWT Lifecycle Outage

## 1. Overview & Classification
- **Identifier**: `RB-07-AUTH-OUTAGE`
- **Subsystem**: Identity & Access Management (Dual-JWT Auth, Refresh Token Rotation)
- **Severity**: SEV-1 (Critical)
- **Target RTO**: $< 2\text{ minutes}$ [TARGET]
- **Target RPO**: $0\text{ seconds}$

## 2. Triggering Conditions
- Widespread HTTP 401 `UNAUTHORIZED` or HTTP 403 `FORBIDDEN` on previously authenticated clients.
- Refresh token rotation loop failure or mass token invalidation.
- Signing secret mismatch across horizontally scaled instances (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`).

## 3. Triage & Diagnostics
1. Verify JWT signing secrets consistency across instances:
   - Ensure all running containers share identical `JWT_SECRET` and `REFRESH_TOKEN_SECRET`.
2. Inspect authentication failure logs:
   ```bash
   docker logs proctornet-backend | grep -E "TokenExpiredError|JsonWebTokenError|AUTH_FAILED"
   ```
3. Check database table `auth_sessions` status:
   ```bash
   SELECT is_revoked, COUNT(*) FROM auth_sessions GROUP BY is_revoked;
   ```
4. Check Redis token blacklist connection:
   ```bash
   docker exec -it proctornet-redis redis-cli keys "bl:*"
   ```

## 4. Remediation Procedure
### Step A: Sync Environment Variables across Cluster
Ensure all instances receive the verified AWS Secrets Manager credentials:
```bash
aws secretsmanager get-secret-value --secret-id proctornet/production/secrets --query SecretString --output text
```

### Step B: Clear Stale In-Memory / Redis Token Revocation Caches
If a false-positive revocation occurred:
```bash
docker exec -it proctornet-redis redis-cli FLUSHDB
```
*Note: Flushing Redis cache will NOT invalidate active sessions because `auth_sessions` table in PostgreSQL is authoritative.*

### Step C: Emergency Session Key Rotation (Compromise Scenario)
If signing keys are suspected compromised:
1. Update `JWT_SECRET` in AWS Secrets Manager.
2. Trigger rolling restart of application cluster (`./infrastructure/deploy.sh`).
3. Active candidates refresh tokens using valid refresh cookie, receiving tokens signed with the new key.

## 5. Verification
1. Test login flow via curl:
   ```bash
   curl -X POST https://exam.proctornet.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@proctornet.com","password":"..."}'
   ```
2. Confirm returned HTTP 200 with valid JWT access token and HttpOnly refresh cookie.
3. Test protected endpoint `/api/v1/users/me` with returned token.
