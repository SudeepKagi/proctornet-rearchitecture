import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Trophy,
  CalendarClock,
  Ban,
  FileText,
} from 'lucide-react';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Alert, AlertDescription } from '../../components/ui/alert.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.jsx';

function formatDateTime(val) {
  if (!val) return 'TBA';
  return new Date(val).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getExamState(session) {
  const now = new Date();
  const start = session.scheduled_start_time ? new Date(session.scheduled_start_time) : null;
  const end = session.scheduled_end_time ? new Date(session.scheduled_end_time) : null;

  if (session.status === 'COMPLETED') return 'completed';
  if (session.status === 'CANCELLED') return 'cancelled';
  if (session.status === 'ACTIVE') return 'active';
  // Scheduled but end time passed
  if (end && now > end) return 'over';
  return 'upcoming';
}

function ExamCard({ session, onEnter, onViewResult }) {
  const id = session.session_id || session.id;
  const state = getExamState(session);

  const stateConfig = {
    active: {
      border: 'border-emerald-300',
      bg: 'bg-emerald-50/50',
      badge: <Badge variant="success" className="gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>Live Now</Badge>,
      action: (
        <Button onClick={() => onEnter(id)} className="bg-emerald-700 hover:bg-emerald-800 text-white h-9 px-5 text-sm font-semibold gap-1.5">
          Enter Exam <ArrowRight size={14} />
        </Button>
      ),
    },
    upcoming: {
      border: 'border-blue-200',
      bg: 'bg-white',
      badge: <Badge variant="secondary">Scheduled</Badge>,
      action: (
        <Button variant="outline" onClick={() => onEnter(id)} className="h-9 px-4 text-sm gap-1.5">
          View Details <ArrowRight size={14} />
        </Button>
      ),
    },
    over: {
      border: 'border-slate-200',
      bg: 'bg-slate-50/50',
      badge: <Badge variant="destructive" className="gap-1"><Ban size={11} />Exam Over</Badge>,
      action: (
        <span className="text-xs text-slate-400 font-medium italic">This exam window has closed.</span>
      ),
    },
    completed: {
      border: 'border-slate-200',
      bg: 'bg-white',
      badge: <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700"><CheckCircle2 size={11} />Completed</Badge>,
      action: (
        <Button variant="secondary" onClick={() => onViewResult(session)} className="h-9 px-4 text-sm gap-1.5">
          <Trophy size={13} /> View Results
        </Button>
      ),
    },
    cancelled: {
      border: 'border-red-100',
      bg: 'bg-red-50/30',
      badge: <Badge variant="destructive" className="gap-1"><XCircle size={11} />Cancelled</Badge>,
      action: (
        <span className="text-xs text-red-400 font-medium">Session cancelled.</span>
      ),
    },
  };

  const cfg = stateConfig[state] || stateConfig.upcoming;

  return (
    <Card className={`border ${cfg.border} ${cfg.bg} shadow-xs transition-shadow hover:shadow-sm`}>
      <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {cfg.badge}
            {state === 'completed' && session.my_submission_status === 'SUBMITTED' && (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 gap-1">
                <FileText size={10} /> Submitted
              </Badge>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900 leading-snug truncate">
            {session.exam_title || 'Assigned Examination'}
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarClock size={12} />
              {state === 'completed'
                ? `Completed ${formatDateTime(session.scheduled_end_time || session.updated_at)}`
                : `Scheduled ${formatDateTime(session.scheduled_start_time)}`}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {session.exam_duration_minutes || 60} min
            </span>
          </div>
        </div>
        <div className="shrink-0 self-end sm:self-center">
          {cfg.action}
        </div>
      </CardContent>
    </Card>
  );
}

export function CandidateExamsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await sessionsApi.listSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load exams. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleEnter(sessionId) {
    navigate(`/candidate/readiness/${sessionId}`);
  }

  async function handleViewResult(session) {
    // Try to get attempt to navigate to result
    try {
      const attempt = await sessionsApi.getMyAttempt(session.session_id || session.id);
      if (attempt?.attempt_id) {
        navigate(`/candidate/attempts/${attempt.attempt_id}/result`);
        return;
      }
    } catch {/* fall through */}
    navigate(`/candidate/readiness/${session.session_id || session.id}`);
  }

  const upcoming = sessions.filter(s => ['SCHEDULED', 'ACTIVE'].includes(s.status) || (!['COMPLETED','CANCELLED'].includes(s.status) && getExamState(s) === 'upcoming'));
  const active = sessions.filter(s => getExamState(s) === 'active');
  const completed = sessions.filter(s => getExamState(s) === 'completed');
  const over = sessions.filter(s => getExamState(s) === 'over');
  const all = sessions;

  const tabs = [
    { key: 'all', label: `All (${all.length})`, items: all },
    { key: 'active', label: `Live (${active.length})`, items: active },
    { key: 'upcoming', label: `Upcoming (${upcoming.length})`, items: upcoming },
    { key: 'completed', label: `Completed (${completed.length})`, items: completed },
  ];

  function EmptyState({ icon: Icon, title, desc }) {
    return (
      <div className="py-16 text-center space-y-2">
        <Icon size={36} className="mx-auto text-slate-300 stroke-1" />
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">{desc}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Student Portal</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Exams</h1>
          <p className="text-sm text-slate-500 mt-0.5">All examination sessions assigned to you.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="self-start sm:self-auto gap-1.5 text-xs h-9">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle size={15} />
          <AlertDescription className="flex items-center justify-between gap-4">
            {error}
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList className="border-b border-slate-200 rounded-none bg-transparent p-0 h-auto gap-1 mb-5">
          {tabs.map(t => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="rounded-md px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-800"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(t => (
          <TabsContent key={t.key} value={t.key}>
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-slate-100" />)}
              </div>
            ) : t.items.length === 0 ? (
              <Card className="border-slate-200 bg-white">
                {t.key === 'all'
                  ? <EmptyState icon={BookOpen} title="No exams assigned yet" desc="Your assigned examination sessions will appear here once scheduled by your faculty." />
                  : t.key === 'completed'
                  ? <EmptyState icon={CheckCircle2} title="No completed exams yet" desc="Exams you submit will show here, along with your results once published." />
                  : t.key === 'active'
                  ? <EmptyState icon={Clock} title="No live exams right now" desc="You'll see an exam here when your session window opens." />
                  : <EmptyState icon={CalendarClock} title="No upcoming exams" desc="No scheduled exams coming up. Check back later." />
                }
              </Card>
            ) : (
              <div className="space-y-3">
                {t.items.map(s => (
                  <ExamCard
                    key={s.session_id || s.id}
                    session={s}
                    onEnter={handleEnter}
                    onViewResult={handleViewResult}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
