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
  lastShotTick: number; // Simulation tick of the last shot
}

export interface Bullet extends GameObject {
  direction: 'up' | 'down';
}

export interface Shield extends GameObject {
  damageMap: boolean[][]; // Track which pixels are destroyed
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
  animationFrame: number;
  levelTransition: boolean;
  ufoSoundPlaying: boolean;
  endReason: GameEndReason | null;
  // Timers, all counted in simulation ticks so they freeze while paused
  tick: number; // Ticks simulated since the game started
  ticksSinceMarch: number; // Ticks since the formation last stepped
  marchIntervalTicks: number; // Ticks between formation steps
  ufoSpawnCountdown: number; // Ticks until a bonus ship may appear
  playerFlashTicks: number; // Ticks left of the player-hit flash (the player cannot be hit while it runs)
  levelBannerTicks: number; // Ticks left of the "LEVEL n" banner
  respawnTicks: number; // Ticks left of the pause after losing a life; everything but the flash is frozen
}

export type GameEndReason = 'lives' | 'invaded' | 'timeout';

/** Player input for one tick. `fire` is a one-shot request. */
export interface TickInput {
  left: boolean;
  right: boolean;
  fire: boolean;
}

/** Something that happened during a tick, for sound and UI to react to. */
export type GameEvent =
  | { type: 'shot' }
  | { type: 'invaderKilled'; points: number }
  | { type: 'ufoSpawned'; endOfWave: boolean }
  | { type: 'ufoHit'; points: number }
  | { type: 'ufoLeft' }
  | { type: 'playerHit'; livesLeft: number }
  | { type: 'march' }
  | { type: 'levelUp'; level: number }
  | { type: 'gameOver'; reason: GameEndReason };

/** Random number source in [0, 1). Defaults to Math.random; tests pass a seeded one. */
export type Rng = () => number;

// Game constants
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PLAYER_WIDTH = 48;
export const PLAYER_HEIGHT = 24;
export const INVADER_WIDTH = 32;
export const INVADER_HEIGHT = 32;
export const BULLET_WIDTH = 6;
export const BULLET_HEIGHT = 16;
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

// Simulation timing. The game advances in fixed ticks of 1/60 s whatever the
// display refresh rate, so speeds above are in pixels per tick.
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/** Convert a duration in milliseconds to whole ticks (nearest). */
export function msToTicks(ms: number): number {
  return Math.round((ms * TICK_RATE) / 1000);
}

export const UFO_SPAWN_TICKS = msToTicks(UFO_SPAWN_INTERVAL); // 900
export const PLAYER_FLASH_TICKS = msToTicks(500); // 30
export const LEVEL_BANNER_TICKS = msToTicks(2000); // 120
export const DEATH_PAUSE_TICKS = msToTicks(1000); // 60: formation and bombs freeze after a hit
export const RESPAWN_INVULNERABLE_TICKS = msToTicks(1500); // 90: blinking and unhittable after respawning
export const PLAYER_RESPAWN_X = 16; // The player comes back at the left of the screen

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

export function getFireCooldownTicks(level: number): number {
  return msToTicks(getFireCooldown(level));
}

/** March interval in ms: 1000 ms x (alive/55)^1.5, floored at 35 ms. */
export function getMarchIntervalMs(aliveCount: number): number {
  const totalInvaders = INVADERS_PER_ROW * INVADER_ROWS;
  const ratio = aliveCount / totalInvaders;
  return Math.max(MIN_INVADER_SPEED, INITIAL_INVADER_SPEED * Math.pow(ratio, 1.5));
}

/**
 * March interval in ticks: the formation steps on the first tick at or after
 * the interval has elapsed, as it did when it was timed per 60 Hz frame.
 */
export function getMarchIntervalTicks(aliveCount: number): number {
  return Math.max(1, Math.ceil((getMarchIntervalMs(aliveCount) * TICK_RATE) / 1000 - 1e-9));
}

