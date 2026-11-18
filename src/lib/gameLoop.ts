/**
 * Fixed-timestep driver for the game simulation.
 *
 * The display calls `advanceFrame` once per animation frame with the time
 * since the previous frame. Time is collected in an accumulator and spent in
 * whole ticks of TICK_MS, so the simulation runs at 60 ticks per second on a
 * 60 Hz, 120 Hz or 144 Hz display alike.
 */
import { TICK_MS, tickGame, type GameEvent, type GameState, type Rng, type TickInput } from './gameEngine';

/**
 * Longest frame the simulation will catch up on. A stalled or backgrounded
 * tab resumes after at most this much simulated time instead of fast-forwarding.
 */
export const MAX_FRAME_MS = 100;

// Absorbs floating-point error when frame times add up to an exact tick
const EPSILON_MS = 1e-6;

export interface FixedStepClock {
  accumulatorMs: number;
}

export function createFixedStepClock(): FixedStepClock {
  return { accumulatorMs: 0 };
}

export interface FrameResult {
  ticks: number;
  events: GameEvent[];
}

/**
 * Run as many whole ticks as the elapsed frame time allows.
 * `readInput` is called once per tick (so a queued shot is used by one tick only).
 * Stops early if the game is paused or ends during the frame.
 */
export function advanceFrame(
  state: GameState,
  clock: FixedStepClock,
  frameDeltaMs: number,
  readInput: () => TickInput,
  rng: Rng = Math.random
): FrameResult {
  const events: GameEvent[] = [];
  let ticks = 0;

  const delta = Math.min(Math.max(frameDeltaMs, 0), MAX_FRAME_MS);
  clock.accumulatorMs += delta;

  while (clock.accumulatorMs >= TICK_MS - EPSILON_MS) {
    if (state.gameOver || state.isPaused) {
      clock.accumulatorMs = 0;
      break;
    }
    clock.accumulatorMs = Math.max(0, clock.accumulatorMs - TICK_MS);
    events.push(...tickGame(state, readInput(), rng));
    ticks++;
  }

  return { ticks, events };
}
