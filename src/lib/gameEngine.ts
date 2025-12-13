/**
 * Space Zappers Game Engine
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
  lastShotTime: number;
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
  color: string;
}

// UFO types with colors and point values
export const UFO_TYPES = [
  { points: 50, color: '#00ffff' },   // Cyan - common
  { points: 100, color: '#ff00ff' },  // Magenta - uncommon
  { points: 150, color: '#ffff00' },  // Yellow - rare
  { points: 300, color: '#ff0000' },  // Red - legendary
] as const;

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
  levelTransition: boolean;
  ufoSoundPlaying: boolean;
}

// Game constants
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 24;
export const INVADER_WIDTH = 32;
export const INVADER_HEIGHT = 32;
export const BULLET_WIDTH = 4;
export const BULLET_HEIGHT = 12;
export const SHIELD_WIDTH = 160;
export const SHIELD_HEIGHT = 60;
export const PLAYER_SPEED = 5;
export const BULLET_SPEED = 8;
export const BASE_BOMB_SPEED = 2; // Base speed for enemy bombs
export const INITIAL_INVADER_SPEED = 1000; // milliseconds between moves
export const MIN_INVADER_SPEED = 35; // Very fast for last few aliens (like original arcade)
export const UFO_SPAWN_INTERVAL = 15000; // 15 seconds
export const UFO_SPEED = 2;
export const UFO_WIDTH = 48;
export const UFO_HEIGHT = 24;
export const BASE_FIRE_COOLDOWN = 500; // ms between shots at level 1
export const MIN_FIRE_COOLDOWN = 150; // minimum cooldown at high levels

// Invader formation
const INVADERS_PER_ROW = 11;
const INVADER_ROWS = 5;
const INVADER_SPACING_X = 50;
const INVADER_SPACING_Y = 45;
const INVADER_START_X = 100;
const INVADER_START_Y = 100;

// Get fire cooldown based on level (faster shooting at higher levels)
export function getFireCooldown(level: number): number {
  return Math.max(MIN_FIRE_COOLDOWN, BASE_FIRE_COOLDOWN - (level - 1) * 50);
}

// Get bomb speed based on level (slower at level 1, faster each level)
export function getBombSpeed(level: number): number {
  if (level === 1) {
    return BASE_BOMB_SPEED * 0.5; // 50% slower on level 1
  }
  return BASE_BOMB_SPEED + (level - 2) * 0.3; // Increase speed each level after 1
}

// Level-based alien color schemes
export function getAlienColors(level: number): { squid: string; crab: string; octopus: string } {
  const schemes = [
    { squid: '#ff0000', crab: '#ffffff', octopus: '#00ffff' }, // Classic
    { squid: '#ff00ff', crab: '#ffff00', octopus: '#00ff00' }, // Neon
    { squid: '#ff6600', crab: '#ff0066', octopus: '#6600ff' }, // Sunset
    { squid: '#00ff66', crab: '#0066ff', octopus: '#ff0066' }, // Cyber
    { squid: '#ffcc00', crab: '#ff3300', octopus: '#cc00ff' }, // Fire
  ];
  return schemes[(level - 1) % schemes.length];
}

export function createInitialState(): GameState {
  return {
    player: {
      x: GAME_WIDTH / 2 - PLAYER_WIDTH / 2,
      y: GAME_HEIGHT - 70,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      isAlive: true,
      lives: 3,
      lastShotTime: 0,
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
    levelTransition: false,
    ufoSoundPlaying: false,
  };
}

function createInvaders(level: number): Invader[] {
  const invaders: Invader[] = [];

  for (let row = 0; row < INVADER_ROWS; row++) {
    let type: 'squid' | 'crab' | 'octopus';
    let points: number;

    if (row === 0) {
      type = 'squid';
      points = 30 + (level - 1) * 5; // More points at higher levels
    } else if (row <= 2) {
      type = 'crab';
      points = 20 + (level - 1) * 3;
    } else {
      type = 'octopus';
      points = 10 + (level - 1) * 2;
    }

    for (let col = 0; col < INVADERS_PER_ROW; col++) {
      invaders.push({
        x: INVADER_START_X + col * INVADER_SPACING_X,
        y: INVADER_START_Y + row * INVADER_SPACING_Y,
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

  // Create shield damage map (20x15 pixels for classic shield shape)
  const createDamageMap = (): boolean[][] => {
    const map: boolean[][] = [];
    for (let i = 0; i < 15; i++) {
      map.push(new Array(20).fill(false));
    }
    return map;
  };

  for (let i = 0; i < shieldCount; i++) {
    shields.push({
      x: spacing * (i + 1) - SHIELD_WIDTH / 2,
      y: GAME_HEIGHT - 160,
      width: SHIELD_WIDTH,
      height: SHIELD_HEIGHT,
      isAlive: true,
      health: 100,
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
  const now = Date.now();
  const bombSpeed = getBombSpeed(state.level);

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

  // Update bullets with level-based bomb speed
  newState.bullets = newState.bullets
    .map((bullet) => ({
      ...bullet,
      y: bullet.direction === 'up'
        ? bullet.y - BULLET_SPEED
        : bullet.y + bombSpeed,
    }))
    .filter((bullet) => bullet.y > 0 && bullet.y < GAME_HEIGHT);

  // Spawn bonus UFO randomly during gameplay
  if (!newState.bonusUFO && now >= newState.nextUFOSpawn && Math.random() < 0.3) {
    const direction = Math.random() < 0.5 ? 1 : -1;
    const ufoType = UFO_TYPES[Math.floor(Math.random() * UFO_TYPES.length)];
    newState.bonusUFO = {
      x: direction > 0 ? -UFO_WIDTH : GAME_WIDTH,
      y: 50,
      width: UFO_WIDTH,
      height: UFO_HEIGHT,
      isAlive: true,
      points: ufoType.points,
      color: ufoType.color,
      speed: UFO_SPEED * direction,
    };
    newState.ufoSoundPlaying = true;
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
      newState.ufoSoundPlaying = false;
    }
  }

  // Check bullet collisions with UFO
  newState.bullets = newState.bullets.filter((bullet) => {
    if (bullet.direction === 'down' || !newState.bonusUFO) return true;

    if (checkCollision(bullet, newState.bonusUFO)) {
      newState.score += newState.bonusUFO.points;
      newState.bonusUFO = null;
      newState.nextUFOSpawn = now + UFO_SPAWN_INTERVAL;
      newState.ufoSoundPlaying = false;
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

      // Check if bullet hits the shield's actual shape (not just bounding box)
      if (checkShieldCollision(bullet, shield)) {
        damageShield(newState.shields[i], bullet);

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

    // Increase speed as invaders are destroyed (exponential curve like original arcade)
    const aliveCount = newState.invaders.filter((inv) => inv.isAlive).length;
    const totalInvaders = INVADERS_PER_ROW * INVADER_ROWS;
    // Exponential curve: speed increases dramatically as fewer aliens remain
    // At 55 aliens: 1000ms, at 10 aliens: ~180ms, at 1 alien: ~35ms
    const ratio = aliveCount / totalInvaders;
    const speedMultiplier = Math.pow(ratio, 1.5); // Exponential curve
    newState.invaderSpeed = Math.max(
      MIN_INVADER_SPEED,
      INITIAL_INVADER_SPEED * speedMultiplier
    );
  }

  // Random invader shooting (more frequent at higher levels)
  const shootChance = 0.015 + (state.level - 1) * 0.003;
  if (Math.random() < shootChance) {
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

  // Check if all invaders are destroyed - spawn end-of-level UFO
  if (newState.invaders.every((inv) => !inv.isAlive)) {
    // Spawn bonus UFO for end of level
    if (!newState.bonusUFO && !newState.levelTransition) {
      const direction = Math.random() < 0.5 ? 1 : -1;
      newState.bonusUFO = {
        x: direction > 0 ? -UFO_WIDTH : GAME_WIDTH,
        y: 50,
        width: UFO_WIDTH,
        height: UFO_HEIGHT,
        isAlive: true,
        points: 500, // Big bonus for end-of-level UFO
        color: '#ffffff', // White/gold for special end-of-level UFO
        speed: UFO_SPEED * direction * 1.5, // Faster
      };
      newState.levelTransition = true;
      newState.ufoSoundPlaying = true;
    }

    // Only advance level once UFO is gone or shot
    if (!newState.bonusUFO && newState.levelTransition) {
      newState.level++;
      newState.invaders = createInvaders(newState.level);
      // Shields persist across levels (like the original arcade game)
      newState.invaderSpeed = INITIAL_INVADER_SPEED; // Reset to base speed each level (like original)
      newState.levelTransition = false;
      newState.nextUFOSpawn = now + UFO_SPAWN_INTERVAL;
    }
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
  const now = Date.now();
  const fireCooldown = getFireCooldown(state.level);

  // Check fire cooldown
  if (now - state.player.lastShotTime < fireCooldown) {
    return state;
  }

  // Only one bullet at a time from player (classic mode)
  const playerBulletExists = state.bullets.some((b) => b.direction === 'up');
  if (playerBulletExists) return state;

  return {
    ...state,
    player: {
      ...state.player,
      lastShotTime: now,
    },
    bullets: [
      ...state.bullets,
      {
        x: state.player.x + state.player.width / 2 - BULLET_WIDTH / 2,
        y: state.player.y - BULLET_HEIGHT,
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

// Shield shape for collision detection (matching the visual shape)
const SHIELD_SHAPE = [
  '    ████████████    ',
  '  ████████████████  ',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '████████████████████',
  '██████        ██████',
  '████            ████',
  '████            ████',
  '████            ████',
];

// Check if bullet collides with shield's actual shape (not just bounding box)
function checkShieldCollision(bullet: Bullet, shield: Shield): boolean {
  // First, quick bounding box check
  if (!checkCollision(bullet, shield)) {
    return false;
  }

  // Calculate bullet center position relative to shield
  const bulletCenterX = bullet.x + bullet.width / 2;
  const bulletY = bullet.direction === 'down' ? bullet.y : bullet.y + bullet.height;

  // Convert to shield grid coordinates
  const gridX = Math.floor((bulletCenterX - shield.x) / (shield.width / 20));
  const gridY = Math.floor((bulletY - shield.y) / (shield.height / 15));

  // Check bounds
  if (gridX < 0 || gridX >= 20 || gridY < 0 || gridY >= 15) {
    return false;
  }

  // Check if this position is already damaged
  if (shield.damageMap[gridY] && shield.damageMap[gridY][gridX]) {
    return false;
  }

  // Check if this position is part of the shield shape
  const row = SHIELD_SHAPE[gridY];
  if (!row) return false;

  const charIndex = gridX * 2;
  const char = row.substring(charIndex, charIndex + 2);

  return char === '██';
}

function damageShield(shield: Shield, bullet: Bullet): void {
  // Calculate damage based on bullet impact
  const damage = bullet.direction === 'down' ? 8 : 6;
  shield.health -= damage;

  // Mark damage on the shield's damage map at impact point
  const relativeX = Math.floor((bullet.x + BULLET_WIDTH / 2 - shield.x) / (shield.width / 20));
  const relativeY = bullet.direction === 'down'
    ? Math.floor((bullet.y - shield.y) / (shield.height / 15))
    : Math.floor((bullet.y + BULLET_HEIGHT - shield.y) / (shield.height / 15));

  // Damage a larger area around the impact point (3x3 for bigger visible damage)
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      // Skip corners for a more circular damage pattern
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;

      const mapX = Math.max(0, Math.min(19, relativeX + dx));
      const mapY = Math.max(0, Math.min(14, relativeY + dy));
      if (shield.damageMap[mapY]) {
        shield.damageMap[mapY][mapX] = true;
      }
    }
  }
}
