/**
 * @file FacultyDashboardPage.jsx
 * @description Faculty portal listing authored exams, creation modal, and lifecycle navigation.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as examsApi from '../../api/examsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function FacultyDashboardPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create exam modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState('60');
  const [totalMarks, setTotalMarks] = useState('100');
  const [passingMarks, setPassingMarks] = useState('40');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  async function loadExams() {
    try {
      setLoading(true);
      const data = await examsApi.listExams();
      setExams(data);
    } catch (err) {
      setError(err.message || 'Failed to load faculty exams');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExams();
  }, []);

  async function handleCreateExam(e) {
    e.preventDefault();
    setModalError('');
    setCreating(true);

    try {
      const newExam = await examsApi.createExam({
        title,
        subject,
        duration_minutes: parseInt(duration, 10),
        total_marks: parseInt(totalMarks, 10),
        passing_marks: parseInt(passingMarks, 10),
      });

      setIsModalOpen(false);
      setTitle('');
      setSubject('');
      navigate(`/faculty/exams/${newExam.id}`);
    } catch (err) {
      setModalError(err.message || 'Failed to create exam');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Faculty Exam Management
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
            Author exam blueprints, manage topic rules, and supervise academic evaluations.
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          + Create New Exam
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-light)',
            border: '1px solid var(--color-danger-border)',
            color: 'var(--color-danger)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <Spinner size="lg" label="Loading faculty exams..." />
        </div>
      ) : exams.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>No Authored Exams Yet</h3>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            Create your first examination blueprint to define topics, question rules, and scoring criteria.
          </p>
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Create Exam Blueprint
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {exams.map((exam) => (
            <Card key={exam.id} padding="normal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                  <h3 style={{ fontSize: '1.125rem', margin: 0 }}>{exam.title}</h3>
                  <Badge variant={getStatusBadgeVariant(exam.status)}>
                    {exam.status}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1.5rem' }}>
                  <span>Subject: <strong>{exam.subject}</strong></span>
                  <span>Duration: <strong>{exam.duration_minutes}m</strong></span>
                  <span>Marks: <strong>{exam.passing_marks} / {exam.total_marks}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/faculty/exams/${exam.id}`)}
                >
                  {exam.status === 'DRAFT' ? 'Edit Blueprint' : 'View Blueprint'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/faculty/exams/${exam.id}/results`)}
                >
                  Results & Grading
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Exam Blueprint Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Examination">
        <form onSubmit={handleCreateExam}>
          {modalError && (
            <div
              role="alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                fontSize: '0.8125rem',
              }}
            >
              {modalError}
            </div>
          )}

          <Input
            id="exam-title"
            label="Exam Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CS201 Midterm Examination"
            required
          />

          <Input
            id="exam-subject"
            label="Academic Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Data Structures & Algorithms"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <Input
              id="exam-duration"
              label="Duration (min)"
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
            />
            <Input
              id="exam-total-marks"
              label="Total Marks"
              type="number"
              min="1"
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              required
            />
            <Input
              id="exam-passing-marks"
              label="Passing Marks"
              type="number"
              min="0"
              value={passingMarks}
              onChange={(e) => setPassingMarks(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={creating}>
              Create Blueprint
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
