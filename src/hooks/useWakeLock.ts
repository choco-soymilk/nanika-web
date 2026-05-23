import { useEffect, useRef } from 'react';
import NoSleep from 'nosleep.js';

export const useWakeLock = () => {
  const noSleepRef = useRef<NoSleep | null>(null);

  useEffect(() => {
    // Instantiate NoSleep library
    const noSleep = new NoSleep();
    noSleepRef.current = noSleep;

    const enableNoSleep = () => {
      noSleep.enable()
        .then(() => {
          console.log('NoSleep active.');
        })
        .catch((err) => {
          console.warn('Failed to enable NoSleep:', err);
        });
      
      // Clean up event listeners after the first interaction
      document.removeEventListener('click', enableNoSleep);
      document.removeEventListener('touchstart', enableNoSleep);
    };

    // Add listeners to enable wake lock on the first user interaction
    document.addEventListener('click', enableNoSleep);
    document.addEventListener('touchstart', enableNoSleep);

    // Manage sleep lock state on browser visibility state transitions
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        noSleep.enable().catch((err) => {
          console.warn('Failed to enable NoSleep on visibility change:', err);
        });
      } else {
        noSleep.disable();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('click', enableNoSleep);
      document.removeEventListener('touchstart', enableNoSleep);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (noSleepRef.current) {
        noSleepRef.current.disable();
        noSleepRef.current = null;
      }
    };
  }, []);
};
