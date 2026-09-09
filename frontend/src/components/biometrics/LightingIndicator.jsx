import React, { useEffect, useState } from 'react';

/**
 * @component LightingIndicator
 * @description Analyzes real-time canvas luminance from the camera feed and provides instant visual UX guidance.
 * Pure UX utility: does not calculate biometric vectors or submit scores.
 */
export default function LightingIndicator({ videoRef, active = true }) {
  const [luminance, setLuminance] = useState(128);
  const [status, setStatus] = useState('good'); // 'too_dark' | 'good' | 'too_bright'

  useEffect(() => {
    if (!active || !videoRef?.current) return;

    let animId;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    let ctx = null;
    try {
      ctx = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
    } catch {
      ctx = null;
    }

    const sampleInterval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !ctx) return;

      try {
        ctx.drawImage(video, 0, 0, 64, 48);
        const imgData = ctx.getImageData(0, 0, 64, 48);
        const data = imgData.data;

        let totalLum = 0;
        const totalPixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          // Standard ITU-R BT.601 luma formula
          totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }

        const avgLum = Math.round(totalLum / totalPixels);
        setLuminance(avgLum);

        if (avgLum < 65) {
          setStatus('too_dark');
        } else if (avgLum > 215) {
          setStatus('too_bright');
        } else {
          setStatus('good');
        }
      } catch {
        // Ignore frame read errors (e.g. cross-origin or video detached)
      }
    }, 400);

    return () => {
      clearInterval(sampleInterval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [active, videoRef]);

  const getBadgeConfig = () => {
    switch (status) {
      case 'too_dark':
        return {
          label: 'Low Light',
          color: 'text-amber-400 bg-amber-950/50 border-amber-800/60',
          dot: 'bg-amber-400'
        };
      case 'too_bright':
        return {
          label: 'Too Bright',
          color: 'text-amber-400 bg-amber-950/50 border-amber-800/60',
          dot: 'bg-amber-400'
        };
      case 'good':
      default:
        return {
          label: 'Lighting Good',
          color: 'text-emerald-400 bg-emerald-950/50 border-emerald-800/60',
          dot: 'bg-emerald-400'
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border backdrop-blur-md transition-colors duration-300 ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
      <span className="text-[10px] opacity-60">({luminance})</span>
    </div>
  );
}
