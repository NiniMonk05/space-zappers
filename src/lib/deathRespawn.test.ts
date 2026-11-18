import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  createSeededRng,
  tickGame,
  DEATH_PAUSE_TICKS,
  PLAYER_RESPAWN_X,
  RESPAWN_INVULNERABLE_TICKS,
  type GameState,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

function bombOnPlayer(state: GameState) {
  const p = state.player;
  state.bullets.push({ x: p.x + 21, y: p.y + 2, width: 6, height: 16, isAlive: true, direction: 'down' });
}

describe('death and respawn', () => {
  it('freezes the formation, bombs and player for a beat, clears the bombs, then respawns at the left', () => {
    const state = createInitialState();
    // Something in flight that would otherwise move
    state.bullets.push({ x: 50, y: 300, width: 6, height: 16, isAlive: true, direction: 'down' });
    bombOnPlayer(state);
    const events = tickGame(state, idle, () => 0.99);
    expect(events).toEqual([{ type: 'playerHit', livesLeft: 2 }]);
    expect(state.player.lives).toBe(2);
    expect(state.bullets).toEqual([]);
    expect(state.respawnTicks).toBe(DEATH_PAUSE_TICKS);

    const deathX = state.player.x;
    const formation = structuredClone(state.invaders);
    const rng = createSeededRng(3);
    // An rng of 0 passes every roll: enemy fire and the bonus ship would both happen if not frozen
    for (let i = 1; i < DEATH_PAUSE_TICKS; i++) {
      expect(tickGame(state, { left: true, right: false, fire: true }, () => 0)).toEqual([]);
      expect(state.player.x).toBe(deathX);
      expect(state.invaders).toEqual(formation);
      expect(state.bullets).toEqual([]);
      expect(state.bonusUFO).toBeNull();
      expect(state.playerFlashTicks).toBeGreaterThan(0); // Blinking at the spot where it was hit
    }
    tickGame(state, idle, rng);
    expect(state.respawnTicks).toBe(0);
    expect(state.player.x).toBe(PLAYER_RESPAWN_X);
    expect(state.playerFlashTicks).toBe(RESPAWN_INVULNERABLE_TICKS);

    // Play resumes: the formation steps again
    for (let i = 0; i < 60; i++) tickGame(state, idle, () => 0.99);
    expect(state.invaders[0].x).not.toBe(formation[0].x);
  });

  it('cannot lose a second life to a bomb right after the first', () => {
    const state = createInitialState();
    bombOnPlayer(state);
    bombOnPlayer(state);
    tickGame(state, idle, () => 0.99);
    expect(state.player.lives).toBe(2);
    for (let i = 0; i < DEATH_PAUSE_TICKS; i++) tickGame(state, idle, () => 0.99);

    // Blinking after the respawn: bombs pass through
    let hits = 0;
    for (let i = 0; i < RESPAWN_INVULNERABLE_TICKS - 1; i++) {
      bombOnPlayer(state);
      hits += tickGame(state, idle, () => 0.99).filter((e) => e.type === 'playerHit').length;
    }
    expect(hits).toBe(0);
    expect(state.player.lives).toBe(2);

    // Once the blinking stops, a bomb hits again
    state.bullets = [];
    tickGame(state, idle, () => 0.99);
    expect(state.playerFlashTicks).toBe(0);
    bombOnPlayer(state);
    expect(tickGame(state, idle, () => 0.99)).toContainEqual({ type: 'playerHit', livesLeft: 1 });
  });

  it('the last life ends the game straight away', () => {
    const state = createInitialState();
    state.player.lives = 1;
    bombOnPlayer(state);
    const events = tickGame(state, idle, () => 0.99);
    expect(events).toContainEqual({ type: 'gameOver', reason: 'lives' });
    expect(state.gameOver).toBe(true);
    expect(state.respawnTicks).toBe(0);
  });

  it('is deterministic over a long seeded game', () => {
    const run = () => {
      const state = createInitialState();
      const rng = createSeededRng(99);
      for (let i = 0; i < 6000 && !state.gameOver; i++) {
        tickGame(state, { left: i % 300 < 150, right: i % 300 >= 150, fire: i % 5 === 0 }, rng);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });
});
