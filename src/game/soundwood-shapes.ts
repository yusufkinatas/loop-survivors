// Cached pixel geometry for the Midnight Neon Soundwood world renderer.
// High-count entities remain one Graphics each and share GraphicsContexts.

import { Container, Graphics, GraphicsContext, Text, TextStyle } from 'pixi.js';
import { ROLE_COLORS, type Role } from '../audio/kits';
import type { Enemy, Gem, HealthPickup, MusicNotePickup, Projectile, StageMagnetPickup, Zone } from './run';
import { SOUNDWOOD, hash2, regularPixelPoly, snap } from './soundwood-art';
import { drawWeaponIcon } from './weaponicons';

const shapes = new Map<string, GraphicsContext>();

function cachedPixelShape(key: string, draw: (ctx: GraphicsContext) => void): GraphicsContext {
  let context = shapes.get(key);
  if (!context) {
    context = new GraphicsContext();
    draw(context);
    shapes.set(key, context);
  }
  return context;
}

function pixelGraphics(context: GraphicsContext): Graphics {
  return new Graphics({ context, roundPixels: true });
}

function box(
  g: GraphicsContext,
  x: number,
  y: number,
  width: number,
  height: number,
  color = 0xffffff,
  alpha = 1,
): void {
  g.rect(snap(x), snap(y), Math.max(1, snap(width)), Math.max(1, snap(height))).fill({ color, alpha });
}

function pixelDiamond(g: GraphicsContext, x: number, y: number, radius: number, color: number): void {
  const r = snap(radius);
  g.poly([snap(x), snap(y - r), snap(x + r), snap(y), snap(x), snap(y + r), snap(x - r), snap(y)]).fill(color);
}

function makePixelGlow(radius: number, color: number, alpha = 0.25): Graphics {
  const r = Math.max(2, snap(radius));
  const gfx = pixelGraphics(cachedPixelShape('glow:' + r, (g) => {
    g.poly(regularPixelPoly(12, r, Math.PI / 12)).fill(0xffffff);
  }));
  gfx.tint = color;
  gfx.alpha = alpha;
  gfx.blendMode = 'add';
  return gfx;
}

export interface EnemyGfx extends Graphics {
  __shield: boolean;
  __frame: number;
  /** The radius this silhouette was drawn at. Body size is fixed for a run's
   *  lifetime under normal play, but the enemy lab resizes live enemies, and a
   *  cached context keyed on the old radius would keep the old silhouette. */
  __radius: number;
}

function darkSilhouette(g: GraphicsContext, points: number[]): void {
  g.poly(points.map(snap)).fill(SOUNDWOOD.ink);
}

function hushFeet(g: GraphicsContext, r: number, frame: number, wide = 0.62): void {
  const step = frame ? r * 0.13 : -r * 0.13;
  box(g, -r * wide + step, r * 0.5, r * 0.34, r * 0.44, SOUNDWOOD.ink);
  box(g, r * (wide - 0.34) - step, r * 0.5, r * 0.34, r * 0.44, SOUNDWOOD.ink);
  box(g, -r * wide + step + 2, r * 0.53, Math.max(2, r * 0.19), r * 0.26, 0xffffff);
  box(g, r * (wide - 0.34) - step + 2, r * 0.53, Math.max(2, r * 0.19), r * 0.26, 0xffffff);
}

function hushMite(g: GraphicsContext, r: number, frame: number, variant: 0 | 1 | 2): void {
  const pulse = frame ? 1 : 0.84;
  const width = variant === 0 ? 0.9 : variant === 1 ? 1.12 : 1.28;
  // Antenna plugs and four feet make a grounded bug-like machine, never wings.
  box(g, -r * 0.55, -r * 1.04, r * 0.18, r * 0.42, SOUNDWOOD.ink);
  box(g, r * 0.37, -r * 1.04, r * 0.18, r * 0.42, SOUNDWOOD.ink);
  pixelDiamond(g, -r * 0.46, -r * 1.06, r * 0.12, 0xffffff);
  pixelDiamond(g, r * 0.46, -r * 1.06, r * 0.12, 0xffffff);
  darkSilhouette(g, [
    0, -r * 0.88, r * width, -r * 0.42, r * width * pulse, r * 0.48,
    r * 0.5, r * 0.78, -r * 0.5, r * 0.78, -r * width * pulse, r * 0.48,
    -r * width, -r * 0.42,
  ]);
  g.poly([
    0, -r * 0.65, r * width * 0.76, -r * 0.3, r * width * 0.72 * pulse, r * 0.34,
    r * 0.38, r * 0.56, -r * 0.38, r * 0.56, -r * width * 0.72 * pulse, r * 0.34,
    -r * width * 0.76, -r * 0.3,
  ].map(snap)).fill(0xffffff);
  if (variant === 2) {
    box(g, -r * 0.72, -r * 0.08, r * 1.44, r * 0.22, SOUNDWOOD.ink);
    box(g, -r * 0.12, -r * 0.54, r * 0.24, r * 0.82, SOUNDWOOD.ink);
  } else {
    box(g, -r * 0.36, -r * 0.16, r * 0.2, r * 0.18, SOUNDWOOD.ink);
    box(g, r * 0.16, -r * 0.16, r * 0.2, r * 0.18, SOUNDWOOD.ink);
  }
  hushFeet(g, r, frame, width * 0.7);
}

function hushCabinet(g: GraphicsContext, r: number, cracked: boolean, frame: number): void {
  const lean = frame ? 1 : -1;
  box(g, -r * 0.94 + lean, -r * 0.94, r * 1.88, r * 1.84, SOUNDWOOD.ink);
  box(g, -r * 0.75 + lean, -r * 0.75, r * 1.5, r * 1.45, 0xffffff);
  for (const y of [-0.4, 0.32]) {
    g.poly(regularPixelPoly(8, r * (y < 0 ? 0.4 : 0.48), Math.PI / 8)
      .map((value, i) => snap(value + (i % 2 === 0 ? lean : r * y))))
      .fill(SOUNDWOOD.ink);
    pixelDiamond(g, lean, r * y, r * 0.13, 0xffffff);
  }
  if (cracked) {
    g.poly([r * 0.55, -r * 0.72, r * 0.13, -r * 0.2, r * 0.46, r * 0.08, -r * 0.06, r * 0.66].map(snap))
      .stroke({ width: Math.max(2, snap(r * 0.13)), color: SOUNDWOOD.ink });
    box(g, -r * 0.94, -r * 0.94, r * 0.42, r * 0.28, SOUNDWOOD.ink);
  } else {
    for (const x of [-0.58, -0.25, 0.36]) {
      box(g, r * x, -r * 1.14, r * 0.18, r * 0.38, 0xffffff);
      pixelDiamond(g, r * (x + 0.08), -r * 1.16, r * 0.14, 0xffffff);
    }
  }
  hushFeet(g, r, frame, 0.72);
}

