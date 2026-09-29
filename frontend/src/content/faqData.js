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
      'No. ProctorNet explicitly rejects continuous facial emotion recognition, gaze tracking, and invasive continuous video AI. Webcams are utilized solely for pre-exam identity verification and live streaming to human invigilators over an encrypted connection. No continuous webcam video or microphone audio is recorded or stored.',
    tags: ['Privacy', 'Webcam', 'AI Ethics'],
  },
  {
    id: 'faq-screen-ai-works',
    category: 'Architecture & Tech',
    question: 'How does the client-side screen analysis work?',
    answer:
      'The candidate browser captures their display context using standard Web APIs. A background process assesses desktop anomalies (such as window minimization, tab switches, full-screen drops, and multi-display transitions) locally on the student device. Only lightweight activity events and periodic low-resolution hashes are sent to the exam server.',
    tags: ['Screen Analysis', 'Exam Environment', 'Privacy'],
  },
  {
    id: 'faq-network-drop',
    category: 'For Candidates',
    question: 'What happens if my internet connection drops during an exam?',
    answer:
      'ProctorNet includes an offline-resilient draft queueing mechanism. When connectivity is interrupted, your answers are safely saved in browser storage. The UI presents a clear offline banner with a grace countdown. Once connection is restored, drafts sync automatically without overwriting newer answers.',
    tags: ['Offline', 'Network Drop', 'Autosave'],
  },
  {
    id: 'faq-disqualification-algorithm',
    category: 'For Candidates',
    question: 'Can the AI automatically disqualify me or cancel my exam attempt?',
    answer:
      'No. ProctorNet operates under a strict Human-in-the-Loop principle. The system only provides assistive activity indicators to help invigilators prioritize check-ins. Only an authorized faculty member or human invigilator has the authority to issue warnings, request re-verification, or take administrative action.',
    tags: ['Disqualification', 'Human-in-the-loop', 'Candidate Rights'],
  },
  {
    id: 'faq-browser-requirements',
    category: 'For Candidates',
    question: 'What hardware and browser do I need to take an exam?',
    answer:
      'Any modern desktop computer running Windows, macOS, or Linux with Google Chrome, Mozilla Firefox, or Microsoft Edge. Your browser must support camera capture and screen sharing permissions. Mobile phones and tablets are not supported for proctored examination sessions.',
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
      'All grades, exam modifications, and proctoring interventions are recorded into an immutable audit table. Database-level tamper-prevention rules reject any modification or deletion of audit records, ensuring a verifiable and transparent trail.',
    tags: ['Audit', 'Security', 'Integrity'],
  },
  {
    id: 'faq-developer-ops-access',
    category: 'Architecture & Tech',
    question: 'Who can access the Developer Operations Telemetry Portal?',
    answer:
      'Access to the Developer Operations portal is strictly restricted to engineering staff. In addition to requiring developer credentials, access is guarded behind private administrative network boundaries. All public attempts to reach developer dashboards are rejected.',
    tags: ['DevOps', 'Security', 'Access Control'],
  },
  {
    id: 'faq-ferpa-gdpr',
    category: 'Privacy & Security',
    question: 'Is ProctorNet compliant with FERPA and GDPR?',
    answer:
      'ProctorNet is an academic project and does not possess formal third-party regulatory certification. However, the system architecture was engineered from the ground up to uphold the foundational privacy principles of FERPA and GDPR: minimal data collection, zero third-party trackers, encrypted storage, automated 90-day retention purges, and candidate data export/deletion rights.',
    tags: ['FERPA', 'GDPR', 'Compliance'],
  },
  {
    id: 'faq-data-retention',
    category: 'Privacy & Security',
    question: 'How long is candidate photo and exam activity data retained?',
    answer:
      'Photos used for identity checks are kept for a maximum of 90 days following exam evaluation, after which automated cleanup jobs permanently purge the media from storage and databases. Routine screen activity indicators are summarized and deleted after 30 days.',
    tags: ['Retention', 'Privacy', 'Purge'],
  },
];
