// Shared player take-damage feedback for every arena (normal run, sandbox,
// boss). One helper drives the red edge tint (a DOM `.hit-flash` element) and
// the hit screenshake (a view that can shake), both tuned from DAMAGE_FEEDBACK
// in config.ts. Keeping it in one place is why a landed hit feels identical
// whichever arena you are in.

import { DAMAGE_FEEDBACK } from './config';

/** Any renderer that can absorb a hit shake. RunView and BossView both match
 *  this shape, so the same feedback call works in either arena. */
export interface Shakeable {
  pushShake(mag: number, durS: number): void;
}

/** Fire the shared take-damage feedback: restart the red edge tint on
 *  `flashEl` and kick a screenshake on `view` (when present). Call this from an
 *  arena's `onHit` and nowhere else, so the feel stays in one place. */
export function pushDamageFeedback(flashEl: HTMLElement, view: Shakeable | null): void {
  const fb = DAMAGE_FEEDBACK;
  // Push the tunable values onto the element; the CSS reads them as variables.
  flashEl.style.setProperty('--hit-flash-dur', `${fb.flashDurS}s`);
  flashEl.style.setProperty('--hit-flash-color', fb.flashColor);
  flashEl.style.setProperty('--hit-flash-intensity', `${fb.flashIntensity}`);
  // Remove, force a reflow, re-add: restarts the animation even on a hit that
  // lands mid-flash (rapid consecutive hits).
  flashEl.classList.remove('on');
  void flashEl.offsetWidth;
  flashEl.classList.add('on');
  view?.pushShake(fb.shakeMag, fb.shakeDurS);
}
