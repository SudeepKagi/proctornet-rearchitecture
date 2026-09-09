/**
 * @file CandidateMediaGrid.jsx
 * @description 12-candidate grid layout for invigilator dashboards with muted-by-default audio policy,
 * single-candidate solo listening, simulcast layer switching, and visual VU meters (Phase 17).
 */

import React, { useState } from 'react';
import { useMediaSubscription } from '../../hooks/useMediaSubscription.js';
import { VideoPlayer } from './VideoPlayer.jsx';

/**
 * @param {object} props
 * @param {string} props.sessionId - Active examination session UUID
 * @param {function} [props.onSelectCandidate] - Callback when candidate tile details is clicked
 */
export function CandidateMediaGrid({ sessionId, onSelectCandidate }) {
  const { candidates, focusedCandidateId, focusCandidate, isReady, error } =
    useMediaSubscription(sessionId);

  const [page, setPage] = useState(0);
  const pageSize = 12;

  const candidateList = Array.from(candidates.values());
  const totalPages = Math.max(1, Math.ceil(candidateList.length / pageSize));
  const pagedCandidates = candidateList.slice(page * pageSize, (page + 1) * pageSize);

  if (error) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 text-red-200 rounded-lg text-sm">
        <h4 className="font-semibold text-base mb-1">Media Monitoring Error</h4>
        <p>{error.message || 'Could not initialize live media subscription'}</p>
      </div>
    );
  }

  return (
    <div className="candidate-media-grid flex flex-col gap-4">
      {/* Grid Controls & Status Header */}
      <div className="flex items-center justify-between bg-gray-900/60 p-3 rounded-lg border border-gray-800 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isReady ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            }`}
          />
          <span className="font-medium text-gray-200">
            {isReady ? 'Live SFU Media Connected' : 'Connecting to Media Plane...'}
          </span>
          <span className="text-gray-400 ml-2">
            ({candidateList.length} Active Stream{candidateList.length === 1 ? '' : 's'})
          </span>
        </div>

        {/* Audio Policy Badge */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="bg-gray-800 px-2.5 py-1 rounded text-gray-300">
            Audio: {focusedCandidateId ? `Solo Listening (Candidate)` : '12-Grid Muted by Default'}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1 ml-4">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 12-Grid Container */}
      {candidateList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-gray-900/30 rounded-lg border border-dashed border-gray-800 text-gray-400">
          <p className="text-sm font-medium">No candidates are currently streaming media</p>
          <p className="text-xs text-gray-500 mt-1">
            Streams will appear automatically when enrolled candidates begin their exam
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {pagedCandidates.map((cand) => {
            const webcamConsumer = cand.consumers?.get('webcam');
            const screenConsumer = cand.consumers?.get('screen');
            const micConsumer = cand.consumers?.get('mic') || cand.consumers?.get('microphone');

            const isFocused = focusedCandidateId === cand.userId;
            const isMuted = !isFocused; // Solo listening: only focused candidate is unmuted

            return (
              <div key={cand.userId} className="flex flex-col gap-1.5">
                <VideoPlayer
                  track={webcamConsumer?.track || null}
                  label={`Candidate: ${cand.userId.slice(0, 8)}`}
                  isFocused={isFocused}
                  isMuted={isMuted}
                  audioLevel={0}
                  onFocusToggle={() => focusCandidate(isFocused ? null : cand.userId)}
                />

                {/* Render Screen Share preview if available */}
                {screenConsumer?.track && (
                  <div className="w-full">
                    <VideoPlayer
                      track={screenConsumer.track}
                      label="Screen Share"
                      isFocused={false}
                      isMuted={true}
                    />
                  </div>
                )}

                {/* Hidden audio element for solo listening */}
                {micConsumer?.track && (
                  <audio
                    ref={(el) => {
                      if (el && el.srcObject !== micConsumer.stream) {
                        el.srcObject = new MediaStream([micConsumer.track]);
                        el.muted = isMuted;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    muted={isMuted}
                  />
                )}
                {onSelectCandidate && (
                  <button
                    type="button"
                    onClick={() => onSelectCandidate(cand.userId)}
                    className="mt-1 w-full py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
                  >
                    🔍 Inspect & Intervene
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
