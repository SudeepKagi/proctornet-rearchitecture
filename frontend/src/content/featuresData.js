/**
 * @file featuresData.js
 * @description Exhaustive, capability-oriented feature catalog for ProctorNet.
 * All capabilities are presented by domain without development phase numbers.
 */

export const FEATURE_CATEGORIES = [
  {
    id: 'exam-engine',
    title: 'Examination Engine & Lifecycle',
    description: 'Server-authoritative assessment delivery with balanced question distribution and continuous autosave protection.',
    features: [
      {
        name: 'Assessment Blueprints',
        description: 'Define topic quotas, difficulty distributions, and sectional time limits to dynamically generate distinct candidate exam instances.',
        tag: 'Authoritative Delivery',
        metrics: 'Deterministic per-candidate randomization',
      },
      {
        name: 'Continuous Autosave & Conflict Protection',
        description: 'Every answer submission is automatically version-tracked. Prevents accidental overwrites even during intermittent network reconnects.',
        tag: 'Data Integrity',
        metrics: '0 answer collisions under concurrent updates',
      },
      {
        name: 'Offline Draft Queueing & Autosave',
        description: 'Candidate answers are queued in browser local storage and dispatched asynchronously, guaranteeing zero loss when connectivity fluctuates.',
        tag: 'Resilience',
        metrics: '< 2000ms background sync cycle',
      },
      {
        name: 'Multi-Format Question Bank',
        description: 'Author Multiple Choice (Single & Multi-Select), True/False, Numerical Range, and Subjective essay questions with rich markdown.',
        tag: 'Evaluation Variety',
        metrics: '4 Question Formats Supported',
      },
      {
        name: 'Automated & Rubric-Based Grading',
        description: 'Instant atomic scoring for objective items; dedicated faculty grading suite with blind evaluation rubrics for subjective questions.',
        tag: 'Academic Evaluation',
        metrics: 'Immediate score breakdown generation',
      },
    ],
  },
  {
    id: 'screen-analysis',
    title: 'Client-Side Screen Analysis',
    description: 'Ethical, privacy-first desktop anomaly detection running inside candidate browser Web Workers.',
    features: [
      {
        name: 'In-Browser Web Worker Inference',
        description: 'Screen analysis executes client-side off the main browser thread, minimizing UI stutter and keeping raw screen buffers on the local device.',
        tag: 'Privacy Architecture',
        metrics: '0% raw screen video sent to cloud AI services',
      },
      {
        name: 'Screen Activity Indicators',
        description: 'Detects full-screen exits, tab switches, browser window blurs, and unauthorized desktop context switching.',
        tag: 'Activity Monitoring',
        metrics: '100% Client-side anomaly detection',
      },
      {
        name: 'Centralized Activity Review Score',
        description: 'Raw client signals are dispatched to the backend, which calculates an activity score on a 0–100 scale to help invigilators prioritize attention.',
        tag: 'Review Precision',
        metrics: 'Standardized 0–100 activity score calculation',
      },
      {
        name: 'Human-in-the-Loop Principle',
        description: 'No automated disqualification or punitive action is executed by algorithm. Signals serve solely to triage candidate sessions for human invigilators.',
        tag: 'Ethical Monitoring',
        metrics: 'Mandatory human invigilator review',
      },
      {
        name: 'No Invasive Webcam or Audio AI',
        description: 'ProctorNet strictly excludes continuous webcam gaze tracking, facial emotion classification, and continuous microphone audio processing.',
        tag: 'Candidate Dignity',
        metrics: '0 continuous audio/facial models deployed',
      },
    ],
  },
  {
    id: 'invigilator-console',
    title: 'Real-Time Invigilator Console',
    description: 'High-density video matrix and live intervention console for remote proctors.',
    features: [
      {
        name: '12-Stream Video Grid',
        description: 'Synchronized live video tiles with low-latency adaptive bitrate streaming.',
        tag: 'Live Video Matrix',
        metrics: '< 300ms end-to-end video latency',
      },
      {
        name: 'Automated Priority Triage',
        description: 'The grid dynamically reorders candidates based on their real-time activity score, surfacing sessions needing assistance or check-ins.',
        tag: 'Dynamic Prioritization',
        metrics: 'Continuous live sort via secure telemetry',
      },
      {
        name: 'Two-Way Live Interventions',
        description: 'Proctors can issue real-time text warnings, pause candidate timers, request identity re-checks, or manage session flow.',
        tag: 'Session Authority',
        metrics: 'Instant sub-second intervention delivery',
      },
      {
        name: 'Timeline Incident Bookmarking',
        description: 'Invigilators can annotate flagged anomalies with timestamped notes, generating permanent records for faculty review.',
        tag: 'Auditability',
        metrics: 'Persistent incident log',
      },
    ],
  },
  {
    id: 'biometrics-identity',
    title: 'Pre-Exam Photo Identity Check',
    description: 'Fast pre-exam identity assurance preventing proxy test-taking.',
    features: [
      {
        name: 'Photo Identity Setup',
        description: 'Candidates register an identity baseline photograph prior to exam day. Facial features are securely compared against this photo during check-in.',
        tag: 'Identity Verification',
        metrics: 'Automated photo identity verification',
      },
      {
        name: 'Pre-Exam Verification Check',
        description: 'Before an exam attempt begins, a fresh camera capture is compared against the enrolled baseline photo to confirm candidate identity.',
        tag: 'Anti-Impersonation',
        metrics: 'High-confidence photo matching',
      },
      {
        name: 'Encrypted Media Storage',
        description: 'Verification images are stored in private cloud storage with AES-256 encryption and short-lived signed URLs.',
        tag: 'Storage Security',
        metrics: 'Automated 90-day retention purge lifecycle',
      },
    ],
  },
  {
    id: 'developer-operations',
    title: 'Developer Operations Telemetry',
    description: 'Internal operational observability and infrastructure health monitoring suite for system administrators.',
    features: [
      {
        name: '6-Screen Operations Suite',
        description: 'Overview, Subsystem Health, Structured Logs, Immutable Audit, Topology Explorer, and Incident Management.',
        tag: 'Comprehensive Ops',
        metrics: '6 dedicated operational views',
      },
      {
        name: 'Administrative Network Boundary',
        description: 'Developer APIs and metrics endpoints are physically isolated behind dedicated private administrative network perimeters.',
        tag: 'Zero-Trust Boundary',
        metrics: '100% public exclusion on internal dev routes',
      },
      {
        name: 'Automated Health Sweeps',
        description: 'Periodic background probes continuously verify read/write health across database, caching, messaging, and media services.',
        tag: 'Continuous Health',
        metrics: 'Sub-second multi-service ping sweeps',
      },
      {
        name: 'Distributed Tracing & Correlation IDs',
        description: 'Every inbound request carries an immutable correlation ID passed down to background workers and audit logs.',
        tag: 'Observability',
        metrics: 'End-to-end request tracing',
      },
    ],
  },
  {
    id: 'security-resilience',
    title: 'Security, Auditing & Resilience',
    description: 'Defense-in-depth security model engineered for high-stakes academic reliability.',
    features: [
      {
        name: 'Role-Based Access Control',
        description: 'Strict authorization checks ensure users can only access their authorized exams, courses, and grading tasks.',
        tag: 'Access Control',
        metrics: 'Enforced on 100% of internal endpoints',
      },
      {
        name: 'Tamper-Proof Audit Records',
        description: 'Database audit logs are protected by database-level rules rejecting any modification or deletion of past events.',
        tag: 'Audit Defense',
        metrics: 'Tamper-proof append-only audit trail',
      },
      {
        name: 'Broker Disconnection Buffering',
        description: 'Guarantees exam events remain consistent and durable even during transient infrastructure interruptions.',
        tag: 'Resilience',
        metrics: '0 answer loss during broker failure resilience tests',
      },
      {
        name: 'Secure Session Lifecycle',
        description: 'Short-lived access tokens paired with rotating refresh tokens backed by immediate session revocation on logout.',
        tag: 'Session Hardening',
        metrics: 'Instantaneous token revocation',
      },
    ],
  },
];
