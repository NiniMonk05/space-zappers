import { describe, it, expect } from 'vitest';
import { createInitialState, tickGame, type GameState } from './gameEngine';
import { createMarchBeat } from './marchBeat';

const idle = { left: false, right: false, fire: false };
const alive = (state: GameState) => state.invaders.filter((inv) => inv.isAlive).length;

describe('march beat', () => {
  it('plays one beat per formation step, numbering the beats in order', () => {
    const state = createInitialState();
    const beats: { index: number; tick: number }[] = [];
    const beat = createMarchBeat((index) => beats.push({ index, tick: state.tick }));
    let marches = 0;
    for (let i = 0; i < 600; i++) {
      const events = tickGame(state, idle, () => 0.99);
      marches += events.filter((e) => e.type === 'march').length;
      beat.onEvents(events, alive(state));
    }
    expect(marches).toBeGreaterThan(5);
    expect(beats.map((b) => b.index)).toEqual([...Array(marches).keys()]);
  });

  it('keeps speeding up with the march, past where the old timed beat stopped (150 ms)', () => {
    const state = createInitialState();
    state.levelBannerTicks = 0;
    const beatTicks: number[] = [];
    const beat = createMarchBeat(() => beatTicks.push(state.tick));
    // Leave only the top-left invader, high up, so it marches at full speed for a long time
    state.invaders.forEach((inv, i) => (inv.isAlive = i === 0));
    for (let i = 0; i < 300 && !state.gameOver; i++) {
      beat.onEvents(tickGame(state, idle, () => 0.99), alive(state));
    }
    const gaps = beatTicks.slice(1).map((t, i) => t - beatTicks[i]);
    expect(gaps.length).toBeGreaterThan(50);
    // One invader left: a step every 3 ticks (50 ms), three times as fast as the old 150 ms floor
    expect(Math.max(...gaps.slice(1))).toBe(3);
  });

  it('is silent while paused and when the wave is cleared', () => {
    const state = createInitialState();
    let beats = 0;
    const beat = createMarchBeat(() => beats++);
    state.isPaused = true;
    for (let i = 0; i < 200; i++) beat.onEvents(tickGame(state, idle, () => 0.99), alive(state));
    expect(beats).toBe(0);

    // A cleared formation still "marches" (empty) during the end-of-wave bonus ship: no beats then
    state.isPaused = false;
    state.levelBannerTicks = 0;
    state.invaders.forEach((inv) => (inv.isAlive = false));
    for (let i = 0; i < 100; i++) beat.onEvents(tickGame(state, idle, () => 0.99), alive(state));
    expect(beats).toBe(0);
  });

  it('restarts the motif from beat 0 after reset', () => {
    const indices: number[] = [];
    const beat = createMarchBeat((i) => indices.push(i));
    beat.onEvents([{ type: 'march' }, { type: 'march' }], 10);
    beat.reset();
    beat.onEvents([{ type: 'march' }], 10);
    expect(indices).toEqual([0, 1, 0]);
  });
});
