# ProctorNet Re-Architecture

> **Secure, High-Concurrency Online Examination and Remote Proctoring Platform**

This repository contains the re-architecture and ground-up rebuild of ProctorNet, designed for massive concurrent examination delivery with strict data durability, authoritative server-side timing, and decoupled multi-modal proctoring.

---

## Architecture & Development Documentation

All implementation adheres strictly to the finalized architecture specification:

- **[System Architecture (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)**: Master architectural design, technology stack, consistency principles, and non-goals.
- **[Development Plan (docs/DEVELOPMENT_PLAN.md)](docs/DEVELOPMENT_PLAN.md)**: The 25-phase roadmap, milestones, acceptance criteria, and progress tracker.
- **[Development Rules (docs/DEVELOPMENT_RULES.md)](docs/DEVELOPMENT_RULES.md)**: Engineering governance, git workflow, branch strategy, Conventional Commits, and security rules.
- **[Architecture Decision Records (docs/ADR/)](docs/ADR/)**: Index of architectural decisions and changes.
- **[Testing Strategy (docs/TESTING/)](docs/TESTING/)**: Comprehensive testing standards across all 10 testing levels.

---

## Directory Structure

```
.
├── backend/          # Node.js 24 LTS + Express (JavaScript, ES Modules) Modular Monolith
├── frontend/         # React (JavaScript SPA)
├── infrastructure/   # Terraform (AWS IaC), Docker Compose, and deployment scripts
└── docs/             # Master architecture, phased plans, development rules, ADRs, tests
    ├── ARCHITECTURE.md
    ├── DEVELOPMENT_PLAN.md
    ├── DEVELOPMENT_RULES.md
    ├── ADR/
    └── TESTING/
```

---

## Target Technology Stack

- **Frontend**: React (JavaScript SPA)
- **Backend**: Node.js 24 LTS + Express (JavaScript, ES Modules)
- **Primary Database**: PostgreSQL (Authoritative source of business-critical state)
- **Caching & Ephemeral Sync**: Redis (Non-authoritative)
- **Message Broker**: RabbitMQ (Decoupled async worker tasks & Transactional Outbox)
- **Object Storage**: AWS S3 (Tamper-evident evidence storage)
- **Signaling**: WebSocket
- **Live Media**: WebRTC + SFU (Isolated media plane)
- **Infrastructure**: Docker, Terraform, AWS, GitHub Actions

---

## Project Status

- **Current Phase**: Phase 0 — Repository & Development Foundation
- **Current Milestone**: Repository & Development Foundation
- **Status**: Completed / Ready for Phase 1
