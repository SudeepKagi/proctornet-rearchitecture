import React, { useEffect, useState, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  FileText,
  MapPin,
  Laptop,
  CheckSquare,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { getEnrollmentStatus } from '../../api/biometricsApi.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert.jsx';
import { Separator } from '../../components/ui/separator.jsx';

function formatDateTime(val) {
  if (!val) return 'TBA';
  const d = new Date(val);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(val) {
  if (!val) return '';
  const d = new Date(val);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getStatusBadge(status) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Available Now</Badge>;
    case 'SCHEDULED':
      return <Badge variant="secondary">Scheduled</Badge>;
    case 'COMPLETED':
      return <Badge variant="outline">Concluded</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status || 'Scheduled'}</Badge>;
  }
}

export function CandidateDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const [sessionData, enrollmentData] = await Promise.all([
        sessionsApi.listSessions(),
        getEnrollmentStatus().catch(() => null),
      ]);
      setSessions(Array.isArray(sessionData) ? sessionData : []);
      setEnrollment(enrollmentData);
    } catch (err) {
      setError(err?.message || "Failed to load examination schedule. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const activeSessions = sessions.filter((s) => s.status === 'ACTIVE');
  const upcomingSessions = sessions.filter((s) => !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(s.status));
  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED');

  const studentName = user?.name || 'Student';
  const isEnrolled = Boolean(enrollment?.isEnrolled);

  return (
    <div className="app-container space-y-8 pb-16">
      {/* Top Academic Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Academic Portal</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-medium text-slate-500">Student Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome, {studentName}
          </h1>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            View assigned examinations, complete mandatory readiness checks, and access official scorecards.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboard}
            disabled={loading}
            className="text-xs text-slate-700 h-9 px-3.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Schedule</span>
          </Button>
        </div>
      </div>

      {/* Error Alert if request failed */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle size={16} />
          <AlertTitle>Unable to retrieve exam schedule</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 mt-1">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={loadDashboard}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Verification & Enrollment Status Banner */}
      <Card className="border-slate-200 bg-white shadow-xs">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`p-2.5 rounded-lg shrink-0 ${
                  isEnrolled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {isEnrolled ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {isEnrolled ? 'Biometric Identity Profile Verified' : 'Biometric Identity Verification Required'}
                  </h2>
                  <Badge variant={isEnrolled ? 'success' : 'warning'} size="sm">
                    {isEnrolled ? 'Ready for Monitored Exams' : 'Action Required'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isEnrolled
                    ? `Your reference facial embedding is active (Model ${enrollment?.modelVersion || 'v1'}). Automated pre-exam liveness verification is enabled.`
                    : 'A reference face capture is required before entering proctored sessions. Complete your profile setup now.'}
                </p>
              </div>
            </div>

            {!isEnrolled && (
              <Button
                size="sm"
                variant="default"
                onClick={() => navigate('/candidate/biometrics/enroll')}
                className="whitespace-nowrap sm:self-center"
              >
                Complete Verification
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* High-Priority Active Exam Alert Banner */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                Examination Available Now
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {activeSessions.length} active {activeSessions.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          <div className="grid gap-4">
            {activeSessions.map((session) => {
              const id = session.session_id || session.id;
              return (
                <Card key={id} className="border-emerald-200 bg-emerald-50/40 shadow-xs">
                  <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <Badge variant="success" size="sm">
                          Available Now
                        </Badge>
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          Closes at {formatTime(session.scheduled_end_time)}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                        {session.exam_title || 'Assigned Examination'}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600 pt-0.5">
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-500" />
                          Duration: <strong className="font-semibold text-slate-800">{session.exam_duration_minutes || 60} minutes</strong>
                        </span>
                        {session.room_name && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-slate-500" />
                            Location: <strong className="font-semibold text-slate-800">{session.room_name} {session.room_building ? `(${session.room_building})` : ''}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="default"
                      onClick={() => navigate(`/candidate/readiness/${id}`)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs md:self-center shrink-0 h-10 px-5 text-sm font-semibold"
                    >
                      Enter Readiness Check
                      <ArrowRight size={15} />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Examination & Information Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Tabs of Scheduled, Completed, All Exams */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="upcoming">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <TabsList>
                <TabsTrigger value="upcoming">
                  Upcoming ({upcomingSessions.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({completedSessions.length})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All Exams ({sessions.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Upcoming Exams Tab */}
            <TabsContent value="upcoming">
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {upcomingSessions.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <BookOpen size={32} className="mx-auto text-slate-400 dark:text-slate-500 stroke-1" />
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Upcoming Exams Scheduled</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      You currently do not have future examination sessions assigned to your roster. Check back closer to the scheduled examination window.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[620px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[38%]">Assessment</TableHead>
                          <TableHead className="w-[26%]">Schedule Window</TableHead>
                          <TableHead className="w-[14%]">Duration</TableHead>
                          <TableHead className="w-[12%]">Status</TableHead>
                          <TableHead className="w-[10%] text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcomingSessions.map((session) => {
                          const id = session.session_id || session.id;
                          return (
                            <TableRow key={id} className="h-14">
                              <TableCell className="font-semibold text-slate-900 dark:text-slate-100 py-3.5">
                                <div>
                                  <span className="block text-sm">{session.exam_title || 'Scheduled Exam'}</span>
                                  {session.room_name && (
                                    <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                      <MapPin size={11} className="text-slate-400 dark:text-slate-500" /> {session.room_name}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap py-3.5">
                                {formatDateTime(session.scheduled_start_time)}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400 py-3.5">
                                {session.exam_duration_minutes || 60} mins
                              </TableCell>
                              <TableCell className="py-3.5">
                                {getStatusBadge(session.status)}
                              </TableCell>
                              <TableCell className="text-right py-3.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/candidate/readiness/${id}`)}
                                  className="h-8 text-xs font-medium px-3"
                                >
                                  View Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Completed Assessments Tab */}
            <TabsContent value="completed">
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {completedSessions.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <FileText size={32} className="mx-auto text-slate-400 dark:text-slate-500 stroke-1" />
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Completed Exams on File</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      Completed exams and released scorecards will be listed here after submission and faculty grading.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[580px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[38%]">Assessment</TableHead>
                          <TableHead className="w-[26%]">Completed Date</TableHead>
                          <TableHead className="w-[14%]">Duration</TableHead>
                          <TableHead className="w-[12%]">Status</TableHead>
                          <TableHead className="w-[10%] text-right">Scorecard</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedSessions.map((session) => {
                          const id = session.session_id || session.id;
                          return (
                            <TableRow key={id} className="h-14">
                              <TableCell className="font-semibold text-slate-900 dark:text-slate-100 py-3.5">
                                {session.exam_title || 'Completed Exam'}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap py-3.5">
                                {formatDateTime(session.scheduled_end_time || session.updated_at)}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400 py-3.5">
                                {session.exam_duration_minutes || 60} mins
                              </TableCell>
                              <TableCell className="py-3.5">
                                <Badge variant="outline">Concluded</Badge>
                              </TableCell>
                              <TableCell className="text-right py-3.5">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => navigate(`/candidate/readiness/${id}`)}
                                  className="h-8 text-xs font-medium px-3"
                                >
                                  Assessment Record
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* All Exams Tab */}
            <TabsContent value="all">
              <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {sessions.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <BookOpen size={32} className="mx-auto text-slate-400 dark:text-slate-500 stroke-1" />
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No Exams Found</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                      You are not currently enrolled in any examination sessions.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[540px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[45%]">Exam Title</TableHead>
                          <TableHead className="w-[30%]">Date / Window</TableHead>
                          <TableHead className="w-[15%]">Status</TableHead>
                          <TableHead className="w-[10%] text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((session) => {
                          const id = session.session_id || session.id;
                          return (
                            <TableRow key={id} className="h-14">
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100 py-3.5">
                                {session.exam_title || 'Exam Session'}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap py-3.5">
                                {formatDateTime(session.scheduled_start_time)}
                              </TableCell>
                              <TableCell className="py-3.5">
                                {getStatusBadge(session.status)}
                              </TableCell>
                              <TableCell className="text-right py-3.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/candidate/readiness/${id}`)}
                                  className="h-8 text-xs font-medium px-3"
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right 1 Col: Readiness Checklist & Institutional Guidelines */}
        <div className="space-y-4">
          <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare size={16} className="text-slate-700" />
                Pre-Exam Checklist
              </CardTitle>
              <CardDescription className="text-xs">
                Essential requirements before starting any monitored exam session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-medium text-slate-800">Hardware & Peripherals</strong>
                  <p className="text-slate-500 mt-0.5">Ensure webcam and microphone permissions are granted.</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-medium text-slate-800">Environment Setup</strong>
                  <p className="text-slate-500 mt-0.5">Use a quiet, well-lit room free from secondary monitors or visitors.</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-medium text-slate-800">Network Stability</strong>
                  <p className="text-slate-500 mt-0.5">A stable broadband connection prevents autosave interruptions.</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-medium text-slate-800">Academic Integrity</strong>
                  <p className="text-slate-500 mt-0.5">Automated proctoring logs tab changes, audio spikes, and multi-face events.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50/50">
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Laptop size={15} className="text-slate-600" />
                <span>System Compatibility</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                ProctorNet is optimized for recent releases of Google Chrome, Mozilla Firefox, and Microsoft Edge with WebRTC support enabled.
              </p>
              <div className="pt-1 text-[11px] text-slate-400">
                Examination Office Support: support@proctornet.edu
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
