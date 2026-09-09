/**
 * @file StudentConfigurationPage.jsx
 * @description Administrative screen for managing per-student accommodations:
 * extra time multiplier, break allowances, assistive technology flags, and proctoring strictness.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as adminUsersApi from '../../api/adminUsersApi.js';
import { Button } from '../../components/common/Button.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Input } from '../../components/common/Input.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import { Badge } from '../../components/common/Badge.jsx';

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
          adminUsersApi.fetchStudentConfiguration(studentId).catch(() => null)
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
          keyboardOnly
        },
        proctoringStrictness
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
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading student accommodations profile...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Back Button & Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          ← Back
        </Button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Per-Student Accommodations & Strictness
          </h1>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {studentInfo?.name} ({studentInfo?.enrollmentNumber || studentInfo?.email})
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Alert variant="danger">{error}</Alert>
        </div>
      )}

      {success && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Alert variant="success">{success}</Alert>
        </div>
      )}

      <form onSubmit={handleSave}>
        <Card style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem' }}>
            Examination Time & Duration Accommodations
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
            The time multiplier automatically and server-authoritatively scales the exam countdown duration for all scheduled sessions.
          </p>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Extra Time Multiplier (1.00x to 3.00x) *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Input
                type="number"
                step="0.05"
                min="1.00"
                max="3.00"
                value={extraTimeMultiplier}
                onChange={(e) => setExtraTimeMultiplier(e.target.value)}
                disabled={saving}
                style={{ width: '120px' }}
                required
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                {parseFloat(extraTimeMultiplier) === 1
                  ? 'Standard duration (no extra time)'
                  : `${Math.round((parseFloat(extraTimeMultiplier) - 1) * 100)}% additional exam time (e.g. 60 min → ${Math.round(60 * parseFloat(extraTimeMultiplier))} min)`}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                Total Break Allowance (Minutes)
              </label>
              <Input
                type="number"
                min="0"
                max="120"
                value={breakAllowanceMinutes}
                onChange={(e) => setBreakAllowanceMinutes(e.target.value)}
                disabled={saving}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Maximum cumulative break minutes across attempt (0 - 120)
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
                Maximum Breaks Allowed
              </label>
              <Input
                type="number"
                min="0"
                max="10"
                value={maxBreaksAllowed}
                onChange={(e) => setMaxBreaksAllowed(e.target.value)}
                disabled={saving}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
                Number of discrete pause/rest sessions permitted (0 - 10)
              </span>
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem' }}>
            Assistive Technology Clearance
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Enable declared assistive technologies. AI and rule-based proctoring flags will suppress false anomalies caused by these tools.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={screenReader}
                onChange={(e) => setScreenReader(e.target.checked)}
                disabled={saving}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
                <strong>Screen Reader:</strong> JAWS, NVDA, VoiceOver, or Orca accessibility tools
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={speechToText}
                onChange={(e) => setSpeechToText(e.target.checked)}
                disabled={saving}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
                <strong>Speech-to-Text Dictation:</strong> Dragon NaturallySpeaking, Windows Speech Recognition
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={keyboardOnly}
                onChange={(e) => setKeyboardOnly(e.target.checked)}
                disabled={saving}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text)' }}>
                <strong>Keyboard-Only Navigation:</strong> Head wand, sip-and-puff, switch access devices
              </span>
            </label>
          </div>
        </Card>

        <Card style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem' }}>
            Proctoring Strictness Profile
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Tailor AI anomaly thresholds and sensitivity to the student's documented medical and accommodation context.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.35rem' }}>
              Strictness Level *
            </label>
            <select
              value={proctoringStrictness}
              onChange={(e) => setProctoringStrictness(e.target.value)}
              disabled={saving}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                color: 'var(--color-text)',
                fontSize: '0.9rem'
              }}
            >
              <option value="STANDARD">STANDARD — Standard strictness and multi-face detection thresholds</option>
              <option value="RELAXED">RELAXED — Elevated gaze and movement tolerance for candidates with ADHD/tics</option>
              <option value="STRICT">STRICT — Tight anomaly thresholds for audited high-stakes retakes</option>
              <option value="MEDICAL_EXEMPTION">MEDICAL_EXEMPTION — Suppress automated posture and gaze anomaly alerts</option>
            </select>
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {updatedAt ? `Last modified: ${new Date(updatedAt).toLocaleString()}` : 'Default institutional settings'}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" type="button" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving Changes...' : 'Save Accommodations'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
