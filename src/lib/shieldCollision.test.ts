import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  findShieldHit,
  BULLET_SPEED,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  getBombSpeed,
  type Bullet,
  type Shield,
} from './gameEngine';

const CELL_W = 8;
const CELL_H = 4;
const COL = 3; // A column that is solid from row 0 to row 10

function freshShield(): Shield {
  return createInitialState().shields[0];
}

function shot(shield: Shield, top: number): Bullet {
  const cx = shield.x + COL * CELL_W + CELL_W / 2;
  return { x: cx - BULLET_WIDTH / 2, y: top, width: BULLET_WIDTH, height: BULLET_HEIGHT, isAlive: true, direction: 'up' };
}

function bomb(shield: Shield, top: number): Bullet {
  return { ...shot(shield, top), direction: 'down' };
}

// Destroy every cell except one row, leaving a single row of thickness CELL_H
function leaveOnlyRow(shield: Shield, keepRow: number) {
  shield.damageMap = shield.damageMap.map((row, r) => row.map(() => r !== keepRow));
}

describe('shield collision', () => {
  it('stops a rising shot at a single remaining row, from any starting offset', () => {
    // Player shots move 8 px per update against 4 px rows: try every sub-step phase
    for (let phase = 0; phase < BULLET_SPEED; phase++) {
      const shield = freshShield();
      leaveOnlyRow(shield, 5);
      const b = shot(shield, shield.y + shield.height + 40 + phase);
      let hit: ReturnType<typeof findShieldHit> = null;
      for (let i = 0; i < 40 && !hit; i++) {
        b.y -= BULLET_SPEED;
        hit = findShieldHit(b, shield, BULLET_SPEED);
      }
      expect(hit, `phase ${phase}`).toEqual({ row: 5, col: COL });
    }
  });

  it('registers a falling bomb as soon as its bottom edge enters the shield', () => {
    const shield = freshShield();
    const speed = getBombSpeed(1);
    // Bottom edge was exactly on the shield's top boundary, then moved in
    const b = bomb(shield, shield.y - BULLET_HEIGHT + speed);
    expect(findShieldHit(b, shield, speed)).toEqual({ row: 0, col: COL });
    // Touching the boundary is not a hit
    const touching = bomb(shield, shield.y - BULLET_HEIGHT);
    expect(findShieldHit(touching, shield, speed)).toBeNull();
  });

  it('registers a rising shot as soon as its top edge enters the shield', () => {
    const shield = freshShield();
    const bottomRow = 10; // Column 3 is solid down to row 10, empty below (the arch)
    const rowBottom = shield.y + (bottomRow + 1) * CELL_H;
    const b = shot(shield, rowBottom - 1);
    expect(findShieldHit(b, shield, BULLET_SPEED)).toEqual({ row: bottomRow, col: COL });
    const below = shot(shield, rowBottom);
    expect(findShieldHit(below, shield, 0)).toBeNull();
  });

  it('does not hit already destroyed cells', () => {
    const shield = freshShield();
    leaveOnlyRow(shield, -1);
    const b = shot(shield, shield.y + 10);
    expect(findShieldHit(b, shield, BULLET_SPEED)).toBeNull();
  });
});