/** Small seedable RNG (mulberry32) for deterministic tests and replays. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
      lastShotTick: Number.NEGATIVE_INFINITY,
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
    animationFrame: 0,
    levelTransition: false,
    ufoSoundPlaying: false,
    endReason: null,
    tick: 0,
    ticksSinceMarch: 0,
    marchIntervalTicks: getMarchIntervalTicks(INVADERS_PER_ROW * INVADER_ROWS),
    ufoSpawnCountdown: UFO_SPAWN_TICKS,
    playerFlashTicks: 0,
    levelBannerTicks: LEVEL_BANNER_TICKS,
    respawnTicks: 0,
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
      damageMap: createDamageMap(),
    });
  }

  return shields;
}

/** End the game once, recording why and emitting a gameOver event. */
export function endGame(state: GameState, reason: GameEndReason, events?: GameEvent[]): void {
  if (state.gameOver) return;
  state.gameOver = true;
  state.endReason = reason;
  if (reason !== 'invaded') state.player.isAlive = false;
  events?.push({ type: 'gameOver', reason });
}

/**
 * Advance the simulation by exactly one fixed tick (1/60 s).
 *
 * Mutates `state` in place and returns what happened as a list of events;
 * it has no other side effects (no sound, no timers, no clock reads), so the
 * caller decides how to present the events. Randomness comes from `rng`.
 */
