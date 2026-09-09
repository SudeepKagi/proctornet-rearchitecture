/**
 * @file SessionSignOffModal.jsx
 * @description Modals for Invigilator Session Sign-Off & Incident Reporting.
 * Implements Workstream H.
 */

import React, { useState } from 'react';
import { signOffSession, reportIncident } from '../../api/interventionsApi.js';

export function SessionSignOffModal({ isOpen, onClose, sessionId, onSignedOff }) {
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState({
    allSubmissionsAccounted: true,
    hardwareCollected: true,
    anomaliesResolved: true,
    identityVerified: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleToggle = (key) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError('Sign-off notes are required before concluding session.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signOffSession(sessionId, {
        notes,
        checklist
      });
      if (onSignedOff) onSignedOff();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to sign off and conclude session');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          Formal Session Sign-Off & Conclusion
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Conclude this proctoring session and generate immutable audit log records.
        </p>

        {error && (
          <div className="mb-4 text-xs text-rose-400 bg-rose-950/50 border border-rose-800 p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs">
            <div className="font-semibold text-slate-300 mb-1">Invigilator Checklist:</div>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.allSubmissionsAccounted}
                onChange={() => handleToggle('allSubmissionsAccounted')}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
              />
              All candidate submissions and timers reconciled
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.anomaliesResolved}
                onChange={() => handleToggle('anomaliesResolved')}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
              />
              All integrity anomalies reviewed & addressed
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist.identityVerified}
                onChange={() => handleToggle('identityVerified')}
                className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
              />
              Candidate attendance roster certified
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Sign-Off Rationale & Proctor Notes *
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Session concluded in good order. Room 402 clear."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
            >
              {submitting ? 'Signing Off...' : 'Conclude Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function IncidentReportModal({ isOpen, onClose, sessionId, candidates = [], preselectedCandidateId = null, onReported }) {
  const [candidateId, setCandidateId] = useState(preselectedCandidateId || '');
  const [incidentType, setIncidentType] = useState('CHEATING_SUSPICION');
  const [severity, setSeverity] = useState('HIGH');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Description is required for incident reporting.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await reportIncident(sessionId, {
        candidateId: candidateId || undefined,
        incidentType,
        severity,
        description
      });
      if (onReported) onReported();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit incident report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          File Formal Incident Report
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Record a proctor-flagged violation or environmental anomaly for institutional review.
        </p>

        {error && (
          <div className="mb-4 text-xs text-rose-400 bg-rose-950/50 border border-rose-800 p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Associated Candidate</label>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">General Room / Environmental (None)</option>
              {candidates.map((c) => (
                <option key={c.id || c.student_id} value={c.id || c.student_id}>
                  {c.student_name || c.name || c.student_id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Incident Category</label>
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="CHEATING_SUSPICION">Cheating Suspicion</option>
                <option value="HARDWARE_FAILURE">Hardware Failure</option>
                <option value="DISTURBANCE">Disturbance</option>
                <option value="IDENTITY_MISMATCH">Identity Mismatch</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Detailed Description *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail observations, candidate actions, and context..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'File Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
