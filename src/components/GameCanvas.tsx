import { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/gameEngine';
import { getAlienColors } from '@/lib/gameEngine';

interface GameCanvasProps {
  gameState: GameState;
  playerFlashing?: boolean;
}

export function GameCanvas({ gameState, playerFlashing = false }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get colors for current level
    const colors = getAlienColors(gameState.level);

    // Draw shields (flat bottom, solid, symmetrical)
    for (const shield of gameState.shields) {
      if (shield.isAlive) {
        drawShield(ctx, shield.x, shield.y, shield.width, shield.height, shield.health, shield.damageMap);
      }
    }

    // Draw UFO if present
    if (gameState.bonusUFO) {
      drawUFO(ctx, gameState.bonusUFO.x, gameState.bonusUFO.y, gameState.bonusUFO.points, gameState.bonusUFO.color);
    }

    // Draw invaders with level-based colors
    for (const invader of gameState.invaders) {
      if (invader.isAlive) {
        drawInvader(ctx, invader, gameState.animationFrame, colors);
      }
    }

    // Draw player (Bitcoin orange tank, flashing red when hit)
    if (gameState.player.isAlive) {
      drawPlayer(ctx, gameState.player.x, gameState.player.y, playerFlashing);
    }

    // Draw bullets
    for (const bullet of gameState.bullets) {
      if (bullet.direction === 'up') {
        // Player bullet - lightning zap shape
        drawZapBullet(ctx, bullet.x, bullet.y, bullet.height);
      } else {
        // Enemy bomb
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      }
    }
  }, [gameState]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      className="border-4 border-green-500 rounded-lg shadow-[0_0_30px_rgba(0,255,0,0.3)]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// Draw player tank - Bitcoin orange color, solid fill (flashes red when hit)
function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, flashing: boolean = false) {
  // Alternate between red and white when flashing
  ctx.fillStyle = flashing ? (Date.now() % 200 < 100 ? '#ff0000' : '#ffffff') : '#f7931a';

  // Draw solid tank shape - cannon on top, wide base
  // Cannon barrel
  ctx.fillRect(x + 20, y, 8, 8);
  // Cannon body
  ctx.fillRect(x + 8, y + 8, 32, 8);
  // Tank base
  ctx.fillRect(x, y + 16, 48, 8);
}

// Draw tank shape for lives display
export function drawTankIcon(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number = 1) {
  ctx.fillStyle = '#f7931a'; // Bitcoin orange

  const pixels = [
    '    ██    ',
    '    ██    ',
    '  ██████  ',
    '██████████',
    '██████████',
  ];

  drawPixelArt(ctx, x, y, pixels, scale);
}

function drawInvader(
  ctx: CanvasRenderingContext2D,
  invader: { x: number; y: number; type: string },
  frame: number,
  colors: { squid: string; crab: string; octopus: string }
) {
  let pixels: string[];
  const color = invader.type === 'squid' ? colors.squid :
                invader.type === 'crab' ? colors.crab :
                colors.octopus;

  ctx.fillStyle = color;

  if (invader.type === 'squid') {
    // Top row invader (squid)
    if (frame === 0) {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '████  ████  ████',
        '████████████████',
        '  ██  ████  ██  ',
        '██  ██    ██  ██',
      ];
    } else {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '████  ████  ████',
        '████████████████',
        '    ██    ██    ',
        '  ██        ██  ',
      ];
    }
  } else if (invader.type === 'crab') {
    // Middle rows invader (crab)
    if (frame === 0) {
      pixels = [
        '  ██      ██  ',
        '    ██  ██    ',
        '  ██████████  ',
        '████  ██  ████',
        '██████████████',
        '██  ██████  ██',
        '██          ██',
      ];
    } else {
      pixels = [
        '  ██      ██  ',
        '██  ██  ██  ██',
        '██████████████',
        '████  ██  ████',
        '  ██████████  ',
        '    ██  ██    ',
        '  ██      ██  ',
      ];
    }
  } else {
    // Bottom rows invader (octopus)
    if (frame === 0) {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '████  ████  ████',
        '████████████████',
        '    ██    ██    ',
        '  ██  ████  ██  ',
      ];
    } else {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '████  ████  ████',
        '████████████████',
        '  ██  ████  ██  ',
        '██          ██  ',
      ];
    }
  }

  drawPixelArt(ctx, invader.x, invader.y, pixels, 2);
}

