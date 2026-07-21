// Pixel glyphs shared by reward pedestals and any future inventory surfaces.
// Geometry is white so callers can tint one cached GraphicsContext per role.

import { GraphicsContext } from 'pixi.js';
import type { Role } from '../audio/kits';

const W = 0xffffff;
const D = 0x101522;

function rect(c: GraphicsContext, x: number, y: number, w: number, h: number): void {
  c.rect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).fill(W);
}

function dark(c: GraphicsContext, x: number, y: number, w: number, h: number): void {
  c.rect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).fill(D);
}

function diamond(c: GraphicsContext, x: number, y: number, r: number): void {
  const q = Math.round(r);
  c.poly([Math.round(x), Math.round(y - q), Math.round(x + q), Math.round(y), Math.round(x), Math.round(y + q), Math.round(x - q), Math.round(y)]).fill(W);
}

/** Draw a role's unmistakable pixel mark within half-extent `s`. */
export function drawWeaponIcon(c: GraphicsContext, role: Role, s: number): void {
  const u = Math.max(1, Math.round(s / 8));
  const p = (n: number): number => n * u;

  switch (role) {
    case 'kick':
      // Speaker cone: the low, booming pulse.
      rect(c, p(-6), p(-6), p(12), p(12));
      dark(c, p(-4), p(-4), p(8), p(8));
      rect(c, p(-2), p(-2), p(4), p(4));
      rect(c, p(-8), p(-1), p(2), p(2));
      rect(c, p(6), p(-1), p(2), p(2));
      break;
    case 'snare':
      // Drum with crossing snare wires.
      rect(c, p(-7), p(-5), p(14), p(3));
      rect(c, p(-7), p(3), p(14), p(3));
      rect(c, p(-6), p(-2), p(2), p(5));
      rect(c, p(4), p(-2), p(2), p(5));
      rect(c, p(-3), p(-2), p(2), p(5));
      rect(c, p(1), p(-2), p(2), p(5));
      break;
    case 'hat':
      // Two cymbal plates and their stand.
      rect(c, p(-7), p(-4), p(14), p(2));
      rect(c, p(-5), p(-2), p(10), p(2));
      rect(c, p(-1), p(0), p(2), p(7));
      rect(c, p(-4), p(6), p(8), p(2));
      break;
    case 'bass':
      // Heavy square wave.
      rect(c, p(-8), p(-2), p(3), p(6));
      rect(c, p(-5), p(-5), p(4), p(3));
      rect(c, p(-1), p(-2), p(4), p(3));
      rect(c, p(3), p(1), p(3), p(4));
      rect(c, p(6), p(-2), p(2), p(3));
      break;
    case 'chord':
      // Three notes played together as one punch.
      rect(c, p(-7), p(-6), p(14), p(3));
      rect(c, p(-7), p(-1), p(14), p(3));
      rect(c, p(-7), p(4), p(14), p(3));
      rect(c, p(-5), p(-7), p(2), p(15));
      break;
    case 'lead':
      // A melody note with a lightning-shaped flag.
      rect(c, p(-3), p(-6), p(2), p(11));
      rect(c, p(-6), p(3), p(5), p(4));
      rect(c, p(-1), p(-6), p(6), p(2));
      rect(c, p(3), p(-4), p(3), p(2));
      rect(c, p(1), p(-2), p(4), p(2));
      break;
    case 'clap':
      // Two hands meeting at a bright center.
      c.poly([p(-8), p(-5), p(-2), p(-1), p(-8), p(5), p(-5), p(7), p(0), p(1), p(-5), p(-7)]).fill(W);
      c.poly([p(8), p(-5), p(2), p(-1), p(8), p(5), p(5), p(7), p(0), p(1), p(5), p(-7)]).fill(W);
      rect(c, p(-1), p(-8), p(2), p(4));
      rect(c, p(-1), p(5), p(2), p(3));
      break;
    case 'tom':
      // Deep drum, wider at the shoulders.
      rect(c, p(-7), p(-6), p(14), p(3));
      rect(c, p(-5), p(-3), p(10), p(8));
      rect(c, p(-7), p(5), p(14), p(2));
      dark(c, p(-2), p(-1), p(4), p(3));
      break;
    case 'arp':
      // Four notes climbing one at a time.
      diamond(c, p(-6), p(5), p(2));
      diamond(c, p(-2), p(1), p(2));
      diamond(c, p(2), p(-3), p(2));
      diamond(c, p(6), p(-7), p(2));
      break;
    case 'crash':
      // Explosive cymbal star.
      c.poly([0, p(-8), p(2), p(-3), p(7), p(-6), p(4), p(-1), p(8), p(2), p(3), p(2), p(5), p(7), 0, p(4), p(-5), p(7), p(-3), p(2), p(-8), p(2), p(-4), p(-1), p(-7), p(-6), p(-2), p(-3)]).fill(W);
      break;
    case 'shaker':
      // Beaded capsule with grit pixels.
      rect(c, p(-6), p(-5), p(12), p(10));
      dark(c, p(-4), p(-3), p(8), p(6));
      rect(c, p(-3), p(-2), p(2), p(2));
      rect(c, p(1), p(-1), p(2), p(2));
      rect(c, p(-1), p(2), p(2), p(2));
      rect(c, p(6), p(-1), p(2), p(2));
      break;
    case 'acid':
      // Corrosive drop and jagged waveform.
      c.poly([0, p(-8), p(5), p(-1), p(4), p(5), 0, p(8), p(-4), p(5), p(-5), p(-1)]).fill(W);
      dark(c, p(-2), p(1), p(4), p(3));
      rect(c, p(-8), p(-1), p(3), p(2));
      rect(c, p(5), p(-4), p(3), p(2));
      break;
    case 'pluck':
      // A taut string being pulled sideways.
      rect(c, p(-7), p(-7), p(2), p(14));
      rect(c, p(5), p(-7), p(2), p(14));
      rect(c, p(-5), p(-1), p(6), p(2));
      rect(c, p(1), p(-3), p(4), p(2));
      diamond(c, p(1), p(-2), p(2));
      break;
    case 'rhodes':
      // Electric piano keys with a soft glow cap.
      rect(c, p(-8), p(-6), p(16), p(12));
      dark(c, p(-6), p(-4), p(12), p(8));
      for (let i = -5; i <= 5; i += 4) rect(c, p(i), p(0), p(2), p(4));
      rect(c, p(-5), p(-4), p(2), p(4));
      rect(c, p(1), p(-4), p(2), p(4));
      break;
    case 'riser':
      // Upward launch arrows.
      c.poly([0, p(-8), p(6), p(-2), p(2), p(-2), p(2), p(3), p(-2), p(3), p(-2), p(-2), p(-6), p(-2)]).fill(W);
      rect(c, p(-6), p(5), p(12), p(2));
      break;
  }
}