function hushWalker(g: GraphicsContext, r: number, frame: number, jack: boolean): void {
  const step = frame ? r * 0.17 : -r * 0.17;
  if (jack) {
    // Tall connector on rigid stilts with cable bands, no bones.
    box(g, -r * 0.52, -r * 1.12, r * 1.04, r * 1.55, SOUNDWOOD.ink);
    box(g, -r * 0.34, -r * 0.92, r * 0.68, r * 1.12, 0xffffff);
    box(g, -r * 0.28, -r * 1.4, r * 0.18, r * 0.48, SOUNDWOOD.ink);
    box(g, r * 0.1, -r * 1.4, r * 0.18, r * 0.48, SOUNDWOOD.ink);
    for (const y of [-0.55, -0.08, 0.28]) box(g, -r * 0.62, r * y, r * 1.24, r * 0.12, SOUNDWOOD.ink);
  } else {
    // Lopsided cable spool with plug head and dangling cable arms.
    g.poly(regularPixelPoly(10, r * 0.78, Math.PI / 10)).fill(SOUNDWOOD.ink);
    box(g, -r * 0.52, -r * 0.62, r * 1.04, r * 1.12, 0xffffff);
    g.poly(regularPixelPoly(8, r * 0.35, Math.PI / 8)).fill(SOUNDWOOD.ink);
    box(g, -r * 0.24, -r * 1.22, r * 0.48, r * 0.52, SOUNDWOOD.ink);
    box(g, -r * 0.12, -r * 1.42, r * 0.09, r * 0.28, 0xffffff);
    box(g, r * 0.06, -r * 1.42, r * 0.09, r * 0.28, 0xffffff);
    g.poly([-r * 0.48, -r * 0.2, -r * 1.02, r * 0.12, -r * 0.78, r * 0.62].map(snap))
      .stroke({ width: Math.max(2, snap(r * 0.16)), color: SOUNDWOOD.ink });
    g.poly([r * 0.48, -r * 0.18, r * 1.04, r * 0.34, r * 0.86, r * 0.82].map(snap))
      .stroke({ width: Math.max(2, snap(r * 0.16)), color: SOUNDWOOD.ink });
  }
  box(g, -r * 0.45 + step, r * 0.35, r * 0.28, r * 0.78, SOUNDWOOD.ink);
  box(g, r * 0.17 - step, r * 0.35, r * 0.28, r * 0.78, SOUNDWOOD.ink);
  box(g, -r * 0.37 + step, r * 0.42, r * 0.12, r * 0.54, 0xffffff);
  box(g, r * 0.25 - step, r * 0.42, r * 0.12, r * 0.54, 0xffffff);
}

/** Body radii at which the white boss ring sits. Lifted verbatim from the ring
 *  that used to be baked into Shearjaw's silhouette, so the 5:00 boss is
 *  unchanged and every other boss spawn now reads the same way. */
export const BOSS_RING_SCALE = 1.72;

/** The Hush: living interference assembled from abandoned stage hardware,
 * static, cables, wood rot, and broken light. Stable simulation IDs preserve
 * behavior; every live silhouette and player-facing name is project-native. */
