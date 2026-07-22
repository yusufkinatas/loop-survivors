// Shared visual primitives for the Midnight Neon Soundwood run renderer.
// This module deliberately owns no simulation state: it only preloads the
// generated floor texture and provides deterministic helpers for scenery.

import { Assets, Texture } from 'pixi.js';

export const SOUNDWOOD = {
  ink: 0x050810,
  shadow: 0x080d18,
  bark: 0x172238,
  barkLight: 0x263852,
  pine: 0x102c31,
  pineLight: 0x1d4b45,
  moss: 0x3f7f59,
  moon: 0xd9f7e8,
  cyan: 0x42f5d0,
  cyanHot: 0xbaffef,
  magenta: 0xff4fbd,
  violet: 0x8e6cff,
  amber: 0xffd56a,
  coral: 0xff665a,
  blue: 0x5ea7ff,
} as const;

// The generated 32x32 Soundwood tile (#209, accepted in #211). The old
// 1254x1254 hand-made floor stays on disk at /art/soundwood-floor.png so the
// A/B is one line, which is worth keeping while the art is still being judged.
const FLOOR_URL = '/art/pixellab/floor-earth.png';
let floorTexture: Texture | null = null;
let floorPromise: Promise<Texture | null> | null = null;

/** Preload once, configure nearest-neighbour sampling, and keep a shared
 * texture alive across runs. The procedural fallback remains playable if the
 * image cannot be decoded or served. */
export function preloadSoundwoodFloor(): Promise<Texture | null> {
  if (floorTexture) return Promise.resolve(floorTexture);
  if (floorPromise) return floorPromise;
  floorPromise = Assets.load<Texture>(FLOOR_URL)
    .then((texture) => {
      texture.source.scaleMode = 'nearest';
      floorTexture = texture;
      return texture;
    })
    .catch((error: unknown) => {
      console.warn('[soundwood] floor art failed to load; using fallback ground', error);
      return null;
    });
  return floorPromise;
}

export function soundwoodFloorTexture(): Texture | null {
  return floorTexture;
}

/** Stable 0..1 pseudo-random value derived from integer world coordinates. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function snap(value: number): number {
  return Math.round(value);
}

export function regularPixelPoly(sides: number, radius: number, rotation = 0): number[] {
  const points: number[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push(snap(Math.cos(angle) * radius), snap(Math.sin(angle) * radius));
  }
  return points;
}