export function tickGame(state: GameState, input: TickInput, rng: Rng = Math.random): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.gameOver || state.isPaused) {
    return events;
  }

  // Advance timers
  state.tick++;
  if (state.playerFlashTicks > 0) state.playerFlashTicks--;

  // After losing a life everything holds still while the player flashes,
  // then the player comes back at the left
  if (state.respawnTicks > 0) {
    state.respawnTicks--;
    if (state.respawnTicks === 0) state.player.x = PLAYER_RESPAWN_X;
    return events;
  }

  state.ticksSinceMarch++;
  if (state.ufoSpawnCountdown > 0) state.ufoSpawnCountdown--;
  if (state.levelBannerTicks > 0) state.levelBannerTicks--;

  const bombSpeed = getBombSpeed(state.level);
  const player = state.player;

  // Fire before moving, so the shot leaves from where the player was when it was requested
  if (input.fire && tryShoot(state)) {
    events.push({ type: 'shot' });
  }

  // Update player position
  if (input.left) {
    player.x = Math.max(0, player.x - PLAYER_SPEED);
  }
  if (input.right) {
    player.x = Math.min(GAME_WIDTH - PLAYER_WIDTH, player.x + PLAYER_SPEED);
  }

  // Update bullets with level-based bomb speed
  for (const bullet of state.bullets) {
    bullet.y += bullet.direction === 'up' ? -BULLET_SPEED : bombSpeed;
  }
  state.bullets = state.bullets.filter((bullet) => bullet.y > 0 && bullet.y < GAME_HEIGHT);

  // Spawn bonus UFO randomly during gameplay
  if (!state.bonusUFO && state.ufoSpawnCountdown <= 0 && rng() < 0.3) {
    const direction = rng() < 0.5 ? 1 : -1;
    const ufoType = UFO_TYPES[Math.floor(rng() * UFO_TYPES.length)];
    state.bonusUFO = {
      x: direction > 0 ? -UFO_WIDTH : GAME_WIDTH,
      y: 65,
      width: UFO_WIDTH,
      height: UFO_HEIGHT,
      isAlive: true,
      points: ufoType.points,
      color: ufoType.color,
      speed: UFO_SPEED * direction,
    };
    state.ufoSoundPlaying = true;
    events.push({ type: 'ufoSpawned', endOfWave: false });
  }

  // Update UFO
  if (state.bonusUFO) {
    state.bonusUFO.x += state.bonusUFO.speed;

    // Remove UFO if off screen
    if (state.bonusUFO.x < -UFO_WIDTH || state.bonusUFO.x > GAME_WIDTH) {
      state.bonusUFO = null;
      state.ufoSpawnCountdown = UFO_SPAWN_TICKS;
      state.ufoSoundPlaying = false;
      events.push({ type: 'ufoLeft' });
    }
  }

  // Check bullet collisions with UFO
  state.bullets = state.bullets.filter((bullet) => {
    const ufo = state.bonusUFO;
    if (bullet.direction === 'down' || !ufo) return true;

    if (checkCollision(bullet, ufo)) {
      state.score += ufo.points;
      state.bonusUFO = null;
      state.ufoSpawnCountdown = UFO_SPAWN_TICKS;
      state.ufoSoundPlaying = false;
      events.push({ type: 'ufoHit', points: ufo.points });
      return false;
    }
    return true;
  });

  // Check bullet collisions with invaders
  state.bullets = state.bullets.filter((bullet) => {
    if (bullet.direction === 'down') return true;

    for (const invader of state.invaders) {
      if (!invader.isAlive) continue;

      if (checkCollision(bullet, invader)) {
        invader.isAlive = false;
        state.score += invader.points;
        events.push({ type: 'invaderKilled', points: invader.points });
        return false;
      }
    }
    return true;
  });

  // Check bullet collisions with shields (both player and enemy bullets damage shields!)
  state.bullets = state.bullets.filter((bullet) => {
    for (const shield of state.shields) {
      // Check if bullet hits the shield's actual shape (not just bounding box)
      if (checkShieldCollision(bullet, shield)) {
        damageShield(shield, bullet);
        return false;
      }
    }
    return true;
  });

  // Check bullet collisions with player (bombs pass through while the player is blinking)
  const canBeHit = state.playerFlashTicks === 0;
  for (const bullet of state.bullets) {
    if (canBeHit && bullet.direction === 'down' && checkCollision(bullet, player)) {
      player.lives--;
      events.push({ type: 'playerHit', livesLeft: player.lives });
      if (player.lives <= 0) {
        state.playerFlashTicks = PLAYER_FLASH_TICKS;
        endGame(state, 'lives', events);
        state.bullets = state.bullets.filter((b) => b !== bullet);
        break;
      }
      // Freeze for a beat, clear the screen of shots and bombs, then respawn
      // (see the top of tickGame) and blink through the invulnerable spell
      state.respawnTicks = DEATH_PAUSE_TICKS;
      state.playerFlashTicks = DEATH_PAUSE_TICKS + RESPAWN_INVULNERABLE_TICKS;
      state.bullets = [];
      return events;
    }
  }

  // Move invaders
  if (state.ticksSinceMarch >= state.marchIntervalTicks) {
    const { invaders, direction, shouldMoveDown } = moveInvaders(
      state.invaders,
      state.invaderDirection
    );

    state.invaders = invaders;
    state.ticksSinceMarch = 0;
    state.animationFrame = (state.animationFrame + 1) % 2;

    if (shouldMoveDown) {
      state.invaderDirection = direction === 1 ? -1 : 1;
    } else {
      state.invaderDirection = direction;
    }

    // Increase speed as invaders are destroyed (exponential curve like original arcade)
    const aliveCount = state.invaders.filter((inv) => inv.isAlive).length;
    state.marchIntervalTicks = getMarchIntervalTicks(aliveCount);
    events.push({ type: 'march' });
  }

  // Random invader shooting (more frequent at higher levels)
  const shootChance = 0.015 + (state.level - 1) * 0.003;
  if (rng() < shootChance) {
    const aliveInvaders = state.invaders.filter((inv) => inv.isAlive);
    if (aliveInvaders.length > 0) {
      const shooter = aliveInvaders[Math.floor(rng() * aliveInvaders.length)];
      state.bullets.push({
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
  if (state.invaders.every((inv) => !inv.isAlive)) {
    // Spawn bonus UFO for end of level
    if (!state.bonusUFO && !state.levelTransition) {
      const direction = rng() < 0.5 ? 1 : -1;
      state.bonusUFO = {
        x: direction > 0 ? -UFO_WIDTH : GAME_WIDTH,
        y: 65,
        width: UFO_WIDTH,
        height: UFO_HEIGHT,
        isAlive: true,
        points: 500, // Big bonus for end-of-level UFO
        color: '#ffffff', // White/gold for special end-of-level UFO
        speed: UFO_SPEED * direction * 1.5, // Faster
      };
      state.levelTransition = true;
      state.ufoSoundPlaying = true;
      events.push({ type: 'ufoSpawned', endOfWave: true });
    }

    // Only advance level once UFO is gone or shot
    if (!state.bonusUFO && state.levelTransition) {
      state.level++;
      state.invaders = createInvaders(state.level);
      // Shields persist across levels (like the original arcade game)
      state.marchIntervalTicks = getMarchIntervalTicks(INVADERS_PER_ROW * INVADER_ROWS); // Reset to base speed each level (like original)
      state.levelTransition = false;
      state.ufoSpawnCountdown = UFO_SPAWN_TICKS;
      state.levelBannerTicks = LEVEL_BANNER_TICKS;
      events.push({ type: 'levelUp', level: state.level });
    }
  }

  // Check if invaders touch shields - destroy shield sections they overlap
  for (const invader of state.invaders) {
    if (!invader.isAlive) continue;

    for (const shield of state.shields) {
      // Check if invader overlaps with shield bounding box
      if (checkCollision(invader, shield)) {
        // Destroy the shield pixels that the invader touches
        destroyShieldSection(shield, invader);
      }
    }
  }

  // Check if invaders reached the bottom
  for (const invader of state.invaders) {
    if (invader.isAlive && invader.y + invader.height >= player.y) {
      endGame(state, 'invaded', events);
      break;
    }
  }

  return events;
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

/** Fire a player shot if the cooldown has passed and no shot is in flight. */
function tryShoot(state: GameState): boolean {
  if (state.tick - state.player.lastShotTick < getFireCooldownTicks(state.level)) {
    return false;
  }

  // Only one bullet at a time from player (classic mode)
  if (state.bullets.some((b) => b.direction === 'up')) return false;

  state.player.lastShotTick = state.tick;
  state.bullets.push({
    x: state.player.x + state.player.width / 2 - BULLET_WIDTH / 2,
    y: state.player.y - BULLET_HEIGHT,
    width: BULLET_WIDTH,
    height: BULLET_HEIGHT,
    isAlive: true,
    direction: 'up',
  });
  return true;
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
  // Mark damage on the shield's damage map at impact point
  const relativeX = Math.floor((bullet.x + BULLET_WIDTH / 2 - shield.x) / (shield.width / 20));
  const relativeY = bullet.direction === 'down'
    ? Math.floor((bullet.y - shield.y) / (shield.height / 15))
    : Math.floor((bullet.y + BULLET_HEIGHT - shield.y) / (shield.height / 15));

  // Damage a small area around the impact point (like original arcade)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const mapX = Math.max(0, Math.min(19, relativeX + dx));
      const mapY = Math.max(0, Math.min(14, relativeY + dy));
      if (shield.damageMap[mapY]) {
        shield.damageMap[mapY][mapX] = true;
      }
    }
  }
}

// Destroy shield pixels that an invader overlaps (when invaders descend to shield level)
function destroyShieldSection(shield: Shield, invader: Invader): void {
  // Calculate the grid coordinates that the invader overlaps
  const startX = Math.floor((invader.x - shield.x) / (shield.width / 20));
  const endX = Math.floor((invader.x + invader.width - shield.x) / (shield.width / 20));
  const startY = Math.floor((invader.y - shield.y) / (shield.height / 15));
  const endY = Math.floor((invader.y + invader.height - shield.y) / (shield.height / 15));

  // Destroy all shield pixels the invader touches
  for (let y = Math.max(0, startY); y <= Math.min(14, endY); y++) {
    for (let x = Math.max(0, startX); x <= Math.min(19, endX); x++) {
      if (shield.damageMap[y]) {
        shield.damageMap[y][x] = true;
      }
    }
  }
}
