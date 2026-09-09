/**
 * @file faqData.js
 * @description Categorized questions and answers for ProctorNet educational project.
 * Adheres strictly to transparent academic engineering presentation.
 */

export const FAQ_CATEGORIES = [
  'All',
  'For Candidates',
  'For Faculty',
  'Architecture & Tech',
  'Privacy & Security',
];

export const FAQ_ITEMS = [
  {
    id: 'faq-academic-nature',
    category: 'Architecture & Tech',
    question: 'Is ProctorNet a commercial product or enterprise service?',
    answer:
      'No. ProctorNet is a student-built academic software engineering capstone project. It was designed and implemented to demonstrate how an ethical, resilient online examination and proctoring platform can be built using modern software engineering principles and open-source infrastructure. It is not for sale, has no pricing tiers, and cannot be commercially procured.',
    tags: ['Identity', 'Academic', 'Open Source'],
  },
  {
    id: 'faq-webcam-monitoring',
    category: 'Privacy & Security',
    question: 'Does ProctorNet record or analyze candidate webcams continuously using AI?',
    answer:
      'No. ProctorNet explicitly rejects continuous facial emotion recognition, gaze tracking, and invasive continuous video AI. Webcams are utilized for pre-exam identity verification and live streaming to human invigilators via mediasoup WebRTC. No continuous raw webcam video or microphone audio is recorded or stored on cloud servers.',
    tags: ['Privacy', 'Webcam', 'AI Ethics'],
  },
  {
    id: 'faq-screen-ai-works',
    category: 'Architecture & Tech',
    question: 'How does the client-side screen analysis work?',
    answer:
      'The candidate browser captures their display context using standard Web APIs. An in-browser Web Worker assesses desktop anomalies (such as window minimization, tab switches, full-screen drops, and multi-display transitions) locally on the candidate device. Only lightweight, ephemeral telemetry flags and periodic low-resolution hashes are sent to the backend server.',
    tags: ['Screen Analysis', 'Web Worker', 'Client-Side'],
  },
  {
    id: 'faq-network-drop',
    category: 'For Candidates',
    question: 'What happens if my internet connection drops during an exam?',
    answer:
      'ProctorNet includes an offline-resilient draft queueing mechanism. When connectivity is interrupted, your answers are safely saved in encrypted browser storage. The UI presents a clear offline banner with a grace countdown. Once connection is restored, drafts sync automatically using Optimistic Concurrency Control (OCC) without overwriting newer answers.',
    tags: ['Offline', 'Network Drop', 'Autosave'],
  },
  {
    id: 'faq-disqualification-algorithm',
    category: 'For Candidates',
    question: 'Can the AI automatically disqualify me or cancel my exam attempt?',
    answer:
      'No. ProctorNet operates under a strict Human-in-the-Loop principle. The system only provides assistive heuristic risk scores to prioritize live sessions on the invigilator console. Only an authorized faculty member or human invigilator has the authority to issue warnings, request re-verification, or take administrative action.',
    tags: ['Disqualification', 'Human-in-the-loop', 'Candidate Rights'],
  },
  {
    id: 'faq-browser-requirements',
    category: 'For Candidates',
    question: 'What hardware and browser do I need to take an exam?',
    answer:
      'Any modern desktop computer running Windows, macOS, or Linux with Google Chrome, Mozilla Firefox, or Microsoft Edge. Your browser must support WebRTC, MediaDevices (camera capture), and getDisplayMedia (screen capture). Mobile devices and tablets are not supported for proctored examination sessions.',
    tags: ['Requirements', 'Browser', 'System'],
  },
  {
    id: 'faq-blueprint-randomization',
    category: 'For Faculty',
    question: 'How do assessment blueprints prevent candidate collusion?',
    answer:
      'Faculty configure blueprint rules (e.g. 10 questions from Topic A at Medium difficulty, 5 from Topic B at Hard). When a candidate begins an attempt, the server dynamically samples questions according to the blueprint and randomizes option orders. Each candidate receives a distinct, balanced question set.',
    tags: ['Blueprints', 'Anti-Collusion', 'Faculty'],
  },
  {
    id: 'faq-subjective-grading',
    category: 'For Faculty',
    question: 'How are subjective essay questions evaluated?',
    answer:
      'Subjective questions route to a dedicated Manual Grading workspace. Faculty review candidate submissions against multi-criteria grading rubrics. The system supports blind evaluation mode where candidate personal details are masked to eliminate grading bias.',
    tags: ['Grading', 'Rubrics', 'Subjective'],
  },
  {
    id: 'faq-tamper-proof-audit',
    category: 'Privacy & Security',
    question: 'How does ProctorNet protect against grade tampering?',
    answer:
      'All grades, exam modifications, and proctoring interventions are recorded into an immutable audit table. Database-level PostgreSQL triggers reject any UPDATE or DELETE operations on audit records with SQLSTATE 20000, creating a cryptographically verifiable trail.',
    tags: ['Audit', 'Security', 'Integrity'],
  },
  {
    id: 'faq-developer-ops-access',
    category: 'Architecture & Tech',
    question: 'Who can access the Developer Operations Telemetry Portal?',
    answer:
      'Access to the Developer Operations portal is strictly restricted. In addition to requiring a user account with the DEVELOPER role, network requests are bounded to a private WireGuard VPN subnet (10.100.0.0/24). All public attempts to reach developer endpoints are rejected.',
    tags: ['DevOps', 'WireGuard', 'Zero-Trust'],
  },
  {
    id: 'faq-ferpa-gdpr',
    category: 'Privacy & Security',
    question: 'Is ProctorNet compliant with FERPA and GDPR?',
    answer:
      'ProctorNet is an academic project and does not possess formal third-party regulatory certification. However, the system architecture was engineered from the ground up to uphold the foundational privacy principles of FERPA and GDPR: minimal data collection, zero third-party trackers, encrypted media storage, automated 90-day retention purges, and candidate data export/deletion rights.',
    tags: ['FERPA', 'GDPR', 'Compliance'],
  },
  {
    id: 'faq-data-retention',
    category: 'Privacy & Security',
    question: 'How long is candidate biometric and telemetry data retained?',
    answer:
      'Pre-exam biometric facial embeddings and verification photos are retained for a maximum of 90 days after exam evaluation, after which automated background workers purge the media from Amazon S3 and PostgreSQL. Ephemeral screen telemetry flags are summarized into session scorecards and deleted after 30 days.',
    tags: ['Retention', 'Biometrics', 'Purge'],
  },
];
