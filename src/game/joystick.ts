// Floating virtual joystick for touch play. Touch anywhere on the arena
// (the canvas, not the UI) and a stick appears under the finger; drag to
// move, analog deflection, lift to stop. Writes into touchAxis (input.ts).
// Desktop mouse input is ignored: only pointerType "touch"/"pen" summons it.

import { autoMove, touchAxis } from './input';

/** Max knob deflection in px; full deflection = full speed. */
const STICK_RADIUS = 56;
/** Deflections under this fraction are ignored (resting-finger jitter). */
const DEAD_ZONE = 0.12;

export function mountJoystick(root: HTMLElement): void {
  const base = document.createElement('div');
  base.className = 'joy-base hidden';
  const knob = document.createElement('div');
  knob.className = 'joy-knob';
  base.appendChild(knob);
  root.appendChild(base);

  let pointerId: number | null = null;
  let cx = 0;
  let cy = 0;

  const reset = (): void => {
    pointerId = null;
    touchAxis.active = false;
    touchAxis.x = 0;
    touchAxis.y = 0;
    base.classList.add('hidden');
  };

  root.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    if (e.pointerType === 'mouse') return;
    // auto-move runs take the movement verb away: no stick appears
    if (autoMove.active) return;
    // only arena touches: taps on buttons, cards, and panels stay taps
    if (!(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault();
    pointerId = e.pointerId;
    cx = e.clientX;
    cy = e.clientY;
    base.style.left = `${cx}px`;
    base.style.top = `${cy}px`;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.remove('hidden');
    touchAxis.active = true;
    touchAxis.x = 0;
    touchAxis.y = 0;
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const mag = Math.hypot(dx, dy);
    if (mag > STICK_RADIUS) {
      dx *= STICK_RADIUS / mag;
      dy *= STICK_RADIUS / mag;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const deflect = Math.min(mag / STICK_RADIUS, 1);
    if (deflect < DEAD_ZONE) {
      touchAxis.x = 0;
      touchAxis.y = 0;
    } else {
      const inv = 1 / (Math.hypot(dx, dy) || 1);
      touchAxis.x = dx * inv * deflect;
      touchAxis.y = dy * inv * deflect;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === pointerId) reset();
  });
  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointerId) reset();
  });
  window.addEventListener('blur', reset);
}
