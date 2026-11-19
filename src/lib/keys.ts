/** Keyboard rules shared by the game screen. */

const CONTROLS = 'button, a, input, textarea, select, summary, [role="button"], [role="menuitem"], [role="option"], [contenteditable="true"]';
const TYPING = 'input, textarea, select, [contenteditable="true"]';
/** Radix renders dialogs, dropdown menus and select lists with these roles while they are open. */
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

const targetOf = (e: KeyboardEvent) => (e.target instanceof Element ? e.target : null);

/**
 * Fire / start: the Space bar, or Enter. Enter is what a TV remote's OK button sends, so the
 * game is playable from a sofa. Enter keeps its normal job while a button, link or text field
 * has focus (pressing a focused button, submitting a form), so it only fires from the game.
 */
export function isFireKey(e: KeyboardEvent): boolean {
  if (e.key === ' ') return true;
  if (e.key !== 'Enter') return false;
  return !targetOf(e)?.closest(CONTROLS);
}

/**
 * The key is not for the game: the player is typing in a field, or a dialog or menu is open.
 * The game must then leave the key alone: no move, no shot, no unpause, and no preventDefault
 * (so Tab, Enter on a Close button, and the letters a and d in a text field all work).
 */
export function keyBelongsElsewhere(e: KeyboardEvent, root: ParentNode = document): boolean {
  if (targetOf(e)?.closest(TYPING)) return true;
  return root.querySelector(OVERLAYS) !== null;
}
