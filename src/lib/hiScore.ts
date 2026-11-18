/**
 * The best score played on this device, kept in localStorage. Storage can be
 * missing or blocked (private mode, disabled site data), so every access is
 * guarded and the game carries on with 0 if it fails.
 */
export const HI_SCORE_STORAGE_KEY = 'space-zappers:hi-score';

export function loadHiScore(): number {
  try {
    const value = Number(localStorage.getItem(HI_SCORE_STORAGE_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Store `score` if it beats the stored best. Returns the best score after the update. */
export function saveHiScore(score: number): number {
  const best = loadHiScore();
  if (!(Number.isSafeInteger(score) && score > best)) return best;
  try {
    localStorage.setItem(HI_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Storage unavailable: keep the score for this session only
  }
  return score;
}
