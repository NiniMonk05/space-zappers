import { describe, it, expect } from 'vitest';
import { drawGame } from '@/components/GameCanvas';
import { createInitialState, createSeededRng, tickGame, INVADER_HIT_TICKS, type GameState } from './gameEngine';

const idle = { left: false, right: false, fire: false };
const fire = { left: false, right: false, fire: true };

// Shoot the bottom-left invader from just below it
function shootBottomLeft(state: GameState) {
  const target = state.invaders[state.invaders.length - 11];
  state.bullets.push({ x: target.x + 10, y: target.y + 20, width: 6, height: 16, isAlive: true, direction: 'up' });
  return target;
}

// A stand-in 2D context that records the colour of every rectangle drawn
function recordingContext() {
  const rects: { x: number; y: number; fillStyle: string }[] = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    fillStyle: '',
    font: '',
    textAlign: '',
    fillRect(x: number, y: number) {
      rects.push({ x, y, fillStyle: this.fillStyle });
    },
    fillText: () => {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

describe('kill flash', () => {
  it('holds the dead invader in its cell for a quarter of a second', () => {
    const state = createInitialState();
    const target = shootBottomLeft(state);
    tickGame(state, idle, () => 0.99);
    expect(target.isAlive).toBe(false);
    expect(state.invaderHit).toEqual({ x: target.x, y: target.y, type: target.type, ticksLeft: INVADER_HIT_TICKS });
    expect(INVADER_HIT_TICKS).toBe(15);

    for (let i = 1; i < INVADER_HIT_TICKS; i++) tickGame(state, idle, () => 0.99);
    expect(state.invaderHit).not.toBeNull();
    tickGame(state, idle, () => 0.99);
    expect(state.invaderHit).toBeNull();
  });

  it('draws the dead invader with its own sprite, flashing white and red, in the cell where it died', () => {
    const state = createInitialState();
    const target = shootBottomLeft(state);
    tickGame(state, idle, () => 0.99);
    const inCell = (r: { x: number; y: number }) =>
      r.x >= target.x && r.x < target.x + 32 && r.y >= target.y && r.y < target.y + 32;

    const seen = new Set<string>();
    for (let i = 0; i < INVADER_HIT_TICKS - 1; i++) {
      const { ctx, rects } = recordingContext();
      drawGame(ctx, state);
      const cell = rects.filter(inCell);
      expect(cell.length).toBeGreaterThan(10); // A whole sprite's worth of pixels
      expect(new Set(cell.map((r) => r.fillStyle)).size).toBe(1);
      seen.add(cell[0].fillStyle);
      tickGame(state, idle, () => 0.99);
    }
    expect([...seen].sort()).toEqual(['#ff0000', '#ffffff']);

    // Nothing drawn there once the flash has cleared
    tickGame(state, idle, () => 0.99);
    const after = recordingContext();
    drawGame(after.ctx, state);
    expect(after.rects.some(inCell)).toBe(false);
  });

  it('blocks the next shot until the flash clears', () => {
    const state = createInitialState();
    state.player.lastShotTick = Number.NEGATIVE_INFINITY;
    shootBottomLeft(state);
    tickGame(state, idle, () => 0.99);
    state.tick += 1000; // Well past any fire cooldown, so only the flash can block
    let firstShot = -1;
    for (let i = 1; i <= 30 && firstShot < 0; i++) {
      if (tickGame(state, fire, () => 0.99).some((e) => e.type === 'shot')) firstShot = i;
    }
    expect(firstShot).toBe(INVADER_HIT_TICKS);
  });

  it('is deterministic over a seeded game', () => {
    const run = () => {
      const state = createInitialState();
      const rng = createSeededRng(77);
      for (let i = 0; i < 3000 && !state.gameOver; i++) {
        tickGame(state, { left: i % 200 < 100, right: i % 200 >= 100, fire: true }, rng);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });
});
