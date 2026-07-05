// The three bosses. Each one IS a real track (an ear-tested Track Lab cover),
// and the track's structure drives the fight: sections are phases, beats are
// attacks. The player never damages the boss — the boss dies when its song
// ends. What makes the three feel drastically different is the attack grammar
// each one speaks on the beat:
//
//   METAMORPHOSIS — close-range brawler. A body that hunts you, slams the
//     ground on every heavy kick, and lunges on the snare. You fight in its
//     face and dodge with the dash.
//   SATISFACTION — bullet hell. An anchored core that paints the arena with
//     beat-locked rings and spirals. You read the gaps and weave.
//   PURSUIT — arena hazard / rhythm survival. The room itself attacks:
//     center shockwaves, sweeping laser bars, and a lane grid that leaves one
//     safe corridor per bar. You survive by standing in the right place when
//     the beat lands.

import { METAMORPHOSIS } from '../tracklab/tracks/metamorphosis';
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
// 1. METAMORPHOSIS — close-range brawler
// ---------------------------------------------------------------------------

const META_PALETTE: BossPalette = {
  boss: 0xd14b8f,
  bullet: 0xff6bd6,
  beam: 0xa06bff,
  accent: 0xff5a3c,
  bg: 0x140a1a,
};

const META_CHASE: Record<string, number> = {
  intro: 78,
  drop: 132,
  peak: 158,
  break: 60,
  finale: 182,
};

const METAMORPHOSIS_BOSS: BossDef = {
  id: 'metamorphosis',
  name: 'METAMORPHOSIS',
  archetype: 'Close-range brawler',
  tagline: 'It hunts you down. Slams on the kick, lunges on the snare. Stay close, dash out.',
  track: METAMORPHOSIS,
  // intro → drop → peak → break → drop → finale (the record's own escalation).
  arrangement: [
    { sectionId: 'intro', bars: 8 },
    { sectionId: 'drop', bars: 16 },
    { sectionId: 'peak', bars: 16 },
    { sectionId: 'break', bars: 8 },
    { sectionId: 'drop', bars: 16 },
    { sectionId: 'finale', bars: 16 },
  ],
  palette: META_PALETTE,
  bossRadius: 44,
  behavior: 'chase',
  chaseSpeed: 90,
  contactDamage: 13,
  spawn: { x: 0, y: -0.12 },
  onSectionEnter(sectionId, _i, world) {
    world.boss.chaseSpeed = META_CHASE[sectionId] ?? 120;
    world.boss.contactDamage = sectionId === 'finale' ? 16 : sectionId === 'break' ? 10 : 13;
  },
  onStep(info, world) {
    const P = META_PALETTE;
    const b = world.boss;
    const { sectionId, stepInBar } = info;

    if (sectionId === 'intro') {
      if (info.isDownbeat) {
        world.pulseBoss(0.6);
        if (info.absBar % 2 === 0) {
          world.shock({ x: b.x, y: b.y, rMax: 520, speed: 520, thickness: 30, damage: 11, warnT: 0.24, color: P.beam });
        }
      }
      return;
    }

    if (sectionId === 'break') {
      // breather: no slams, just a slow chase and the odd puddle underfoot.
      if (info.isDownbeat && info.absBar % 2 === 0) {
        world.zone({ x: world.player.x, y: world.player.y, radius: 92, warnT: 0.7, liveT: 0.35, damage: 11, color: P.accent });
      }
      return;
    }

    // KICK on beat 1 (half-time 808): ground slam under the boss.
    if (stepInBar === 0) {
      world.pulseBoss(1);
      world.shock({ x: b.x, y: b.y, rMax: 660, speed: 640, thickness: 34, damage: 13, warnT: 0.2, color: P.beam });
      if (sectionId === 'peak' || sectionId === 'finale') {
        const n = sectionId === 'finale' ? 14 : 10;
        world.radial(b.x, b.y, n, 236, { color: P.bullet, offset: info.absBar * 0.5, radius: 8, damage: 10 });
      }
    }

    // SNARE on beat 3 (the backbeat crack): telegraph a melee arc, then lunge.
    if (stepInBar === 8) {
      const ang = world.aimAt(b.x, b.y);
      world.arc({ cx: b.x, cy: b.y, angle: ang, half: Math.PI / 2.6, reach: 196, warnT: 0.3, liveT: 0.18, damage: 14, color: P.beam });
      world.bossLungeAt(world.player.x, world.player.y, sectionId === 'finale' ? 900 : 720, 0.16);
    }

    // FINALE rage: an extra aimed volley on beat 4.
    if (sectionId === 'finale' && stepInBar === 12) {
      world.aimedSpread(b.x, b.y, 5, 0.9, 300, { color: P.bullet, radius: 7, damage: 10 });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. SATISFACTION — bullet hell
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
  onSectionEnter(_sectionId, i, world) {
    // Drift the core between phases so its rings come from a fresh angle.
    world.boss.homeX = ((i % 3) - 1) * ARENA.w * 0.16;
    world.boss.homeY = -ARENA.h * 0.16;
  },
  onStep(info, world) {
    const P = SAT_PALETTE;
    const b = world.boss;
    const cx = b.x;
    const cy = b.y;
    const spiral = info.absStep * 0.16; // continuous rotation for spiral arms
    const { sectionId, stepInBar } = info;

    if (info.isBeat) world.pulseBoss(0.7);

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
// 3. PURSUIT — arena hazard / rhythm survival
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

export const BOSSES: BossDef[] = [METAMORPHOSIS_BOSS, SATISFACTION_BOSS, PURSUIT_BOSS];
