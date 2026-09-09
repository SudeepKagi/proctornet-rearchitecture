import React from 'react';

/**
 * @component FaceOvalGuide
 * @description Renders an advisory face oval framing guide overlay for candidate enrollment and verification.
 * Does not transmit or compute client vectors; solely provides candidate UX alignment assistance.
 */
export default function FaceOvalGuide({ status = 'aligning', message = 'Position your face within the oval' }) {
  const getStrokeColor = () => {
    switch (status) {
      case 'ready':
      case 'success':
        return '#10b981'; // green-500
      case 'warning':
      case 'action':
        return '#f59e0b'; // amber-500
      case 'error':
        return '#ef4444'; // red-500
      case 'aligning':
      default:
        return 'rgba(255, 255, 255, 0.75)';
    }
  };

  const strokeColor = getStrokeColor();

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6 select-none">
      {/* Top Message Badge */}
      <div className="z-10 mt-2 px-4 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 shadow-lg transition-all duration-300">
        <p className="text-xs md:text-sm font-medium text-slate-100 flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: strokeColor }}
          />
          {message}
        </p>
      </div>

      {/* SVG Face Oval Guideline */}
      <div className="relative w-full h-full max-w-sm max-h-[380px] flex items-center justify-center">
        <svg
          viewBox="0 0 300 400"
          className="w-full h-full max-h-[360px] drop-shadow-[0_0_12px_rgba(0,0,0,0.5)]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Outer semi-dark mask vignette */}
          <defs>
            <mask id="oval-mask">
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy="190" rx="90" ry="125" fill="black" />
            </mask>
          </defs>
          <rect
            width="300"
            height="400"
            fill="rgba(15, 23, 42, 0.45)"
            mask="url(#oval-mask)"
          />

          {/* Oval Guideline Border */}
          <ellipse
            cx="150"
            cy="190"
            rx="90"
            ry="125"
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeDasharray={status === 'ready' ? 'none' : '6 6'}
            className="transition-colors duration-300"
          />

          {/* Center Crosshair Tick Marks */}
          <line x1="140" y1="190" x2="160" y2="190" stroke={strokeColor} strokeWidth="1.5" opacity="0.6" />
          <line x1="150" y1="180" x2="150" y2="200" stroke={strokeColor} strokeWidth="1.5" opacity="0.6" />

          {/* Eye Level Guide Lines */}
          <line x1="100" y1="150" x2="125" y2="150" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <line x1="175" y1="150" x2="200" y2="150" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        </svg>
      </div>

      {/* Bottom Hint */}
      <div className="z-10 mb-2 px-3 py-1 rounded bg-slate-900/60 backdrop-blur-sm text-[11px] text-slate-300 text-center">
        Ensure your eyes are visible and lighting is even
      </div>
    </div>
  );
}
