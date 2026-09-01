import { useEffect } from 'react';

const AXIS_THRESHOLD = 0.35;

type ControlKey = 'ArrowLeft' | 'ArrowRight' | ' ' | 'Escape';

function dispatchKey(key: ControlKey, pressed: boolean): void {
  window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { key }));
}

export function useGamepadControls(): void {
  useEffect(() => {
    let animationFrame = 0;
    const activeKeys = new Set<ControlKey>();

    const updateKey = (key: ControlKey, pressed: boolean): void => {
      if (pressed === activeKeys.has(key)) return;

      if (pressed) {
        activeKeys.add(key);
      } else {
        activeKeys.delete(key);
      }
      dispatchKey(key, pressed);
    };

    const poll = (): void => {
      const gamepad = navigator.getGamepads?.().find((pad) => pad !== null);
      const horizontalAxis = gamepad?.axes[0] ?? 0;

      updateKey('ArrowLeft', !!gamepad && (horizontalAxis < -AXIS_THRESHOLD || !!gamepad.buttons[14]?.pressed));
      updateKey('ArrowRight', !!gamepad && (horizontalAxis > AXIS_THRESHOLD || !!gamepad.buttons[15]?.pressed));
      updateKey(' ', !!gamepad?.buttons[0]?.pressed);
      updateKey('Escape', !!gamepad?.buttons[9]?.pressed);

      animationFrame = requestAnimationFrame(poll);
    };

    animationFrame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(animationFrame);
      for (const key of activeKeys) dispatchKey(key, false);
    };
  }, []);
}
