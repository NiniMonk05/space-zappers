import type { GameEvent } from './gameEngine';

/**
 * Plays the march beat from the simulation: one beat for each formation step
 * (`march` event), so the beat speeds up exactly as the march does and stops
 * when the game is paused. `playBeat` is given a running beat count, which
 * the music uses to walk through its motif.
 */
export function createMarchBeat(playBeat: (beatIndex: number) => void) {
  let beatIndex = 0;
  return {
    /** Play one beat per march step in `events`, unless the formation is empty (end of wave). */
    onEvents(events: GameEvent[], invadersAlive: number): void {
      if (invadersAlive === 0) return;
      for (const event of events) {
        if (event.type === 'march') playBeat(beatIndex++);
      }
    },
    /** Start the motif from its first beat (new game). */
    reset(): void {
      beatIndex = 0;
    },
  };
}
