import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  createSeededRng,
  getWaveStartSteps,
  isWaveIntro,
  tickGame,
  INVADER_STEP_DOWN,
  LEVEL_BANNER_TICKS,
  MAX_WAVE_START_STEPS,
  type GameState,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

// Clear the wave and let the end-of-wave bonus ship leave, until the next wave starts
function finishWave(state: GameState, rng: () => number) {
  for (const inv of state.invaders) inv.isAlive = false;
  state.bullets = [];
  for (let i = 0; i < 2000; i++) {
    if (tickGame(state, idle, rng).some((e) => e.type === 'levelUp')) return;
  }
  throw new Error('next wave never started');
}

const topRowY = (state: GameState) => Math.min(...state.invaders.map((inv) => inv.y));

describe('wave intro hold', () => {
  it('holds the formation and all fire while the banner shows, then plays on', () => {
    const state = createInitialState();
    expect(isWaveIntro(state)).toBe(true);
    const formation = structuredClone(state.invaders);
    const startX = state.player.x;

    // rng 0 passes every enemy-fire roll; fire is held down the whole time
    for (let i = 1; i < LEVEL_BANNER_TICKS; i++) {
      const events = tickGame(state, { left: false, right: true, fire: true }, () => 0);
      expect(events).toEqual([]);
      expect(state.invaders).toEqual(formation);
      expect(state.bullets).toEqual([]);
    }
    // The player can still move to line up a shot
    expect(state.player.x).toBeGreaterThan(startX);

    // The banner ends on the next tick, and play starts that tick
    const events = tickGame(state, { left: false, right: false, fire: true }, () => 0.99);
    expect(isWaveIntro(state)).toBe(false);
    expect(events).toContainEqual({ type: 'shot' });

    // The first march step comes one full interval after the hold
    const marchTicks: number[] = [];
    for (let i = 0; i < 70; i++) {
      if (tickGame(state, idle, () => 0.99).some((e) => e.type === 'march')) marchTicks.push(state.tick);
    }
    expect(marchTicks[0]).toBe(LEVEL_BANNER_TICKS + 59);
  });

  it('holds again at the start of every new wave', () => {
    const state = createInitialState();
    const rng = createSeededRng(8);
    finishWave(state, rng);
    expect(state.level).toBe(2);
    expect(isWaveIntro(state)).toBe(true);
    const formation = structuredClone(state.invaders);
    for (let i = 1; i < LEVEL_BANNER_TICKS; i++) tickGame(state, idle, () => 0);
    expect(state.invaders).toEqual(formation);
    expect(state.bullets.filter((b) => b.direction === 'down')).toEqual([]);
  });
});

describe('lower starts', () => {
  it('starts each wave one step lower, down to a floor, then cycles', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(getWaveStartSteps)).toEqual([0, 1, 2, 3, 4, 1, 2, 3, 4, 1]);
    for (let level = 1; level <= 100; level++) {
      expect(getWaveStartSteps(level)).toBeLessThanOrEqual(MAX_WAVE_START_STEPS);
    }
  });

  it('the formation of each new wave starts at that height', () => {
    const state = createInitialState();
    const wave1Top = topRowY(state);
    const rng = createSeededRng(21);
    for (let level = 2; level <= 7; level++) {
      finishWave(state, rng);
      expect(state.level).toBe(level);
      expect(topRowY(state)).toBe(wave1Top + getWaveStartSteps(level) * INVADER_STEP_DOWN);
    }
  });

  it('even the lowest start leaves the bottom row clear above the shields', () => {
    const state = createInitialState();
    const lowestBottom =
      Math.max(...state.invaders.map((inv) => inv.y + inv.height)) + MAX_WAVE_START_STEPS * INVADER_STEP_DOWN;
    const shieldTop = Math.min(...state.shields.map((s) => s.y));
    expect(lowestBottom).toBeLessThan(shieldTop);
  });
});