export function enemyContext(e: Enemy, shieldOn: boolean, frame: number): GraphicsContext {
  const r = Math.max(4, snap(e.radius));
  const shieldKey = e.kind === 'shielded' ? (shieldOn ? ':shield' : ':bare') : '';
  const spinKey = e.kind === 'circler' ? `:spin${e.spin}` : '';
  // Boss marking rides on the spawn, not the kind (mad-forest-spec 2a/2e), so
  // it has to be part of the shape key: the same kind draws with and without.
  const bossKey = e.spawnClass === 'boss' ? ':boss' : '';
  return cachedPixelShape(`hush:${e.kind}:${e.band}:${r}:${frame}${shieldKey}${spinKey}${bossKey}`, (g) => {
    box(g, -r, r * 0.66, r * 2, Math.max(2, r * 0.32), SOUNDWOOD.ink, 0.68);
    switch (e.kind) {
      case 'bat': hushMite(g, r, frame, 0); break;
      case 'redBat': hushMite(g, r, frame, 1); break;
      case 'redBat2': hushMite(g, r, frame, 2); break;
      case 'zombie': hushWalker(g, r, frame, false); break;
      case 'skeleton': hushWalker(g, r, frame, true); break;
      case 'greenMudman': hushCabinet(g, r, false, frame); break;
      case 'grayMudman': hushCabinet(g, r, true, frame); break;
      // The practice target is a cabinet with its step pinned: it never walks.
      case 'dummy': hushCabinet(g, r, false, 0); break;
      case 'ghost': {
        // Three displaced glass panes sell phasing without a face or sheet tail.
        const offset = frame ? r * 0.18 : -r * 0.18;
        for (const [x, y, alpha] of [[-0.48, 0.2, 0.32], [0.42, -0.18, 0.5], [0, 0, 1]] as const) {
          g.poly([0, -r, r * 0.72, -r * 0.25, r * 0.42, r, -r * 0.42, r, -r * 0.72, -r * 0.25]
            .map((value, i) => snap(value + (i % 2 === 0 ? r * x + offset : r * y))))
            .stroke({ width: Math.max(2, snap(r * 0.14)), color: i32White(), alpha });
        }
        pixelDiamond(g, offset, 0, r * 0.23, 0xffffff);
        break;
      }
      case 'flower': {
        // Eight rectangular speaker petals around a crossed-out mute core.
        const open = frame ? 0.8 : 0.64;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          const x = Math.cos(a) * r * open;
          const y = Math.sin(a) * r * open;
          pixelDiamond(g, x, y, r * 0.38, SOUNDWOOD.ink);
          pixelDiamond(g, x, y, r * 0.25, 0xffffff);
        }
        g.poly(regularPixelPoly(8, r * 0.55, Math.PI / 8)).fill(SOUNDWOOD.ink);
        box(g, -r * 0.34, -r * 0.08, r * 0.68, r * 0.16, 0xffffff);
        box(g, -r * 0.08, -r * 0.34, r * 0.16, r * 0.68, 0xffffff);
        break;
      }
      case 'glowingBat': {
        // Floating antenna tower with scanning crown bars.
        darkSilhouette(g, [0, -r * 1.3, r * 0.86, r * 0.45, r * 0.44, r, -r * 0.44, r, -r * 0.86, r * 0.45]);
        g.poly([0, -r, r * 0.6, r * 0.38, r * 0.3, r * 0.72, -r * 0.3, r * 0.72, -r * 0.6, r * 0.38].map(snap)).fill(0xffffff);
        for (let i = 0; i < 3; i++) box(g, -r * (0.72 + i * 0.12), -r * (1.05 + i * 0.25) + (frame ? 2 : 0), r * (1.44 + i * 0.24), r * 0.1, 0xffffff, 0.9 - i * 0.2);
        pixelDiamond(g, 0, -r * 1.55, r * 0.2, 0xffffff);
        break;
      }
      case 'mantis': {
        // Huge broken truss shears around a hard rectangular signal core.
        const flex = frame ? r * 0.08 : 0;
        const left = [-r * 1.5, -r * 1.05 - flex, -r * 0.3, -r * 0.28, -r * 1.42, r * 1.04 + flex, -r * 0.82, r * 1.26, 0, r * 0.32];
        const right = left.map((value, i) => i % 2 === 0 ? -value : value);
        darkSilhouette(g, left);
        darkSilhouette(g, right);
        g.poly(left.map((value, i) => snap(value * (i % 2 === 0 ? 0.76 : 0.82)))).fill(0xffffff);
        g.poly(right.map((value, i) => snap(value * (i % 2 === 0 ? 0.76 : 0.82)))).fill(0xffffff);
        box(g, -r * 0.5, -r * 0.65, r, r * 1.3, SOUNDWOOD.ink);
        box(g, -r * 0.32, -r * 0.45, r * 0.64, r * 0.9, 0xffffff);
        box(g, -r * 0.12, -r * 0.34, r * 0.24, r * 0.68, SOUNDWOOD.ink);
        break;
      }
      case 'batSwarm': {
        const jag = frame ? r * 0.22 : 0;
        darkSilhouette(g, [r * 1.8, 0, r * 0.42, -r * 0.9 + jag, r * 0.1, -r * 0.32, -r * 1.2, -r * 0.72, -r * 0.55, 0, -r * 1.2, r * 0.72, r * 0.1, r * 0.32, r * 0.42, r * 0.9 - jag]);
        g.poly([r * 1.42, 0, r * 0.34, -r * 0.58 + jag, r * 0.05, -r * 0.18, -r * 0.78, -r * 0.44, -r * 0.38, 0, -r * 0.78, r * 0.44, r * 0.05, r * 0.18, r * 0.34, r * 0.58 - jag].map(snap)).fill(0xffffff);
        for (const y of [-0.58, 0, 0.58]) box(g, -r * 1.7, r * y, r * 0.58, 2, 0xffffff, 0.58);
        break;
      }
      case 'swarmer': {
        pixelDiamond(g, 0, 0, r * 1.15, SOUNDWOOD.ink);
        pixelDiamond(g, 0, 0, r * 0.82, 0xffffff);
        g.poly([-r * 0.58, -r * 0.25, 0, r * 0.12, -r * 0.18, r * 0.7].map(snap))
          .stroke({ width: Math.max(2, snap(r * 0.16)), color: SOUNDWOOD.ink });
        hushFeet(g, r, frame, 0.64);
        break;
      }
      case 'tank':
        hushCabinet(g, r, false, frame);
        box(g, -r * 1.08, -r * 1.08, r * 2.16, r * 0.24, SOUNDWOOD.ink);
        box(g, r * 0.48, -r * 1.42, r * 0.16, r * 0.42, 0xffffff);
        break;
      case 'darter': {
        // Audio plug / needle nose with a forked tail.
        darkSilhouette(g, [r * 1.9, 0, r * 0.72, -r * 0.64, -r * 0.85, -r * 0.52, -r * 1.28, -r, -r * 1.05, 0, -r * 1.28, r, -r * 0.85, r * 0.52, r * 0.72, r * 0.64]);
        g.poly([r * 1.48, 0, r * 0.56, -r * 0.38, -r * 0.7, -r * 0.34, -r * 0.92, -r * 0.64, -r * 0.78, 0, -r * 0.92, r * 0.64, -r * 0.7, r * 0.34, r * 0.56, r * 0.38].map(snap)).fill(0xffffff);
        box(g, r * 1.35, -r * 0.16, r * 0.55, r * 0.32, SOUNDWOOD.ink);
        break;
      }
      case 'splitter': {
        g.poly(regularPixelPoly(8, r * 1.16, Math.PI / 8)).fill(SOUNDWOOD.ink);
        g.poly(regularPixelPoly(8, r * 0.88, Math.PI / 8)).fill(0xffffff);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          g.poly([0, 0, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82].map(snap))
            .stroke({ width: Math.max(2, snap(r * 0.15)), color: SOUNDWOOD.ink });
          pixelDiamond(g, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.14, SOUNDWOOD.ink);
        }
        break;
      }
      case 'circler': {
        g.poly(regularPixelPoly(12, r * 1.16, Math.PI / 12)).fill(SOUNDWOOD.ink);
        g.poly([r * 0.96, -r * 0.72, r * 0.2, -r * 0.98, -r * 0.72, -r * 0.65, -r * 0.92, 0, -r * 0.72, r * 0.65, r * 0.2, r * 0.98, r * 0.96, r * 0.72, r * 0.52, r * 0.28, r * 0.52, -r * 0.28].map(snap)).fill(0xffffff);
        pixelDiamond(g, -r * 0.1, 0, r * 0.34, SOUNDWOOD.ink);
        pixelDiamond(g, -r * 0.1, 0, r * 0.13, 0xffffff);
        box(g, r * 0.88, e.spin > 0 ? -r * 0.6 : r * 0.4, r * 0.62, r * 0.18, 0xffffff);
        break;
      }
      case 'shielded': {
        g.poly(regularPixelPoly(8, r * 1.05, Math.PI / 8)).fill(SOUNDWOOD.ink);
        g.poly(regularPixelPoly(8, r * 0.76, Math.PI / 8)).fill(0xffffff);
        pixelDiamond(g, 0, 0, r * 0.3, SOUNDWOOD.ink);
        if (shieldOn) {
          g.poly(regularPixelPoly(12, r * 1.5, Math.PI / 12)).stroke({ width: Math.max(3, snap(r * 0.15)), color: 0xffffff, alpha: 0.92 });
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            const x = Math.cos(a) * r * 1.5;
            const y = Math.sin(a) * r * 1.5;
            box(g, x - r * 0.18, y - r * 0.28, r * 0.36, r * 0.56, SOUNDWOOD.ink);
            box(g, x - r * 0.08, y - r * 0.18, r * 0.16, r * 0.36, 0xffffff);
          }
        } else {
          g.poly([-r * 0.6, -r * 0.5, 0, -r * 0.08, r * 0.52, r * 0.62].map(snap))
            .stroke({ width: Math.max(2, snap(r * 0.14)), color: SOUNDWOOD.ink });
        }
        break;
      }
      case 'elite': {
        box(g, -r * 0.86, -r * 1.08, r * 1.72, r * 2.08, SOUNDWOOD.ink);
        box(g, -r * 0.6, -r * 0.82, r * 1.2, r * 1.52, 0xffffff);
        box(g, -r * 0.32, -r * 0.62, r * 0.64, r * 1.1, SOUNDWOOD.ink);
        box(g, -r * 0.1, -r * 0.48, r * 0.2, r * 0.82, 0xffffff);
        for (const x of [-0.62, 0, 0.62]) pixelDiamond(g, r * x, -r * 1.22, r * 0.22, 0xffffff);
        g.poly(regularPixelPoly(12, r * 1.36, Math.PI / 12)).stroke({ width: Math.max(3, snap(r * 0.1)), color: 0xffffff, alpha: 0.72 });
        break;
      }
    }
    // A boss wears the ring instead of the danger diamonds: one read per body.
    if (e.spawnClass === 'boss') {
      g.poly(regularPixelPoly(12, r * BOSS_RING_SCALE, Math.PI / 12))
        .stroke({ width: Math.max(3, snap(r * 0.11)), color: 0xffffff, alpha: 0.78 });
    } else if (e.band >= 2 && e.kind !== 'elite') {
      const marker = Math.max(2, r * 0.15);
      pixelDiamond(g, -r * 0.78, -r * 0.82, marker, 0xffffff);
      if (e.band >= 3) pixelDiamond(g, r * 0.78, -r * 0.82, marker, 0xffffff);
    }
  });
}

