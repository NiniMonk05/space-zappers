import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoPause } from '@/hooks/useAutoPause';
import {
  createInitialState,
  getTimeLeftSeconds,
  tickGame,
  FREE_PLAY_TICKS,
  type GameEvent,
} from './gameEngine';
import { advanceFrame, createFixedStepClock } from './gameLoop';

const idle = { left: false, right: false, fire: false };
const quiet = () => 0.99; // No bonus ship, no enemy fire

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(() => {
  setVisibility('visible');
});

describe('useAutoPause', () => {
  it('pauses on window blur and when the tab is hidden', () => {
    const pause = vi.fn();
    renderHook(() => useAutoPause(true, pause));
    window.dispatchEvent(new Event('blur'));
    expect(pause).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the tab becomes visible again or when disabled', () => {
    const pause = vi.fn();
    const { rerender } = renderHook(({ on }) => useAutoPause(on, pause), { initialProps: { on: true } });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pause).not.toHaveBeenCalled();
    rerender({ on: false });
    window.dispatchEvent(new Event('blur'));
    expect(pause).not.toHaveBeenCalled();
  });
});

describe('free-play time limit', () => {
  it('ends the game after one minute of play with a timeout event', () => {
    const state = createInitialState({ timeLimitTicks: FREE_PLAY_TICKS });
    expect(getTimeLeftSeconds(state)).toBe(60);
    let events: GameEvent[] = [];
    for (let i = 0; i < FREE_PLAY_TICKS && !state.gameOver; i++) {
      // Keep the player alive and the formation high so only the timer can end the game
      state.bullets = state.bullets.filter((b) => b.direction === 'up');
      for (const inv of state.invaders) inv.y = Math.min(inv.y, 200);
      events = tickGame(state, idle, quiet);
      if (state.tick === 60) expect(getTimeLeftSeconds(state)).toBe(59);
    }
    expect(state.tick).toBe(FREE_PLAY_TICKS);
    expect(state.gameOver).toBe(true);
    expect(state.endReason).toBe('timeout');
    expect(events).toContainEqual({ type: 'gameOver', reason: 'timeout' });
    expect(getTimeLeftSeconds(state)).toBe(0);
  });

  it('does not count down while paused', () => {
    const state = createInitialState({ timeLimitTicks: FREE_PLAY_TICKS });
    const clock = createFixedStepClock();
    for (let i = 0; i < 600; i++) tickGame(state, idle, quiet);
    expect(getTimeLeftSeconds(state)).toBe(50);
    state.isPaused = true;
    // Five minutes in a hidden or unfocused tab
    for (let i = 0; i < 5 * 60 * 60; i++) advanceFrame(state, clock, 1000 / 60, () => idle, quiet);
    expect(getTimeLeftSeconds(state)).toBe(50);
    expect(state.gameOver).toBe(false);
  });

  it('paid games have no limit', () => {
    expect(getTimeLeftSeconds(createInitialState())).toBeNull();
  });
});
