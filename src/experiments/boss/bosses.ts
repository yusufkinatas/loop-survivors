// The bosses. Each one IS a real track (an ear-tested Track Lab cover),
// and the track's structure drives the fight: sections are phases, beats are
// attacks. The player never damages the boss — the boss dies when its song
// ends. What makes them feel drastically different is the attack grammar each
// one speaks on the beat:
//
//   SATISFACTION — bullet hell. An anchored core that paints the arena with
//     beat-locked rings and spirals. You read the gaps and weave.
//   PURSUIT — arena hazard / rhythm survival. The room itself attacks:
//     center shockwaves, sweeping laser bars, and a lane grid that leaves one
//     safe corridor per bar. You survive by standing in the right place when
//     the beat lands.

import { SATISFACTION } from '../tracklab/tracks/satisfaction';
import { PURSUIT } from '../tracklab/tracks/pursuit';
import type { LabTrack } from '../tracklab/tracks/types';
import type { ArrangementEntry, BeatInfo } from './conductor';
import { ARENA, type BossBehavior, type BossWorld } from './world';

export interface BossPalette {
  boss: number;
  bullet: number;
  beam: number;
  accent: number;
  bg: number;
}

export interface BossDef {
  id: string;
  name: string;
  /** Player-facing archetype label on the select card. */
  archetype: string;
  /** One line on how it fights. */
  tagline: string;
  track: LabTrack;
  /** When set, the boss plays this real audio file (via Mp3Engine) instead of
   *  synthesizing `track` live — same arrangement, same attacks, real record.
   *  `offsetS` is the file position that plays at fight-step 0 (tunable live
   *  in the fight, then baked here). File lives in public/, served at `url`. */
  mp3?: { url: string; offsetS?: number };
  arrangement: ArrangementEntry[];
  palette: BossPalette;
  bossRadius: number;
  behavior: BossBehavior;
  chaseSpeed: number;
  contactDamage: number;
  /** Where the boss body starts / anchors, as a fraction of the arena. */
  spawn: { x: number; y: number };
  onSectionEnter?(sectionId: string, entryIndex: number, world: BossWorld): void;
  onStep(info: BeatInfo, world: BossWorld): void;
}

// ---------------------------------------------------------------------------
// 1. SATISFACTION — bullet hell
// ---------------------------------------------------------------------------

const SAT_PALETTE: BossPalette = {
  boss: 0x2ad4ff,
  bullet: 0xff6bd6,
  beam: 0xffc93c,
  accent: 0x3ce0ff,
  bg: 0x081420,
};

