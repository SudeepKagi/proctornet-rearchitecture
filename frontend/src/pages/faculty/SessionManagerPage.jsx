/**
 * @file SessionManagerPage.jsx
 * @description Faculty and admin portal for scheduling sessions, rooms, rosters, and invigilation.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Shield,
  UserCheck,
  Building,
  Eye,
  ChevronRight,
  UserPlus,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import * as examsApi from '../../api/examsApi.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';

function getSessionStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active Session</Badge>;
    case 'SCHEDULED':
      return <Badge variant="secondary">Scheduled</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function SessionManagerPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Schedule session dialog
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  // Roster inspection / manage dialog
  const [activeSession, setActiveSession] = useState(null);
  const [studentIdInput, setStudentIdInput] = useState('');
  const [invigilatorIdInput, setInvigilatorIdInput] = useState('');
  const [rosterActionLoading, setRosterActionLoading] = useState(false);
  const [rosterNotice, setRosterNotice] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [sessionsData, roomsData, examsData] = await Promise.all([
        sessionsApi.listSessions(),
        sessionsApi.listRooms().catch(() => []),
        examsApi.listExams().catch(() => []),
      ]);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setExams(Array.isArray(examsData) ? examsData : []);
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
      setSelectedExamId('');
      setSelectedRoomId('');
      setStartTime('');
      setEndTime('');
      await loadData();
    } catch (err) {
      setScheduleError(err.message || 'Failed to schedule exam session');
    } finally {
      setScheduling(false);
    }
  }

  async function handleAssignStudent(sessionId) {
    if (!studentIdInput.trim()) return;
    setRosterActionLoading(true);
    setRosterNotice(null);
    try {
      await sessionsApi.assignStudents(sessionId, [studentIdInput.trim()]);
      setStudentIdInput('');
      const updated = await sessionsApi.getSession(sessionId);
      setActiveSession(updated);
      await loadData();
      setRosterNotice({ type: 'success', message: 'Candidate enrolled in session roster successfully.' });
    } catch (err) {
      setRosterNotice({ type: 'error', message: err.message || 'Failed to assign candidate to session' });
    } finally {
      setRosterActionLoading(false);
    }
  }

  async function handleAssignInvigilator(sessionId) {
    if (!invigilatorIdInput.trim()) return;
    setRosterActionLoading(true);
    setRosterNotice(null);
    try {
      await sessionsApi.assignInvigilator(sessionId, { user_id: invigilatorIdInput.trim() });
      setInvigilatorIdInput('');
      const updated = await sessionsApi.getSession(sessionId);
      setActiveSession(updated);
      await loadData();
      setRosterNotice({ type: 'success', message: 'Invigilator designated to session successfully.' });
    } catch (err) {
      setRosterNotice({ type: 'error', message: err.message || 'Failed to assign invigilator' });
    } finally {
      setRosterActionLoading(false);
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Exam Administration
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Session Orchestration
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Session Scheduling & Rosters
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Coordinate examination operational windows, allocate rooms, and enroll candidate rosters.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-xs h-9 gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
          <Button
            onClick={() => {
              setScheduleError('');
              if (exams.length > 0 && !selectedExamId) {
                setSelectedExamId(exams[0].id || exams[0].exam_id);
              }
              setIsScheduleOpen(true);
            }}
            className="text-xs h-9 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Plus size={14} />
            <span>Schedule Session</span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Scheduling Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw size={28} className="animate-spin mx-auto text-slate-400" />
          <p className="text-sm font-medium text-slate-500">Loading examination sessions...</p>
        </div>
      ) : sessions.length === 0 ? (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center py-16 px-4">
          <CardContent className="space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mx-auto flex items-center justify-center">
              <Calendar size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Scheduled Sessions</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Create a session to allocate an exam blueprint to physical or virtual rooms with assigned candidates.
              </p>
            </div>
            <Button onClick={() => setIsScheduleOpen(true)} className="gap-2">
              <Plus size={15} />
              Schedule First Session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((sess) => {
            const sid = sess.session_id || sess.id || '';
            const sStart = sess.scheduled_start_time || sess.start_time;
            const sEnd = sess.scheduled_end_time || sess.end_time;
            const isLive = sess.status === 'ACTIVE';

            return (
              <Card
                key={sid}
                className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {getSessionStatusBadge(sess.status)}
                      <span className="text-xs font-mono text-slate-400">
                        #{sid.slice(0, 8)}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {sess.exam_title || `Session ${sid.slice(0, 8)}`}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Building size={13} className="text-slate-400 dark:text-slate-500" />
                        Room: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sess.room_name || 'Virtual / Unassigned'}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                        Start: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sStart ? new Date(sStart).toLocaleString() : 'TBA'}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                        End: <strong className="font-semibold text-slate-800 dark:text-slate-200">{sEnd ? new Date(sEnd).toLocaleString() : 'TBA'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                    {isLive && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => navigate(`/invigilator/sessions/${sid}`)}
                        className="gap-1.5 h-8 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white"
                      >
                        <Eye size={13} />
                        <span>Live Monitor</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const detailed = await sessionsApi.getSession(sid);
                        setActiveSession(detailed);
                      }}
                      className="gap-1.5 h-8 text-xs font-medium"
                    >
                      <Users size={13} />
                      <span>Manage Rosters</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Schedule Session Dialog */}
      <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Schedule Examination Session</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Bind a published exam blueprint to an operational delivery window.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleScheduleSession} className="space-y-4 pt-1">
            {scheduleError && (
              <Alert variant="destructive">
                <AlertCircle size={15} />
                <AlertDescription>{scheduleError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label htmlFor="session-exam" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Target Exam Blueprint *
              </label>
              <select
                id="session-exam"
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                required
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
              >
                <option value="">-- Select Exam Blueprint --</option>
                {exams.map((ex) => {
                  const id = ex.id || ex.exam_id;
                  return (
                    <option key={id} value={id}>
                      {ex.title} ({ex.status})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="session-room" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Campus Room / Facility (Optional)
              </label>
              <select
                id="session-room"
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
              >
                <option value="">-- Virtual / Remote Assessment --</option>
                {rooms.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.name} {rm.capacity ? `(Capacity: ${rm.capacity})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="session-start" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Window Start *
                </label>
                <Input
                  id="session-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="session-end" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Window End *
                </label>
                <Input
                  id="session-end"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={scheduling}
                className="h-9 text-xs gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {scheduling && <RefreshCw size={13} className="animate-spin" />}
                <span>Confirm Schedule</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Roster Management Dialog */}
      {activeSession && (() => {
        const activeSid = activeSession.session_id || activeSession.id || '';
        return (
          <Dialog
            open={Boolean(activeSession)}
            onOpenChange={(open) => {
              if (!open) {
                setActiveSession(null);
                setRosterNotice(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <Users size={18} className="text-slate-600 dark:text-slate-400" />
                  <span>Session Roster & Invigilation</span>
                  <span className="text-xs font-normal text-slate-500 font-mono">#{activeSid.slice(0, 8)}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Manage enrolled candidates and assign certified invigilators.
                </DialogDescription>
              </DialogHeader>

              {rosterNotice && (
                <Alert variant={rosterNotice.type === 'error' ? 'destructive' : 'success'}>
                  {rosterNotice.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                  <AlertDescription className="text-xs">{rosterNotice.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-5 pt-1">
                {/* Candidates Roster */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <UserCheck size={14} className="text-blue-600" />
                      Enrolled Candidates ({activeSession.students?.length || 0})
                    </h4>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Candidate User ID (UUID) or email..."
                      value={studentIdInput}
                      onChange={(e) => setStudentIdInput(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      disabled={rosterActionLoading || !studentIdInput.trim()}
                      onClick={() => handleAssignStudent(activeSid)}
                      className="h-8 text-xs gap-1.5 shrink-0 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                    >
                      <UserPlus size={13} />
                      <span>Enroll</span>
                    </Button>
                  </div>

                  <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {activeSession.students && activeSession.students.length > 0 ? (
                      activeSession.students.map((st) => (
                        <div key={st.student_id} className="flex items-center justify-between p-2.5">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {st.name || st.email || st.student_id}
                          </span>
                          <Badge variant="outline" size="sm">
                            {st.status || 'ASSIGNED'}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-slate-500 text-xs">
                        No candidates currently enrolled in this session roster.
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Invigilators */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Shield size={14} className="text-emerald-600" />
                      Designated Invigilators ({activeSession.invigilators?.length || 0})
                    </h4>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Invigilator User ID (UUID)..."
                      value={invigilatorIdInput}
                      onChange={(e) => setInvigilatorIdInput(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rosterActionLoading || !invigilatorIdInput.trim()}
                      onClick={() => handleAssignInvigilator(activeSid)}
                      className="h-8 text-xs gap-1.5 shrink-0"
                    >
                      <Shield size={13} />
                      <span>Designate</span>
                    </Button>
                  </div>

                  <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {activeSession.invigilators && activeSession.invigilators.length > 0 ? (
                      activeSession.invigilators.map((inv) => (
                        <div key={inv.user_id} className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {inv.name || inv.email || inv.user_id}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-slate-500 text-xs">
                        No invigilators designated yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveSession(null)}
                  className="h-9 text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

export default SessionManagerPage;
