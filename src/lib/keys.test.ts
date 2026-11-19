import { afterEach, describe, expect, it } from 'vitest';
import { isFireKey, keyBelongsElsewhere } from './keys';

/** A keydown as the window listener sees it, dispatched from an element built from `html`. */
function press(key: string, html = '<div id="t"></div>'): KeyboardEvent {
  document.body.innerHTML = html;
  const target = document.getElementById('t') ?? document.body;
  let seen!: KeyboardEvent;
  const listener = (e: Event) => { seen = e as KeyboardEvent; };
  window.addEventListener('keydown', listener);
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.removeEventListener('keydown', listener);
  return seen;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('isFireKey', () => {
  it('fires on Space, and on Enter from the game itself', () => {
    expect(isFireKey(press(' '))).toBe(true);
    expect(isFireKey(press('Enter'))).toBe(true);
    expect(isFireKey(press('a'))).toBe(false);
  });

  it.each(['<button id="t">Mute</button>', '<a id="t" href="#">Scores</a>', '<input id="t" />', '<textarea id="t"></textarea>',
    '<div role="menuitem" id="t">Log out</div>', '<button><span id="t">icon</span></button>'])('leaves Enter to %s', (html) => {
    expect(isFireKey(press('Enter', html))).toBe(false);
  });
});

describe('keyBelongsElsewhere', () => {
  it('is false in plain play', () => {
    expect(keyBelongsElsewhere(press('ArrowLeft'))).toBe(false);
    expect(keyBelongsElsewhere(press(' ', '<button id="t">Mute</button>'))).toBe(false);
  });

  it('is true while the player types, for any key', () => {
    for (const key of ['a', 'd', ' ', 'Enter']) {
      expect(keyBelongsElsewhere(press(key, '<input id="t" />'))).toBe(true);
      expect(keyBelongsElsewhere(press(key, '<textarea id="t"></textarea>'))).toBe(true);
    }
  });

  it('is true while a dialog or menu is open, wherever the focus is', () => {
    expect(keyBelongsElsewhere(press('Enter', '<div role="dialog"><button id="t">Close</button></div>'))).toBe(true);
    expect(keyBelongsElsewhere(press('Tab', '<div id="t"></div><div role="dialog"></div>'))).toBe(true);
    expect(keyBelongsElsewhere(press('ArrowDown', '<div id="t"></div><div role="menu"></div>'))).toBe(true);
  });
});
