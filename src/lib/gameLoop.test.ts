import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createInitialState,
  createSeededRng,
  tickGame,
  getMarchIntervalMs,
  getMarchIntervalTicks,
  getFireCooldownTicks,
  PLAYER_SPEED,
  TICK_MS,
  UFO_SPAWN_TICKS,
  type GameState,
  type TickInput,
} from './gameEngine';
import { advanceFrame, createFixedStepClock, MAX_FRAME_MS } from './gameLoop';

// Deterministic input that depends only on the simulation tick, not on frame timing
function scriptedInput(state: GameState) {
  return (): TickInput => ({
    left: state.tick >= 120 && state.tick < 200,
    right: state.tick < 120,
    fire: state.tick % 7 === 0,
  });
}

// Feed `seconds` of frames at `hz` and return the final state
function simulate(hz: number, seconds: number, seed = 1234): { state: GameState; ticks: number } {
  const state = createInitialState();
  const clock = createFixedStepClock();
  const rng = createSeededRng(seed);
  const input = scriptedInput(state);
  let ticks = 0;
  const frames = Math.round(hz * seconds);
  for (let i = 0; i < frames; i++) {
    ticks += advanceFrame(state, clock, 1000 / hz, input, rng).ticks;
  }
  return { state, ticks };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fixed timestep', () => {
  it('gives identical state at 60, 120 and 144 Hz', () => {
    const at60 = simulate(60, 20);
    const at120 = simulate(120, 20);
    const at144 = simulate(144, 20);
    expect(at60.ticks).toBe(20 * 60);
    expect(at120.ticks).toBe(20 * 60);
    expect(at144.ticks).toBe(20 * 60);
    expect(at120.state).toEqual(at60.state);
    expect(at144.state).toEqual(at60.state);
  });

  it('moves the player 300 px/s at any refresh rate (5 px per tick, as at 60 Hz before)', () => {
    for (const hz of [30, 60, 120, 144, 240]) {
      const state = createInitialState();
      const startX = state.player.x;
      const clock = createFixedStepClock();
      const input = () => ({ left: false, right: true, fire: false });
      for (let i = 0; i < hz / 2; i++) advanceFrame(state, clock, 1000 / hz, input, () => 0.99);
      expect(state.player.x - startX).toBe(30 * PLAYER_SPEED);
    }
  });

  it('caps catch-up after a long stall', () => {
    const state = createInitialState();
    const clock = createFixedStepClock();
    const { ticks } = advanceFrame(state, clock, 5000, () => ({ left: false, right: false, fire: false }), () => 0.99);
    expect(ticks).toBe(Math.floor(MAX_FRAME_MS / TICK_MS));
    expect(state.tick).toBe(6);
  });

  it('does not read the wall clock during a tick', () => {
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now used in simulation');
    });
    const state = createInitialState();
    for (let i = 0; i < 2000; i++) tickGame(state, { left: false, right: false, fire: true }, createSeededRng(i));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('pause', () => {
  it('freezes every timer: no bonus ship or march step straight after a long pause', () => {
    const state = createInitialState();
    const clock = createFixedStepClock();
    const idle = () => ({ left: false, right: false, fire: false });
    const noUfoNoFire = () => 0.99; // Never passes the bonus-ship or enemy-fire rolls

    // Play until just before the bonus ship may spawn
    for (let i = 0; i < UFO_SPAWN_TICKS - 10; i++) tickGame(state, idle(), noUfoNoFire);
    state.isPaused = true;
    const frozen = structuredClone(state);

    // A minute passes while paused
    for (let i = 0; i < 60 * 60; i++) advanceFrame(state, clock, 1000 / 60, idle, () => 0);
    expect(state).toEqual(frozen);

    // Resume with an RNG that would spawn the ship as soon as it is allowed
    state.isPaused = false;
    tickGame(state, idle(), () => 0);
    expect(state.bonusUFO).toBeNull();
    expect(state.ufoSpawnCountdown).toBe(9);
    expect(state.ticksSinceMarch).toBe(frozen.ticksSinceMarch + 1);
  });
});

describe('tick-based timers match the old 60 Hz behaviour', () => {
  // The old loop stepped the formation on the first 60 Hz frame where
  // (now - lastMove) > interval. Count those frames with ideal frame times.
  function oldFramesBetweenSteps(intervalMs: number): number {
    let frame = 0;
    while ((frame * 1000) / 60 <= intervalMs) frame++;
    return frame;
  }

  it('march interval in ticks follows 1000 ms x (alive/55)^1.5, min 35 ms', () => {
    for (const alive of [55, 50, 40, 30, 20, 10, 5, 3, 2, 1]) {
      const ms = Math.max(35, 1000 * Math.pow(alive / 55, 1.5));
      expect(getMarchIntervalMs(alive)).toBeCloseTo(ms, 9);
      const ticks = getMarchIntervalTicks(alive);
      // Never earlier than the interval, and less than one tick later
      expect(ticks * TICK_MS).toBeGreaterThanOrEqual(ms - 1e-9);
      expect(ticks * TICK_MS - ms).toBeLessThan(TICK_MS);
      // Same as the old per-frame timing, except when the interval is an exact
      // multiple of a frame (e.g. 1000 ms), where the old code depended on jitter
      const exact = Math.abs((ms * 60) / 1000 - Math.round((ms * 60) / 1000)) < 1e-9;
      if (!exact) expect(ticks).toBe(oldFramesBetweenSteps(ms));
    }
    expect(getMarchIntervalTicks(55)).toBe(60); // 1000 ms
    expect(getMarchIntervalTicks(1)).toBe(3); // 35 ms floor -> 50 ms
  });

  it('steps the formation at the march interval', () => {
    const state = createInitialState();
    state.levelBannerTicks = 0; // Skip the wave intro hold
    const idle = { left: false, right: false, fire: false };
    const startX = state.invaders[0].x;
    for (let i = 0; i < 59; i++) tickGame(state, idle, () => 0.99);
    expect(state.invaders[0].x).toBe(startX);
    const events = tickGame(state, idle, () => 0.99);
    expect(events).toContainEqual({ type: 'march' });
    expect(state.invaders[0].x).toBe(startX + 10);
  });

  it('fire cooldown is 500 ms (30 ticks) at level 1', () => {
    expect(getFireCooldownTicks(1)).toBe(30);
    expect(getFireCooldownTicks(20)).toBe(9); // 150 ms floor
    const state = createInitialState();
    state.levelBannerTicks = 0; // Skip the wave intro hold
    const fire = { left: false, right: false, fire: true };
    const shotTicks: number[] = [];
    for (let i = 0; i < 200; i++) {
      // Clear the shot in flight so only the cooldown limits firing
      state.bullets = state.bullets.filter((b) => b.direction !== 'up');
      if (tickGame(state, fire, () => 0.99).some((e) => e.type === 'shot')) shotTicks.push(state.tick);
    }
    expect(shotTicks.slice(0, 4)).toEqual([1, 31, 61, 91]);
  });
});

describe('events', () => {
  it('reports hits as events instead of playing sounds', () => {
    const state = createInitialState();
    const target = state.invaders[state.invaders.length - 1];
    state.bullets.push({ x: target.x + 10, y: target.y + 20, width: 6, height: 16, isAlive: true, direction: 'up' });
    const events = tickGame(state, { left: false, right: false, fire: false }, () => 0.99);
    expect(events).toContainEqual({ type: 'invaderKilled', points: target.points });
    expect(target.isAlive).toBe(false);
    expect(state.score).toBe(target.points);
  });

  it('a hit costs exactly one life and reports it once', () => {
    const state = createInitialState();
    const p = state.player;
    state.bullets.push({ x: p.x + 21, y: p.y + 2, width: 6, height: 16, isAlive: true, direction: 'down' });
    const events = tickGame(state, { left: false, right: false, fire: false }, () => 0.99);
    expect(state.player.lives).toBe(2);
    expect(events.filter((e) => e.type === 'playerHit')).toEqual([{ type: 'playerHit', livesLeft: 2 }]);
    expect(state.playerFlashTicks).toBeGreaterThan(0);
  });
});
