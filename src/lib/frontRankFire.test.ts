import { describe, it, expect } from 'vitest';
import {
  countBombs,
  createInitialState,
  createSeededRng,
  getFrontRank,
  tickGame,
  MAX_ENEMY_BOMBS,
  type Bullet,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

describe('enemy fire from the front rank', () => {
  it('the front rank is the lowest alive invader in each column', () => {
    const state = createInitialState();
    const front = getFrontRank(state.invaders);
    expect(front).toHaveLength(11);
    const bottomY = Math.max(...state.invaders.map((inv) => inv.y));
    expect(front.every((inv) => inv.y === bottomY)).toBe(true);

    // Kill the bottom invader of the first column: the one above takes its place
    const column = state.invaders.filter((inv) => inv.x === front[0].x);
    column.sort((a, b) => b.y - a.y)[0].isAlive = false;
    const next = getFrontRank(state.invaders).find((inv) => inv.x === front[0].x);
    expect(next?.y).toBe(column[1].y);
  });

  it('a column whose bottom invader is dead fires from the invader above it', () => {
    const state = createInitialState();
    const [first] = getFrontRank(state.invaders);
    first.isAlive = false;
    // rng 0 passes the fire roll and picks the first front-rank column
    tickGame(state, idle, () => 0);
    const bombs = state.bullets.filter((b) => b.direction === 'down');
    expect(bombs).toHaveLength(1);
    const shooter = getFrontRank(state.invaders)[0];
    expect(shooter.x).toBe(first.x);
    expect(bombs[0].y).toBe(shooter.y + shooter.height);
    expect(bombs[0].y).toBe(first.y - 45 + shooter.height); // one row up
  });

  it(`never has more than ${MAX_ENEMY_BOMBS} bombs falling, and every bomb starts under the front rank`, () => {
    const state = createInitialState();
    state.level = 10; // High fire rate, so the cap is what limits it
    const rng = createSeededRng(42);
    let maxBombs = 0;
    let spawned = 0;
    for (let i = 0; i < 3000 && !state.gameOver; i++) {
      const before = new Set<Bullet>(state.bullets);
      tickGame(state, idle, rng);
      const front = getFrontRank(state.invaders);
      for (const bomb of state.bullets) {
        if (bomb.direction !== 'down' || before.has(bomb)) continue;
        spawned++;
        const shooter = front.find((inv) => inv.x + inv.width / 2 - bomb.width / 2 === bomb.x);
        expect(shooter).toBeDefined();
        expect(bomb.y).toBe(shooter!.y + shooter!.height);
      }
      maxBombs = Math.max(maxBombs, countBombs(state));
    }
    expect(spawned).toBeGreaterThan(10);
    expect(maxBombs).toBe(MAX_ENEMY_BOMBS);
  });

  it('keeps the per-level fire roll: no bomb when the roll fails', () => {
    const state = createInitialState();
    for (let i = 0; i < 50; i++) tickGame(state, idle, () => 0.99);
    expect(countBombs(state)).toBe(0);
  });
});
