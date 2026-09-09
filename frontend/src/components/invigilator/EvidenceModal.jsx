/**
 * @file EvidenceModal.jsx
 * @description Secure evidence inspector modal for invigilators and faculty.
 * Implements Workstream H: S3 presigned URL retrieval, snapshot preview, audio playback.
 */

import React, { useState, useEffect } from 'react';
import { listEvidence, getPlaybackUrl } from '../../api/evidenceApi.js';

export default function EvidenceModal({ isOpen, onClose, attemptId, candidateName }) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    if (!isOpen || !attemptId) {
      setEvidenceList([]);
      setSelectedItem(null);
      setPlaybackUrl(null);
      setError(null);
      return;
    }

    async function fetchEvidence() {
      setLoading(true);
      setError(null);
      try {
        const data = await listEvidence(attemptId);
        setEvidenceList(data?.evidence || []);
      } catch (err) {
        setError(err.message || 'Failed to load evidence records');
      } finally {
        setLoading(false);
      }
    }

    fetchEvidence();
  }, [isOpen, attemptId]);

  const handleSelectItem = async (item) => {
    setSelectedItem(item);
    setLoadingUrl(true);
    setPlaybackUrl(null);
    try {
      const data = await getPlaybackUrl(attemptId, item.id);
      setPlaybackUrl(data.downloadUrl);
    } catch (err) {
      setError(err.message || 'Failed to generate secure playback URL');
    } finally {
      setLoadingUrl(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              Secure Evidence Inspection
            </h3>
            <p className="text-xs text-slate-400">
              Candidate: <span className="text-slate-200 font-medium">{candidateName || attemptId}</span> • Private S3 Presigned Pointers
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Left Column: Evidence List */}
          <div className="p-4 overflow-y-auto max-h-[70vh] md:col-span-1 space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Evidence Records ({evidenceList.length})
            </h4>

            {loading && (
              <div className="text-xs text-slate-400 py-6 text-center animate-pulse">
                Fetching evidence records...
              </div>
            )}

            {error && (
              <div className="text-xs text-rose-400 bg-rose-950/50 border border-rose-800 p-2.5 rounded">
                {error}
              </div>
            )}

            {!loading && evidenceList.length === 0 && (
              <div className="text-xs text-slate-500 py-8 text-center">
                No evidence records archived for this candidate attempt.
              </div>
            )}

            {evidenceList.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-650'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-200">
                      {item.evidence_type || item.type}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                      {item.status || 'CONFIRMED'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Preview & Metadata */}
          <div className="p-6 md:col-span-2 overflow-y-auto max-h-[70vh] flex flex-col justify-center items-center bg-slate-950/40">
            {selectedItem ? (
              <div className="w-full flex flex-col items-center">
                {loadingUrl && (
                  <div className="py-16 text-center text-sm text-slate-400 animate-pulse">
                    Acquiring authenticated 5-minute presigned GET ticket...
                  </div>
                )}

                {!loadingUrl && playbackUrl && (
                  <div className="w-full flex flex-col items-center">
                    {selectedItem.evidence_type === 'AUDIO_SNIPPET' ? (
                      <div className="w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-xl text-center">
                        <div className="text-sm font-medium text-slate-300 mb-3">
                          Audio Snippet Playback
                        </div>
                        <audio controls src={playbackUrl} className="w-full">
                          Your browser does not support audio playback.
                        </audio>
                      </div>
                    ) : (
                      <div className="w-full flex justify-center">
                        <img
                          src={playbackUrl}
                          alt="Violation snapshot"
                          className="max-h-[50vh] max-w-full rounded-lg border border-slate-700 shadow-md object-contain"
                        />
                      </div>
                    )}

                    <div className="mt-4 w-full bg-slate-900/90 border border-slate-800 p-3 rounded-lg text-xs space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Record ID:</span>
                        <span className="font-mono text-[11px]">{selectedItem.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Captured At:</span>
                        <span>{new Date(selectedItem.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">File Size:</span>
                        <span>{selectedItem.byte_size ? `${Math.round(selectedItem.byte_size / 1024)} KB` : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-500 text-xs py-16">
                Select an evidence record from the list to securely inspect.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 flex justify-end bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
