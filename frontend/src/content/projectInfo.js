/**
 * @file projectInfo.js
 * @description Canonical project metadata, positioning statements, and verified system statistics.
 * Strictly adheres to academic capstone identity with zero commercial claims.
 */

export const PROJECT_INFO = {
  name: 'ProctorNet',
  version: 'v1.0.0-release',
  tagline: 'An Open, Resilient Architecture for Online Examinations and Ethical Screen Proctoring',
  academicBadge: 'Academic Capstone Project • Non-Commercial Software Engineering Demo',
  positioningStatement:
    'ProctorNet is a student-built academic software engineering project demonstrating the design and implementation of an online examination and ethical remote proctoring system.',
  subheadline:
    'Demonstrating server-authoritative assessment workflows, continuous autosave with answer conflict protection, and privacy-first client-side screen analysis.',
  githubUrl: 'https://github.com/SudeepKagi/proctornet-rearchitecture',
  license: 'MIT License (Open Source Academic Project)',
  attribution: 'Engineered by Computer Science & Engineering Undergraduate Students',
  academicDisclaimer:
    'This platform is an educational software engineering demonstration. It is not a commercial SaaS product and is not offered for commercial procurement.',
  
  // Explicitly classified quantitative metrics
  stats: [
    {
      value: '4',
      label: 'Role-Based Portals',
      description: 'Student, Faculty, Administrator, Developer Operations',
      classification: 'MEASURED',
    },
    {
      value: '0%',
      label: 'Cloud Video Stored',
      description: 'Zero continuous raw webcam video or microphone audio persisted to cloud storage',
      classification: 'MEASURED',
    },
    {
      value: '100%',
      label: 'Server-Authoritative',
      description: 'Untrusted client model with continuous autosave and tamper-proof audit logs',
      classification: 'MEASURED',
    },
    {
      value: '13',
      label: 'Operational Subsystems',
      description: 'Monitored across databases, caching, messaging, and real-time media services',
      classification: 'MEASURED',
    },
  ],

  // 4 Core Architecture Pillars (Capability-Oriented, Zero Phase Numbers)
  pillars: [
    {
      id: 'pillar-exam-engine',
      title: 'Authoritative Examination Engine',
      subtitle: 'Resilient Assessment Lifecycle',
      description:
        'Blueprint-driven question randomization, continuous auto-saving with answer conflict protection, and offline draft queueing ensuring zero answer loss during transient network disconnects.',
      badges: ['Continuous Auto-Save', 'Offline Resilience', 'Atomic Grading'],
      icon: 'clipboard-document-check',
    },
    {
      id: 'pillar-screen-ai',
      title: 'Privacy-First Screen Analysis',
      subtitle: 'Client-Side Assistive Inference',
      description:
        'In-browser background checks assessing desktop display contexts without continuous facial recognition, eye tracking, or invasive room audio surveillance.',
      badges: ['Client-Side Privacy', 'Zero Continuous Audio/Video AI', 'Ephemeral Telemetry'],
      icon: 'computer-desktop',
    },
    {
      id: 'pillar-invigilator',
      title: 'Faculty Invigilation Console',
      subtitle: 'Live Examination Supervision',
      description:
        'Live examination session supervision, participant status tracking, in-session candidate notifications, and violation monitoring.',
      badges: ['Live Monitoring', 'Session Supervision', 'Violation Alerts'],
      icon: 'video-camera',
    },
    {
      id: 'pillar-devops',
      title: 'Developer Operations Telemetry',
      subtitle: 'Internal System Observability',
      description:
        'Dedicated 6-screen developer operations suite protected within an isolated private administrative network, featuring live metrics, health sweeps, and distributed tracing.',
      badges: ['Isolated Admin Network', 'Live Telemetry Feeds', 'Automated Health Sweeps'],
      icon: 'command-line',
    },
  ],

  // Implemented Technology Stack
  techStack: [
    { name: 'Node.js 24 LTS', category: 'Backend Runtime', detail: 'Modular monolith with asynchronous event loop' },
    { name: 'React 19', category: 'Frontend SPA', detail: 'Component-driven UI with fluid responsive design system' },
    { name: 'PostgreSQL 16', category: 'Relational Database', detail: 'Strict relational integrity with concurrent write safety and trigger-locked audit trails' },
    { name: 'Redis 7', category: 'In-Memory Cache & Pub/Sub', detail: 'Fast session state, token blacklisting, and WebSocket room multiplexing' },
    { name: 'RabbitMQ 3.13', category: 'Message Broker', detail: 'Event routing with DLQ fault recovery' },
    { name: 'WebRTC Media Server', category: 'Live Video Streaming', detail: 'Multi-stream WebRTC video distribution and bandwidth adaptation' },
    { name: 'Coturn STUN/TURN', category: 'NAT Traversal', detail: 'RFC 5766 TURN relay for firewalled candidate streaming' },
    { name: 'Docker Compose', category: 'Container Orchestration', detail: 'Unified local and production containerized topology' },
  ],
};
