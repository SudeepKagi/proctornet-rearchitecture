/**
 * @file StudentConfigurationPage.jsx
 * @description Administrative screen for managing per-student accommodations:
 * extra time multiplier, break allowances, assistive technology flags, and proctoring strictness.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sliders,
  ArrowLeft,
  Clock,
  Accessibility,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Coffee,
  Check,
} from 'lucide-react';

export function StudentConfigurationPage() {
  const { id: studentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [studentInfo, setStudentInfo] = useState(null);
  const [extraTimeMultiplier, setExtraTimeMultiplier] = useState('1.00');
  const [breakAllowanceMinutes, setBreakAllowanceMinutes] = useState(0);
  const [maxBreaksAllowed, setMaxBreaksAllowed] = useState(0);
  const [screenReader, setScreenReader] = useState(false);
  const [speechToText, setSpeechToText] = useState(false);
  const [keyboardOnly, setKeyboardOnly] = useState(false);
  const [proctoringStrictness, setProctoringStrictness] = useState('STANDARD');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [dossier, config] = await Promise.all([
          adminUsersApi.fetchStudentVerificationDossier(studentId).catch(() => null),
          adminUsersApi.fetchStudentConfiguration(studentId).catch(() => null),
        ]);

        if (dossier?.user) {
          setStudentInfo(dossier.user);
        }

        if (config) {
          setExtraTimeMultiplier(String(config.extraTimeMultiplier || '1.00'));
          setBreakAllowanceMinutes(config.breakAllowanceMinutes || 0);
          setMaxBreaksAllowed(config.maxBreaksAllowed || 0);
          setProctoringStrictness(config.proctoringStrictness || 'STANDARD');
          setUpdatedAt(config.updatedAt);

          const at = config.assistiveTechnology || {};
          setScreenReader(Boolean(at.screenReader));
          setSpeechToText(Boolean(at.speechToText));
          setKeyboardOnly(Boolean(at.keyboardOnly));
        }
      } catch (err) {
        setError(err?.message || 'Failed to load student configuration');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [studentId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const mult = parseFloat(extraTimeMultiplier);
    if (isNaN(mult) || mult < 1.00 || mult > 3.00) {
      setError('Extra time multiplier must be between 1.00 and 3.00 (e.g. 1.50 for 50% extra time).');
      return;
    }

    const breaksMin = parseInt(breakAllowanceMinutes, 10);
    if (isNaN(breaksMin) || breaksMin < 0 || breaksMin > 120) {
      setError('Break allowance minutes must be between 0 and 120 minutes.');
      return;
    }

    const breaksCount = parseInt(maxBreaksAllowed, 10);
    if (isNaN(breaksCount) || breaksCount < 0 || breaksCount > 10) {
      setError('Maximum breaks allowed must be between 0 and 10.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminUsersApi.updateStudentConfiguration(studentId, {
        extraTimeMultiplier: mult,
        breakAllowanceMinutes: breaksMin,
        maxBreaksAllowed: breaksCount,
        assistiveTechnology: {
          screenReader,
          speechToText,
          keyboardOnly,
        },
        proctoringStrictness,
      });

      setSuccess('Accommodations and proctoring strictness updated successfully!');
      setUpdatedAt(res.updatedAt || new Date().toISOString());
    } catch (err) {
      setError(err?.message || 'Failed to save accommodations');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-3 text-sm text-muted-foreground">Loading student accommodations profile...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Sliders className="h-7 w-7 text-primary" />
          Per-Student Accommodations & Strictness
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {studentInfo?.name} ({studentInfo?.enrollmentNumber || studentInfo?.email})
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Time Multiplier & Breaks */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                Examination Time & Duration Accommodations
              </CardTitle>
            </div>
            <CardDescription>
              The time multiplier server-authoritatively scales the exam timer for all attempts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="multiplier" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Extra Time Multiplier (1.00x to 3.00x) *
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Input
                  id="multiplier"
                  type="number"
                  step="0.05"
                  min="1.00"
                  max="3.00"
                  value={extraTimeMultiplier}
                  onChange={(e) => setExtraTimeMultiplier(e.target.value)}
                  disabled={saving}
                  className="w-32 h-10 text-sm font-semibold"
                  required
                />
                <span className="text-xs text-muted-foreground">
                  {parseFloat(extraTimeMultiplier) === 1
                    ? 'Standard duration (no extra time)'
                    : `${Math.round((parseFloat(extraTimeMultiplier) - 1) * 100)}% additional exam time (e.g. 60 min → ${Math.round(60 * parseFloat(extraTimeMultiplier))} min)`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label htmlFor="breaks-min" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Break Allowance (Minutes)
                </label>
                <Input
                  id="breaks-min"
                  type="number"
                  min="0"
                  max="120"
                  value={breakAllowanceMinutes}
                  onChange={(e) => setBreakAllowanceMinutes(e.target.value)}
                  disabled={saving}
                  className="h-10 text-sm"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Cumulative break budget (0 - 120 minutes)
                </span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="breaks-count" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Maximum Breaks Allowed
                </label>
                <Input
                  id="breaks-count"
                  type="number"
                  min="0"
                  max="10"
                  value={maxBreaksAllowed}
                  onChange={(e) => setMaxBreaksAllowed(e.target.value)}
                  disabled={saving}
                  className="h-10 text-sm"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Discrete rest sessions permitted (0 - 10)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assistive Tech */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Accessibility className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                Assistive Technology Clearance
              </CardTitle>
            </div>
            <CardDescription>
              Clear assistive technologies to suppress false-positive anomaly detections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border/70 hover:bg-muted/20 transition-colors">
              <Checkbox
                id="screen-reader"
                checked={screenReader}
                onCheckedChange={(checked) => setScreenReader(Boolean(checked))}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="space-y-0.5 leading-none">
                <label htmlFor="screen-reader" className="text-xs font-medium text-foreground cursor-pointer">
                  <strong>Screen Reader:</strong> JAWS, NVDA, VoiceOver, or Orca accessibility tools
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Suppresses rapid DOM mutation and speech synthesiser flags.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border/70 hover:bg-muted/20 transition-colors">
              <Checkbox
                id="speech-to-text"
                checked={speechToText}
                onCheckedChange={(checked) => setSpeechToText(Boolean(checked))}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="space-y-0.5 leading-none">
                <label htmlFor="speech-to-text" className="text-xs font-medium text-foreground cursor-pointer">
                  <strong>Speech-to-Text Dictation:</strong> Dragon, Windows Speech Recognition
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Suppresses vocalization anomaly alerts for this candidate.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border border-border/70 hover:bg-muted/20 transition-colors">
              <Checkbox
                id="keyboard-only"
                checked={keyboardOnly}
                onCheckedChange={(checked) => setKeyboardOnly(Boolean(checked))}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="space-y-0.5 leading-none">
                <label htmlFor="keyboard-only" className="text-xs font-medium text-foreground cursor-pointer">
                  <strong>Keyboard-Only Navigation:</strong> Head wand, sip-and-puff, switch access
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Suppresses mouse inactivity and cursor-off-screen flags.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Proctoring Strictness Profile */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                Proctoring Strictness Profile
              </CardTitle>
            </div>
            <CardDescription>
              Tailor AI anomaly sensitivity to the student's documented medical and accommodation context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <label htmlFor="strictness" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Strictness Profile *
              </label>
              <select
                id="strictness"
                value={proctoringStrictness}
                onChange={(e) => setProctoringStrictness(e.target.value)}
                disabled={saving}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="STANDARD">STANDARD — Normal thresholds for multi-face and gaze tracking</option>
                <option value="RELAXED">RELAXED — Elevated gaze and movement tolerance for neurodivergent candidates</option>
                <option value="STRICT">STRICT — Tight anomaly sensitivity for high-stakes retakes</option>
                <option value="MEDICAL_EXEMPTION">MEDICAL_EXEMPTION — Suppress automated posture and gaze alerts</option>
              </select>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between border-t border-border/60 p-4">
            <div className="text-xs text-muted-foreground">
              {updatedAt ? `Last modified: ${new Date(updatedAt).toLocaleString()}` : 'Default institutional settings'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={() => navigate(-1)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Accommodations'}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
