import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  bulletHitsPlayer,
  bulletHitsInvader,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  type Bullet,
  type Invader,
} from './gameEngine';

function bullet(x: number, y: number, direction: 'up' | 'down'): Bullet {
  return { x, y, width: BULLET_WIDTH, height: BULLET_HEIGHT, isAlive: true, direction };
}

describe('player hitbox', () => {
  const { player } = createInitialState();

  it('does not kill on a bomb in the empty top corner beside the barrel', () => {
    // Bomb bottom 4 px into the top 8 px, at the far left: only empty space is drawn there
    const b = bullet(player.x + 1, player.y - BULLET_HEIGHT + 4, 'down');
    expect(bulletHitsPlayer(b, player)).toBe(false);
    const right = bullet(player.x + player.width - BULLET_WIDTH - 1, player.y - BULLET_HEIGHT + 4, 'down');
    expect(bulletHitsPlayer(right, player)).toBe(false);
  });

  it('kills on the barrel, the body and the base', () => {
    expect(bulletHitsPlayer(bullet(player.x + 21, player.y - BULLET_HEIGHT + 2, 'down'), player)).toBe(true);
    expect(bulletHitsPlayer(bullet(player.x + 9, player.y + 8 - BULLET_HEIGHT + 2, 'down'), player)).toBe(true);
    expect(bulletHitsPlayer(bullet(player.x + 1, player.y + 16 - BULLET_HEIGHT + 2, 'down'), player)).toBe(true);
  });
});

describe('enemy hitboxes', () => {
  const invaders = createInitialState().invaders;
  const crab = invaders.find((i) => i.type === 'crab') as Invader;
  const squid = invaders.find((i) => i.type === 'squid') as Invader;

  it('the middle-row sprite is 28 px wide, so a shot in the empty right 4 px misses', () => {
    const miss = bullet(crab.x + 29, crab.y + 10, 'up');
    expect(bulletHitsInvader(miss, crab)).toBe(false);
    const hit = bullet(crab.x + 22, crab.y + 10, 'up');
    expect(bulletHitsInvader(hit, crab)).toBe(true);
  });

  it('sprites are 28 px tall, so a shot below the sprite misses', () => {
    expect(bulletHitsInvader(bullet(squid.x + 12, squid.y + 29, 'up'), squid)).toBe(false);
    expect(bulletHitsInvader(bullet(squid.x + 12, squid.y + 27, 'up'), squid)).toBe(true);
  });
});
