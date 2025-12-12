/**
 * Space Zapper Game Engine
 * Classic Space Invaders gameplay with modern TypeScript
 */

export interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  isAlive: boolean;
}

export interface Invader extends GameObject {
  type: 'squid' | 'crab' | 'octopus';
  points: number;
  frame: number;
}

export interface Player extends GameObject {
  lives: number;
}

export interface Bullet extends GameObject {
  direction: 'up' | 'down';
}

export interface Shield extends GameObject {
  health: number;
  damageMap: boolean[][]; // Track which pixels are damaged
}

export interface BonusUFO extends GameObject {
  points: number;
  speed: number;
}

export interface GameState {
  player: Player;
  invaders: Invader[];
  bullets: Bullet[];
  shields: Shield[];
  bonusUFO: BonusUFO | null;
  score: number;
  level: number;
  gameOver: boolean;
  isPaused: boolean;
  invaderDirection: 1 | -1;
  invaderSpeed: number;
  lastInvaderMove: number;
  animationFrame: number;
  nextUFOSpawn: number;
}

// Game constants
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 30;
export const INVADER_WIDTH = 32;
export const INVADER_HEIGHT = 32;
export const BULLET_WIDTH = 4;
export const BULLET_HEIGHT = 12;
export const SHIELD_WIDTH = 80;
export const SHIELD_HEIGHT = 60;
export const PLAYER_SPEED = 5;
export const BULLET_SPEED = 7;
export const INITIAL_INVADER_SPEED = 1000; // milliseconds between moves
export const MIN_INVADER_SPEED = 200;
export const SPEED_INCREASE_FACTOR = 0.95;
export const UFO_SPAWN_INTERVAL = 20000; // 20 seconds
export const UFO_SPEED = 2;
export const UFO_WIDTH = 48;
export const UFO_HEIGHT = 24;

// Invader formation
const INVADERS_PER_ROW = 11;
const INVADER_ROWS = 5;
const INVADER_SPACING_X = 50;
const INVADER_SPACING_Y = 50;
const INVADER_START_X = 100;
const INVADER_START_Y = 80;

export function createInitialState(): GameState {
  return {
    player: {
      x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      y: GAME_HEIGHT - 80,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      isAlive: true,
      lives: 3,
    },
    invaders: createInvaders(1),
    bullets: [],
    shields: createShields(),
    bonusUFO: null,
    score: 0,
    level: 1,
    gameOver: false,
    isPaused: false,
    invaderDirection: 1,
    invaderSpeed: INITIAL_INVADER_SPEED,
    lastInvaderMove: Date.now(),
    animationFrame: 0,
    nextUFOSpawn: Date.now() + UFO_SPAWN_INTERVAL,
  };
}

function createInvaders(level: number): Invader[] {
  const invaders: Invader[] = [];

  // Invaders get closer each level
  const levelOffset = Math.min((level - 1) * 10, 50);

  for (let row = 0; row < INVADER_ROWS; row++) {
    let type: 'squid' | 'crab' | 'octopus';
    let points: number;

    if (row === 0) {
      type = 'squid';
      points = 30;
    } else if (row <= 2) {
      type = 'crab';
      points = 20;
    } else {
      type = 'octopus';
      points = 10;
    }

    for (let col = 0; col < INVADERS_PER_ROW; col++) {
      invaders.push({
        x: INVADER_START_X + col * INVADER_SPACING_X,
        y: INVADER_START_Y + row * INVADER_SPACING_Y + levelOffset,
        width: INVADER_WIDTH,
        height: INVADER_HEIGHT,
        type,
        points,
        isAlive: true,
        frame: 0,
      });
    }
  }

  return invaders;
}

function createShields(): Shield[] {
  const shields: Shield[] = [];
  const shieldCount = 4;
  const spacing = GAME_WIDTH / (shieldCount + 1);

  // Create classic shield shape damage map (20x10 pixels)
  const createDamageMap = (): boolean[][] => {
    const map: boolean[][] = [];
    for (let i = 0; i < 10; i++) {
      map.push(new Array(20).fill(false));
    }
    return map;
  };

  for (let i = 0; i < shieldCount; i++) {
    shields.push({
      x: spacing * (i + 1) - SHIELD_WIDTH / 2,
      y: GAME_HEIGHT - 200,
      width: SHIELD_WIDTH,
      height: SHIELD_HEIGHT,
      isAlive: true,
      health: 100, // Total health based on pixels
      damageMap: createDamageMap(),
    });
  }

  return shields;
}

