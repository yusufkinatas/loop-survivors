// Generated pixel art for the pixel-art test (wayfinder map #204): the
// player's walk loop and two Hush enemy loops, produced with PixelLab and
// accepted at both human gates in #211.
//
// This module owns loading and slicing only. Where the frames are drawn, how
// fast they cycle and what mirrors them is the renderer's business; what a
// frame *is* lives here.
//
// Every loop is one horizontal strip of four same-size frames, packed by
// art/pixellab/make-strips.py. The frames keep their full generation canvas,
// so they stay in register with each other and a single anchor of 0.5 centres
// the creature. Alongside each strip is a white silhouette of the same frames,
// used as an overlay for the on-hit flash: these sprites carry baked SOUNDWOOD
// colour rather than a runtime tint (map #204 Notes), so the old
// `tint = 0xffffff` flash has nothing to bite on.

import { Assets, Rectangle, Texture } from 'pixi.js';
import type { EnemyKind } from './config';

export interface SpriteLoop {
  /** Frames in loop order. */
  readonly frames: readonly Texture[];
  /** The same frames as flat white silhouettes, for the hit flash. */
  readonly flash: readonly Texture[];
  /** Loop tempo in frames per second, locked by the concept ticket. */
  readonly fps: number;
}

interface LoopSpec {
  readonly name: string;
  readonly fps: number;
}

/** The player's walk. Four frames at ~8 fps (#206). */
const PLAYER_LOOP: LoopSpec = { name: 'dj-walk', fps: 8 };

/** Enemy kinds whose art is generated rather than drawn. Every other kind
 *  keeps its procedural Hush silhouette, so the 2:00+ swarm deliberately shows
 *  generated art beside drawn art (#207). */
const ENEMY_LOOPS: Partial<Record<EnemyKind, LoopSpec>> = {
  // The Night Mite hovers at ~8 fps (#207).
  redBat2: { name: 'mite-hover', fps: 8 },
  // The Cable Husk shambles at 4 fps, its arms swinging late (#208).
  zombie: { name: 'husk-shamble', fps: 4 },
  // Wave 1 of the whole-roster map (#219). Tempo is set from how each kind
  // moves, not from a table: the Gaffer Husk is the slowest and largest body
  // in the wave, the Jackwalker marches a step quicker than the Cable Husk
  // shambles, the Mute Bloom barely travels so its loop is a breath rather
  // than a walk, and the Static Rush is the fastest body in the game.
  bigMummy: { name: 'gaffer-lumber', fps: 3 },
  skeleton: { name: 'jack-march', fps: 5 },
  flower: { name: 'bloom-sway', fps: 3 },
  batSwarm: { name: 'rush-charge', fps: 10 },
  // Wave 2 (#220) is all sibling pairs, and each pair shares a speed — so
  // tempo comes from build rather than from speed alone, and ends up being a
  // separator in its own right. The Cabinets both move at 100: Moss is the
  // heavier body and trudges, Cracked is half its HP and broken so it shuffles
  // quicker and unevenly. The Crowns both move at 140, so the one with long
  // legs takes fewer, longer strides than the one on stubby legs.
  greenMudman: { name: 'moss-trudge', fps: 3 },
  grayMudman: { name: 'crack-shuffle', fps: 5 },
  glowingBat: { name: 'signal-lope', fps: 6 },
  silverBat: { name: 'silver-scuttle', fps: 9 },
  // Waves 3 and 4, generated in one pass (#234). Tempo still comes from how
  // each kind moves, and where two kinds share a speed it comes from build:
  // Snare Bloom and The Shear both move at 80, so the one carrying its weight
  // in its head lumbers a beat slower than the one swinging long arms. The
  // three mites all move at 140, so their cadence ramps by size instead --
  // smallest is twitchiest, which puts Night Mite's shipped 8 fps at the top.
  venus: { name: 'bloom-chomp', fps: 3 },
  mantis: { name: 'shear-swing', fps: 4 },
  giantBat: { name: 'woofer-wade', fps: 4 },
  werewolf: { name: 'howl-lope', fps: 8 },
  ghost: { name: 'shard-drift', fps: 6 },
  ghostSwarm: { name: 'echo-sweep', fps: 10 },
  redBat: { name: 'flare-hover', fps: 9 },
  bat: { name: 'static-hover', fps: 10 },
  // The four Giants ride free on their base kind's art at sizeMul 1.5, which
  // spriteEnemyScale already applies from the radius ratio. Giant Snare Bloom
  // reuses the green art despite the drawn renderer tinting it blue: the blue
  // is a Vampire Survivors artifact, not this game's fiction (map #217).
  giantMummy: { name: 'gaffer-lumber', fps: 3 },
  giantBlueVenus: { name: 'bloom-chomp', fps: 3 },
  giantMantis: { name: 'shear-swing', fps: 4 },
  giantWerewolf: { name: 'howl-lope', fps: 8 },
};

const FRAMES_PER_LOOP = 4;

const loops = new Map<string, SpriteLoop>();
let loadPromise: Promise<void> | null = null;

/** Slice one strip of `FRAMES_PER_LOOP` frames laid out left to right. */
function sliceStrip(strip: Texture): Texture[] {
  strip.source.scaleMode = 'nearest';
  const width = strip.width / FRAMES_PER_LOOP;
  const height = strip.height;
  const frames: Texture[] = [];
  for (let i = 0; i < FRAMES_PER_LOOP; i++) {
    frames.push(new Texture({
      source: strip.source,
      frame: new Rectangle(i * width, 0, width, height),
    }));
  }
  return frames;
}

async function loadLoop(spec: LoopSpec): Promise<void> {
  const [strip, white] = await Promise.all([
    Assets.load<Texture>(`/art/pixellab/${spec.name}.png`),
    Assets.load<Texture>(`/art/pixellab/${spec.name}-white.png`),
  ]);
  loops.set(spec.name, {
    frames: sliceStrip(strip),
    flash: sliceStrip(white),
    fps: spec.fps,
  });
}

/** Load every generated loop once. A failure leaves the map empty and the
 *  renderer falls back to the drawn silhouettes, so the game stays playable
 *  with the art missing. */
export function preloadPixelArt(): Promise<void> {
  if (loadPromise) return loadPromise;
  const specs = [PLAYER_LOOP, ...Object.values(ENEMY_LOOPS)];
  loadPromise = Promise.all(specs.map((spec) =>
    loadLoop(spec).catch((error: unknown) => {
      console.warn(`[pixelart] ${spec.name} failed to load; using drawn art`, error);
    }),
  )).then(() => undefined);
  return loadPromise;
}

/** The player's walk loop, or null before it has loaded / if it failed. */
export function playerLoop(): SpriteLoop | null {
  return loops.get(PLAYER_LOOP.name) ?? null;
}

/** This kind's generated loop, or null if it keeps its drawn silhouette. */
export function enemyLoop(kind: EnemyKind): SpriteLoop | null {
  const spec = ENEMY_LOOPS[kind];
  return spec ? loops.get(spec.name) ?? null : null;
}

/** Frame index for a loop at `timeS`, offset by `phase` so a crowd of the same
 *  kind does not step in unison. */
export function loopFrame(loop: SpriteLoop, timeS: number, phase = 0): number {
  return Math.floor(timeS * loop.fps + phase) % loop.frames.length;
}
