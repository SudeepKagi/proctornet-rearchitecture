/**
 * @file AdminOverviewPage.jsx
 * @description System-wide administrative overview for exams, sessions, and campus facilities.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as examsApi from '../../api/examsApi.js';
import * as sessionsApi from '../../api/sessionsApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { StateBoundary } from '@/components/common/StateBoundary.jsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  FileText,
  Calendar,
  Building,
  ArrowRight,
  Activity,
  Layers,
  ShieldCheck,
} from 'lucide-react';

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [examsData, sessionsData, roomsData] = await Promise.all([
          examsApi.listExams().catch(() => []),
          sessionsApi.listSessions().catch(() => []),
          sessionsApi.listRooms().catch(() => []),
        ]);
        setExams(examsData);
        setSessions(sessionsData);
        setRooms(roomsData);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SCHEDULED':
        return <Badge variant="secondary">{status}</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">{status}</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline" className="text-muted-foreground">{status}</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="outline">{status || 'UNKNOWN'}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-7xl">
        <StateBoundary
          isLoading={true}
          loadingMessage="Loading system-wide administrative metrics..."
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          System Administration Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Global oversight of academic blueprints, examination execution windows, and physical facilities.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Exam Blueprints
            </CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">{exams.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Configured blueprints across departments</p>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between group"
                onClick={() => navigate('/faculty')}
              >
                <span>Manage All Exams</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scheduled Sessions
            </CardTitle>
            <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {sessions.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active, upcoming & historic exam slots</p>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between group"
                onClick={() => navigate('/faculty/sessions')}
              >
                <span>Manage Sessions</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Campus Rooms & Halls
            </CardTitle>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground">{rooms.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Physical exam venues and computer labs</p>
            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between group"
                onClick={() => navigate('/faculty/sessions')}
              >
                <span>Inspect Facilities</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active System Sessions Table */}
      <Card className="shadow-xs border-border/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Active System Sessions</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">Latest 5 registered sessions</span>
          </div>
          <CardDescription>
            Live view of scheduled examination instances currently configured in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <StateBoundary
            isEmpty={sessions.length === 0}
            emptyTitle="No Sessions Active"
            emptyDescription="There are no examination sessions currently registered or running in the system."
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px]">Session ID</TableHead>
                    <TableHead>Exam Title</TableHead>
                    <TableHead>Room / Venue</TableHead>
                    <TableHead className="w-[140px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(sessions) ? sessions : []).slice(0, 5).map((s) => {
                    const sid = s.session_id || s.id || '';
                    return (
                      <TableRow key={sid || Math.random()} className="transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {sid ? `${sid.slice(0, 8)}...` : '-'}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {s.exam_title || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.room_name || 'Virtual'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(s.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </StateBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
