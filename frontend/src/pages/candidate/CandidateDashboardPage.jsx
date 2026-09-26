import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Award,
  Layers,
  Timer,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { getEnrollmentStatus } from '../../api/biometricsApi.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';

function formatDateTime(val) {
  if (!val) return 'TBA';
  return new Date(val).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function useCountdown(targetDate) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setRemaining('Now'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 48) {
        const days = Math.floor(h / 24);
        setRemaining(`${days}d ${h % 24}h`);
      } else if (h > 0) {
        setRemaining(`${h}h ${m}m`);
      } else {
        setRemaining(`${m}m ${s}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return remaining;
}

function NextExamCard({ session, onEnter }) {
  const id = session.session_id || session.id;
  const isActive = session.status === 'ACTIVE';
  const countdown = useCountdown(isActive ? null : session.scheduled_start_time);

  return (
    <Card className={`border-2 ${isActive ? 'border-emerald-400 bg-emerald-50/60' : 'border-blue-200 bg-blue-50/40'} shadow-sm`}>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {isActive ? (
                <Badge variant="success" className="gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Now
                </Badge>
              ) : (
                <Badge variant="secondary">Upcoming</Badge>
              )}
              <span className="text-xs text-slate-500 font-medium">
                {isActive ? `Closes at ${new Date(session.scheduled_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : formatDateTime(session.scheduled_start_time)}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 leading-snug">
              {session.exam_title || 'Assigned Examination'}
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Timer size={12} className="text-slate-400" />
                {session.exam_duration_minutes || 60} min duration
              </span>
              {!isActive && (
                <span className="flex items-center gap-1.5 font-semibold text-blue-700">
                  <Clock size={12} />
                  Starts in {countdown}
                </span>
              )}
            </div>
          </div>
          <Button
            onClick={() => onEnter(id)}
            className={`shrink-0 h-10 px-6 font-semibold text-sm ${isActive
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
              : 'bg-blue-700 hover:bg-blue-800 text-white'
            }`}
          >
            {isActive ? 'Enter Exam' : 'View Details'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CandidateDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError(err?.message || 'Failed to load dashboard. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []);

  const upcoming = sessions.filter(s => !['COMPLETED', 'CANCELLED'].includes(s.status));
  const completed = sessions.filter(s => s.status === 'COMPLETED');
  const active = sessions.filter(s => s.status === 'ACTIVE');
  const nextExam = active[0] || upcoming.sort((a, b) => new Date(a.scheduled_start_time) - new Date(b.scheduled_start_time))[0];
  const recentCompleted = [...completed].sort((a, b) => new Date(b.scheduled_end_time || b.updated_at) - new Date(a.scheduled_end_time || a.updated_at)).slice(0, 3);

  const isEnrolled = Boolean(
    enrollment?.isEnrolled &&
    (user?.isVerified === true || user?.verificationStatus === 'VERIFIED') &&
    Boolean(user?.enrolledFacePhotoUrl)
  );
  const firstName = (user?.name || 'Student').split(' ')[0];

  const stats = [
    { label: 'Total Assigned', value: sessions.length, icon: Layers, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Upcoming', value: upcoming.length, icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Pass Rate', value: completed.length > 0 ? `${Math.round((completed.length / sessions.length) * 100)}%` : '—', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-7 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Student Portal</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here's your exam overview for today.</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={loadDashboard}
          disabled={loading}
          className="self-start sm:self-auto text-xs h-9 gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={15} />
          <AlertDescription className="flex items-center justify-between gap-4">
            {error}
            <Button size="sm" variant="outline" onClick={loadDashboard}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-slate-200 bg-white shadow-xs">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`${bg} ${color} p-3 rounded-xl shrink-0`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-2xl font-bold text-slate-900 leading-tight">{loading ? '…' : value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Next Exam / No Exams */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
          {active.length > 0 ? '🔴 Active Now' : '📅 Next Exam'}
        </h2>
        {loading ? (
          <Card className="border-slate-200 animate-pulse"><CardContent className="p-6 h-24" /></Card>
        ) : nextExam ? (
          <NextExamCard session={nextExam} onEnter={(id) => navigate(`/candidate/readiness/${id}`)} />
        ) : (
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-8 text-center space-y-2">
              <BookOpen size={32} className="mx-auto text-slate-300 stroke-1" />
              <p className="text-sm font-semibold text-slate-700">No upcoming exams scheduled</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                You'll see your next exam here once one is assigned to you.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Results + Identity Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Completed */}
        <Card className="lg:col-span-2 border-slate-200 bg-white shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award size={15} className="text-slate-500" />
              Recent Results
            </CardTitle>
            <Button
              variant="ghost" size="sm"
              className="text-xs h-7 text-blue-600 hover:text-blue-700 gap-1"
              onClick={() => navigate('/candidate/exams')}
            >
              View All <ChevronRight size={13} />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1,2].map(i => <div key={i} className="h-12 rounded-lg bg-slate-100" />)}
              </div>
            ) : recentCompleted.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                No completed exams yet. Your results will appear here after submission.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCompleted.map(s => {
                  const id = s.session_id || s.id;
                  return (
                    <div key={id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.exam_title || 'Exam'}</p>
                        <p className="text-xs text-slate-400">{formatDateTime(s.scheduled_end_time || s.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">Completed</Badge>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-blue-600 hover:text-blue-700 gap-1 px-2"
                          onClick={() => navigate(`/candidate/exams`)}
                        >
                          Results <ChevronRight size={12} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Identity / Quick Links */}
        <div className="space-y-4">
          <Card className={`border-2 shadow-xs ${isEnrolled ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 size={16} className={isEnrolled ? 'text-emerald-600' : 'text-amber-600'} />
                <p className="text-xs font-semibold text-slate-700">
                  {isEnrolled ? 'Biometrics Verified' : 'Verification Pending'}
                </p>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isEnrolled
                  ? 'Your face profile is active. You can enter proctored exams.'
                  : 'Complete face enrollment to unlock proctored exam access.'}
              </p>
              {!isEnrolled && (
                <Button
                  size="sm" className="mt-3 h-8 text-xs w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  onClick={() => navigate('/candidate/enrollment')}
                >
                  Complete Setup
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-xs">
            <CardContent className="p-5 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Quick Links</p>
              {[
                { label: 'My Exams', path: '/candidate/exams', icon: BookOpen },
                { label: 'Profile & Verification', path: '/candidate/profile', icon: Award },
              ].map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition-colors text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon size={14} className="text-slate-400" />
                    {label}
                  </span>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
