/**
 * @file SessionManagerPage.jsx
 * @description Faculty and admin portal for scheduling sessions, rooms, rosters, and invigilation.
 */

import React, { useEffect, useState, useCallback } from 'react';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as examsApi from '../../api/examsApi.js';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Badge, getStatusBadgeVariant } from '../../components/common/Badge.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';

export function SessionManagerPage() {
  const [sessions, setSessions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Schedule session modal
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  // Roster inspection / manage modal
  const [activeSession, setActiveSession] = useState(null);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [invigilatorIdInput, setInvigilatorIdInput] = useState('');
  const [rosterActionLoading, setRosterActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionsData, roomsData, examsData] = await Promise.all([
        sessionsApi.listSessions(),
        sessionsApi.listRooms().catch(() => []),
        examsApi.listExams().catch(() => []),
      ]);
      setSessions(sessionsData);
      setRooms(roomsData);
      setExams(examsData);
    } catch (err) {
      setError(err.message || 'Failed to load session scheduling data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleScheduleSession(e) {
    e.preventDefault();
    setScheduleError('');
    setScheduling(true);

    try {
      await sessionsApi.createSession({
        exam_id: selectedExamId,
        room_id: selectedRoomId || undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      });

      setIsScheduleOpen(false);
      await loadData();
    } catch (err) {
      setScheduleError(err.message || 'Failed to schedule exam session');
    } finally {
      setScheduling(false);
    }
  }

  async function handleAssignStudent(sessionId) {
    if (!studentIdInput) return;
    setRosterActionLoading(true);
    try {
      await sessionsApi.assignStudents(sessionId, [studentIdInput.trim()]);
      setStudentIdInput('');
      const updated = await sessionsApi.getSession(sessionId);
      setActiveSession(updated);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to assign candidate to session');
    } finally {
      setRosterActionLoading(false);
    }
  }

  async function handleAssignInvigilator(sessionId) {
    if (!invigilatorIdInput) return;
    setRosterActionLoading(true);
    try {
      await sessionsApi.assignInvigilator(sessionId, { user_id: invigilatorIdInput.trim() });
      setInvigilatorIdInput('');
      const updated = await sessionsApi.getSession(sessionId);
      setActiveSession(updated);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to assign invigilator');
    } finally {
      setRosterActionLoading(false);
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Session Scheduling & Rosters
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
            Coordinate exam execution windows, assign candidate rosters, and designate invigilators.
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsScheduleOpen(true)}>
          + Schedule New Session
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
          <Spinner size="lg" label="Loading sessions..." />
        </div>
      ) : sessions.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <h3>No Sessions Scheduled</h3>
          <p style={{ color: 'var(--color-text-muted)', margin: '1rem 0' }}>
            Create a session to allocate exam windows to rooms and students.
          </p>
          <Button variant="primary" onClick={() => setIsScheduleOpen(true)}>
            Schedule First Session
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sessions.map((sess) => (
            <Card key={sess.id} padding="normal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                  <h3 style={{ fontSize: '1.125rem', margin: 0 }}>
                    {sess.exam_title || `Session #${sess.id.slice(0, 8)}`}
                  </h3>
                  <Badge variant={getStatusBadgeVariant(sess.status)}>
                    {sess.status}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', display: 'flex', gap: '1.5rem' }}>
                  <span>Room: <strong>{sess.room_name || 'Virtual / Unassigned'}</strong></span>
                  <span>Start: <strong>{new Date(sess.start_time).toLocaleString()}</strong></span>
                  <span>End: <strong>{new Date(sess.end_time).toLocaleString()}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const detailed = await sessionsApi.getSession(sess.id);
                    setActiveSession(detailed);
                  }}
                >
                  Manage Rosters
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Schedule Session Modal */}
      <Modal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} title="Schedule Examination Session">
        <form onSubmit={handleScheduleSession}>
          {scheduleError && (
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
              {scheduleError}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Select Published Exam
            </label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <option value="">-- Choose an Exam --</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.status})
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Select Campus Room (Optional)
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-subtle)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <option value="">-- Virtual / No Physical Room --</option>
              {rooms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name} (Capacity: {rm.capacity})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Input
              id="session-start"
              label="Start Window"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
            <Input
              id="session-end"
              label="Closing Window"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button variant="secondary" onClick={() => setIsScheduleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={scheduling}>
              Schedule Session
            </Button>
          </div>
        </form>
      </Modal>

      {/* Roster Management Modal */}
      {activeSession && (
        <Modal
          isOpen={!!activeSession}
          onClose={() => setActiveSession(null)}
          title={`Session Rosters — #${activeSession.id.slice(0, 8)}`}
          maxWidth="640px"
        >
          <div>
            <h4 style={{ marginBottom: '0.75rem' }}>Candidate Roster ({activeSession.students?.length || 0})</h4>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Student User ID (UUID)"
                value={studentIdInput}
                onChange={(e) => setStudentIdInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.375rem 0.625rem',
                  fontSize: '0.875rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              />
              <Button
                variant="primary"
                size="sm"
                loading={rosterActionLoading}
                onClick={() => handleAssignStudent(activeSession.id)}
              >
                Enroll Student
              </Button>
            </div>

            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '1.5rem', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              {activeSession.students?.length > 0 ? (
                activeSession.students.map((st) => (
                  <div key={st.student_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <span style={{ fontSize: '0.8125rem' }}>{st.name || st.email || st.student_id}</span>
                    <Badge variant="neutral" size="sm">{st.status || 'ASSIGNED'}</Badge>
                  </div>
                ))
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  No students assigned to this session.
                </div>
              )}
            </div>

            <h4 style={{ marginBottom: '0.75rem' }}>Invigilators ({activeSession.invigilators?.length || 0})</h4>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Invigilator User ID (UUID)"
                value={invigilatorIdInput}
                onChange={(e) => setInvigilatorIdInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.375rem 0.625rem',
                  fontSize: '0.875rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={rosterActionLoading}
                onClick={() => handleAssignInvigilator(activeSession.id)}
              >
                Assign Invigilator
              </Button>
            </div>

            <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              {activeSession.invigilators?.length > 0 ? (
                activeSession.invigilators.map((inv) => (
                  <div key={inv.user_id} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
                    {inv.name || inv.email || inv.user_id}
                  </div>
                ))
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  No invigilators assigned.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
