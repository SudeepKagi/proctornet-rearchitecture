# Developer Local Audit Scripts (Quarantined)

> [!WARNING]
> **LOCAL DEVELOPMENT & VERIFICATION ONLY — NEVER RUN IN PRODUCTION**
> These scripts connect directly to the database using privileged credentials, generate real temporary entities, and execute high-concurrency end-to-end integration flows.

## Contents
- `audit_flow_1.js`: Auth & Candidate Onboarding flow validation
- `audit_flow_2.js`: Admin Bulk Import & Verification Queue
- `audit_flow_3.js`: Exam Scheduling, Blueprints & Student Registration
- `audit_flow_4.js`: Exam Attempt Lifecycle, Offline Recovery & OCC Autosave
- `audit_flow_5.js`: Invigilator Real-Time WebRTC, Telemetry & Interventions
- `audit_flow_6.js`: Grading, Scoring Pipeline & Scorecard Release
- `audit_flow_7.js`: Developer Operations, Health Sweeps & Audit Immutability

## Running Locally
Ensure local Postgres, Redis, and backend services are active:
```bash
node backend/scripts/dev-audits/audit_flow_1.js
```

## Production Quarantine
These scripts are explicitly excluded from production Docker images via `backend/.dockerignore` and the multi-stage Docker build copy directives.
