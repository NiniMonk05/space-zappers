import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { renderHook } from '@testing-library/react';
import { interpretKeyDown, isLeftHeld, isRightHeld, type KeyLike } from './input';
import { useReleaseKeysOnBlur } from '@/hooks/useReleaseKeysOnBlur';

function key(code: string, extra: Partial<KeyLike> = {}): KeyLike {
  return { code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...extra };
}

// Mirror Game.tsx: key-down adds the code for `move`, key-up deletes the code
function press(held: Set<string>, k: KeyLike) {
  if (interpretKeyDown(k, 'playing').action === 'move') held.add(k.code);
}

describe('key matching', () => {
  it('A/D work with Caps Lock or Shift (matched on code, not key)', () => {
    // With Caps Lock on, the browser reports key "D" but code "KeyD"
    const held = new Set<string>();
    press(held, key('KeyD'));
    expect(isRightHeld(held)).toBe(true);
    press(held, key('KeyA'));
    expect(isLeftHeld(held)).toBe(true);
  });

  it('holding D then pressing Shift does not leave D stuck', () => {
    const held = new Set<string>();
    press(held, key('KeyD')); // key "d"
    press(held, key('ShiftLeft'));
    // Key-up arrives as key "D" (shifted) but code "KeyD"
    held.delete('KeyD');
    held.delete('ShiftLeft');
    expect(isRightHeld(held)).toBe(false);
    expect(held.size).toBe(0);
  });

  it('arrows and Space are game keys while playing', () => {
    expect(interpretKeyDown(key('ArrowLeft'), 'playing')).toEqual({ action: 'move', preventDefault: true });
    expect(interpretKeyDown(key('Space'), 'playing')).toEqual({ action: 'fire', preventDefault: true });
    expect(interpretKeyDown(key('Escape'), 'playing')).toEqual({ action: 'pause', preventDefault: true });
  });
});

describe('pause handling', () => {
  it('only the pause key or Enter resumes', () => {
    expect(interpretKeyDown(key('Escape'), 'paused').action).toBe('resume');
    expect(interpretKeyDown(key('Enter'), 'paused').action).toBe('resume');
    for (const code of ['KeyX', 'ArrowLeft', 'Space', 'ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft', 'Tab', 'F5']) {
      expect(interpretKeyDown(key(code), 'paused').action, code).toBe('none');
    }
  });

  it('modifier combos never unpause and are never blocked', () => {
    expect(interpretKeyDown(key('Escape', { ctrlKey: true }), 'paused')).toEqual({ action: 'none', preventDefault: false });
    expect(interpretKeyDown(key('KeyR', { ctrlKey: true }), 'paused').preventDefault).toBe(false);
    expect(interpretKeyDown(key('KeyR', { ctrlKey: true }), 'playing').preventDefault).toBe(false);
    expect(interpretKeyDown(key('KeyR', { metaKey: true }), 'playing').preventDefault).toBe(false);
    expect(interpretKeyDown(key('ArrowLeft', { altKey: true }), 'playing')).toEqual({ action: 'none', preventDefault: false });
  });

  it('does not block browser keys such as F5', () => {
    for (const phase of ['playing', 'paused', 'inactive'] as const) {
      expect(interpretKeyDown(key('F5'), phase).preventDefault).toBe(false);
      expect(interpretKeyDown(key('Tab'), phase).preventDefault).toBe(false);
    }
  });

  it('holding Escape does not toggle pause through key repeat', () => {
    expect(interpretKeyDown(key('Escape', { repeat: true }), 'playing').action).toBe('none');
    expect(interpretKeyDown(key('Escape', { repeat: true }), 'paused').action).toBe('none');
    expect(interpretKeyDown(key('Enter', { repeat: true }), 'paused').action).toBe('none');
  });

  it('ignores keys when no game is running', () => {
    expect(interpretKeyDown(key('Space'), 'inactive')).toEqual({ action: 'none', preventDefault: false });
  });
});

describe('useReleaseKeysOnBlur', () => {
  it('clears held keys on blur and when the tab is hidden', () => {
    const { result } = renderHook(() => {
      const ref = useRef(new Set<string>());
      useReleaseKeysOnBlur(ref);
      return ref;
    });
    result.current.current.add('ArrowRight');
    window.dispatchEvent(new Event('blur'));
    expect(result.current.current.size).toBe(0);

    result.current.current.add('KeyA');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(result.current.current.size).toBe(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
});
