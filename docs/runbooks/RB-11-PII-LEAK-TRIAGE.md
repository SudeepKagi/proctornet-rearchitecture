# Runbook RB-11: Suspected PII Exposure & Log Scrubber Execution

## 1. Overview & Classification
- **Identifier**: `RB-11-PII-LEAK-TRIAGE`
- **Subsystem**: Privacy, Compliance & Log Sanitization (FERPA & GDPR Compliance Readiness)
- **Severity**: SEV-2 (Privacy Violation Risk)
- **Target RTO**: $< 15\text{ minutes}$ for log neutralization [TARGET]

## 2. Invariants & Architecture
- **Developer Zero-PII Boundary**:
  - The developer console (`/developer/*`) and log buffer must NEVER expose raw candidate Personally Identifiable Information (USN, full names, phone numbers, face images, documents).
- **Automated PII Masking**:
  - `ringBuffer.js` and `logger.js` pass output through an automated redaction pipeline replacing candidate identifiers with pseudonymized tokens (`usr_****_1234`).
- **Audit Immutability Exception**:
  - Academic audit logs are legally exempt from hard deletion under GDPR Article 17(3)(b) (trigger `SQLSTATE 20000`). Personal identifiers in `users` are pseudonymized (`user_xxxx@deleted.local`) to break linkage while preserving audit chain.

## 3. Triage & Incident Confirmation
1. Inspect developer console log stream:
   ```bash
   curl -s -H "Authorization: Bearer $DEV_TOKEN" http://localhost:4000/api/v1/developer/logs | jq .
   ```
2. Scan for unmasked PII patterns (email addresses, raw USNs, plaintext phone numbers).
3. Identify source log emitter (middleware, service, unhandled exception stack trace).

## 4. Remediation Procedure
### Step A: Neutralize Ring Buffer & Cache
Flush developer in-memory log buffer immediately:
```bash
# Call developer endpoint to clear ephemeral log buffer
curl -s -X POST -H "Authorization: Bearer $DEV_TOKEN" http://localhost:4000/api/v1/developer/logs/clear
```

### Step B: CloudWatch Logs Scrubbing
If CloudWatch Logs captured raw PII:
1. Identify CloudWatch log stream:
   `/aws/proctornet/backend`
2. Run log redaction / masking query in CloudWatch Logs Insights.
3. If necessary, execute bounded deletion of affected log stream slice via AWS CLI:
   ```bash
   aws logs delete-log-stream \
     --log-group-name /aws/proctornet/backend \
     --log-stream-name $AFFECTED_STREAM
   ```

### Step C: Patch Code Emitter
Ensure logging calls use structured fields with automatic masking rather than raw string interpolation:
```javascript
// INCORRECT:
logger.info(`Candidate ${user.name} with email ${user.email} submitted`);
// CORRECT:
logger.info({ userId: user.user_id, status: 'SUBMITTED' }, 'Candidate submitted attempt');
```

## 5. Verification & Audit
1. Verify developer log buffer shows masked tokens only.
2. Confirm zero candidate PII is visible in `/developer/overview` or `/developer/logs`.
