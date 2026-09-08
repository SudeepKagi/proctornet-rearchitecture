/**
 * @file VideoPlayer.jsx
 * @description High-performance video tile component with track attachment, hardware cleanup,
 * quality indicator, and visual VU meter telemetry (Phase 17).
 */

import React, { useEffect, useRef } from 'react';

/**
 * @param {object} props
 * @param {MediaStreamTrack | null} props.track - Video or screen MediaStreamTrack
 * @param {boolean} [props.isMuted=true] - Audio muted state
 * @param {string} [props.label='Candidate'] - Tile title / student name
 * @param {boolean} [props.isFocused=false] - Whether tile is currently focused
 * @param {number} [props.audioLevel=0] - Audio energy (0.0 to 1.0)
 * @param {() => void} [props.onFocusToggle] - Callback on click/focus
 */
export function VideoPlayer({
  track,
  isMuted = true,
  label = 'Candidate',
  isFocused = false,
  audioLevel = 0,
  onFocusToggle
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoElem = videoRef.current;
    if (!videoElem) return;

    if (track) {
      const stream = new MediaStream([track]);
      videoElem.srcObject = stream;
      videoElem.play().catch(() => {});
    } else {
      videoElem.srcObject = null;
    }

    return () => {
      if (videoElem) {
        videoElem.srcObject = null;
      }
    };
  }, [track]);

  const vuPercentage = Math.round(Math.min(1.0, Math.max(0, audioLevel)) * 100);

  return (
    <div
      className={`video-player-tile relative rounded-lg overflow-hidden bg-gray-900 border ${
        isFocused ? 'border-blue-500 shadow-lg ring-2 ring-blue-400' : 'border-gray-800'
      }`}
      style={{ minHeight: '160px' }}
      onClick={onFocusToggle}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-cover"
      />

      {!track && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 text-gray-400 text-xs">
          No Video Stream
        </div>
      )}

      {/* Top Header Badge */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span className="bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded font-medium truncate max-w-[70%]">
          {label}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
            isFocused ? 'bg-blue-600 text-white' : 'bg-gray-800/80 text-gray-300'
          }`}
        >
          {isFocused ? 'High' : 'Low'}
        </span>
      </div>

      {/* Bottom Footer Controls & VU Meter */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        {/* VU Meter Indicator */}
        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2 py-1 rounded">
          <span className="text-[10px] text-gray-300">
            {isMuted ? 'Muted' : 'Live'}
          </span>
          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-75 ${
                vuPercentage > 60 ? 'bg-red-500' : vuPercentage > 30 ? 'bg-yellow-400' : 'bg-green-500'
              }`}
              style={{ width: `${vuPercentage}%` }}
            />
          </div>
        </div>

        {onFocusToggle && (
          <button
            type="button"
            className="pointer-events-auto bg-gray-800/80 hover:bg-gray-700 text-gray-200 text-xs px-2 py-0.5 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onFocusToggle();
            }}
          >
            {isFocused ? 'Unfocus' : 'Inspect'}
          </button>
        )}
      </div>
    </div>
  );
}