function i32White(): number {
  return 0xffffff;
}

export function makeEnemyGfx(e: Enemy, frame: number): EnemyGfx {
  const shield = e.shieldHp > 0;
  const gfx = pixelGraphics(enemyContext(e, shield, frame)) as EnemyGfx;
  gfx.tint = e.color;
  gfx.__shield = shield;
  gfx.__frame = frame;
  gfx.__radius = e.radius;
  if (e.kind === 'ghost') gfx.alpha = 0.82;
  return gfx;
}

function projectileContext(pr: Projectile, evolved: boolean): GraphicsContext {
  const r = Math.max(3, snap(pr.radius));
  return cachedPixelShape('shot:' + pr.role + ':' + r + ':' + (evolved ? 'e' : 'n'), (g) => {
    switch (pr.role) {
      case 'snare':
        box(g, -r * 2.2, -r * 0.75, r * 4.4, r * 1.5, SOUNDWOOD.ink);
        box(g, -r * 1.9, -r * 0.42, r * 3.8, r * 0.84, 0xffffff);
        pixelDiamond(g, r * 2.1, 0, r * 0.65, 0xffffff);
        break;
      case 'hat':
      case 'shaker':
        box(g, -r * 2.4, -r * 0.55, r * 4.8, r * 1.1, SOUNDWOOD.ink);
        box(g, -r * 1.9, -r * 0.26, r * 3.8, Math.max(2, r * 0.52), 0xffffff);
        box(g, r * 1.35, -r * 0.72, r * 0.42, r * 1.44, 0xffffff);
        break;
      case 'bass':
        // An open equalizer wave: a dark edge, not a huge opaque disc. The
        // projectile keeps its heavy footprint while the horde stays visible
        // through the generous negative space above and below the center bar.
        g.poly(regularPixelPoly(12, r * 1.28, Math.PI / 12))
          .stroke({ width: Math.max(3, snap(r * 0.16)), color: SOUNDWOOD.ink, alpha: 0.9 });
        box(g, -r * 1.2, -r * 0.2, r * 2.4, r * 0.4, SOUNDWOOD.ink);
        box(g, -r * 1.05, -r * 0.09, r * 2.1, Math.max(2, r * 0.18), 0xffffff);
        for (const [x, height] of [[-0.72, 0.62], [-0.28, 0.92], [0.28, 0.92], [0.72, 0.62]] as const) {
          box(g, r * x - r * 0.08, -r * height / 2, r * 0.16, r * height, 0xffffff, 0.78);
        }
        pixelDiamond(g, -r * 1.28, 0, r * 0.2, 0xffffff);
        pixelDiamond(g, r * 1.28, 0, r * 0.2, 0xffffff);
        break;
      case 'lead':
      case 'pluck':
        darkSilhouette(g, [r * 2.1, 0, -r * 0.9, r, -r * 0.48, 0, -r * 0.9, -r]);
        g.poly([r * 1.7, 0, -r * 0.62, r * 0.65, -r * 0.28, 0, -r * 0.62, -r * 0.65].map(snap)).fill(0xffffff);
        break;
      case 'arp':
        g.poly(regularPixelPoly(10, r * 1.35, Math.PI / 10)).fill(SOUNDWOOD.ink);
        g.poly(regularPixelPoly(10, r, Math.PI / 10)).fill(0xffffff);
        pixelDiamond(g, 0, 0, r * 0.45, SOUNDWOOD.ink);
        break;
      case 'crash':
        pixelDiamond(g, 0, 0, r * 1.75, SOUNDWOOD.ink);
        pixelDiamond(g, 0, 0, r * 1.3, 0xffffff);
        box(g, -r * 2.1, -r * 0.18, r * 4.2, Math.max(2, r * 0.36), 0xffffff);
        box(g, -r * 0.18, -r * 2.1, Math.max(2, r * 0.36), r * 4.2, 0xffffff);
        break;
      case 'acid':
        g.poly([0, -r * 1.8, r * 1.25, -r * 0.1, r, r * 1.25, 0, r * 1.65, -r, r * 1.25, -r * 1.25, -r * 0.1].map(snap)).fill(SOUNDWOOD.ink);
        g.poly([0, -r * 1.35, r * 0.85, 0, r * 0.65, r, 0, r * 1.25, -r * 0.65, r, -r * 0.85, 0].map(snap)).fill(0xffffff);
        break;
      case 'kick':
      case 'tom':
        g.poly(regularPixelPoly(10, r * 1.45, Math.PI / 10)).fill(SOUNDWOOD.ink);
        g.poly(regularPixelPoly(10, r, Math.PI / 10)).fill(0xffffff);
        g.poly(regularPixelPoly(8, r * 0.45, Math.PI / 8)).fill(SOUNDWOOD.ink);
        break;
      case 'chord':
      case 'rhodes':
        for (const y of [-0.75, 0, 0.75]) box(g, -r * 1.35, r * y - r * 0.2, r * 2.7, r * 0.4, 0xffffff);
        break;
      case 'clap':
        pixelDiamond(g, 0, 0, r * 1.25, 0xffffff);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          box(g, Math.cos(a) * r * 1.8 - r * 0.2, Math.sin(a) * r * 1.8 - r * 0.2, r * 0.4, r * 0.4, 0xffffff);
        }
        break;
      case 'riser':
        g.poly([r * 1.8, 0, r * 0.35, -r, r * 0.35, -r * 0.42, -r * 1.7, -r * 0.42, -r * 1.7, r * 0.42, r * 0.35, r * 0.42, r * 0.35, r].map(snap)).fill(0xffffff);
        break;
    }
    if (evolved) {
      g.poly(regularPixelPoly(8, r * 2.25, Math.PI / 8)).stroke({ width: Math.max(2, snap(r * 0.25)), color: 0xffffff, alpha: 0.72 });
      pixelDiamond(g, 0, -r * 2.25, Math.max(2, r * 0.32), 0xffffff);
    }
  });
}

export interface ProjectileGfx extends Graphics {
  __evolved: boolean;
}

export function makeProjectileGfx(pr: Projectile, evolved: boolean): ProjectileGfx {
  const gfx = pixelGraphics(projectileContext(pr, evolved)) as ProjectileGfx;
  gfx.tint = pr.color;
  gfx.rotation = Math.atan2(pr.vy, pr.vx);
  gfx.__evolved = evolved;
  if (evolved) gfx.blendMode = 'add';
  return gfx;
}

export function refreshProjectileContext(gfx: ProjectileGfx, pr: Projectile, evolved: boolean): void {
  gfx.context = projectileContext(pr, evolved);
  gfx.__evolved = evolved;
  gfx.blendMode = evolved ? 'add' : 'normal';
}

