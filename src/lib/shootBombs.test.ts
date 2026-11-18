import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  createSeededRng,
  tickGame,
  BOMB_SURVIVES_SHOT_CHANCE,
  type GameState,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

// A shot and a bomb about to meet in empty space at the left edge (clear of shields and invaders)
function shotMeetsBomb(state: GameState, bombX = 20) {
  state.bullets.push({ x: 20, y: 300, width: 6, height: 16, isAlive: true, direction: 'up' });
  state.bullets.push({ x: bombX, y: 280, width: 6, height: 16, isAlive: true, direction: 'down' });
}

describe('shooting down bombs', () => {
  it('destroys the bomb and uses up the shot', () => {
    const state = createInitialState();
    shotMeetsBomb(state);
    tickGame(state, idle, () => 0.99); // 0.99 fails the survive roll
    expect(state.bullets).toEqual([]);
  });

  it('now and then the bomb survives, but the shot is always used up', () => {
    const state = createInitialState();
    shotMeetsBomb(state);
    // The survive roll is the first roll of the tick: 0 passes it; 0.99 fails the rest (no enemy fire)
    let first = true;
    tickGame(state, idle, () => (first ? ((first = false), 0) : 0.99));
    expect(state.bullets.map((b) => b.direction)).toEqual(['down']);
  });

  it('a shot that misses the bomb sideways carries on', () => {
    const state = createInitialState();
    shotMeetsBomb(state, 40);
    tickGame(state, idle, () => 0.99);
    expect(state.bullets.map((b) => b.direction).sort()).toEqual(['down', 'up']);
  });

  it('a shot cannot pass through a bomb between ticks', () => {
    // Closing speed is shot + bomb speed per tick, less than the two heights combined
    for (let gap = 0; gap < 40; gap++) {
      const state = createInitialState();
      state.bullets.push({ x: 20, y: 300 + gap, width: 6, height: 16, isAlive: true, direction: 'up' });
      state.bullets.push({ x: 20, y: 280, width: 6, height: 16, isAlive: true, direction: 'down' });
      for (let i = 0; i < 10; i++) tickGame(state, idle, () => 0.99);
      expect(state.bullets).toEqual([]);
    }
  });

  it('the bomb survives about one time in ten over many seeded meetings', () => {
    const rng = createSeededRng(2024);
    let survived = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const state = createInitialState();
      shotMeetsBomb(state);
      // Only the survive roll comes from the seeded rng; the rest of the tick sees 0.99
      let first = true;
      tickGame(state, idle, () => (first ? ((first = false), rng()) : 0.99));
      if (state.bullets.length === 1) survived++;
    }
    expect(survived / trials).toBeGreaterThan(BOMB_SURVIVES_SHOT_CHANCE - 0.03);
    expect(survived / trials).toBeLessThan(BOMB_SURVIVES_SHOT_CHANCE + 0.03);
  });
});
