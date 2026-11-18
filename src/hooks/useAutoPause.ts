import { useEffect } from 'react';

/**
 * Call `pause` when the window loses focus or the tab is hidden, while `enabled`.
 * Used to stop the game, its free-play countdown and the music while the player is away.
 */
export function useAutoPause(enabled: boolean, pause: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const handleBlur = () => pause();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, pause]);
}
