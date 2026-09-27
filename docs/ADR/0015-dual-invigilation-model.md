# ADR-0015: Dual-Path Invigilation Model (Dedicated Proctoring Staff and Faculty Self-Invigilation)

## Status
Accepted

## Date
2026-09-27

## Context & Problem Statement
The original conceptual planning brief for ProctorNet outlined four primary roles: `ADMIN`, `DEVELOPER`, `FACULTY`, and `STUDENT`. However, as the multi-modal proctoring control plane and mediasoup Selective Forwarding Unit (SFU) media plane evolved, a specialized operational requirement emerged: institutions conduct two distinct examination formats that require different operational boundaries:
1. **Departmental & Course-Level Assessments**: Quizzes, midterms, and lab practicals where the faculty member who authors and schedules the exam also acts as the proctor, directly monitoring their own students' feeds and interventions.
2. **Centralized Institutional High-Stakes Examinations**: Final university examinations, standardized entrance tests, and cross-departmental finals where dedicated invigilation proctors (who do not author questions or adjust grades) oversee multi-candidate video grids across examination rooms.

Without formal documentation, having both a standalone `INVIGILATOR` role (`frontend/src/pages/invigilator/*`) and automatic assignment of exam-scheduling faculty as session invigilators could appear contradictory or redundant.

---

## Decision Drivers
- **Separation of Concerns (SoC)**: Dedicated invigilators require a focused, low-latency monitoring workspace (candidate video tiles, audio VU meters, violation flags, live intervention triggers, session sign-off) without clutter from question authoring or grade adjustments.
- **Institutional Flexibility**: Departmental faculty must not be locked out of invigilating their own scheduled exams; requiring a separate proctor for every routine evaluation creates excessive staffing friction.
- **Role Composability**: The underlying identity model (`user_roles` junction table) already supports multi-role assignment (`(user_id, role)`), enabling a faculty member to hold both `FACULTY` and `INVIGILATOR` privileges simultaneously when needed.
- **Audit Traceability**: All real-time interventions (warnings, announcements, session pauses, incident reports) must record the authentic `actor_user_id` and role context in `proctor_interventions` and `audit_logs`.

---

## Considered Options

### Option 1: Fold Invigilation Entirely Into the Faculty Role
- Merge `/invigilator/*` routes into `/faculty/*` and delete the standalone `INVIGILATOR` role.
- *Rejected*: Violates the principle of least privilege. In large university testing centers, external proctors and graduate teaching assistants monitor exams without being granted permission to view unpublished exam questions, edit rubrics, or alter student scores.

### Option 2: Require Dedicated Invigilators Exclusively (No Faculty Self-Invigilation)
- Forbid faculty from monitoring their own sessions; require an institutional admin to assign an external proctor to every session.
- *Rejected*: Impractical for continuous semester assessments, lab evaluations, and departmental tests where independent proctors are unavailable.

### Option 3: Dual-Path Hybrid Invigilation Model (Selected)
- Support both operational modes seamlessly:
  1. **Faculty Self-Invigilation**: When a faculty member schedules an exam session, the backend automatically inserts them into `session_invigilators` as `PRIMARY` invigilator. They can access both the Faculty Portal and the Invigilator Monitoring Console for that session.
  2. **Dedicated Invigilator Staff**: Users assigned the standalone `INVIGILATOR` role log into a dedicated `/invigilator/dashboard` portal. They can be scheduled as primary or secondary invigilators across any department's exam sessions without requiring question bank or grade modification privileges.
  3. **Multi-Role Support**: Academic staff possessing both `FACULTY` and `INVIGILATOR` roles navigate between portals using the standard role switcher in the application shell.

---

## Architectural Consequences

### Positive
- **Operational Scalability**: Adapts to both decentralized classroom tests and centralized institutional exam centers without code alterations.
- **Security Boundary**: Dedicated invigilators are restricted by RBAC from modifying exam blueprints, answer keys, or question banks.
- **Complete Audit Trail**: `session_invigilators` accurately distinguishes between primary faculty proctors and auxiliary invigilator staff.

### Negative / Trade-Offs
- **Dual Portal Maintenance**: Frontend maintains both `/faculty/sessions` and `/invigilator/*` consoles; common video grid and intervention modal primitives must remain synchronized across both surfaces.
