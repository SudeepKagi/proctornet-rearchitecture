/**
 * @file useExamTimer.js
 * @description Countdown timer hook with server drift calibration and expiration callback.
 */

import { useState, useEffect, useRef, useMemo } from 'react';

export function useExamTimer({
  serverTime,
  expiresAt,
  onExpire,
}) {
  const [remainingMs, setRemainingMs] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const hasExpiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Calculate clock offset between server and local browser
  const offsetMs = useMemo(() => {
    if (!serverTime) return 0;
    return new Date(serverTime).getTime() - Date.now();
  }, [serverTime]);

  useEffect(() => {
    if (!expiresAt) return;

    const expiryTime = new Date(expiresAt).getTime();

    function updateRemaining() {
      const estimatedServerNow = Date.now() + offsetMs;
      const diff = Math.max(0, expiryTime - estimatedServerNow);
      setRemainingMs(diff);

      if (diff <= 0) {
        setIsExpired(true);
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          if (onExpireRef.current) {
            onExpireRef.current();
          }
        }
      }
    }

    // Initial update
    updateRemaining();

    const interval = setInterval(updateRemaining, 250);
    return () => clearInterval(interval);
  }, [expiresAt, offsetMs]);

  const remainingSeconds = Math.floor(remainingMs / 1000);

  const formattedTime = useMemo(() => {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [remainingSeconds]);

  const isUrgent5Min = remainingSeconds <= 300 && remainingSeconds > 60;
  const isUrgent1Min = remainingSeconds <= 60 && remainingSeconds > 0;

  return {
    remainingSeconds,
    formattedTime,
    isExpired,
    isUrgent5Min,
    isUrgent1Min,
  };
}
