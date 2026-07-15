// Compact view-only glyphs for silent Gear. Names remain the source of truth;
// these marks only speed up recognition on ground tokens and in the rack.

import { GraphicsContext } from 'pixi.js';
import type { GearId } from './evolutions';

const W = 0xffffff;

export function drawGearIcon(c: GraphicsContext, gear: GearId, s: number): void {
  switch (gear) {
    case 'heavyBoots':
      c.roundRect(-s * 0.75, -s * 0.65, s * 0.65, s * 1.05, s * 0.12).fill(W);
      c.roundRect(-s * 0.75, s * 0.18, s * 1.45, s * 0.38, s * 0.12).fill(W);
      break;
    case 'laserSight':
      c.circle(0, 0, s * 0.65).stroke({ width: s * 0.14, color: W });
      c.moveTo(-s, 0).lineTo(s, 0).moveTo(0, -s).lineTo(0, s)
        .stroke({ width: s * 0.12, color: W });
      break;
    case 'needleCase':
      for (const x of [-0.55, 0, 0.55]) {
        c.moveTo(s * x, s * 0.8).lineTo(s * x, -s * 0.65)
          .stroke({ width: s * 0.12, color: W });
        c.poly([s * x, -s, s * (x - 0.15), -s * 0.6, s * (x + 0.15), -s * 0.6]).fill(W);
      }
      break;
    case 'gyroscope':
      c.ellipse(0, 0, s * 0.95, s * 0.42).stroke({ width: s * 0.13, color: W });
      c.ellipse(0, 0, s * 0.42, s * 0.95).stroke({ width: s * 0.13, color: W });
      c.circle(0, 0, s * 0.2).fill(W);
      break;
    case 'leadWeight':
      c.roundRect(-s * 0.75, -s * 0.5, s * 1.5, s * 1.2, s * 0.18).fill(W);
      c.arc(0, -s * 0.45, s * 0.42, Math.PI, Math.PI * 2)
        .stroke({ width: s * 0.16, color: W });
      break;
    case 'hourglass':
      c.moveTo(-s * 0.7, -s * 0.85).lineTo(s * 0.7, -s * 0.85)
        .lineTo(-s * 0.55, s * 0.85).lineTo(s * 0.7, s * 0.85)
        .stroke({ width: s * 0.14, color: W });
      break;
    case 'compass':
      c.circle(0, 0, s * 0.85).stroke({ width: s * 0.13, color: W });
      c.poly([0, -s * 0.72, s * 0.22, s * 0.18, 0, s * 0.05, -s * 0.22, s * 0.18]).fill(W);
      break;
    case 'boxingGloves':
      c.circle(-s * 0.25, -s * 0.1, s * 0.55).fill(W);
      c.roundRect(-s * 0.58, s * 0.3, s * 0.7, s * 0.42, s * 0.12).fill(W);
      c.circle(s * 0.45, -s * 0.35, s * 0.28).fill(W);
      break;
    case 'prism':
      c.poly([0, -s, s * 0.88, s * 0.68, -s * 0.88, s * 0.68]).stroke({ width: s * 0.15, color: W });
      c.moveTo(-s, -s * 0.1).lineTo(s, s * 0.1).stroke({ width: s * 0.12, color: W });
      break;
  }
}