const SATISFACTION_BOSS: BossDef = {
  id: 'satisfaction',
  name: 'Satisfaction',
  archetype: 'Bullet hell',
  tagline: 'An anchored core paints the room with beat-locked rings and spirals. Read the gaps.',
  track: SATISFACTION,
  // intro → build → drop → breakdown → build → drop.
  arrangement: [
    { sectionId: 'intro', bars: 8 },
    { sectionId: 'build', bars: 8 },
    { sectionId: 'drop', bars: 16 },
    { sectionId: 'breakdown', bars: 8 },
    { sectionId: 'build', bars: 8 },
    { sectionId: 'drop', bars: 16 },
  ],
  palette: SAT_PALETTE,
  bossRadius: 40,
  behavior: 'anchor',
  chaseSpeed: 0,
  contactDamage: 14,
  spawn: { x: 0, y: -0.16 },
  onStep(info, world) {
    const P = SAT_PALETTE;
    const b = world.boss;
    const cx = b.x;
    const cy = b.y;
    const spiral = info.absStep * 0.16; // continuous rotation for spiral arms
    const { sectionId, stepInBar } = info;

    // --- movement: the core grooves. It never charges the player. It sways on
    // a figure-8 around its section anchor (rings then come from a shifting
    // spot) and punches out a hop on every beat, biased away from the player so
    // the dance never turns into a charge.
    const baseX = ((info.entryIndex % 3) - 1) * ARENA.w * 0.16;
    const baseY = -ARENA.h * 0.16;
    b.homeX = baseX + Math.sin(info.absStep * 0.11) * ARENA.w * 0.2;
    b.homeY = baseY + Math.sin(info.absStep * 0.17 + 1) * ARENA.h * 0.12;

    if (info.isBeat) {
      world.pulseBoss(0.7);
      let hop = info.beatInBar * 1.7 + info.absBar * 0.5; // rotating hop angle
      const toPlayer = world.aimAt(b.x, b.y);
      let diff = hop - toPlayer;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < Math.PI / 2) hop = toPlayer + Math.PI; // flip off the player
      const dist = 150;
      world.bossLungeAt(b.x + Math.cos(hop) * dist, b.y + Math.sin(hop) * dist, 900, 0.12);
    }

    switch (sectionId) {
      case 'intro':
        if (stepInBar === 0 || stepInBar === 8) {
          world.aimedSpread(cx, cy, 3, 0.5, 240, { color: P.bullet, damage: 9 });
        }
        break;
      case 'build':
        if (info.isBeat) {
          world.radial(cx, cy, 10, 224, { color: P.bullet, offset: spiral, radius: 7, damage: 9 });
        }
        if (stepInBar === 4 || stepInBar === 12) {
          world.aimedSpread(cx, cy, 4, 0.6, 300, { color: P.accent, damage: 9 });
        }
        break;
      case 'drop':
        if (info.isBeat) {
          world.radial(cx, cy, 16, 244, { color: P.bullet, offset: spiral, radius: 7, damage: 9 });
        }
        if (info.isDownbeat) {
          // counter-rotating second arm for the woven-lattice look.
          world.radial(cx, cy, 16, 200, { color: P.beam, offset: -spiral + 0.2, radius: 7, damage: 9 });
        }
        if (stepInBar === 4 || stepInBar === 12) {
          world.aimedSpread(cx, cy, 5, 0.7, 322, { color: P.accent, radius: 7, damage: 10 });
        }
        break;
      case 'breakdown':
        if (info.isHalfBar) {
          world.radial(cx, cy, 12, 172, { color: P.bullet, offset: spiral, radius: 7, damage: 8 });
        }
        break;
    }
  },
};

// ---------------------------------------------------------------------------
// 2. PURSUIT — arena hazard / rhythm survival
// ---------------------------------------------------------------------------

const PUR_PALETTE: BossPalette = {
  boss: 0xd94f5a,
  bullet: 0xff4658,
  beam: 0xff6a6a,
  accent: 0xe6e6ee,
  bg: 0x120609,
};

/** The signature move: rule off the arena into lanes and leave one safe
 *  corridor. Telegraphs thin during warnT, then the walls bite. */
function laneGrid(world: BossWorld, vertical: boolean, color: number): void {
  const span = vertical ? ARENA.w : ARENA.h;
  const n = 7;
  const gap = Math.floor(Math.random() * n); // the un-lit lane is the way out
  const step = span / n;
  for (let i = 0; i < n; i++) {
    if (i === gap) continue;
    const c = -span / 2 + step * (i + 0.5);
    world.beam({
      type: vertical ? 'vlane' : 'hlane',
      ox: vertical ? c : 0,
      oy: vertical ? 0 : c,
      halfWidth: step * 0.34,
      warnT: 0.55,
      liveT: 0.42,
      damage: 13,
      color,
    });
  }
}

