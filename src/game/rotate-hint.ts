// First-open orientation nudge. Loop Survivors is built for a wide arena, and
// a portrait phone crops it to an uncomfortable slice — so the very first time
// a player opens the game on a phone held vertically, we ask them once to turn
// it sideways. Shown at most once ever (persisted flag), and only when it's
// actually relevant: a coarse-pointer device currently in portrait. On desktop,
// or once the phone is already landscape, it never appears. The card also
// dismisses itself the moment the player rotates to landscape.

const SHOWN_KEY = 'loop.rotatehint';

function el(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export function maybeShowRotateHint(root: HTMLElement): void {
  // Already shown once, or the media queries aren't available (non-browser): skip.
  if (typeof matchMedia === 'undefined') return;
  if (localStorage.getItem(SHOWN_KEY) === '1') return;

  const portrait = matchMedia('(orientation: portrait)');
  const coarse = matchMedia('(pointer: coarse)');
  // Only a phone-shaped, touch device held upright needs the nudge. A landscape
  // phone, a tablet in landscape, or any desktop gets nothing.
  if (!portrait.matches || !coarse.matches) return;

  // Consume the one-shot as soon as we decide to show it, so it can never
  // reappear on a later load.
  localStorage.setItem(SHOWN_KEY, '1');

  const overlay = el('div', 'rotate-hint', root);
  const card = el('div', 'rotate-hint-card', overlay);
  el('div', 'rotate-hint-icon', card, '📱');
  el('h2', '', card, 'Turn your phone sideways');
  el(
    'p',
    'sub',
    card,
    'Loop Survivors plays best in landscape. Rotate your phone to horizontal for a better view of the arena — vertical is cramped.',
  );
  const btn = el('button', 'big', card, 'Got it') as HTMLButtonElement;

  const close = (): void => {
    portrait.removeEventListener('change', onRotate);
    overlay.remove();
  };
  // If they rotate to landscape while the card is up, they've done the thing it
  // asked for — take it away without a tap.
  const onRotate = (): void => {
    if (!portrait.matches) close();
  };
  portrait.addEventListener('change', onRotate);
  btn.onclick = close;
}
