import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TouchControls } from './TouchControls';
import { createInitialState, tickGame } from '@/lib/gameEngine';

function renderControls() {
  const onFire = vi.fn();
  const onFireEnd = vi.fn();
  const noop = () => {};
  const { container } = render(
    <TouchControls
      onLeftStart={noop}
      onLeftEnd={noop}
      onRightStart={noop}
      onRightEnd={noop}
      onFire={onFire}
      onFireEnd={onFireEnd}
      onPause={noop}
    />
  );
  // The fire button is the round one
  const fire = container.querySelector('button.rounded-full')!;
  return { fire, onFire, onFireEnd };
}

describe('touch fire button', () => {
  it('reports press and release, so the page can fire while it is held', () => {
    const { fire, onFire, onFireEnd } = renderControls();
    fireEvent.touchStart(fire);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFireEnd).not.toHaveBeenCalled();
    fireEvent.touchEnd(fire);
    expect(onFireEnd).toHaveBeenCalledTimes(1);
  });

  it('a cancelled touch also releases fire', () => {
    const { fire, onFireEnd } = renderControls();
    fireEvent.touchStart(fire);
    fireEvent.touchCancel(fire);
    expect(onFireEnd).toHaveBeenCalledTimes(1);
  });

  it('holding fire shoots again as soon as the last shot is gone, never two at once', () => {
    // What the page does while the button is held: request fire on every tick
    const state = createInitialState();
    state.levelBannerTicks = 0;
    state.player.x = 0; // Up the empty left edge, so each shot flies its full length
    const held = { left: false, right: false, fire: true };
    let shots = 0;
    for (let i = 0; i < 300; i++) {
      shots += tickGame(state, held, () => 0.99).filter((e) => e.type === 'shot').length;
      expect(state.bullets.filter((b) => b.direction === 'up').length).toBeLessThanOrEqual(1);
    }
    expect(shots).toBeGreaterThanOrEqual(4);
  });
});