export function makeZoneGfx(zone: Zone, evolved: boolean): Graphics {
  const r = Math.max(8, snap(zone.radius));
  const context = cachedPixelShape('zone:' + zone.source + ':' + r + ':' + (evolved ? 'e' : 'n'), (g) => {
    g.poly(regularPixelPoly(16, r, Math.PI / 16)).fill({ color: 0xffffff, alpha: evolved ? 0.13 : 0.08 });
    g.poly(regularPixelPoly(16, r, Math.PI / 16)).stroke({ width: evolved ? 4 : 2, color: 0xffffff, alpha: 0.72 });
    const rings = zone.source === 'chord' ? [0.34, 0.58, 0.8] : [0.55];
    for (const f of rings) {
      g.poly(regularPixelPoly(12, r * f, Math.PI / 12)).stroke({ width: 1, color: 0xffffff, alpha: 0.28 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pixelDiamond(g, Math.cos(a) * r, Math.sin(a) * r, evolved ? 4 : 2, 0xffffff);
    }
    if (evolved) {
      g.poly(regularPixelPoly(8, r * 0.78, Math.PI / 8)).stroke({ width: 3, color: 0xffffff, alpha: 0.5 });
      pixelDiamond(g, 0, 0, Math.max(5, r * 0.08), 0xffffff);
    }
  });
  const gfx = pixelGraphics(context);
  gfx.tint = zone.color;
  gfx.position.set(snap(zone.x), snap(zone.y));
  return gfx;
}

export interface GemGfx extends Container {
  __tier: Gem['tier'];
}

export function makeGemGfx(gem: Gem): GemGfx {
  const style = gem.tier === 'red'
    ? { size: 9, color: SOUNDWOOD.coral, glow: 17, alpha: 0.45 }
    : gem.tier === 'green'
      ? { size: 7, color: 0x6dff8d, glow: 13, alpha: 0.34 }
      : { size: 5, color: SOUNDWOOD.blue, glow: 10, alpha: 0.28 };
  const body = pixelGraphics(cachedPixelShape('gem:' + gem.tier, (g) => {
    pixelDiamond(g, 0, 1, style.size + 2, SOUNDWOOD.ink);
    pixelDiamond(g, 0, 0, style.size, 0xffffff);
    g.poly([0, -style.size, style.size, 0, 0, -1].map(snap)).fill(0xc5d4ef);
    box(g, -1, -style.size + 2, 2, 3, 0xffffff);
    if (gem.tier === 'red') {
      g.poly(regularPixelPoly(8, style.size + 5, Math.PI / 8)).stroke({ width: 2, color: 0xffffff, alpha: 0.75 });
    }
  }));
  body.tint = style.color;
  const glow = makePixelGlow(style.glow, style.color, style.alpha);
  const result = new Container() as GemGfx;
  result.__tier = gem.tier;
  result.addChild(glow, body);
  result.position.set(snap(gem.x), snap(gem.y));
  return result;
}

export interface MusicNoteGfx extends Container {
  __tier: MusicNotePickup['tier'];
}

/** Shop currency: an unmistakable gold pixel music note, never confused with
 * blue/green/red XP diamonds. Higher-value drops become a beamed pair. */
export function makeMusicNoteGfx(note: MusicNotePickup): MusicNoteGfx {
  const anthem = note.tier === 'anthem';
  const phrase = note.tier === 'phrase';
  const color = anthem ? SOUNDWOOD.amber : phrase ? 0xffdf78 : 0xffc857;
  const body = pixelGraphics(cachedPixelShape(`music-note:${note.tier}`, (g) => {
    const stemH = anthem ? 18 : 15;
    box(g, 1, -stemH, 6, stemH + 6, SOUNDWOOD.ink);
    box(g, 3, -stemH + 2, 2, stemH, 0xffffff);
    g.poly([5, -stemH, anthem ? 15 : 13, -stemH + 3, anthem ? 13 : 11, -stemH + 8, 5, -stemH + 5].map(snap))
      .fill(SOUNDWOOD.ink);
    g.poly([6, -stemH + 2, anthem ? 12 : 10, -stemH + 4, anthem ? 11 : 9, -stemH + 6, 6, -stemH + 4].map(snap))
      .fill(0xffffff);
    pixelDiamond(g, 0, 5, anthem ? 8 : phrase ? 7 : 6, SOUNDWOOD.ink);
    pixelDiamond(g, 0, 4, anthem ? 5 : phrase ? 4 : 3.5, 0xffffff);
    if (anthem) {
      box(g, -10, -14, 5, 19, SOUNDWOOD.ink);
      box(g, -8, -12, 2, 15, 0xffffff);
      box(g, -8, -14, 13, 5, SOUNDWOOD.ink);
      box(g, -6, -12, 9, 2, 0xffffff);
      pixelDiamond(g, -11, 6, 6, SOUNDWOOD.ink);
      pixelDiamond(g, -11, 5, 3.5, 0xffffff);
    }
  }));
  body.tint = color;
  const glow = makePixelGlow(anthem ? 24 : phrase ? 18 : 14, color, anthem ? 0.48 : 0.34);
  const result = new Container() as MusicNoteGfx;
  result.__tier = note.tier;
  result.addChild(glow, body);
  result.position.set(snap(note.x), snap(note.y));
  return result;
}

export interface StageMagnetGfx extends Container {
  __beam: Graphics;
  __field: Graphics;
  __leftPole: Graphics;
  __rightPole: Graphics;
}

/** Rare screen-vacuum pickup. The open center, cyan/magenta poles, and violet
 * scan field keep it distinct from XP diamonds and gold career notes. */
export function makeStageMagnetGfx(pickup: StageMagnetPickup): StageMagnetGfx {
  const root = new Container() as StageMagnetGfx;
  const glow = makePixelGlow(29, SOUNDWOOD.violet, 0.38);
  const beam = pixelGraphics(cachedPixelShape('stage-magnet:beam', (g) => {
    g.poly(regularPixelPoly(12, 37, Math.PI / 12))
      .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    g.poly(regularPixelPoly(12, 27, Math.PI / 12))
      .stroke({ width: 1, color: 0xffffff, alpha: 0.28 });
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      pixelDiamond(g, Math.cos(angle) * 36, Math.sin(angle) * 36, 2, 0xffffff);
    }
  }));
  beam.tint = SOUNDWOOD.violet;
  beam.blendMode = 'add';

  const body = pixelGraphics(cachedPixelShape('stage-magnet:body', (g) => {
    // Chunky U silhouette with a fully open center rather than a dark fill.
    box(g, -17, -13, 11, 25, SOUNDWOOD.ink);
    box(g, 6, -13, 11, 25, SOUNDWOOD.ink);
    box(g, -17, 4, 34, 12, SOUNDWOOD.ink);
    box(g, -13, -7, 5, 17, 0xffffff);
    box(g, 8, -7, 5, 17, 0xffffff);
    box(g, -12, 7, 24, 5, 0xffffff);
    // Visible stage-hardware rivets.
    box(g, -11, 2, 3, 3, SOUNDWOOD.violet);
    box(g, 8, 2, 3, 3, SOUNDWOOD.violet);
    box(g, -2, 8, 4, 3, SOUNDWOOD.violet);
  }));

  const leftPole = pixelGraphics(cachedPixelShape('stage-magnet:left-pole', (g) => {
    box(g, -18, -16, 13, 10, SOUNDWOOD.ink);
    box(g, -14, -13, 7, 6, 0xffffff);
  }));
  leftPole.tint = SOUNDWOOD.cyanHot;
  const rightPole = pixelGraphics(cachedPixelShape('stage-magnet:right-pole', (g) => {
    box(g, 5, -16, 13, 10, SOUNDWOOD.ink);
    box(g, 7, -13, 7, 6, 0xffffff);
  }));
  rightPole.tint = SOUNDWOOD.magenta;

  const field = pixelGraphics(cachedPixelShape('stage-magnet:field', (g) => {
    pixelDiamond(g, -5, -11, 2, SOUNDWOOD.cyanHot);
    pixelDiamond(g, 0, -11, 2, 0xffffff);
    pixelDiamond(g, 5, -11, 2, SOUNDWOOD.magenta);
  }));
  field.blendMode = 'add';

  root.__beam = beam;
  root.__field = field;
  root.__leftPole = leftPole;
  root.__rightPole = rightPole;
  root.addChild(glow, beam, body, leftPole, rightPole, field);
  root.position.set(snap(pickup.x), snap(pickup.y));
  return root;
}

export interface HealthPickupGfx extends Container {
  __cross: Graphics;
  __pulse: Graphics;
}

/** Rare floor heal. A coral upright cross on a solid ink slab: the only cross
 * in the game and the only warm red among the floor pickups, so it separates
 * at a glance from the blue/green/red XP diamonds, gold career notes, the
 * violet Stage Magnet, and the amber chest. */
export function makeHealthPickupGfx(pickup: HealthPickup): HealthPickupGfx {
  const root = new Container() as HealthPickupGfx;
  const glow = makePixelGlow(26, SOUNDWOOD.coral, 0.42);

  const pulse = pixelGraphics(cachedPixelShape('health-pickup:pulse', (g) => {
    g.poly(regularPixelPoly(8, 26, Math.PI / 8))
      .stroke({ width: 2, color: 0xffffff, alpha: 0.42 });
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      pixelDiamond(g, Math.cos(angle) * 25, Math.sin(angle) * 25, 2, 0xffffff);
    }
  }));
  pulse.tint = SOUNDWOOD.coral;
  pulse.blendMode = 'add';

  const cross = pixelGraphics(cachedPixelShape('health-pickup:cross', (g) => {
    // Ink slab first so the cross stays legible over bright floor and corpses.
    box(g, -14, -14, 28, 28, SOUNDWOOD.ink);
    box(g, -11, -11, 22, 22, SOUNDWOOD.coral);
    box(g, -3, -9, 6, 18, 0xffffff);
    box(g, -9, -3, 18, 6, 0xffffff);
  }));

  root.__cross = cross;
  root.__pulse = pulse;
  root.addChild(glow, pulse, cross);
  root.position.set(snap(pickup.x), snap(pickup.y));
  return root;
}

