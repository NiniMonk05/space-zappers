/**
 * Keyboard handling rules for the game, kept free of React and the DOM so
 * they can be tested. Keys are matched on `KeyboardEvent.code` (the physical
 * key), so Caps Lock and Shift do not change what a key does.
 */

export const LEFT_CODES = ['ArrowLeft', 'KeyA'];
export const RIGHT_CODES = ['ArrowRight', 'KeyD'];
export const FIRE_CODE = 'Space';
export const PAUSE_CODE = 'Escape'; // Toggles pause
export const RESUME_CODES = ['Enter', 'NumpadEnter']; // Also resume while paused

export type GamePhase = 'playing' | 'paused' | 'inactive';

/**
 * - `move`: start holding a movement key
 * - `fire`: request a shot
 * - `pause` / `resume`: change the pause state
 * - `none`: not for the game
 */
export type KeyAction = 'move' | 'fire' | 'pause' | 'resume' | 'none';

export interface KeyLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface KeyDecision {
  action: KeyAction;
  preventDefault: boolean;
}

const NONE: KeyDecision = { action: 'none', preventDefault: false };

function isMovementCode(code: string): boolean {
  return LEFT_CODES.includes(code) || RIGHT_CODES.includes(code);
}

/** Decide what a key-down does in the current phase of the game. */
export function interpretKeyDown(e: KeyLike, phase: GamePhase): KeyDecision {
  // Leave browser and OS shortcuts (Ctrl+R, Cmd+W, Alt+Tab...) alone
  if (e.ctrlKey || e.metaKey || e.altKey) return NONE;
  if (phase === 'inactive') return NONE;

  // Game keys never scroll the page while a game is on screen
  const gameKey = isMovementCode(e.code) || e.code === FIRE_CODE;

  if (phase === 'paused') {
    // Only the pause key or a resume key unpauses; held-key repeats never do
    if (!e.repeat && (e.code === PAUSE_CODE || RESUME_CODES.includes(e.code))) {
      return { action: 'resume', preventDefault: true };
    }
    return { action: 'none', preventDefault: gameKey };
  }

  // Playing
  if (e.code === PAUSE_CODE) {
    return { action: e.repeat ? 'none' : 'pause', preventDefault: true };
  }
  if (isMovementCode(e.code)) return { action: 'move', preventDefault: true };
  // Space auto-repeat keeps firing as it did before (the cooldown still applies)
  if (e.code === FIRE_CODE) return { action: 'fire', preventDefault: true };
  return NONE;
}

export function isLeftHeld(held: ReadonlySet<string>): boolean {
  return LEFT_CODES.some((code) => held.has(code));
}

export function isRightHeld(held: ReadonlySet<string>): boolean {
  return RIGHT_CODES.some((code) => held.has(code));
}