export function updateGame(state: GameState, keys: Set<string>): GameState {
  if (state.gameOver || state.isPaused) {
    return state;
  }

  const newState = { ...state };
  let playerHit = false;
  let ufoHit = false;

  // Update player position
  if (keys.has('ArrowLeft') || keys.has('a')) {
    newState.player = {
      ...newState.player,
      x: Math.max(0, newState.player.x - PLAYER_SPEED),
    };
  }
  if (keys.has('ArrowRight') || keys.has('d')) {
    newState.player = {
      ...newState.player,
      x: Math.min(GAME_WIDTH - PLAYER_WIDTH, newState.player.x + PLAYER_SPEED),
    };
  }

  // Update bullets
  newState.bullets = newState.bullets
    .map((bullet) => ({
      ...bullet,
      y: bullet.direction === 'up' ? bullet.y - BULLET_SPEED : bullet.y + BULLET_SPEED,
    }))
    .filter((bullet) => bullet.y > 0 && bullet.y < GAME_HEIGHT);

  // Spawn bonus UFO
  const now = Date.now();
  if (!newState.bonusUFO && now >= newState.nextUFOSpawn && Math.random() < 0.5) {
    const direction = Math.random() < 0.5 ? 1 : -1;
    newState.bonusUFO = {
      x: direction > 0 ? -UFO_WIDTH : GAME_WIDTH,
      y: 40,
      width: UFO_WIDTH,
      height: UFO_HEIGHT,
      isAlive: true,
      points: [50, 100, 150, 300][Math.floor(Math.random() * 4)],
      speed: UFO_SPEED * direction,
    };
  }

  // Update UFO
  if (newState.bonusUFO) {
    newState.bonusUFO = {
      ...newState.bonusUFO,
      x: newState.bonusUFO.x + newState.bonusUFO.speed,
    };

    // Remove UFO if off screen
    if (newState.bonusUFO.x < -UFO_WIDTH || newState.bonusUFO.x > GAME_WIDTH) {
      newState.bonusUFO = null;
      newState.nextUFOSpawn = now + UFO_SPAWN_INTERVAL;
    }
  }

  // Check bullet collisions with UFO
  newState.bullets = newState.bullets.filter((bullet) => {
    if (bullet.direction === 'down' || !newState.bonusUFO) return true;

    if (checkCollision(bullet, newState.bonusUFO)) {
      newState.score += newState.bonusUFO.points;
      newState.bonusUFO = null;
      newState.nextUFOSpawn = now + UFO_SPAWN_INTERVAL;
      ufoHit = true;
      return false;
    }
    return true;
  });

  // Check bullet collisions with invaders
  newState.bullets = newState.bullets.filter((bullet) => {
    if (bullet.direction === 'down') return true;

    for (let i = 0; i < newState.invaders.length; i++) {
      const invader = newState.invaders[i];
      if (!invader.isAlive) continue;

      if (checkCollision(bullet, invader)) {
        newState.invaders[i] = { ...invader, isAlive: false };
        newState.score += invader.points;
        return false;
      }
    }
    return true;
  });

  // Check bullet collisions with shields (both player and enemy bullets damage shields!)
  newState.bullets = newState.bullets.filter((bullet) => {
    for (let i = 0; i < newState.shields.length; i++) {
      const shield = newState.shields[i];
      if (!shield.isAlive) continue;

      if (checkCollision(bullet, shield)) {
        // Damage the shield at bullet impact point
        damageShield(newState.shields[i], bullet);

        // Check if shield should be destroyed
        if (newState.shields[i].health <= 0) {
          newState.shields[i].isAlive = false;
        }
        return false;
      }
    }
    return true;
  });

  // Check bullet collisions with player
  for (const bullet of newState.bullets) {
    if (bullet.direction === 'down' && checkCollision(bullet, newState.player)) {
      newState.player.lives--;
      if (newState.player.lives <= 0) {
        newState.gameOver = true;
        newState.player.isAlive = false;
      }
      newState.bullets = newState.bullets.filter((b) => b !== bullet);
      break;
    }
  }

  // Move invaders
  if (now - newState.lastInvaderMove > newState.invaderSpeed) {
    const { invaders, direction, shouldMoveDown } = moveInvaders(
      newState.invaders,
      newState.invaderDirection
    );

    newState.invaders = invaders;
    newState.lastInvaderMove = now;
    newState.animationFrame = (newState.animationFrame + 1) % 2;

    if (shouldMoveDown) {
      newState.invaderDirection = direction === 1 ? -1 : 1;
    } else {
      newState.invaderDirection = direction;
    }

    // Increase speed as invaders are destroyed
    const aliveCount = newState.invaders.filter((inv) => inv.isAlive).length;
    const totalInvaders = INVADERS_PER_ROW * INVADER_ROWS;
    const speedMultiplier = Math.max(0.3, aliveCount / totalInvaders);
    newState.invaderSpeed = Math.max(
      MIN_INVADER_SPEED,
      INITIAL_INVADER_SPEED * speedMultiplier
    );
  }

  // Random invader shooting
  if (Math.random() < 0.02) {
    const aliveInvaders = newState.invaders.filter((inv) => inv.isAlive);
    if (aliveInvaders.length > 0) {
      const shooter = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
      newState.bullets.push({
        x: shooter.x + shooter.width / 2 - BULLET_WIDTH / 2,
        y: shooter.y + shooter.height,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT,
        isAlive: true,
        direction: 'down',
      });
    }
  }

  // Check if all invaders are destroyed
  if (newState.invaders.every((inv) => !inv.isAlive)) {
    newState.level++;
    newState.invaders = createInvaders(newState.level);
    newState.invaderSpeed = INITIAL_INVADER_SPEED * Math.pow(SPEED_INCREASE_FACTOR, newState.level - 1);
  }

  // Check if invaders reached the bottom
  for (const invader of newState.invaders) {
    if (invader.isAlive && invader.y + invader.height >= newState.player.y) {
      newState.gameOver = true;
      break;
    }
  }

  return newState;
}