export interface PlayerGfx extends Container {
  __body: Graphics;
  __halo: Graphics;
  __marker: Graphics;
}

export function makePlayerGfx(radius: number): PlayerGfx {
  const r = Math.max(14, snap(radius));
  const root = new Container() as PlayerGfx;
  const shadow = new Graphics({ roundPixels: true })
    .ellipse(0, r * 0.78, r * 0.86, Math.max(3, r * 0.28))
    .fill({ color: SOUNDWOOD.ink, alpha: 0.78 });
  const glow = makePixelGlow(r * 1.75, SOUNDWOOD.cyan, 0.28);
  const halo = new Graphics({ roundPixels: true });
  halo.poly(regularPixelPoly(12, r * 1.45, Math.PI / 12)).stroke({ width: 3, color: SOUNDWOOD.cyan, alpha: 0.82 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    halo.rect(snap(Math.cos(a) * r * 1.45 - 2), snap(Math.sin(a) * r * 1.45 - 2), 4, 4).fill(SOUNDWOOD.cyanHot);
  }
  const body = new Graphics({ roundPixels: true });
  // Shoes, legs, jacket, face and magenta headphones form a tiny top-down DJ.
  box(body.context, -r * 0.7, r * 0.52, r * 0.56, r * 0.5, SOUNDWOOD.ink);
  box(body.context, r * 0.14, r * 0.52, r * 0.56, r * 0.5, SOUNDWOOD.ink);
  box(body.context, -r * 0.86, -r * 0.28, r * 1.72, r * 1.18, SOUNDWOOD.ink);
  box(body.context, -r * 0.68, -r * 0.16, r * 1.36, r * 0.82, 0x1cd3b2);
  box(body.context, -r * 0.16, -r * 0.16, r * 0.32, r * 0.82, SOUNDWOOD.cyanHot);
  box(body.context, -r * 0.5, -r * 0.92, r, r * 0.76, SOUNDWOOD.ink);
  box(body.context, -r * 0.34, -r * 0.78, r * 0.68, r * 0.56, 0xffddb5);
  box(body.context, -r * 0.6, -r * 0.72, r * 0.22, r * 0.56, SOUNDWOOD.magenta);
  box(body.context, r * 0.38, -r * 0.72, r * 0.22, r * 0.56, SOUNDWOOD.magenta);
  box(body.context, -r * 0.34, -r * 0.92, r * 0.68, r * 0.16, SOUNDWOOD.magenta);
  box(body.context, r * 0.2, -r * 0.5, r * 0.18, r * 0.12, SOUNDWOOD.ink);
  box(body.context, -r * 0.78, -r * 0.08, r * 0.22, r * 0.56, 0xffddb5);
  box(body.context, r * 0.56, -r * 0.08, r * 0.22, r * 0.56, 0xffddb5);

  const marker = new Graphics({ roundPixels: true });
  pixelDiamond(marker.context, 0, -r * 2.25, Math.max(5, r * 0.34), SOUNDWOOD.ink);
  pixelDiamond(marker.context, 0, -r * 2.32, Math.max(3, r * 0.23), SOUNDWOOD.cyanHot);
  box(marker.context, -1, -r * 1.88, 2, 5, SOUNDWOOD.cyanHot);
  root.__body = body;
  root.__halo = halo;
  root.__marker = marker;
  root.addChild(shadow, glow, halo, body, marker);
  return root;
}

interface RewardBase {
  x: number;
  y: number;
  color: number;
  name: string;
  level: string;
  effect?: string;
  /** Item pedestals only: the weapon this passive evolves, shown once on the
   * player's first pickup. Independent of the `role` xor `glyph` union. */
  evoRole?: Role;
}

export type RewardSpec = RewardBase & (
  | { role: Role; glyph?: never }
  | { role?: never; glyph: string }
);

export interface RewardGfx extends Container {
  __beam: Graphics;
  __platform: Graphics;
}

const REWARD_NAME = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 16,
  fontWeight: '800',
  fill: 0xffffff,
  letterSpacing: 0.5,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});
