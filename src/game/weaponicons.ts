// Abstract weapon glyphs for the level-up ground picks. Each role gets one
// simple, gamified mark drawn into a GraphicsContext in white, so the caller
// can tint it to the weapon's identity color (mirroring the gem/glow pattern
// in view.ts). Purely cosmetic and view-only — never touched headless.
//
// Every glyph is drawn inside a box of half-extent `s` centered on (0,0). The
// name text under the item does the real disambiguating, so these only need to
// read as distinct silhouettes, not as literal instruments.

import { GraphicsContext } from 'pixi.js';
import type { Role } from '../audio/kits';

const W = 0xffffff;

/** Draw `role`'s glyph into `c`, sized to a half-extent of `s`, in white. */
export function drawWeaponIcon(c: GraphicsContext, role: Role, s: number): void {
  switch (role) {
    case 'kick': {
      // A booming disc inside a ring (a big low thump).
      c.circle(0, 0, s * 0.58).fill(W);
      c.circle(0, 0, s * 0.92).stroke({ width: s * 0.14, color: W });
      break;
    }
    case 'snare': {
      // Drumhead: a ring with a center line and snare-wire ticks below.
      c.circle(0, 0, s * 0.82).stroke({ width: s * 0.13, color: W });
      c.moveTo(-s * 0.82, 0).lineTo(s * 0.82, 0).stroke({ width: s * 0.13, color: W });
      for (let i = -2; i <= 2; i++) {
        const x = i * s * 0.3;
        c.moveTo(x, s * 0.18).lineTo(x, s * 0.6).stroke({ width: s * 0.09, color: W });
      }
      break;
    }
    case 'hat': {
      // Two cymbals slightly open, on a short stand.
      c.moveTo(0, -s * 0.05).lineTo(0, s * 0.85).stroke({ width: s * 0.12, color: W });
      c.ellipse(0, -s * 0.32, s * 0.85, s * 0.2).fill(W);
      c.ellipse(0, s * 0.04, s * 0.85, s * 0.2).fill(W);
      break;
    }
    case 'bass': {
      // A fat, slow low-end wave.
      wave(c, s, 1, s * 0.5, s * 0.22);
      break;
    }
    case 'chord': {
      // Three stacked notes struck together (a chord), as horizontal bars.
      for (let i = -1; i <= 1; i++) {
        c.roundRect(-s * 0.72, i * s * 0.5 - s * 0.15, s * 1.44, s * 0.3, s * 0.12).fill(W);
      }
      break;
    }
    case 'lead': {
      // A single melody note: head, stem, flag.
      c.ellipse(-s * 0.28, s * 0.5, s * 0.34, s * 0.26).fill(W);
      c.moveTo(-s * 0.02, s * 0.5).lineTo(-s * 0.02, -s * 0.7).stroke({ width: s * 0.12, color: W });
      c.moveTo(-s * 0.02, -s * 0.7)
        .quadraticCurveTo(s * 0.6, -s * 0.5, s * 0.4, s * 0.05)
        .stroke({ width: s * 0.12, color: W });
      break;
    }
    case 'clap': {
      // A hand-clap burst: radiating spokes around a small core.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        c.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3)
          .lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95)
          .stroke({ width: s * 0.14, color: W, cap: 'round' });
      }
      c.circle(0, 0, s * 0.2).fill(W);
      break;
    }
    case 'arp': {
      // An arpeggio climbing: four dots on a rising diagonal.
      for (let i = 0; i < 4; i++) {
        const x = -s * 0.7 + (i / 3) * s * 1.4;
        const y = s * 0.6 - (i / 3) * s * 1.2;
        c.circle(x, y, s * 0.2).fill(W);
      }
      break;
    }
    case 'shaker': {
      // A maraca: a hollow bulb with rattle dots and a stubby handle.
      c.ellipse(0, -s * 0.12, s * 0.58, s * 0.72).stroke({ width: s * 0.12, color: W });
      c.circle(-s * 0.18, -s * 0.2, s * 0.1).fill(W);
      c.circle(s * 0.16, -s * 0.05, s * 0.1).fill(W);
      c.circle(-s * 0.02, -s * 0.34, s * 0.1).fill(W);
      c.moveTo(0, s * 0.56).lineTo(0, s * 0.92).stroke({ width: s * 0.16, color: W, cap: 'round' });
      break;
    }
    case 'acid': {
      // A squelchy acid drop with a little wiggle tail.
      c.moveTo(0, -s * 0.85)
        .quadraticCurveTo(s * 0.62, -s * 0.1, s * 0.42, s * 0.35)
        .arc(0, s * 0.35, s * 0.42, 0, Math.PI)
        .quadraticCurveTo(-s * 0.62, -s * 0.1, 0, -s * 0.85)
        .fill(W);
      break;
    }
    case 'pluck': {
      // A plucked string: a taut line pinched to one side, plus the pluck point.
      c.moveTo(-s * 0.1, -s * 0.85)
        .quadraticCurveTo(s * 0.7, 0, -s * 0.1, s * 0.85)
        .stroke({ width: s * 0.12, color: W });
      c.circle(s * 0.42, 0, s * 0.16).fill(W);
      break;
    }
    case 'rhodes': {
      // Piano keys: three equal-height rounded bars side by side.
      for (let i = -1; i <= 1; i++) {
        c.roundRect(i * s * 0.5 - s * 0.18, -s * 0.7, s * 0.36, s * 1.4, s * 0.1).fill(W);
      }
      break;
    }
    case 'bell': {
      // A bell: a domed body with a flared lip and a clapper dot.
      c.moveTo(-s * 0.6, s * 0.45)
        .quadraticCurveTo(-s * 0.55, -s * 0.75, 0, -s * 0.8)
        .quadraticCurveTo(s * 0.55, -s * 0.75, s * 0.6, s * 0.45)
        .lineTo(-s * 0.6, s * 0.45)
        .fill(W);
      c.circle(0, s * 0.7, s * 0.16).fill(W);
      break;
    }
  }
}

/** A horizontal wave path (used by the bass glyph). `cycles` full periods
 *  across the box, amplitude `amp`, stroke width `width`. */
function wave(c: GraphicsContext, s: number, cycles: number, amp: number, width: number): void {
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -s * 0.9 + t * s * 1.8;
    const y = -Math.sin(t * cycles * Math.PI * 2) * amp;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke({ width, color: W, cap: 'round', join: 'round' });
}
