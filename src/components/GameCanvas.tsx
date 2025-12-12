import { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/gameEngine';

interface GameCanvasProps {
  gameState: GameState;
}

export function GameCanvas({ gameState }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw shields
    ctx.fillStyle = '#00ff00';
    for (const shield of gameState.shields) {
      if (shield.isAlive) {
        drawShield(ctx, shield.x, shield.y, shield.width, shield.height, shield.health);
      }
    }

    // Draw invaders
    for (const invader of gameState.invaders) {
      if (invader.isAlive) {
        drawInvader(ctx, invader, gameState.animationFrame);
      }
    }

    // Draw player
    if (gameState.player.isAlive) {
      drawPlayer(ctx, gameState.player.x, gameState.player.y);
    }

    // Draw bullets
    ctx.fillStyle = '#ffffff';
    for (const bullet of gameState.bullets) {
      if (bullet.direction === 'up') {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#ff00ff';
      }
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
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

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#00ff00';
  
  // Player spaceship shape
  const pixels = [
    '                ██                  ',
    '               ████                 ',
    '               ████                 ',
    '    ████████████████████████        ',
    '  ████████████████████████████      ',
    '████████████████████████████████    ',
    '████████████████████████████████    ',
  ];
  
  drawPixelArt(ctx, x - 8, y, pixels, 1);
}

function drawInvader(ctx: CanvasRenderingContext2D, invader: any, frame: number) {
  let pixels: string[];
  const color = invader.type === 'squid' ? '#ff0000' : 
                invader.type === 'crab' ? '#ffffff' :
                '#00ffff';
  
  ctx.fillStyle = color;
  
  if (invader.type === 'squid') {
    // Top row invader (squid)
    if (frame === 0) {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '██████  ████████',
        '████████████████',
        '  ██  ██  ██    ',
        '██  ██  ██  ██  ',
      ];
    } else {
      pixels = [
        '    ████████    ',
        '  ████████████  ',
        '████████████████',
        '██████  ████████',
        '████████████████',
        '  ██  ██  ██    ',
        '  ██  ██  ██    ',
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
        '██  ██  ██  ██',
        '    ██  ██    ',
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
        '    ██████    ',
        '  ██████████  ',
        '████████████████',
        '██████  ████████',
        '████████████████',
        '  ████  ████  ',
        '████      ████',
      ];
    } else {
      pixels = [
        '    ██████    ',
        '  ██████████  ',
        '████████████████',
        '██████  ████████',
        '████████████████',
        '  ████  ████  ',
        '  ██      ██  ',
      ];
    }
  }
  
  drawPixelArt(ctx, invader.x, invader.y, pixels, 2);
}

function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, health: number) {
  const opacity = Math.max(0.3, health / 10);
  ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
  
  // Shield shape
  const pixels = [
    '████████████████████',
    '████████████████████',
    '██████████████████████',
    '████████████████████████',
    '████████████████████████',
    '████████████████████████',
    '████████████████████████',
    '██████          ████████',
    '████              ██████',
    '████              ██████',
  ];
  
  drawPixelArt(ctx, x, y, pixels, 4);
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
