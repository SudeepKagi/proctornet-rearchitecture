/**
 * @file LandingPage.jsx
 * @description Completely rebuilt public landing page for ProctorNet Online Examination System.
 * Clean, academic, trustworthy, and restrained. Zero marketing fluff or SaaS jargon.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { PublicNavbar } from '../../components/public/PublicNavbar.jsx';
import { PublicFooter } from '../../components/public/PublicFooter.jsx';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Users,
  ShieldCheck,
  Award,
  ChevronDown,
  GraduationCap,
  Terminal,
  Sparkles,
} from 'lucide-react';

export function LandingPage() {
  const { user, isAuthenticated } = useAuth();
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  usePageMeta({
    title: 'Online Examination System',
    description: 'A simple platform for conducting, managing, and taking academic examinations online securely.',
    canonical: '/',
  });

  const getDashboardRoute = () => {
    if (!user) return '/login';
    if (user.roles?.includes('ADMIN')) return '/admin';
    if (user.roles?.includes('DEVELOPER')) return '/developer/overview';
    if (user.roles?.includes('FACULTY')) return '/faculty';
    return '/candidate';
  };

  const primaryActionUrl = isAuthenticated ? getDashboardRoute() : '/login';
  const primaryActionText = isAuthenticated ? 'Go to Dashboard' : 'Login';

  const faqItems = [
    {
      question: 'What credentials do I use to sign in?',
      answer:
        'You must sign in using the institutional email address and password provided by your institution or examination coordinator. If you do not have credentials, contact your department examination cell.',
    },
    {
      question: 'What happens if my internet connection drops during an exam?',
      answer:
        'ProctorNet continuously saves your responses to the server as you progress. If your connection drops, reconnect your device and re-open the examination. Your saved answers and remaining exam timer are preserved.',
    },
    {
      question: 'Can I navigate between questions and review my answers?',
      answer:
        'Yes. The exam workspace includes an interactive question palette allowing you to move freely between questions, flag questions for review, and update your responses before confirming final submission.',
    },
    {
      question: 'When and how are examination results released?',
      answer:
        'Objective and multiple-choice questions can generate immediate score summaries if permitted by your faculty. Subjective and essay evaluations appear in your dashboard once manual grading is completed.',
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        color: '#1e293b',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <PublicNavbar />

      {/* Main Content */}
      <main id="main-content" style={{ flex: 1, outline: 'none' }}>
        {/* ================================================================ */}
        {/* 1. HERO SECTION                                                  */}
        {/* Simple, grounded, academic hero without technical buzzwords      */}
        {/* ================================================================ */}
        <section
          style={{
            padding: 'clamp(3.5rem, 7vw, 6rem) 0 clamp(3rem, 5vw, 4.5rem)',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
              textAlign: 'center',
            }}
          >
            {/* Subtle Academic Badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '5px 14px',
                borderRadius: '9999px',
                backgroundColor: '#eff6ff',
                border: '1px solid #dbeafe',
                color: '#1d4ed8',
                fontSize: '0.8125rem',
                fontWeight: 600,
                marginBottom: '1.5rem',
              }}
            >
              <GraduationCap size={16} />
              <span>Academic Assessment Platform</span>
            </div>

            {/* Primary Heading */}
            <h1
              style={{
                fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.18,
                color: '#0f172a',
                margin: '0 auto 1.25rem',
                maxWidth: '840px',
              }}
            >
              Online Examination System
            </h1>

            {/* Short Supporting Sentence */}
            <p
              style={{
                fontSize: 'clamp(1.0625rem, 1.8vw, 1.25rem)',
                lineHeight: 1.6,
                color: '#475569',
                margin: '0 auto 2.25rem',
                maxWidth: '680px',
                fontWeight: 400,
              }}
            >
              A simple platform for conducting, managing, and taking online examinations securely.
            </p>

            {/* Primary Actions */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.875rem',
              }}
            >
              <Link
                to={primaryActionUrl}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '12px 26px',
                  backgroundColor: '#1d4ed8',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  textDecoration: 'none',
                  boxShadow: '0 1px 3px rgba(29, 78, 216, 0.2)',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e40af')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              >
                <span>{primaryActionText}</span>
                <ArrowRight size={16} />
              </Link>

              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById('how-it-works');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '12px 24px',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = '#94a3b8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
              >
                <span>How It Works</span>
              </a>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 2. SIMPLE EXPLANATION SECTION                                    */}
        {/* Plain language overview of actual repository capabilities         */}
        {/* ================================================================ */}
        <section
          id="overview"
          style={{
            padding: 'clamp(3.5rem, 6vw, 5rem) 0',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
            }}
          >
            {/* Section Header */}
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem, 4vw, 3.5rem)' }}>
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                  fontSize: 'clamp(1.625rem, 3vw, 2.125rem)',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: '0 0 0.75rem',
                }}
              >
                What the System Provides
              </h2>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#64748b',
                  margin: '0 auto',
                  maxWidth: '600px',
                  lineHeight: 1.55,
                }}
              >
                Practical tools designed for scheduled institutional evaluations, coursework quizzes, and formal examinations.
              </p>
            </div>

            {/* 4 Capability Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {/* Card 1: Take Exams */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                  }}
                >
                  <FileText size={20} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Take Examinations Online
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Students access timed assessments with a clear question palette, countdown timer, and continuous autosave protection.
                </p>
              </div>

              {/* Card 2: Manage Exams */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#f0fdf4',
                    color: '#16a34a',
                  }}
                >
                  <BookOpen size={20} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Manage Question Banks & Exams
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Faculty author multiple-choice and subjective questions, organize question banks, configure schedules, and set exam policies.
                </p>
              </div>

              {/* Card 3: Monitor Live */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                  }}
                >
                  <Clock size={20} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Monitor Active Sessions
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Faculty oversee session readiness, participant connectivity status, and submission progress in real time during live exam windows.
                </p>
              </div>

              {/* Card 4: Review Results */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#f3e8ff',
                    color: '#7c3aed',
                  }}
                >
                  <Award size={20} />
                </div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Review & Publish Results
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                  Automated scoring for objective questions, dedicated manual grading workflows for instructors, and transparent student score reviews.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 3. ROLES / USERS SECTION                                         */}
        {/* Student, Faculty, Developer, Admin                               */}
        {/* ================================================================ */}
        <section
          id="roles"
          style={{
            padding: 'clamp(3.5rem, 6vw, 5rem) 0',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
            }}
          >
            {/* Section Header */}
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem, 4vw, 3.5rem)' }}>
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                  fontSize: 'clamp(1.625rem, 3vw, 2.125rem)',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: '0 0 0.75rem',
                }}
              >
                User Roles in ProctorNet
              </h2>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#64748b',
                  margin: '0 auto',
                  maxWidth: '600px',
                  lineHeight: 1.55,
                }}
              >
                Each role receives a dedicated portal tailored strictly to its academic responsibilities.
              </p>
            </div>

            {/* 4 Clean Role Blocks */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {/* Role 1: Student */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    <GraduationCap size={18} />
                  </span>
                  <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Student
                  </h3>
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                    fontSize: '0.875rem',
                    color: '#475569',
                  }}
                >
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>View assigned tests for your branch and semester</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Take exams with continuous autosave and timer</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>View evaluated results and performance scores</span>
                  </li>
                </ul>
              </div>

              {/* Role 2: Faculty */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    <BookOpen size={18} />
                  </span>
                  <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Faculty
                  </h3>
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                    fontSize: '0.875rem',
                    color: '#475569',
                  }}
                >
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Create exams manually or generate questions from PDF</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Schedule exams assigned to specific branch and semester</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Invigilate active exams, view violations, and review results</span>
                  </li>
                </ul>
              </div>

              {/* Role 3: Developer */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    <Terminal size={18} />
                  </span>
                  <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Developer
                  </h3>
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                    fontSize: '0.875rem',
                    color: '#475569',
                  }}
                >
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Monitor subsystem health and live telemetry</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Inspect real-time logs, errors, and system events</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>View topology status, cache state, and audit feeds</span>
                  </li>
                </ul>
              </div>

              {/* Role 4: Administrator */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                    }}
                  >
                    <ShieldCheck size={18} />
                  </span>
                  <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Administrator
                  </h3>
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                    fontSize: '0.875rem',
                    color: '#475569',
                  }}
                >
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Create and manage user accounts with strict single roles</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Provision credentials directly for students, faculty, and developers</span>
                  </li>
                  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <CheckCircle2 size={16} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span>Maintain institutional security and audit records</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 4. HOW IT WORKS SECTION                                          */}
        {/* 4 clear, real implemented steps                                  */}
        {/* ================================================================ */}
        <section
          id="how-it-works"
          style={{
            padding: 'clamp(3.5rem, 6vw, 5rem) 0',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
            }}
          >
            {/* Section Header */}
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem, 4vw, 3.5rem)' }}>
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                  fontSize: 'clamp(1.625rem, 3vw, 2.125rem)',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: '0 0 0.75rem',
                }}
              >
                How It Works
              </h2>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#64748b',
                  margin: '0 auto',
                  maxWidth: '560px',
                  lineHeight: 1.55,
                }}
              >
                A straightforward assessment process from initial login to final evaluation.
              </p>
            </div>

            {/* 4 Sequential Steps */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {/* Step 1 */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '9999px',
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  1
                </div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Log In
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.55, margin: 0 }}>
                  Sign in with your institutional credentials to access your scheduled tests or dashboard.
                </p>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '9999px',
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  2
                </div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Access Examination
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.55, margin: 0 }}>
                  Enter the exam workspace once the scheduled time window opens and complete verification.
                </p>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '9999px',
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  3
                </div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Complete & Submit
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.55, margin: 0 }}>
                  Answer questions with continuous autosave, review flagged responses, and confirm submission.
                </p>
              </div>

              {/* Step 4 */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.75rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '9999px',
                    backgroundColor: '#1d4ed8',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                  }}
                >
                  4
                </div>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Review Results
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.55, margin: 0 }}>
                  View immediate objective scores or detailed feedback once evaluations are published.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 5. FAQ SECTION                                                   */}
        {/* ================================================================ */}
        <section
          id="faq"
          style={{
            padding: 'clamp(3.5rem, 6vw, 5rem) 0',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '860px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
            }}
          >
            {/* Section Header */}
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 3.5vw, 3rem)' }}>
              <h2
                style={{
                  fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                  fontSize: 'clamp(1.625rem, 3vw, 2.125rem)',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: '0 0 0.75rem',
                }}
              >
                Frequently Asked Questions
              </h2>
              <p style={{ fontSize: '1rem', color: '#64748b', margin: 0 }}>
                Clear answers regarding accounts, exam sessions, and grading.
              </p>
            </div>

            {/* Accordion List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {faqItems.map((item, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div
                    key={item.question}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%',
                        padding: '1.125rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: '#0f172a',
                      }}
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        size={18}
                        color="#64748b"
                        style={{
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.15s ease',
                          flexShrink: 0,
                        }}
                      />
                    </button>
                    {isOpen && (
                      <div
                        style={{
                          padding: '0 1.25rem 1.25rem',
                          fontSize: '0.9375rem',
                          lineHeight: 1.6,
                          color: '#475569',
                          borderTop: '1px solid #f1f5f9',
                          paddingTop: '1rem',
                        }}
                      >
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 6. FINAL CTA SECTION                                             */}
        {/* Dignified closing prompt to log in                               */}
        {/* ================================================================ */}
        <section
          style={{
            padding: 'clamp(3.5rem, 6vw, 5rem) 0',
            backgroundColor: '#f8fafc',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              margin: '0 auto',
              padding: '0 clamp(1rem, 3vw, 2rem)',
            }}
          >
            <h2
              style={{
                fontFamily: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
                fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.02em',
                margin: '0 0 0.75rem',
              }}
            >
              Ready to continue?
            </h2>
            <p
              style={{
                fontSize: '1rem',
                color: '#64748b',
                lineHeight: 1.6,
                margin: '0 auto 1.75rem',
              }}
            >
              Sign in with your verified institutional credentials to access examinations, courses, or administration tools.
            </p>
            <Link
              to={primaryActionUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '12px 28px',
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
                fontSize: '0.9375rem',
                fontWeight: 600,
                borderRadius: '7px',
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgba(29, 78, 216, 0.2)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e40af')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
            >
              <span>{primaryActionText}</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
