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
    'ProctorNet is a student-built academic software engineering project demonstrating the design and implementation of an online examination and AI-assisted remote proctoring system.',
  subheadline:
    'Demonstrating server-authoritative assessment workflows, high-concurrency answer persistence with optimistic concurrency control, and privacy-first client-side screen analysis.',
  githubUrl: 'https://github.com/SudeepKagi/proctornet-rearchitecture',
  license: 'MIT License (Open Source Academic Project)',
  attribution: 'Engineered by Computer Science & Engineering Undergraduate Students',
  academicDisclaimer:
    'This platform is an educational software engineering demonstration. It is not a commercial SaaS product and is not offered for commercial procurement.',
  
  // Explicitly classified quantitative metrics
  stats: [
    {
      value: '5',
      label: 'Role-Based Portals',
      description: 'Candidate, Faculty, Invigilator, Administrator, Developer Operations',
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
      description: 'Untrusted client model with optimistic concurrency control and immutable audit logs',
      classification: 'MEASURED',
    },
    {
      value: '13',
      label: 'Operational Subsystems',
      description: 'Monitored across PostgreSQL, Redis, RabbitMQ, mediasoup SFU, and Coturn',
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
        'Blueprint-driven question randomization, optimistic concurrency control (OCC) auto-saving, and offline draft queueing ensuring zero answer loss during transient network disconnects.',
      badges: ['OCC Auto-Save', 'Offline Resilience', 'Atomic Grading'],
      icon: 'clipboard-document-check',
    },
    {
      id: 'pillar-screen-ai',
      title: 'Privacy-First Screen Analysis',
      subtitle: 'Client-Side Assistive Inference',
      description:
        'In-browser Web Worker classification assessing desktop display contexts without continuous facial recognition, eye tracking, or invasive room audio surveillance.',
      badges: ['Client-Side Web Worker', 'Zero Continuous Audio/Video AI', 'Ephemeral Telemetry'],
      icon: 'computer-desktop',
    },
    {
      id: 'pillar-invigilator',
      title: 'Real-Time Invigilator Console',
      subtitle: 'Live Multi-Stream Supervision',
      description:
        '12-stream mediasoup WebRTC video matrix with sub-300ms latency, dynamic room multiplexing, in-session candidate messaging, and immediate intervention triggers.',
      badges: ['mediasoup SFU', '12-Stream Matrix', 'Live Interventions'],
      icon: 'video-camera',
    },
    {
      id: 'pillar-devops',
      title: 'Developer Operations Telemetry',
      subtitle: 'Internal System Observability',
      description:
        'Dedicated 6-screen developer operations suite protected within a private WireGuard 10.100.0.0/24 subnet, featuring live metrics, health sweeps, and distributed tracing.',
      badges: ['WireGuard Isolation', 'Live WebSocket Feeds', 'Automated Health Sweeps'],
      icon: 'command-line',
    },
  ],

  // Implemented Technology Stack
  techStack: [
    { name: 'Node.js 24 LTS', category: 'Backend Runtime', detail: 'Modular monolith with asynchronous event loop' },
    { name: 'React 19', category: 'Frontend SPA', detail: 'Component-driven UI with fluid responsive design system' },
    { name: 'PostgreSQL 16', category: 'Relational Database', detail: 'Strict relational integrity with OCC and trigger-locked audit trails' },
    { name: 'Redis 7', category: 'In-Memory Cache & Pub/Sub', detail: 'Fast session state, token blacklisting, and WebSocket room multiplexing' },
    { name: 'RabbitMQ 3.13', category: 'Message Broker', detail: 'Transactional outbox event routing with DLQ fault recovery' },
    { name: 'mediasoup 3', category: 'Selective Forwarding Unit', detail: 'Multi-stream WebRTC video distribution and bandwidth adaptation' },
    { name: 'Coturn STUN/TURN', category: 'NAT Traversal', detail: 'RFC 5766 TURN relay for firewalled candidate streaming' },
    { name: 'Docker Compose', category: 'Container Orchestration', detail: 'Unified local and production containerized topology' },
  ],
};
