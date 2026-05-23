import { useEffect, useRef } from 'react';

export const useWakeLock = () => {
  // Using 'any' to avoid TypeScript compilation errors for experimental navigator.wakeLock API
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('Screen Wake Lock API is not supported in this browser.');
      return;
    }

    try {
      if (wakeLockRef.current) return; // Already locked
      
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      console.log('Screen Wake Lock acquired successfully.');

      wakeLockRef.current.addEventListener('release', () => {
        console.log('Screen Wake Lock was released.');
        wakeLockRef.current = null;
      });
    } catch (err) {
      console.warn('Failed to acquire Screen Wake Lock:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.warn('Failed to release Screen Wake Lock:', err);
      }
    }
  };

  useEffect(() => {
    // Request wake lock on mount
    requestWakeLock();

    // Re-request wake lock when page visibility changes back to visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, []);
};
