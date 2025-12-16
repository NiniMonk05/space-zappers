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
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="flex justify-between items-end p-4 pb-8">
        {/* Left/Right buttons */}
        <div className="flex flex-row gap-2 pointer-events-auto">
          <button
            className="w-20 h-20 bg-green-500/30 border-2 border-green-500 rounded-xl flex items-center justify-center active:bg-green-500/60 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onLeftStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onLeftEnd(); }}
            onTouchCancel={(e) => { e.preventDefault(); onLeftEnd(); }}
          >
            <ChevronLeft className="w-12 h-12 text-green-400" />
          </button>
          <button
            className="w-20 h-20 bg-green-500/30 border-2 border-green-500 rounded-xl flex items-center justify-center active:bg-green-500/60 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onRightStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); onRightEnd(); }}
            onTouchCancel={(e) => { e.preventDefault(); onRightEnd(); }}
          >
            <ChevronRight className="w-12 h-12 text-green-400" />
          </button>
        </div>

        {/* Pause and Fire buttons */}
        <div className="flex gap-3 items-center pointer-events-auto">
          {onPause && (
            <button
              className="w-16 h-16 bg-yellow-500/30 border-2 border-yellow-500 rounded-xl flex items-center justify-center active:bg-yellow-500/60 touch-none select-none"
              onTouchStart={(e) => { e.preventDefault(); onPause(); }}
            >
              <Pause className="w-8 h-8 text-yellow-400" />
            </button>
          )}
          <button
            className="w-24 h-24 bg-red-500/40 border-2 border-red-500 rounded-full flex items-center justify-center active:bg-red-500/70 touch-none select-none"
            onTouchStart={(e) => { e.preventDefault(); onFire(); }}
          >
            <Crosshair className="w-12 h-12 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
