/**
 * @file policyData.js
 * @description Policy definitions, data mapping inventories, and regulatory disclosures for ProctorNet.
 */

export const POLICY_DATA = {
  lastUpdated: 'September 2026',
  version: '1.0.0-academic',

  terms: {
    title: 'Terms of Use',
    effectiveDate: 'September 2026',
    summary: 'ProctorNet is an academic capstone demonstration. Use of this service is governed by educational guidelines without commercial warranty.',
    sections: [
      {
        heading: '1. Educational Demonstration Status',
        content:
          'ProctorNet is developed by university students as an academic software engineering capstone project. It is provided "as is" solely for educational demonstration, engineering evaluation, and research purposes. It is not an enterprise commercial service.',
      },
      {
        heading: '2. Disclaimer of Warranties',
        content:
          'The authors and academic institution make no warranties, express or implied, regarding system availability, high-stakes examination fitness, or absolute freedom from errors. Users acknowledge that network interruptions or hardware differences may affect session behavior.',
      },
      {
        heading: '3. Permitted & Prohibited Conduct',
        content:
          'Users agree to utilize ProctorNet only for legitimate examination participation, faculty evaluation, or authorized system demonstration. Attempting to reverse-engineer client proctoring workers, exploit API endpoints, or conduct unauthorized penetration testing outside designated staging environments is strictly prohibited.',
      },
      {
        heading: '4. Account Termination & Suspension',
        content:
          'Administrators reserve the right to suspend or terminate any user account found attempting to manipulate examination attempts, submit forged identity documents, or disrupt platform infrastructure.',
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    effectiveDate: 'September 2026',
    summary: 'ProctorNet prioritizes candidate privacy by rejecting continuous webcam/audio surveillance and executing screen analysis client-side.',
    dataInventory: [
      {
        category: 'Account Data',
        items: 'Full Name, Email Address, Hashed Password (bcrypt cost 12), Institutional Role',
        purpose: 'Authentication, role-based access control, session security',
        storage: 'PostgreSQL (RDS Multi-AZ)',
        retention: 'Duration of academic term or upon account deletion request',
      },
      {
        category: 'Academic Assessment Data',
        items: 'Exam blueprints, questions, candidate answer revisions, autosave drafts, scorecards',
        purpose: 'Delivering assessments, atomic grading, grade calculation',
        storage: 'PostgreSQL with continuous revision conflict prevention',
        retention: 'Academic year or per faculty archive policy',
      },
      {
        category: 'Photo Identity Data',
        items: 'Registered baseline photograph, pre-exam verification photos',
        purpose: 'Pre-exam identity verification to prevent proxy test taking',
        storage: 'Private cloud storage with AES-256 encryption; signed URLs (15m)',
        retention: 'Automated 90-day retention purge lifecycle',
      },
      {
        category: 'Exam Activity Telemetry',
        items: 'Screen activity indicators (full-screen exits, window switches), periodic low-res hashes',
        purpose: 'Live invigilator triage during exam sessions; human-in-the-loop review',
        storage: 'In-memory Redis (live) and PostgreSQL session summary',
        retention: '30 days after exam release; then automatically purged',
      },
      {
        category: 'Audit Logs',
        items: 'Admin actions, grade overrides, intervention logs, IP address, timestamp',
        purpose: 'Tamper resistance, security verification, academic misconduct review',
        storage: 'PostgreSQL tamper-proof audit table with trigger-locked defense',
        retention: 'Indefinite academic integrity record',
      },
    ],
    rights: [
      {
        right: 'Right of Access & Inspection',
        description: 'Candidates have the right to inspect all proctoring telemetry and annotations associated with their exam attempt.',
      },
      {
        right: 'Right to Rectification & Human Appeal',
        description: 'Candidates may appeal any flagged incident or score adjustment for independent manual review by faculty.',
      },
      {
        right: 'Right to Erasure (Purge)',
        description: 'Candidates may request deletion of their registered identity photos once their academic evaluation has completed.',
      },
      {
        right: 'Zero Third-Party Commercial Tracking',
        description: 'ProctorNet does not use Google Analytics, advertising pixels, or third-party behavioral trackers. Zero data is sold or commercialized.',
      },
    ],
  },

  cookies: {
    title: 'Cookie Policy',
    effectiveDate: 'September 2026',
    summary: 'ProctorNet uses essential session cookies for authentication and offers transparent controls for optional first-party analytics.',
    cookieList: [
      {
        name: 'proctornet_session',
        type: 'Essential / Strict',
        purpose: 'Maintains authenticated JWT session state across page navigation',
        duration: 'Session / 15 minutes',
      },
      {
        name: 'proctornet_csrf',
        type: 'Essential / Strict',
        purpose: 'Protects mutation endpoints against Cross-Site Request Forgery',
        duration: 'Session',
      },
      {
        name: 'proctornet_cookie_consent',
        type: 'Essential / Functional',
        purpose: 'Remembers user cookie consent preferences (Essential Only vs All)',
        duration: '1 Year',
      },
      {
        name: 'proctornet_analytics_optin',
        type: 'Optional / Analytics',
        purpose: 'Stores anonymous first-party page visit telemetry if visitor opts in',
        duration: '90 Days',
      },
    ],
  },

  acceptableUse: {
    title: 'Acceptable Use Policy',
    effectiveDate: 'September 2026',
    summary: 'Guidelines ensuring fair, secure, and respectful use of the ProctorNet examination platform.',
    rules: [
      'Do not attempt to bypass, disable, or tamper with the client-side screen analysis worker.',
      'Do not share session tokens, login credentials, or allow proxy test-takers.',
      'Do not perform automated penetration tests, vulnerability scanning, or Denial of Service attacks against the platform infrastructure.',
      'Do not attempt to circumvent network boundaries protecting internal developer and admin APIs.',
      'Report any discovered security vulnerabilities responsibly through the project contact portal.',
    ],
  },

  academicIntegrity: {
    title: 'Academic Integrity Policy',
    effectiveDate: 'September 2026',
    summary: 'Standards of academic honesty upheld during ProctorNet online examinations.',
    principles: [
      {
        title: 'Authorized Materials Only',
        detail: 'Candidates must only consult resources explicitly permitted by the exam blueprint instructions.',
      },
      {
        title: 'Individual Authorship',
        detail: 'All exam responses must reflect the candidate’s own independent intellectual effort without collusion or unauthorized AI assistance.',
      },
      {
        title: 'Evidence-Based Dispute Resolution',
        detail: 'ProctorNet preserves timestamped telemetry and audit records to ensure that any allegations of misconduct are evaluated objectively with full candidate recourse.',
      },
    ],
  },

  aiNotice: {
    title: 'Responsible AI & Proctoring Notice',
    effectiveDate: 'September 2026',
    summary: 'Transparent disclosure regarding the role, limitations, and ethical boundaries of AI within ProctorNet.',
    commitments: [
      {
        title: 'Assistive, Not Determinate',
        description:
          'ProctorNet uses assistive activity checks strictly to alert human invigilators. The system cannot make disciplinary decisions or disqualify candidates.',
      },
      {
        title: 'Absence of Invasive Surveillance',
        description:
          'ProctorNet deliberately excludes continuous facial emotion recognition, continuous gaze tracking, and continuous voice stress analysis, preserving candidate dignity during stressful assessments.',
      },
      {
        title: 'Transparent Risk Calculation',
        description:
          'All risk scores are calculated using a clear, weighted 0–100 scale based on observable screen context switches and duration of window blur.',
      },
    ],
  },

  accessibility: {
    title: 'Accessibility Statement',
    effectiveDate: 'September 2026',
    summary: 'ProctorNet is committed to digital accessibility in conformance with WCAG 2.1 Level AA standards.',
    features: [
      'Comprehensive keyboard navigation support across all examination, grading, and public pages.',
      'Visible focus indicators with high-contrast outlines conforming to WCAG 2.4.7 and 2.4.11.',
      'Semantic HTML5 landmarks (main, nav, header, footer, section, article) and ARIA attributes for screen reader compatibility.',
      'Fluid layout scaling supporting 200% text zoom without horizontal scrolling or content clipping.',
      'Strict color contrast ratios exceeding 4.5:1 for standard text and 3:1 for large text and interactive components.',
      'Honoring prefers-reduced-motion media queries to eliminate vestibular discomfort from animations.',
    ],
  },
};
