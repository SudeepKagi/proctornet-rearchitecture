# Security Audit Exceptions Register

This document tracks formal, approved security exceptions for vulnerabilities detected during container scanning and dependency audits.

## 1. Exception Policy & Governance

In accordance with Phase 19 Security Hardening and Vulnerability Policy:
- **Blocking Severity**: Any **CRITICAL** vulnerability with an available vendor fix blocks the Continuous Integration (CI) pipeline (`exit-code: 1`).
- **Non-Blocking Warnings**: **HIGH** vulnerabilities produce CI warnings.
- **Exception Criteria**: An exception may only be granted if:
  1. No vendor fix is currently available from the upstream maintainer.
  2. The vulnerable code path is provably unreachable within ProctorNet's execution context.
  3. Compensating security controls (defense-in-depth) neutralize the threat vector.
- **Expiration Window**: Exceptions are valid for a **maximum of 30 days** from the approval date, after which the CI pipeline re-enforces blocking status.
- **Mandatory Fields**: Every exception entry must specify:
  - CVE Identifier
  - Package Name & Affected Version
  - Affected Component / Container Image Layer
  - Technical Justification & Compensating Controls
  - Approval Date & Expiration Date
  - Assigned Engineering Owner

---

## 2. Active Exceptions

*No active exceptions. All current dependencies and base images are compliant with zero unresolved CRITICAL vulnerabilities.*

| CVE ID | Package | Image / Layer | Severity | Compensating Controls | Approved Date | Expiration Date | Owner |
|---|---|---|---|---|---|---|---|
| *None* | *None* | *None* | *None* | *None* | *None* | *None* | *None* |

---

## 3. Review Cadence

The security exception register is audited bi-weekly and reviewed prior to every production release deployment.
