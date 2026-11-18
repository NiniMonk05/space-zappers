import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createInitialState, createSeededRng, tickGame, EXTRA_LIFE_SCORE, type GameState } from './gameEngine';
import { HI_SCORE_STORAGE_KEY, loadHiScore, saveHiScore } from './hiScore';

const idle = { left: false, right: false, fire: false };

// Put a shot inside the last alive invader, so the next tick kills it
function shootAnInvader(state: GameState) {
  const target = [...state.invaders].reverse().find((inv) => inv.isAlive)!;
  state.bullets.push({ x: target.x + 10, y: target.y + 20, width: 6, height: 16, isAlive: true, direction: 'up' });
  return target;
}

describe('extra life', () => {
  it('is given once, on the tick the score first reaches the threshold', () => {
    const state = createInitialState();
    state.score = EXTRA_LIFE_SCORE - 5;
    const target = shootAnInvader(state);
    const events = tickGame(state, idle, () => 0.99);
    expect(state.score).toBe(EXTRA_LIFE_SCORE - 5 + target.points);
    expect(events).toContainEqual({ type: 'extraLife', lives: 4 });
    expect(state.player.lives).toBe(4);

    // Never again, however high the score goes
    for (let i = 0; i < 5; i++) {
      shootAnInvader(state);
      expect(tickGame(state, idle, () => 0.99).some((e) => e.type === 'extraLife')).toBe(false);
    }
    expect(state.player.lives).toBe(4);
  });

  it('is not given below the threshold', () => {
    const state = createInitialState();
    state.score = EXTRA_LIFE_SCORE - 100;
    shootAnInvader(state); // a bottom-row invader is worth 10 at level 1
    expect(tickGame(state, idle, () => 0.99).some((e) => e.type === 'extraLife')).toBe(false);
    expect(state.player.lives).toBe(3);
  });

  it('comes from a bonus ship too', () => {
    const state = createInitialState();
    state.score = EXTRA_LIFE_SCORE - 50;
    state.bonusUFO = { x: 300, y: 65, width: 48, height: 24, isAlive: true, points: 50, color: '#00ffff', speed: 2 };
    state.bullets.push({ x: 320, y: 70, width: 6, height: 16, isAlive: true, direction: 'up' });
    expect(tickGame(state, idle, () => 0.99)).toContainEqual({ type: 'extraLife', lives: 4 });
  });

  it('a seeded game is deterministic with the extra life in it', () => {
    const run = () => {
      const state = createInitialState();
      state.score = EXTRA_LIFE_SCORE - 200;
      const rng = createSeededRng(31);
      for (let i = 0; i < 3000 && !state.gameOver; i++) {
        tickGame(state, { left: i % 240 < 120, right: i % 240 >= 120, fire: true }, rng);
      }
      return state;
    };
    const a = run();
    expect(a.extraLifeAwarded).toBe(true);
    expect(run()).toEqual(a);
  });
});

describe('local hi-score', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is 0 when nothing is stored or the value is junk', () => {
    expect(loadHiScore()).toBe(0);
    localStorage.setItem(HI_SCORE_STORAGE_KEY, 'not a number');
    expect(loadHiScore()).toBe(0);
    localStorage.setItem(HI_SCORE_STORAGE_KEY, '-20');
    expect(loadHiScore()).toBe(0);
  });

  it('keeps only the best score', () => {
    expect(saveHiScore(1200)).toBe(1200);
    expect(saveHiScore(800)).toBe(1200);
    expect(loadHiScore()).toBe(1200);
    expect(saveHiScore(2500)).toBe(2500);
    expect(localStorage.getItem(HI_SCORE_STORAGE_KEY)).toBe('2500');
  });

  it('carries on without storage when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadHiScore()).toBe(0);
    expect(saveHiScore(900)).toBe(900);
  });
});