const REWARD_LEVEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  fontWeight: '700',
  fill: 0xe8f5ed,
  stroke: { color: SOUNDWOOD.ink, width: 4, join: 'round' },
});
const REWARD_EFFECT = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  fontWeight: '800',
  fill: 0xffffff,
  letterSpacing: 0.25,
  stroke: { color: SOUNDWOOD.ink, width: 3, join: 'round' },
});
const REWARD_EVO = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  fontWeight: '900',
  fill: 0xffd45c,
  letterSpacing: 1,
  stroke: { color: SOUNDWOOD.ink, width: 3, join: 'round' },
});
const REWARD_GLYPH = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 32,
  fontWeight: '900',
  fill: 0xffffff,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});

export function makeRewardGfx(spec: RewardSpec): RewardGfx {
  const root = new Container() as RewardGfx;
  root.position.set(snap(spec.x), snap(spec.y));
  const beam = new Graphics({ roundPixels: true });
  beam.rect(-22, -154, 44, 174).fill({ color: spec.color, alpha: 0.06 });
  beam.rect(-10, -166, 20, 186).fill({ color: spec.color, alpha: 0.11 });
  beam.rect(-3, -176, 6, 196).fill({ color: 0xffffff, alpha: 0.13 });
  for (const [x, y] of [[-20, -118], [16, -92], [-12, -66], [20, -42], [-18, -26]] as const) {
    beam.rect(x, y, 4, 4).fill({ color: spec.color, alpha: 0.75 });
  }
  beam.blendMode = 'add';
  const glow = makePixelGlow(58, spec.color, 0.4);
  const platform = new Graphics({ roundPixels: true });
  platform.poly(regularPixelPoly(8, 40, Math.PI / 8)).fill(SOUNDWOOD.ink);
  platform.poly(regularPixelPoly(8, 35, Math.PI / 8)).fill(0x111a27);
  platform.poly(regularPixelPoly(8, 35, Math.PI / 8)).stroke({ width: 4, color: spec.color, alpha: 1 });
  platform.poly(regularPixelPoly(8, 25, Math.PI / 8)).stroke({ width: 2, color: spec.color, alpha: 0.46 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    platform.rect(snap(Math.cos(a) * 34 - 3), snap(Math.sin(a) * 34 - 3), 6, 6).fill(0xffffff);
  }
  const role = spec.role;
  const icon = role
    ? pixelGraphics(cachedPixelShape('reward-icon:' + role, (g) => drawWeaponIcon(g, role, 18)))
    : new Text({ text: spec.glyph ?? '•', style: REWARD_GLYPH, roundPixels: true });
  if (icon instanceof Text) icon.anchor.set(0.5);
  icon.tint = spec.color;
  const labelPlate = new Graphics({ roundPixels: true });
  const evoRole = spec.evoRole;
  const plateHeight = (spec.effect ? 66 : 45) + (evoRole ? 20 : 0);
  labelPlate.roundRect(-84, 42, 168, plateHeight, 6).fill({ color: SOUNDWOOD.ink, alpha: 0.92 });
  labelPlate.rect(-78, 42, 156, 2).fill({ color: spec.color, alpha: 0.8 });
  const name = new Text({ text: spec.name.toUpperCase(), style: REWARD_NAME, roundPixels: true });
  name.anchor.set(0.5);
  name.position.set(0, 55);
  name.tint = spec.color;
  if (name.width > 154) name.scale.x = 154 / name.width;
  const level = new Text({ text: 'LEVEL ' + spec.level, style: REWARD_LEVEL, roundPixels: true });
  level.anchor.set(0.5);
  level.position.set(0, 75);
  const effect = spec.effect
    ? new Text({ text: spec.effect.toUpperCase(), style: REWARD_EFFECT, roundPixels: true })
    : null;
  if (effect) {
    effect.anchor.set(0.5);
    effect.position.set(0, 96);
    if (effect.width > 154) effect.scale.x = 154 / effect.width;
  }
  // The recipe teaser: which weapon this passive can transform. Icon only, in
  // that weapon's own hue — the mastery screen still owns the full recipe.
  let evoTag: Text | null = null;
  let evoIcon: Graphics | null = null;
  if (evoRole) {
    const y = (spec.effect ? 96 : 75) + 20;
    evoTag = new Text({ text: 'EVO', style: REWARD_EVO, roundPixels: true });
    evoTag.anchor.set(1, 0.5);
    evoIcon = pixelGraphics(cachedPixelShape('reward-evo-icon:' + evoRole, (g) => drawWeaponIcon(g, evoRole, 9)));
    evoIcon.tint = ROLE_COLORS[evoRole];
    const span = evoTag.width + 8 + 16;
    evoTag.position.set(snap(-span / 2 + evoTag.width), y);
    evoIcon.position.set(snap(span / 2 - 8), y);
  }
  root.__beam = beam;
  root.__platform = platform;
  root.addChild(beam, glow, platform, icon, labelPlate, name, level);
  if (effect) root.addChild(effect);
  if (evoTag && evoIcon) root.addChild(evoTag, evoIcon);
  return root;
}

export interface ChestSpec {
  x: number;
  y: number;
  color: number;
}

export interface ChestGfx extends Container {
  __beam: Graphics;
  __case: Container;
}

const CASE_LABEL = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  fontWeight: '900',
  fill: 0xffffff,
  letterSpacing: 1,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});

/** Chests are elite/boss drops: a bright road case with chunky metal corners,
 * a literal handle, and a beam tall enough to find through a horde. */
export function makeChestGfx(spec: ChestSpec): ChestGfx {
  const root = new Container() as ChestGfx;
  const beam = new Graphics({ roundPixels: true });
  beam.rect(-26, -164, 52, 180).fill({ color: spec.color, alpha: 0.07 });
  beam.rect(-9, -178, 18, 194).fill({ color: spec.color, alpha: 0.15 });
  beam.rect(-2, -190, 4, 206).fill({ color: 0xffffff, alpha: 0.16 });
  beam.blendMode = 'add';
  const glow = makePixelGlow(62, spec.color, 0.4);
  const caseRoot = new Container();
  const body = new Graphics({ roundPixels: true });
  body.rect(-35, -26, 70, 54).fill(SOUNDWOOD.ink);
  body.rect(-29, -20, 58, 42).fill(0x223047);
  body.rect(-29, -20, 58, 5).fill({ color: spec.color, alpha: 0.9 });
  body.rect(-31, -28, 14, 8).fill(SOUNDWOOD.ink);
  body.rect(17, -28, 14, 8).fill(SOUNDWOOD.ink);
  body.rect(-14, -37, 28, 7).fill(SOUNDWOOD.ink);
  body.rect(-8, -34, 16, 4).fill({ color: spec.color, alpha: 0.78 });
  for (const [x, y] of [[-30, -21], [30, -21], [-30, 23], [30, 23]] as const) {
    body.rect(x - 5, y - 5, 10, 10).fill(0xdde5ec);
    body.rect(x - 2, y - 2, 4, 4).fill(SOUNDWOOD.ink);
  }
  body.rect(-5, -3, 10, 14).fill(0xdde5ec);
  body.rect(-2, 0, 4, 6).fill(SOUNDWOOD.ink);
  caseRoot.addChild(body);
  const label = new Text({ text: 'CHEST', style: CASE_LABEL, roundPixels: true });
  label.anchor.set(0.5);
  label.position.set(0, 45);
  label.tint = spec.color;
  root.__beam = beam;
  root.__case = caseRoot;
  root.addChild(beam, glow, caseRoot, label);
  return root;
}

