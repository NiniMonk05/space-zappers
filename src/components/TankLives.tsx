import { useEffect, useRef } from 'react';

interface TankLivesProps {
  lives: number;
}

export function TankLives({ lives }: TankLivesProps) {
  return (
    <div className="flex gap-3">
      {Array.from({ length: lives }).map((_, i) => (
        <TankIcon key={i} />
      ))}
    </div>
  );
}

function TankIcon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw solid tank in Bitcoin orange - matching main tank
    ctx.fillStyle = '#f7931a';

    // Cannon barrel
    ctx.fillRect(9, 0, 4, 4);
    // Cannon body
    ctx.fillRect(4, 4, 14, 4);
    // Tank base
    ctx.fillRect(0, 8, 22, 4);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={22}
      height={12}
      className="drop-shadow-[0_0_3px_rgba(247,147,26,0.8)]"
    />
  );
}