// Draw UFO with different shapes based on point value
function drawUFO(ctx: CanvasRenderingContext2D, x: number, y: number, points: number, color: string) {
  ctx.fillStyle = color;

  // Different symmetrical shapes for each UFO type
  let pixels: string[];

  switch (points) {
    case 50:
      // Cyan - Classic saucer
      pixels = [
        '      ████████      ',
        '    ████████████    ',
        '  ██████████████████',
        '████████████████████',
        '██  ██  ██  ██  ██  ',
        '    ██      ██      ',
      ];
      break;
    case 100:
      // Magenta - Tall dome saucer
      pixels = [
        '        ████        ',
        '      ████████      ',
        '      ████████      ',
        '  ██████████████████',
        '████████████████████',
        '  ██  ██████  ██  ',
      ];
      break;
    case 150:
      // Yellow - Wide flat saucer
      pixels = [
        '    ████████████    ',
        '████████████████████',
        '██████████████████████',
        '████████████████████',
        '  ██    ████    ██  ',
      ];
      break;
    case 300:
      // Red - Double-decker saucer
      pixels = [
        '      ████████      ',
        '    ████████████    ',
        '████████████████████',
        '    ████████████    ',
        '████████████████████',
        '  ██  ██  ██  ██  ',
      ];
      break;
    case 500:
    default:
      // White - Large mothership (end of level)
      pixels = [
        '      ██████████      ',
        '    ██████████████    ',
        '  ██████████████████  ',
        '██████████████████████',
        '████████████████████████',
        '██████████████████████',
        '  ██  ██    ██  ██  ',
      ];
      break;
  }

  drawPixelArt(ctx, x, y, pixels, 2.4);

  // Draw glow effect matching UFO color
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  drawPixelArt(ctx, x, y, pixels, 2.4);
  ctx.shadowBlur = 0;

  // Draw points indicator - color matches UFO
  ctx.fillStyle = color;
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${points}`, x + 24, y - 10);
}

// Draw shield - flat bottom, solid, symmetrical (no fading, just pixel damage)
function drawShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  _health: number,
  damageMap: boolean[][]
) {
  ctx.fillStyle = '#00ff00'; // Solid green, no fading

  // Classic shield shape - flat bottom, solid, symmetrical with cutout for tank
  const shieldShape = [
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

  const pixelWidth = width / 20;
  const pixelHeight = height / 15;

  for (let row = 0; row < shieldShape.length; row++) {
    const line = shieldShape[row];
    for (let col = 0; col < line.length; col += 2) {
      const char = line.substring(col, col + 2);
      if (char === '██') {
        // Check if this pixel is damaged
        const mapX = Math.floor(col / 2);
        const mapY = row;
        if (damageMap[mapY] && damageMap[mapY][mapX]) {
          continue; // Skip damaged pixels
        }
        ctx.fillRect(
          x + (col / 2) * pixelWidth,
          y + row * pixelHeight,
          pixelWidth + 0.5, // Slight overlap to prevent gaps
          pixelHeight + 0.5
        );
      }
    }
  }
}

// Draw lightning zap bullet
function drawZapBullet(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  ctx.fillStyle = '#ffff00'; // Yellow zap
  ctx.strokeStyle = '#ff9900'; // Orange outline

  // Draw a simple zap/lightning shape
  ctx.beginPath();
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 4, y + height * 0.4);
  ctx.lineTo(x + 2, y + height * 0.4);
  ctx.lineTo(x + 4, y + height);
  ctx.lineTo(x, y + height * 0.6);
  ctx.lineTo(x + 2, y + height * 0.6);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();

  // Add glow effect
  ctx.shadowColor = '#ffff00';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPixelArt(ctx: CanvasRenderingContext2D, x: number, y: number, pixels: string[], scale: number = 1) {
  const pixelSize = 2 * scale;

  for (let row = 0; row < pixels.length; row++) {
    const line = pixels[row];
    for (let col = 0; col < line.length; col += 2) {
      const char = line.substring(col, col + 2);
      if (char === '██') {
        ctx.fillRect(
          x + (col / 2) * pixelSize,
          y + row * pixelSize,
          pixelSize,
          pixelSize
        );
      }
    }
  }
}
