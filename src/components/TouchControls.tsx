import { ChevronLeft, ChevronRight, Crosshair, Pause } from 'lucide-react';

interface TouchControlsProps {
  onLeftStart: () => void;
  onLeftEnd: () => void;
  onRightStart: () => void;
  onRightEnd: () => void;
  onFire: () => void;
  onPause?: () => void;
}

export function TouchControls({
  onLeftStart,
  onLeftEnd,
  onRightStart,
  onRightEnd,
  onFire,
  onPause,
}: TouchControlsProps) {
  return (
    <>
      {/* Left/Right buttons - centered in left margin of canvas */}
      <div className="fixed bottom-16 left-[5%] z-40 pointer-events-auto">
        <div className="flex flex-row gap-2">
          <button
            className="w-16 h-16 bg-green-500/30 border-2 border-green-500 rounded-xl flex items-center justify-center active:bg-green-500/60 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onLeftStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onLeftEnd(); }}
            onTouchCancel={(e) => { e.preventDefault(); onLeftEnd(); }}
          >
            <ChevronLeft className="w-10 h-10 text-green-400" />
          </button>
          <button
            className="w-16 h-16 bg-green-500/30 border-2 border-green-500 rounded-xl flex items-center justify-center active:bg-green-500/60 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onRightStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onRightEnd(); }}
            onTouchCancel={(e) => { e.preventDefault(); onRightEnd(); }}
          >
            <ChevronRight className="w-10 h-10 text-green-400" />
          </button>
        </div>
      </div>

      {/* Pause and Fire buttons - centered in right margin of canvas */}
      <div className="fixed bottom-16 right-[5%] z-40 pointer-events-auto">
        <div className="flex gap-2 items-center">
          {onPause && (
            <button
              className="w-14 h-14 bg-yellow-500/30 border-2 border-yellow-500 rounded-xl flex items-center justify-center active:bg-yellow-500/60 touch-none select-none"
              onTouchStart={(e) => { e.preventDefault(); onPause(); }}
            >
              <Pause className="w-7 h-7 text-yellow-400" />
            </button>
          )}
          <button
            className="w-20 h-20 bg-red-500/40 border-2 border-red-500 rounded-full flex items-center justify-center active:bg-red-500/70 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onFire(); }}
          >
            <Crosshair className="w-10 h-10 text-red-400" />
          </button>
        </div>
      </div>
    </>
  );
}