const PURSUIT_BOSS: BossDef = {
  id: 'pursuit',
  name: 'Pursuit',
  archetype: 'Rhythm survival',
  tagline: 'The room is the weapon: center shockwaves, sweeping lasers, and a lane grid with one way out.',
  track: PURSUIT,
  // intro → build → drop → dropvar → breakdown → drop → dropvar.
  arrangement: [
    { sectionId: 'intro', bars: 8 },
    { sectionId: 'build', bars: 8 },
    { sectionId: 'drop', bars: 8 },
    { sectionId: 'dropvar', bars: 8 },
    { sectionId: 'breakdown', bars: 8 },
    { sectionId: 'drop', bars: 8 },
    { sectionId: 'dropvar', bars: 8 },
  ],
  palette: PUR_PALETTE,
  bossRadius: 52,
  behavior: 'anchor',
  chaseSpeed: 0,
  contactDamage: 15,
  spawn: { x: 0, y: 0 },
  onStep(info, world) {
    const P = PUR_PALETTE;
    const { sectionId, stepInBar } = info;
    if (info.isBeat) world.pulseBoss(0.6);

    switch (sectionId) {
      case 'intro':
        if (info.isDownbeat && info.absBar % 2 === 0) {
          world.shock({ x: 0, y: 0, rMax: 620, speed: 470, thickness: 32, damage: 10, warnT: 0.4, color: P.beam });
        }
        break;
      case 'build':
        if (info.isHalfBar) {
          world.shock({ x: 0, y: 0, rMax: 720, speed: 560, thickness: 32, damage: 11, warnT: 0.3, color: P.beam });
        }
        if (info.isDownbeat && info.absBar % 2 === 0) {
          const a = info.absBar * 0.6;
          const live = info.beatDur * 6;
          world.beam({ type: 'ray', ox: 0, oy: 0, angle: a, sweepRate: 0.5, halfWidth: 30, warnT: 0.5, liveT: live, damage: 13, color: P.beam });
          world.beam({ type: 'ray', ox: 0, oy: 0, angle: a + Math.PI, sweepRate: 0.5, halfWidth: 30, warnT: 0.5, liveT: live, damage: 13, color: P.beam });
        }
        break;
      case 'drop':
        if (info.isBeat) {
          world.shock({ x: 0, y: 0, rMax: 780, speed: 640, thickness: 34, damage: 12, warnT: 0.22, color: P.beam });
        }
        if (info.isDownbeat && info.absBar % 2 === 0) {
          const a = info.absBar * 0.8;
          const live = info.beatDur * 4;
          for (let k = 0; k < 3; k++) {
            world.beam({ type: 'ray', ox: 0, oy: 0, angle: a + (k * Math.PI * 2) / 3, sweepRate: 0.7, halfWidth: 28, warnT: 0.5, liveT: live, damage: 13, color: P.beam });
          }
        }
        break;
      case 'dropvar':
        if (info.isDownbeat) laneGrid(world, info.absBar % 2 === 0, P.beam);
        if (stepInBar === 8) {
          world.shock({ x: 0, y: 0, rMax: 720, speed: 600, thickness: 30, damage: 11, warnT: 0.2, color: P.accent });
        }
        break;
      case 'breakdown':
        if (info.isDownbeat && info.absBar % 2 === 0) {
          world.beam({ type: 'ray', ox: 0, oy: 0, angle: info.absBar * 0.9, sweepRate: 0.35, halfWidth: 28, warnT: 0.6, liveT: info.beatDur * 7, damage: 12, color: P.beam });
        }
        break;
    }
  },
};

// PURSUIT is the sole Pursuit fight: it spins the real record. Same arrangement
// and attack grammar as the PURSUIT_BOSS base above (which now only serves as
// that shared source of truth) — only the sound source is real. It plays
// public/boss/pursuit.mp3 through the Mp3Engine; the live sync nudge in the
// fight slides the record so its downbeats sit under the attacks (and skips any
// silent intro). Bake the dialed-in number into `offsetS`. If the file isn't
// present, the boss shows where to drop it.
const PURSUIT_MP3_BOSS: BossDef = {
  ...PURSUIT_BOSS,
  id: 'pursuit-mp3',
  mp3: { url: '/pursuit.mp3', offsetS: 0 },
};

export const BOSSES: BossDef[] = [PURSUIT_MP3_BOSS, SATISFACTION_BOSS];
