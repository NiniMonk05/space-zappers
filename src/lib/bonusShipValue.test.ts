import { describe, it, expect } from 'vitest';
import { drawGame } from '@/components/GameCanvas';
import {
  createInitialState,
  createSeededRng,
  tickGame,
  UFO_MIN_INVADERS_ALIVE,
  UFO_SCORE_POPUP_TICKS,
  type GameState,
} from './gameEngine';

const idle = { left: false, right: false, fire: false };

function withUfo(state: GameState) {
  state.bonusUFO = { x: 300, y: 65, width: 48, height: 24, isAlive: true, points: 150, color: '#ffff00', speed: 2 };
  state.ufoSoundPlaying = true;
}

// A stand-in 2D context that records text drawn on it
function recordingContext() {
  const texts: { text: string; x: number; y: number; fillStyle: string; font: string }[] = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    fillStyle: '',
    font: '',
    textAlign: '',
    fillRect: () => {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, fillStyle: this.fillStyle, font: this.font });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

describe('bonus ship value', () => {
  it('is not drawn while the ship flies', () => {
    const state = createInitialState();
    withUfo(state);
    const { ctx, texts } = recordingContext();
    drawGame(ctx, state);
    expect(texts).toEqual([]);
  });

  it('shows where the ship was hit, in the ship colour and the old text style, for one second', () => {
    const state = createInitialState();
    withUfo(state);
    state.bullets.push({ x: 320, y: 70, width: 6, height: 16, isAlive: true, direction: 'up' });
    const events = tickGame(state, idle, () => 0.99);
    expect(events).toContainEqual({ type: 'ufoHit', points: 150 });
    expect(state.bonusUFO).toBeNull();
    // The ship had moved 2 px before the shot hit it
    expect(state.ufoScorePopup).toEqual({ x: 302, y: 65, points: 150, color: '#ffff00', ticksLeft: UFO_SCORE_POPUP_TICKS });

    const { ctx, texts } = recordingContext();
    drawGame(ctx, state);
    expect(texts).toEqual([{ text: '150', x: 302 + 24, y: 65 + 18, fillStyle: '#ffff00', font: 'bold 18px monospace' }]);

    for (let i = 0; i < UFO_SCORE_POPUP_TICKS - 1; i++) tickGame(state, idle, () => 0.99);
    expect(state.ufoScorePopup).not.toBeNull();
    tickGame(state, idle, () => 0.99);
    expect(state.ufoScorePopup).toBeNull();
  });

  it('a ship that flies off is never shown with a value', () => {
    const state = createInitialState();
    withUfo(state);
    for (let i = 0; i < 400 && state.bonusUFO; i++) tickGame(state, idle, () => 0.99);
    expect(state.bonusUFO).toBeNull();
    expect(state.ufoScorePopup).toBeNull();
  });
});

describe('no bonus ship when only a few invaders are left', () => {
  function readyToSpawn(alive: number) {
    const state = createInitialState();
    state.invaders.forEach((inv, i) => (inv.isAlive = i < alive));
    state.ufoSpawnCountdown = 0;
    return state;
  }

  it(`does not spawn with fewer than ${UFO_MIN_INVADERS_ALIVE} invaders alive`, () => {
    const state = readyToSpawn(UFO_MIN_INVADERS_ALIVE - 1);
    for (let i = 0; i < 300; i++) {
      // rng 0 passes every roll; the survivors are high up, so the game cannot end in 300 ticks
      expect(tickGame(state, idle, () => 0).some((e) => e.type === 'ufoSpawned')).toBe(false);
      state.bullets = [];
    }
    expect(state.bonusUFO).toBeNull();
  });

  it(`still spawns with ${UFO_MIN_INVADERS_ALIVE} or more`, () => {
    const state = readyToSpawn(UFO_MIN_INVADERS_ALIVE);
    expect(tickGame(state, idle, () => 0)).toContainEqual({ type: 'ufoSpawned', endOfWave: false });
  });

  it('the end-of-wave bonus ship still comes when the wave is cleared', () => {
    const state = readyToSpawn(0);
    expect(tickGame(state, idle, createSeededRng(5))).toContainEqual({ type: 'ufoSpawned', endOfWave: true });
  });
});