function moveInvaders(
  invaders: Invader[],
  direction: 1 | -1
): { invaders: Invader[]; direction: 1 | -1; shouldMoveDown: boolean } {
  let shouldMoveDown = false;
  const moveX = 10 * direction;

  // Check if any invader would hit the edge
  for (const invader of invaders) {
    if (!invader.isAlive) continue;
    const newX = invader.x + moveX;
    if (newX < 0 || newX + invader.width > GAME_WIDTH) {
      shouldMoveDown = true;
      break;
    }
  }

  const newInvaders = invaders.map((invader) => {
    if (!invader.isAlive) return invader;

    if (shouldMoveDown) {
      return {
        ...invader,
        y: invader.y + 20,
      };
    } else {
      return {
        ...invader,
        x: invader.x + moveX,
      };
    }
  });

  return { invaders: newInvaders, direction, shouldMoveDown };
}

export function shootBullet(state: GameState): GameState {
  // Only one bullet at a time from player
  const playerBulletExists = state.bullets.some((b) => b.direction === 'up');
  if (playerBulletExists) return state;

  return {
    ...state,
    bullets: [
      ...state.bullets,
      {
        x: state.player.x + state.player.width / 2 - BULLET_WIDTH / 2,
        y: state.player.y,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT,
        isAlive: true,
        direction: 'up',
      },
    ],
  };
}

function checkCollision(obj1: GameObject, obj2: GameObject): boolean {
  return (
    obj1.x < obj2.x + obj2.width &&
    obj1.x + obj1.width > obj2.x &&
    obj1.y < obj2.y + obj2.height &&
    obj1.y + obj1.height > obj2.y
  );
}

function damageShield(shield: Shield, bullet: Bullet): void {
  // Calculate damage based on bullet impact
  const damage = bullet.direction === 'down' ? 15 : 10;
  shield.health -= damage;

  // Mark damage on the shield's damage map at impact point
  const relativeX = Math.floor((bullet.x - shield.x) / (shield.width / 20));
  const relativeY = Math.floor((bullet.y - shield.y) / (shield.height / 10));

  // Damage a small area around the impact point
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const mapX = Math.max(0, Math.min(19, relativeX + dx));
      const mapY = Math.max(0, Math.min(9, relativeY + dy));
      if (shield.damageMap[mapY]) {
        shield.damageMap[mapY][mapX] = true;
      }
    }
  }
}

export function getInvaderSprite(type: string, frame: number): string {
  const sprites = {
    squid: [
      '░▒▓██▓▒░',
      '▓██▓▒░▒▓',
    ],
    crab: [
      '░▓██▓░',
      '▓░██░▓',
    ],
    octopus: [
      '░▒██▒░',
      '▒░██░▒',
    ],
  };

  return sprites[type as keyof typeof sprites]?.[frame] || '░▓██▓░';
}
