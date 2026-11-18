import { describe, it, expect } from 'vitest';
import { createInitialState, createSeededRng, tickGame, type GameState } from './gameEngine';

const idle = { left: false, right: false, fire: false };

function damagedCells(state: GameState): number {
  return state.shields.reduce((n, s) => n + s.damageMap.flat().filter(Boolean).length, 0);
}

// Clear the wave and let the end-of-wave bonus ship leave, until the next wave starts
function finishWave(state: GameState, rng: () => number) {
  for (const inv of state.invaders) inv.isAlive = false;
  for (let i = 0; i < 2000; i++) {
    if (tickGame(state, idle, rng).some((e) => e.type === 'levelUp')) return;
  }
  throw new Error('next wave never started');
}

describe('fresh shields each wave', () => {
  it('restores damaged shields when the next wave starts', () => {
    const state = createInitialState();
    const rng = createSeededRng(11);
    const fresh = structuredClone(state.shields);
    // Damage the shields
    for (const shield of state.shields) {
      for (const row of shield.damageMap) row.fill(true, 0, 10);
    }
    expect(damagedCells(state)).toBeGreaterThan(0);

    // They stay damaged during the wave...
    for (let i = 0; i < 30; i++) tickGame(state, idle, rng);
    expect(damagedCells(state)).toBeGreaterThan(0);

    // ...and are whole again for the next one
    finishWave(state, rng);
    expect(state.level).toBe(2);
    expect(damagedCells(state)).toBe(0);
    expect(state.shields).toEqual(fresh);
  });

  it('does not touch the shields while a wave is still being played', () => {
    const state = createInitialState();
    const shields = state.shields;
    state.shields[0].damageMap[3][3] = true;
    for (let i = 0; i < 120; i++) tickGame(state, idle, () => 0.99);
    expect(state.shields).toBe(shields);
    expect(state.shields[0].damageMap[3][3]).toBe(true);
  });
});
