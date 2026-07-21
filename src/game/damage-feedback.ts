// Shared player take-damage feedback for every arena (normal run, sandbox,
// boss). One helper drives the red edge tint (a DOM `.hit-flash` element), the
// hit screenshake (a view that can shake), and the audio cue (a thud plus a dip
// of the music under it), all tuned from DAMAGE_FEEDBACK in config.ts. Keeping
// it in one place is why a landed hit feels identical whichever arena you are
// in — and why taking damage hits all three senses at once, which is the whole
// point: in a game where the weapons are the soundtrack, a hit that only
// flashes is a hit the player can tune out.

import { DAMAGE_FEEDBACK } from './config';

/** Any renderer that can absorb a hit shake. RunView and BossView both match
 *  this shape, so the same feedback call works in either arena. */
export interface Shakeable {
  pushShake(mag: number, durS: number): void;
}

/** The audio side of a hit. MusicEngine matches this shape; the interface keeps
 *  this module from depending on the engine itself. */
export interface DamageAudible {
  playHitCue(duckDepth: number, duckHoldS: number): void;
}

/** Fire the shared take-damage feedback: restart the red edge tint on
 *  `flashEl`, kick a screenshake on `view`, and play the hit cue on `audio`
 *  (each skipped when absent). Call this from an arena's `onHit` and nowhere
 *  else, so the feel stays in one place. */
export function pushDamageFeedback(
  flashEl: HTMLElement,
  view: Shakeable | null,
  audio: DamageAudible | null = null,
): void {
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
  audio?.playHitCue(fb.hitDuckDepth, fb.hitDuckS);
}
