# ADR-0014: Privacy-Preserving Client-Side Telemetry, First-Party Event Logging, and Consent-Gated Analytics

## Status
Accepted

## Date
2026-09-09

## Context & Problem Statement
Modern educational platforms frequently incorporate third-party tracking scripts (such as Google Analytics, Mixpanel, or advertising pixels) to evaluate visitor behavior. In high-stakes examination and proctoring contexts, third-party analytics introduce severe regulatory and architectural hazards:
1. **Third-Party Data Exfiltration**: Embedded third-party scripts can inspect DOM elements, track user input keystrokes, and leak candidate metadata or examination session IDs to commercial advertising networks.
2. **Regulatory Violations**: Transmitting student educational activity to commercial tracking providers violates the strict data governance mandates of FERPA and the cross-border consent requirements of GDPR.
3. **Candidate Anxiety & Distrust**: Candidates forced to accept commercial trackers during exams experience justified privacy concerns regarding how their behavioral data will be weaponized or commercialized.

ProctorNet requires an empirical, privacy-first telemetry architecture that enables academic evaluators to measure public website performance without compromising student dignity, leaking candidate exam data, or relying on commercial analytics networks.

---

## Decision Drivers
- **Zero Third-Party Trackers**: Complete exclusion of external tracking libraries, Google Analytics, Tag Managers, and behavioral tracking pixels.
- **Strict Boundary Separation**: Zero analytics or telemetry tracking during active examination taking (`/candidate/attempts/:attemptId`).
- **First-Party Consent Management**: Visitors must be provided with transparent, granular cookie consent controls allowing them to reject all optional analytics with a single click.
- **Data Minimization & Ephemeral Storage**: Anonymous telemetry must not collect IP addresses, device serials, or persistent cross-site tracking fingerprints.
- **Automated Retention Purge**: Verification images and face embeddings stored in S3 must be subject to automated 90-day retention lifecycles.

---

## Considered Options

### Option 1: Integrate Google Analytics 4 (GA4) with Anonymize IP
- Include standard GA4 scripts on public routes with IP masking enabled.
- *Rejected*: Violates core academic privacy pledge; loads external third-party scripts from commercial ad tech servers (`googletagmanager.com`), creating external network dependencies, privacy policy liabilities, and potential script injection vectors.

### Option 2: Server-Side Request Log Parsing Only
- Collect zero client-side events; rely entirely on NGINX / ALB HTTP access logs.
- *Rejected*: Inadequate for evaluating client-side SPA route transitions, accessibility interaction usage, or client-side form validation drop-offs.

### Option 3: First-Party, Consent-Gated Client Event Logging (Selected)
- Implement a privacy-first telemetry architecture:
  - **Strict Cookie Consent Banner**: A non-intrusive banner (`CookieConsentBanner.jsx`) defaults to "Essential Only". No optional telemetry is recorded unless the visitor explicitly opts in.
  - **First-Party Storage Only**: Consent choices are stored locally in the browser (`proctornet_cookie_consent`).
  - **Exam Workspace Blackout**: Analytics and telemetry hooks are strictly disabled across all authenticated candidate examination routes.
  - **Cryptographic Biometric Retention**: Pre-exam facial embeddings and photos are isolated in private Amazon S3 buckets with server-side encryption (SSE-S256) and an automated 90-day S3 lifecycle expiration rule.

---

## Decision Outcome
**Chosen Option**: Option 3.

### Architectural Invariants & Implementation Details:

1. **Cookie Classification Standard**:
   | Cookie / Storage Key | Type | Purpose | Expiration |
   | :--- | :--- | :--- | :--- |
   | `proctornet_session` | Essential | Authenticated JWT session token | 15 minutes |
   | `proctornet_csrf` | Essential | Anti-CSRF token on mutation endpoints | Session |
   | `proctornet_cookie_consent` | Functional | Stores visitor consent state (Essential vs All) | 1 Year |
   | `proctornet_analytics_optin`| Optional | First-party anonymous route change metrics | 90 Days |

2. **Zero Commercial Analytics**:
   - The repository contains zero references to external tracking domains. `index.html` loads only self-hosted resources.

3. **Active Exam Privacy Shield**:
   - The distraction-free exam taking route (`/candidate/attempts/:attemptId`) completely bypasses the public layout and cookie consent banner.
   - Screen analysis heuristics operate strictly inside candidate browser Web Workers, emitting compact ephemeral flags without continuous video or audio exfiltration.

4. **Retention Schedule Enforcement**:
   - Biometric embeddings and verification snapshots are tagged with `RetentionGroup: PreExamVerification` in S3 and automatically purged by S3 lifecycle configuration after 90 days.
   - Ephemeral proctoring telemetry is aggregated into session summary scorecards and purged from operational stores after 30 days.

---

## Consequences
- **Positive**:
  - Full alignment with FERPA and GDPR data minimization principles.
  - Complete elimination of third-party script vulnerabilities and ad-tech exfiltration.
  - Transparent, accessible consent controls for all platform visitors.
  - Enhanced candidate trust and dignity during remote assessments.
- **Negative / Trade-offs**:
  - Lack of commercial analytics dashboards (e.g. Google Analytics funnels); requires analyzing first-party event logs for platform usage insights.
