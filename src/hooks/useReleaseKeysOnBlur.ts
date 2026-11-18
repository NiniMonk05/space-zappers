import { useEffect, type MutableRefObject } from 'react';

/**
 * Forget all held keys when the window loses focus or the tab is hidden.
 * The browser does not send key-up events for keys released while the page
 * is not focused, so without this a held arrow would stay "down" on return.
 */
export function useReleaseKeysOnBlur(heldKeys: MutableRefObject<Set<string>>): void {
  useEffect(() => {
    const release = () => heldKeys.current.clear();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [heldKeys]);
}
