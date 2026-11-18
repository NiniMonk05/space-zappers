import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  createSeededRng,
  getBombSpeed,
  tickGame,
  BULLET_SPEED,
  MAX_BOMB_SPEED,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

describe('enemy bomb speed', () => {
  it('starts at 3 px per tick and speeds up every second level', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10, 50].map(getBombSpeed)).toEqual([3, 4, 4, 5, 5, 6, 6, 6, 6]);
  });

  it('is a whole number of pixels, between a third and half the shot speed at level 1, and always below it', () => {
    expect(getBombSpeed(1)).toBeGreaterThanOrEqual(BULLET_SPEED / 3);
    expect(getBombSpeed(1)).toBeLessThanOrEqual(BULLET_SPEED / 2);
    let previous = 0;
    for (let level = 1; level <= 100; level++) {
      const speed = getBombSpeed(level);
      expect(Number.isInteger(speed)).toBe(true);
      expect(speed).toBeGreaterThanOrEqual(previous);
      expect(speed).toBeLessThanOrEqual(MAX_BOMB_SPEED);
      expect(speed).toBeLessThan(BULLET_SPEED);
      previous = speed;
    }
  });

  it('moves a level 1 bomb 3 px per tick and keeps it on whole pixels', () => {
    const state = createInitialState();
    state.bullets.push({ x: 50, y: 100, width: 6, height: 16, isAlive: true, direction: 'down' });
    const bomb = state.bullets[0];
    for (let i = 1; i <= 20; i++) {
      tickGame(state, idle, () => 0.99);
      expect(bomb.y).toBe(100 + 3 * i);
    }
  });

  it('a bomb from the front rank reaches the player in under two seconds at level 1', () => {
    const state = createInitialState();
    const rng = createSeededRng(7);
    const front = Math.max(...state.invaders.map((inv) => inv.y + inv.height));
    const ticks = Math.ceil((state.player.y - front) / getBombSpeed(1));
    expect(ticks).toBeLessThan(2 * 60);
    expect(ticks).toBeGreaterThan(60); // still over a second to react
    // And the simulation agrees: bombs never move more than the level's speed per tick
    for (let i = 0; i < 600; i++) {
      const before = new Map(state.bullets.map((b) => [b, b.y]));
      tickGame(state, idle, rng);
      for (const b of state.bullets) {
        if (b.direction === 'down' && before.has(b)) expect(b.y - before.get(b)!).toBe(getBombSpeed(state.level));
      }
    }
  });
});
