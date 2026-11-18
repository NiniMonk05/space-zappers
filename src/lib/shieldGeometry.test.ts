import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  checkShieldCollision,
  SHIELD_SHAPE,
  SHIELD_COLS,
  SHIELD_ROWS,
  SHIELD_CELL_WIDTH,
  SHIELD_CELL_HEIGHT,
  SHIELD_WIDTH,
  SHIELD_HEIGHT,
  GAME_WIDTH,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  type Bullet,
  type Shield,
} from './gameEngine';

// A falling bomb whose centre column and top edge sit at (cx, top)
function bombAt(cx: number, top: number): Bullet {
  return { x: cx - BULLET_WIDTH / 2, y: top, width: BULLET_WIDTH, height: BULLET_HEIGHT, isAlive: true, direction: 'down' };
}

describe('shield geometry', () => {
  it('declares a box exactly the size of the cell grid', () => {
    expect(SHIELD_SHAPE).toHaveLength(SHIELD_ROWS);
    for (const row of SHIELD_SHAPE) expect(row).toHaveLength(SHIELD_COLS);
    expect(SHIELD_WIDTH).toBe(SHIELD_COLS * SHIELD_CELL_WIDTH);
    expect(SHIELD_HEIGHT).toBe(SHIELD_ROWS * SHIELD_CELL_HEIGHT);
    // The outermost columns are used by the shape, so the drawn width is the full box
    expect(SHIELD_SHAPE.some((row) => row[0])).toBe(true);
    expect(SHIELD_SHAPE.some((row) => row[SHIELD_COLS - 1])).toBe(true);
  });

  it('centres the row of shields on the screen', () => {
    const { shields } = createInitialState();
    const left = shields[0].x;
    const last = shields[shields.length - 1];
    const right = GAME_WIDTH - (last.x + last.width);
    expect(left).toBe(right);
    // Equal gaps between shields
    const gaps = shields.slice(1).map((s, i) => s.x - (shields[i].x + shields[i].width));
    expect(new Set(gaps).size).toBe(1);
  });

  it('collides on every solid drawn cell and nowhere else', () => {
    const shield: Shield = createInitialState().shields[0];
    for (let row = 0; row < SHIELD_ROWS; row++) {
      for (let col = 0; col < SHIELD_COLS; col++) {
        const cx = shield.x + col * SHIELD_CELL_WIDTH + SHIELD_CELL_WIDTH / 2;
        // Bomb top edge inside this cell (the current code tests a bomb's top edge)
        const top = shield.y + row * SHIELD_CELL_HEIGHT + SHIELD_CELL_HEIGHT / 2;
        expect(checkShieldCollision(bombAt(cx, top), shield)).toBe(SHIELD_SHAPE[row][col]);
      }
    }
    // Just right of the drawn box: no collision (used to collide up to 80 px further right)
    const mid = shield.y + SHIELD_HEIGHT / 2;
    expect(checkShieldCollision(bombAt(shield.x + SHIELD_WIDTH + 4, mid), shield)).toBe(false);
  });

  it('places the player spawn shot in a gap between shields', () => {
    const state = createInitialState();
    const shotCentre = state.player.x + state.player.width / 2;
    for (const s of state.shields) {
      expect(shotCentre + BULLET_WIDTH / 2 <= s.x || shotCentre - BULLET_WIDTH / 2 >= s.x + s.width).toBe(true);
    }
  });
});