export interface SceneryCell extends Container {
  __fireflies: Graphics;
  __phase: number;
}

function sceneryContext(variant: number): GraphicsContext {
  return cachedPixelShape('scenery:' + variant, (g) => {
    const rx = (hash2(variant, 1, 31) - 0.5) * 150;
    const ry = (hash2(variant, 2, 53) - 0.5) * 150;
    // Broad pixel fog sits under the prop and never forms a hard gameplay edge.
    box(g, rx - 72, ry - 20, 144, 32, 0x8ba7a2, 0.025);
    box(g, rx - 48, ry - 28, 96, 48, 0x8ba7a2, 0.022);

    switch (variant % 5) {
      case 0:
        // An abandoned speaker stump.
        box(g, rx - 20, ry - 34, 40, 68, SOUNDWOOD.ink, 0.88);
        box(g, rx - 16, ry - 30, 32, 60, SOUNDWOOD.bark, 0.9);
        box(g, rx - 11, ry - 22, 22, 22, SOUNDWOOD.ink, 0.85);
        g.poly(regularPixelPoly(8, 8, Math.PI / 8).map((v, i) => snap(v + (i % 2 === 0 ? rx : ry - 11)))).fill(SOUNDWOOD.pineLight);
        box(g, rx - 9, ry + 9, 18, 12, SOUNDWOOD.ink, 0.82);
        box(g, rx - 6, ry + 12, 12, 2, SOUNDWOOD.cyan, 0.22);
        break;
      case 1:
        // A rune stone: large and quiet, never enemy-colored.
        g.poly([rx - 30, ry + 34, rx - 24, ry - 18, rx - 9, ry - 38, rx + 18, ry - 31, rx + 31, ry + 34].map(snap)).fill(SOUNDWOOD.ink);
        g.poly([rx - 23, ry + 28, rx - 18, ry - 14, rx - 6, ry - 30, rx + 12, ry - 25, rx + 24, ry + 28].map(snap)).fill(SOUNDWOOD.barkLight);
        box(g, rx - 3, ry - 20, 6, 34, SOUNDWOOD.cyan, 0.22);
        box(g, rx - 15, ry - 3, 30, 5, SOUNDWOOD.cyan, 0.18);
        break;
      case 2:
        // Neon mushrooms remain small and grouped, unlike moving foes.
        for (let i = 0; i < 4; i++) {
          const mx = rx - 27 + i * 18;
          const my = ry + (i % 2) * 10;
          box(g, mx - 2, my, 4, 14, 0xa4c4ad, 0.35);
          g.poly([mx, my - 11, mx + 11, my - 2, mx + 8, my + 2, mx - 8, my + 2, mx - 11, my - 2].map(snap))
            .fill(i % 2 ? { color: SOUNDWOOD.magenta, alpha: 0.28 } : { color: SOUNDWOOD.cyan, alpha: 0.24 });
        }
        break;
      case 3:
        // Fallen cable-root with low-frequency equalizer scars.
        g.poly([rx - 76, ry + 16, rx - 48, ry - 9, rx - 10, ry - 3, rx + 18, ry - 22, rx + 77, ry - 12, rx + 49, ry + 6, rx + 9, ry + 2, rx - 16, ry + 27].map(snap)).fill(SOUNDWOOD.ink);
        g.poly([rx - 65, ry + 12, rx - 42, ry - 3, rx - 8, ry + 2, rx + 21, ry - 15, rx + 65, ry - 9, rx + 44, ry, rx + 8, ry - 1, rx - 13, ry + 19].map(snap)).fill(SOUNDWOOD.bark);
        for (let i = 0; i < 5; i++) box(g, rx - 18 + i * 9, ry - 2 - (i % 3) * 5, 4, 7 + (i % 3) * 5, SOUNDWOOD.pineLight, 0.4);
        break;
      case 4:
        // Fern shrine made of angular leaves.
        box(g, rx - 2, ry - 25, 4, 58, SOUNDWOOD.pineLight, 0.55);
        for (let i = 0; i < 5; i++) {
          const fy = ry - 18 + i * 10;
          g.poly([rx, fy, rx - 28 + i * 2, fy - 12, rx - 10, fy + 4].map(snap)).fill(SOUNDWOOD.moss);
          g.poly([rx, fy + 2, rx + 28 - i * 2, fy - 10, rx + 10, fy + 5].map(snap)).fill(SOUNDWOOD.pineLight);
        }
        pixelDiamond(g, rx, ry - 31, 4, SOUNDWOOD.amber);
        break;
    }

    // Small roots and stones fill dead space without reading as pickups.
    for (let i = 0; i < 3; i++) {
      const x = (hash2(variant, i, 91) - 0.5) * 210;
      const y = (hash2(variant, i, 117) - 0.5) * 210;
      box(g, x - 7, y - 3, 14, 6, SOUNDWOOD.barkLight, 0.32);
      box(g, x - 3, y - 5, 7, 3, SOUNDWOOD.pineLight, 0.26);
    }
  });
}

export function makeSceneryCell(ix: number, iy: number): SceneryCell {
  const variant = Math.floor(hash2(ix, iy, 1201) * 20);
  const root = new Container() as SceneryCell;
  const prop = pixelGraphics(sceneryContext(variant));
  prop.alpha = 0.78;
  prop.scale.x = (ix + iy) % 2 === 0 ? 1 : -1;
  const flies = new Graphics({ roundPixels: true });
  for (let i = 0; i < 3; i++) {
    const x = snap((hash2(ix, iy, 300 + i) - 0.5) * 190);
    const y = snap((hash2(ix, iy, 600 + i) - 0.5) * 170);
    const color = i === 2 ? SOUNDWOOD.cyan : SOUNDWOOD.amber;
    flies.rect(x, y, 2, 2).fill({ color, alpha: 0.7 });
  }
  flies.blendMode = 'add';
  root.__fireflies = flies;
  root.__phase = hash2(ix, iy, 777) * Math.PI * 2;
  root.addChild(prop, flies);
  return root;
}

export function animateSceneryCell(cell: SceneryCell, timeS: number, chapter: number): void {
  cell.__fireflies.alpha = 0.16 + 0.2 * (0.5 + 0.5 * Math.sin(timeS * 1.9 + cell.__phase));
  cell.alpha = 0.88 + Math.min(0.08, chapter * 0.01);
}
