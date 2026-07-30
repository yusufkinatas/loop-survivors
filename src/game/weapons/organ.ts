// The Organ weapon module: a long sustained beam that holds while the note
// rings — and its evolution, Wall of Sound, which turns that beam ninety degrees
// and stands it across the ground ahead of you. Base and evolved live in the same
// module; evolving flips an internal mode (ctx.evolved).
//
// LED BY THE SOUND (#266). The organ is the palette's held harmonic voice — a
// pipe speaks and keeps speaking. A beam is the only shape that says the same
// thing: it does not fire and finish, it is ON for as long as the note is, and
// it damages whatever stands in it the whole time.
//
// THE ONLY BEAM IN THE GAME, and the reason it can exist cheaply is that the
// kick already needs rectangle-versus-circle maths for its strip. Same test,
// very different rectangle: the kick's is short, wide and beside you for a
// twelfth of a second; this is long, narrow, ahead of you, and it holds.

import { type WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface OrganStats extends WeaponStats {
  /** Beam length and half-thickness at area 1, in H800 world units. */
  readonly reach: number;
  readonly halfWidth: number;
  /** Seconds a beam stays lit. Long: this is the held voice, and a beam that
   *  blinks is a muzzle flash. */
  readonly holdS: number;
  /** Seconds between damage passes down a live beam. A body standing in it is
   *  hit repeatedly, which is what "sustained" has to mean for damage. */
  readonly tickS: number;

  // ---------------- Wall of Sound (evolved) --------------------------------
  //
  // THE SHAPE TURNS NINETY DEGREES, and that one change is the whole evolution.
  // The base beam points down your aim line: you shoot along it, and what it hits
  // is whatever happens to be in front of you. Evolved, the same held note is
  // laid ACROSS your aim instead — a long bar of light standing on the ground a
  // little ahead of you, holding for seconds while the crowd walks into it.
  //
  // WHICH CHANGES WHAT AIMING MEANS. Down a line, aiming asks "what is in front
  // of me right now". Across it, aiming asks "where are they coming FROM" — you
  // are cutting off an approach rather than picking a target, and a wall put down
  // in the wrong place is simply not where anybody walks. The organ stops being a
  // weapon you point and becomes ground you own.
  //
  // A big pipe organ is described as a wall of sound for a reason; it fills a
  // room rather than aiming at anyone in it. This is that, made literal.
  //
  // NOT A BARRIER IN THE PHYSICAL SENSE. It blocks nothing and stops nobody, in
  // line with every other shape in the game — it only hurts what walks through.

  /** How much longer the wall holds than the beam. The base beam is one note
   *  ringing; this is the note held down — a bar of it. */
  readonly evolvedHoldMul: number;
  /** How many walls may stand at once, oldest retired first.
   *
   *  THE FIRST VERSION HAD NO CAP AND IT WAS UNPLAYABLE. Held 3.15 s against this
   *  weapon's own chart density, EIGHT walls stood at once, each 700 units long and
   *  60 thick — a starburst of light with the arena somewhere underneath it, which
   *  is the same failure the reach note below records from the base beam's first
   *  pass. A hold multiplier cannot be the only lever: the chart decides the count,
   *  so the count needs its own limit.
   *
   *  It also turns out to be the better RULE. Two walls means the two you put down
   *  most recently are the ground you own, so placing a third is a decision to give
   *  up the first — which is a positional weapon rather than an accumulating one. */
  readonly evolvedMaxWalls: number;
  /** Wall length as a multiple of the beam's reach, and its half-thickness as a
   *  multiple of the beam's. Long and thick where the beam is long and thin. */
  readonly evolvedLengthMul: number;
  readonly evolvedHalfWidthMul: number;
  /** How far ahead of the player the wall stands, in world units. Far enough to
   *  be between them and the crowd, close enough that the player picked the spot
   *  rather than lobbed it. */
  readonly evolvedStandOffset: number;
  /** Per-pass damage as a multiple of the beam's. Under 1 because the wall runs
   *  three and a half times as many passes over its life; a body that genuinely
   *  stands in one still takes far more than the beam ever dealt. */
  readonly evolvedDamageMul: number;
}

const ORGAN_STATS: OrganStats = {
  // Per-PASS damage, and a beam runs several passes over its life.
  tiers: [
    { damage: 3, area: 1 },
    { damage: 3.6, area: 1 },
    { damage: 4.2, area: 1.12 },
    { damage: 4.8, area: 1.12 },
    { damage: 5.5, area: 1.24 },
    { damage: 6.2, area: 1.24 },
    { damage: 7, area: 1.36 },
    { damage: 8, area: 1.5 },
  ],
  tierLines: [
    'a beam that holds while the note rings',
    'damage up',
    'longer, wider',
    'damage up',
    'longer, wider',
    'damage up',
    'longer, wider',
    'maximum reach',
  ],
  // A THIRD OF THE FIRST PASS. At 420 x 26 the drawn beam came out 130 units
  // thick — the view draws its dark shell at 2.5x the width it is handed and a
  // solid white core inside that — which read as a wall of light across the
  // screen rather than as one instrument's attack.
  reach: 300,
  halfWidth: 9,
  holdS: 0.9,
  tickS: 0.12,

  // A bar at 122 bpm, so a wall stands for exactly as long as a phrase of the
  // music it came from.
  evolvedHoldMul: (60 / 122) * 4 / 0.9,
  evolvedMaxWalls: 2,
  evolvedLengthMul: 1.25,
  evolvedHalfWidthMul: 1.15,
  evolvedStandOffset: 120,
  evolvedDamageMul: 0.75,
};

interface LiveBeam {
  x: number;
  y: number;
  dx: number;
  dy: number;
  reach: number;
  halfWidth: number;
  damage: number;
  expiresAt: number;
  nextTickAt: number;
  /** A Wall of Sound rather than a beam. Decides only ONE thing — where the
   *  drawing is emitted from — because the damage pass is identical for both. A
   *  beam is drawn ONCE in fire() for its whole life; a wall is drawn EVERY FRAME
   *  from tick(), because a wall can be retired early by the cap and a one-shot
   *  drawing cannot be taken back. Emitting it per frame means the light stops
   *  within a frame of the damage stopping, which is the honest pairing the note
   *  on the base beam's `dur` argues for from the other direction. */
  wall: boolean;
}

class OrganInstance implements WeaponInstance {
  private beams: LiveBeam[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const dir = ctx.aimDir(0);
    const area = conf.area ?? 1;
    if (ctx.evolved) {
      this.raiseWall(ctx, conf, dir, area);
      return;
    }
    const hold = ORGAN_STATS.holdS * ctx.buildMods.durationMul;
    this.beams.push({
      x: p.x,
      y: p.y,
      dx: dir.x,
      dy: dir.y,
      reach: ORGAN_STATS.reach * area,
      halfWidth: ORGAN_STATS.halfWidth * area,
      damage: conf.damage,
      expiresAt: ctx.timeS + hold,
      // First pass immediately, so the beam bites the instant it lights.
      nextTickAt: ctx.timeS,
      wall: false,
    });
    // DRAWN ONCE, FOR ITS WHOLE LIFE. The beam is anchored at fire time and
    // never moves, so one emission is the honest one — and re-emitting an
    // additive effect every frame is what turned the first version into a solid
    // white bar across the screen.
    ctx.fx({
      type: 'beam',
      x: p.x,
      y: p.y,
      x2: p.x + dir.x * ORGAN_STATS.reach * area,
      y2: p.y + dir.y * ORGAN_STATS.reach * area,
      width: ORGAN_STATS.halfWidth * area,
      color: ctx.color,
      steady: true,
      // EXACTLY the beam's own life. Without this the view's default put the
      // drawing at 0.1 s against a 0.9 s beam, so it vanished almost at once
      // while the area kept damaging — a weapon hitting things through thin air.
      dur: hold,
    });
  }

  /** Wall of Sound: the same held note, laid ACROSS the aim instead of along it.
   *
   *  ONE LiveBeam, AND tick() NEEDS NO CHANGE. A wall is a capsule like a beam
   *  is, so it reuses the whole damage pass: what differs is only where the
   *  capsule starts and which way it runs. It is stored from its END rather than
   *  from the player — start at one tip, `reach` its full length along the
   *  perpendicular — because `inBeam` measures distance along the segment from
   *  (x, y), and that is what makes a wall CENTRED on the point the player aimed
   *  at rather than growing off one side of it. */
  private raiseWall(
    ctx: WeaponContext,
    conf: WeaponConf,
    dir: { x: number; y: number },
    area: number,
  ): void {
    const p = ctx.player;
    const hold = ORGAN_STATS.holdS * ORGAN_STATS.evolvedHoldMul * ctx.buildMods.durationMul;
    const length = ORGAN_STATS.reach * ORGAN_STATS.evolvedLengthMul * area;
    const halfWidth = ORGAN_STATS.halfWidth * ORGAN_STATS.evolvedHalfWidthMul * area;
    // The perpendicular of a unit vector, which is still a unit vector — so
    // `reach` stays a length in world units and inBeam's maths is unchanged.
    const runX = -dir.y;
    const runY = dir.x;
    const midX = p.x + dir.x * ORGAN_STATS.evolvedStandOffset;
    const midY = p.y + dir.y * ORGAN_STATS.evolvedStandOffset;
    const x = midX - runX * length * 0.5;
    const y = midY - runY * length * 0.5;
    this.beams.push({
      x,
      y,
      dx: runX,
      dy: runY,
      reach: length,
      halfWidth,
      damage: conf.damage * ORGAN_STATS.evolvedDamageMul,
      expiresAt: ctx.timeS + hold,
      nextTickAt: ctx.timeS,
      wall: true,
    });
    // Oldest out first, so the newest wall the player placed is always standing.
    // Only walls are capped: a base beam holds a fifth as long and is a fraction
    // of the size, so it has never needed one.
    while (this.beams.length > ORGAN_STATS.evolvedMaxWalls) this.beams.shift();
    // NOT DRAWN HERE — tick() draws it every frame. See LiveBeam.wall.
  }

  /** ANCHORED AT FIRE TIME, like the bass's Subquake and unlike the auras. A
   *  beam that swung around with the player would be a searchlight, and aiming
   *  it would stop being a decision — you would just point at whatever you
   *  happened to be facing this frame. */
  tick(ctx: WeaponContext): void {
    const now = ctx.timeS;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      if (now >= beam.expiresAt) {
        this.beams.splice(i, 1);
        continue;
      }
      // A wall is redrawn every frame, so that retiring one to the cap takes its
      // light with it. `steady` keeps that from stacking additively into a solid
      // slab — the exact failure the base beam hit when it was re-emitted — and the
      // short `dur` is what makes the drawing stop within a frame of the wall
      // going. A base beam draws nothing here: it was emitted once, in fire(), for
      // its whole life.
      if (beam.wall) {
        ctx.fx({
          type: 'beam',
          x: beam.x,
          y: beam.y,
          x2: beam.x + beam.dx * beam.reach,
          y2: beam.y + beam.dy * beam.reach,
          width: beam.halfWidth,
          color: ctx.color,
          steady: true,
          dur: 0.06,
        });
      }
      // Damage runs on its own slower cadence so a body standing in the beam
      // takes a readable series of hits rather than sixty a second.
      const midX = beam.x + beam.dx * beam.reach * 0.5;
      const midY = beam.y + beam.dy * beam.reach * 0.5;
      if (now < beam.nextTickAt) continue;
      beam.nextTickAt = now + ORGAN_STATS.tickS;
      const query = beam.reach * 0.5 + beam.halfWidth + QUERY_PAD;
      for (const e of ctx.near(midX, midY, query)) {
        if (e.dead) continue;
        if (!inBeam(e, beam)) continue;
        ctx.damage(e, beam.damage);
      }
    }
  }

  /** Every live beam is dropped: clearSandboxEntities promises no delayed
   *  strike survives, and a beam is exactly that — a damage pass scheduled to
   *  keep happening. */
  reset(): void {
    this.beams.length = 0;
  }
}

/** Slack around the rectangle before the exact test decides. Not tuning: the
 *  spatial hash already widens by the largest inserted radius and every
 *  candidate is cut again below. */
const QUERY_PAD = 24;

/** Is this body inside the beam?
 *
 *  A CAPSULE TEST, not a rectangle one. The shared `circleIntersectsRect` is
 *  axis-aligned, and a beam points wherever the player was aiming — so the
 *  honest shape is "within halfWidth of the line segment", which is both
 *  rotation-free to compute and a rounder, fairer hitbox at the beam's tip than
 *  a rotated box would be. */
function inBeam(e: WeaponTarget, beam: LiveBeam): boolean {
  const relX = e.x - beam.x;
  const relY = e.y - beam.y;
  // Distance along the beam, clamped to its length.
  const along = Math.max(0, Math.min(beam.reach, relX * beam.dx + relY * beam.dy));
  const offX = relX - beam.dx * along;
  const offY = relY - beam.dy * along;
  return Math.hypot(offX, offY) <= beam.halfWidth + e.radius;
}

export const ORGAN = {
  role: 'organ',
  stats: ORGAN_STATS,
  tickAt: 'strikes' satisfies TickPhase,
  create: () => new OrganInstance(),
} satisfies WeaponModule;
