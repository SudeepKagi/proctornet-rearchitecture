/**
 * @file featuresData.js
 * @description Exhaustive, capability-oriented feature catalog for ProctorNet.
 * All capabilities are presented by domain without development phase numbers.
 */

export const FEATURE_CATEGORIES = [
  {
    id: 'exam-engine',
    title: 'Examination Engine & Lifecycle',
    description: 'Server-authoritative assessment delivery with blueprint randomization and optimistic concurrency control.',
    features: [
      {
        name: 'Assessment Blueprints',
        description: 'Define topic quotas, difficulty distributions, and sectional time limits to dynamically generate distinct candidate exam instances.',
        tag: 'Authoritative Delivery',
        metrics: '[MEASURED] Deterministic per-candidate randomization',
      },
      {
        name: 'Optimistic Concurrency Control (OCC)',
        description: 'Every answer submission increments an authoritative revision counter. Prevents silent overwrites during intermittent network retries.',
        tag: 'Data Integrity',
        metrics: '[MEASURED] 0 answer collisions under concurrent updates',
      },
      {
        name: 'Offline Draft Queueing & Autosave',
        description: 'Candidate answers are queued in browser local storage and dispatched asynchronously, guaranteeing zero loss when connectivity fluctuates.',
        tag: 'Resilience',
        metrics: '[TARGET] < 2000ms background sync cycle',
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
        metrics: '[MEASURED] 0% raw screen video sent to cloud AI services',
      },
      {
        name: 'Contextual Screen Heuristics',
        description: 'Detects full-screen exits, tab switches, browser window blurs, and unauthorized desktop context switching.',
        tag: 'Heuristic Triage',
        metrics: '100% Client-side anomaly detection',
      },
      {
        name: 'Server-Authoritative Risk Scoring',
        description: 'Raw client signals are dispatched to the backend, which applies exponential decay and duration weighting on an authoritative 0–100 scale.',
        tag: 'Scoring Precision',
        metrics: 'Authoritative 0–100 risk score calculation',
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
    description: 'High-density WebRTC video matrix and live intervention console for remote proctors.',
    features: [
      {
        name: '12-Stream Video Grid',
        description: 'Synchronized WebRTC video tiles powered by mediasoup SFU with low-latency adaptive bitrate streaming.',
        tag: 'WebRTC Matrix',
        metrics: '[TARGET] < 300ms end-to-end glass-to-glass latency',
      },
      {
        name: 'Automated Priority Triage',
        description: 'The grid dynamically reorders candidates based on their real-time authoritative risk score, surfacing high-risk sessions instantly.',
        tag: 'Dynamic Prioritization',
        metrics: 'Continuous live sort via WebSocket telemetry',
      },
      {
        name: 'Two-Way Live Interventions',
        description: 'Proctors can issue real-time text warnings, pause candidate timers, require live identity re-verification, or terminate anomalous attempts.',
        tag: 'Session Authority',
        metrics: 'Instant sub-second intervention delivery',
      },
      {
        name: 'Timeline Incident Bookmarking',
        description: 'Invigilators can annotate flagged anomalies with timestamped notes, generating immutable audit records for faculty review.',
        tag: 'Auditability',
        metrics: 'Persistent PostgreSQL incident log',
      },
    ],
  },
  {
    id: 'biometrics-identity',
    title: 'Pre-Exam Biometric Identity Verification',
    description: 'Lightweight pre-exam identity assurance preventing proxy test-taking.',
    features: [
      {
        name: 'Pre-Exam Face Enrollment',
        description: 'Candidates register an identity baseline photograph prior to exam day. Facial landmarks are extracted and stored as 512-dimensional embeddings.',
        tag: 'Identity Verification',
        metrics: '512-dimensional vector embedding matching',
      },
      {
        name: 'Pre-Exam Verification Check',
        description: 'Before an exam attempt begins, a fresh camera capture is compared against the enrolled embedding to confirm candidate identity.',
        tag: 'Anti-Impersonation',
        metrics: 'Cosine similarity verification threshold',
      },
      {
        name: 'Encrypted S3 Media Storage',
        description: 'Verification images are stored in private S3 buckets with server-side AES-256 encryption and signed URLs expiring in 15 minutes.',
        tag: 'Storage Security',
        metrics: 'Automated 90-day retention purge lifecycle',
      },
    ],
  },
  {
    id: 'developer-operations',
    title: 'Developer Operations Telemetry',
    description: 'Internal operational observability and infrastructure health monitoring suite.',
    features: [
      {
        name: '6-Screen Operations Suite',
        description: 'Overview, Subsystem Health, Structured Logs, Immutable Audit, Topology Explorer, and Incident Management.',
        tag: 'Comprehensive Ops',
        metrics: '6 dedicated operational views',
      },
      {
        name: 'WireGuard Network Boundary',
        description: 'Developer APIs and metrics endpoints are physically isolated behind a private WireGuard 10.100.0.0/24 subnet.',
        tag: 'Zero-Trust Boundary',
        metrics: '100% public exclusion on /api/v1/developer/*',
      },
      {
        name: 'Automated Health Sweeps',
        description: 'Periodic background probes continuously verify read/write health across PostgreSQL, Redis, RabbitMQ, and mediasoup SFU.',
        tag: 'Continuous Health',
        metrics: 'Sub-second multi-service ping sweeps',
      },
      {
        name: 'Distributed Tracing & Correlation IDs',
        description: 'Every inbound HTTP and WebSocket request carries an immutable correlation ID passed down to background workers and audit logs.',
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
        name: 'Role-Based & Ownership Authorization (RBAC/ABAC)',
        description: 'Strict authorization middleware checking role permissions and resource tenancy to completely prevent Broken Object-Level Authorization (BOLA).',
        tag: 'Access Control',
        metrics: 'Enforced on 100% of internal endpoints',
      },
      {
        name: 'PostgreSQL Trigger Audit Immutability',
        description: 'Database audit logs are protected by database-level triggers rejecting any UPDATE or DELETE operations with SQLSTATE 20000.',
        tag: 'Audit Defense',
        metrics: 'Tamper-proof append-only audit trail',
      },
      {
        name: 'Broker Disconnection Buffering',
        description: 'Transactional outbox pattern ensures domain events remain consistent in PostgreSQL even if RabbitMQ experiences transient downtime.',
        tag: 'Chaos Hardened',
        metrics: '[MEASURED] 0 answer loss during broker failure chaos test',
      },
      {
        name: 'JWT Lifecycle with Redis Blacklisting',
        description: 'Short-lived access tokens (15m) paired with rotating refresh tokens (7d) backed by instant Redis revocation on logout or security events.',
        tag: 'Session Hardening',
        metrics: 'Instantaneous token revocation',
      },
    ],
  },
];
