// The texture seat's two weapons: fields that hurt whatever stands in them.
//
// LED BY THE SOUND (#266). `pad` and `air` are BEDS — they have no firing
// moment at all, they are simply on. So their weapons have no firing moment
// either: no shot, no swing, no trigger. A field surrounds the player and
// damages continuously for as long as the weapon is owned.
//
// THIS IS THE ONE PLACE THE CONTROL IS INVENTED RATHER THAN REPRODUCED, and
// #266 flagged it rather than hiding it. Every other weapon in the game is
// driven by a chart trigger; these are driven by a clock, because a held sound
// has no trigger to be driven by. #255's audibility rule permits it — silence
// means not attacking, but an audible event need not produce exactly one
// attack.
//
// DAMAGE ONLY. No slow, no pull, no push. The designer's worry was a base that
// plays itself — "I don't wanna create a super safe feeling for players where
// they can easily break the game by just getting this area weapon" — and it is
// the right worry: a defensive aura that is always on removes positioning,
// which is the whole skill of the genre. A field that only damages does the
// opposite. It has no reach, so it only does anything when you walk INTO the
// crowd, which is what makes Garlic the most aggressive weapon in Vampire
// Survivors rather than the safest.
//
// The two sit at opposite ends of one axis, which is what makes holding both a
// real decision rather than a doubled-up one:
//
//     pad   small, strong    you have to be in it, and it kills
//     air   wide, weak       covers the ground, finishes the wounded

import type { Role } from '../../audio/kits';
import type { WeaponConf } from '../config';
import type { WeaponContext } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

// ---------------- The seat's evolutions (#273) -------------------------------
//
// DAMAGE ONLY, STILL. #255's floor rule and the designer's own worry about a base
// that plays itself are why these fields damage and do nothing else, and an
// evolution is not a licence to revisit that: neither of the two below slows,
// pulls, pushes, shields or heals. What they change is WHERE the damage is and
// WHEN, which is the only axis this seat is allowed to grow along.
//
// TWO DIFFERENT ANSWERS, because the two voices are opposites and #266 put them
// at opposite ends of one axis on purpose. Giving them the same evolution would
// collapse that.
//
//     pad -> Tide         the field BREATHES on the pulse
//     air -> Slipstream   the field leaves a WAKE along where you walked
//
// The evolution rides in the stats rather than in a role test, so the shared
// instance below never asks which weapon it is.

/** Tide: the pad's field swells and falls on the pulse, widest and fiercest at
 *  the crest.
 *
 *  A PAD IS THE HARMONY AND IT HAS TO MOVE — #266's own finding, and the reason
 *  the pad's sound is a composed four-bar cycle rather than a held note. The base
 *  weapon does not move at all: it is one radius, forever. This is that cycle made
 *  into gameplay, and it turns an always-on weapon into one the player can PLAY:
 *  the crest is a window, so diving into the crowd on the swell is worth more than
 *  diving at random, and the trough is when to be somewhere else.
 *
 *  A pure function of the clock — no state, nothing to reset. */
interface TideEvolution {
  readonly kind: 'tide';
  /** Seconds for one full swell. Eight beats at the soundset's 122 bpm, so the
   *  breathing is in time with what the player is hearing rather than on a period
   *  of its own. */
  readonly swellPeriodS: number;
  /** Radius at the trough and at the crest, as multiples of the tier's. */
  readonly troughRadiusMul: number;
  readonly crestRadiusMul: number;
  /** Damage at the trough and at the crest, as multiples of the tier's. Wide AND
   *  hard at the same moment, deliberately: a crest that traded reach for power
   *  would be a wash rather than a window, and the point is that there is a right
   *  moment to be standing in the crowd. */
  readonly troughDamageMul: number;
  readonly crestDamageMul: number;
}

/** Slipstream: the air's field sheds a fading wake, so everywhere the player has
 *  just walked keeps hissing behind them.
 *
 *  MOVEMENT BECOMES THE WEAPON, which is the one verb this genre is entirely made
 *  of and which no other weapon in the game rewards directly. The base air field
 *  covers ground by being wide; this covers ground by being where you WENT, so a
 *  player who kites in a long arc leaves a burning corridor and a player who
 *  stands still leaves a puddle.
 *
 *  The live field narrows to pay for it: coverage moves out of the radius and into
 *  the trail.
 *
 *  NOT THE DRONE. A drone field is one big circle the player DELIBERATELY plants
 *  and abandons for seven seconds; these are small, many, automatic, and gone in
 *  under two. One marks a place, the other draws a path. */
interface SlipstreamEvolution {
  readonly kind: 'slipstream';
  /** Seconds between puffs. Short: gaps in a wake read as a dotted line rather
   *  than as a trail. */
  readonly puffEveryS: number;
  /** Seconds a puff lasts, and how many may be live at once. Together they are how
   *  long the trail is; the cap is what keeps a standing player from stacking an
   *  unbounded pile on one spot. */
  readonly puffLifeS: number;
  readonly maxPuffs: number;
  /** Puff radius and damage as multiples of the tier's. */
  readonly puffRadiusMul: number;
  readonly puffDamageMul: number;
  /** What the live field around the player shrinks to. Under 1: the wake is paid
   *  for out of the radius. */
  readonly liveRadiusMul: number;
}

type AuraEvolution = TideEvolution | SlipstreamEvolution;

interface AuraStats extends WeaponStats {
  /** Seconds between damage passes. The field is continuous; its DAMAGE is not,
   *  because sixty hits a second would be unreadable and would make every
   *  number in the game meaningless. */
  readonly tickS: number;
  /** What this field becomes at max level. */
  readonly evolution: AuraEvolution;
}

/** One puff of Slipstream's wake: a small field dropped where the player was. */
interface Puff {
  /** Identity for the view, so each puff keeps its own graphic. They overlap and
   *  expire independently — sharing one key would make them fight over a single
   *  graphic, and a keyed field is the whole reason a moving player does not drag
   *  a smear behind them. */
  key: string;
  x: number;
  y: number;
  radius: number;
  damage: number;
  expiresAt: number;
  nextTickAt: number;
}

const QUERY_PAD = 24;

/** One aura, driven by the clock rather than by a chart trigger. */
class AuraInstance implements WeaponInstance {
  private nextTickAt = 0;
  /** Slipstream's wake. Empty in every other mode — the pad never fills it, and
   *  the air only does once evolved. Kept on the shared instance rather than
   *  behind a second class because the always-on field, which is the bulk of both
   *  weapons, is identical either way. */
  private puffs: Puff[] = [];
  private nextPuffAt = 0;
  private nextPuffKey = 0;

  constructor(private readonly stats: AuraStats) {}

  /** Never called in practice: a bed is never sequenced, so no trigger for this
   *  weapon ever arrives. Implemented anyway because the interface requires it
   *  and because a stack may yet drive a texture voice from a chart — in which
   *  case the field is already running and the trigger is simply redundant. */
  fire(): void {}

  tick(ctx: WeaponContext): void {
    // Asked for, not handed in. This is the whole reason WeaponContext.conf
    // exists: a clock-driven weapon has no fire() call to receive its tuning
    // through.
    const conf = ctx.conf();
    if (!conf) return;
    const p = ctx.player;
    // A LIVE read of ctx.evolved, like every other field in this file: a bed has
    // no firing moment to freeze a mode at, so there is nothing here that could be
    // frozen even in principle.
    const evolution = ctx.evolved ? this.stats.evolution : null;

    // Tide's swell, and a flat field in every other mode. Both multipliers come
    // off one phase so the field is always at its widest and its hardest on the
    // same beat — that coincidence IS the window.
    let radiusMul = 1;
    let damageMul = 1;
    if (evolution?.kind === 'tide') {
      const phase = (Math.sin((ctx.timeS / evolution.swellPeriodS) * Math.PI * 2) + 1) * 0.5;
      radiusMul = lerp(evolution.troughRadiusMul, evolution.crestRadiusMul, phase);
      damageMul = lerp(evolution.troughDamageMul, evolution.crestDamageMul, phase);
    } else if (evolution?.kind === 'slipstream') {
      radiusMul = evolution.liveRadiusMul;
    }
    const reach = conf.radius! * radiusMul;

    // THE SHAPE IS REPORTED EVERY FRAME, THE DAMAGE IS NOT. Two different
    // clocks, and conflating them was the first bug here: drawing only on the
    // damage tick made the field flash two or three times a second, so it read
    // as a repeated effect rather than as a thing that is simply on.
    //
    // Reported by KEY, so the view keeps one graphic and moves it. That is the
    // second bug: an effect re-spawned every frame leaves its older copies at
    // the positions they were emitted, and on a moving player that reads as the
    // field being dragged along behind rather than worn.
    ctx.fx({ type: 'aura', x: p.x, y: p.y, radius: reach, color: ctx.color, key: ctx.role });

    // Before the live field's own pass, so each near() result is fully consumed
    // before the next call replaces this context's one scratch buffer.
    if (evolution?.kind === 'slipstream') this.tickWake(ctx, conf, evolution);

    if (ctx.timeS < this.nextTickAt) return;
    this.nextTickAt = ctx.timeS + this.stats.tickS;
    const damage = conf.damage * damageMul;
    for (const e of ctx.near(p.x, p.y, reach + QUERY_PAD)) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > reach + e.radius) continue;
      ctx.damage(e, damage);
    }
  }

  /** Slipstream's wake: drop a puff where the player is, then run every live puff.
   *
   *  A PUFF IS A DRONE FIELD IN MINIATURE and is owned the same way — this
   *  module's own array, never the world's zones, because ctx.zones() hands back
   *  every zone on the field and the chord module steps all of them. Anything
   *  spawned through that shared array would tick on the chord's cadence and pay
   *  its damage into the chord's total.
   *
   *  Two clocks again: every puff is DRAWN every frame and BITES on the seat's own
   *  tickS. */
  private tickWake(ctx: WeaponContext, conf: WeaponConf, evolution: SlipstreamEvolution): void {
    const p = ctx.player;
    if (ctx.timeS >= this.nextPuffAt) {
      this.nextPuffAt = ctx.timeS + evolution.puffEveryS;
      this.puffs.push({
        key: `${ctx.role}:wake:${this.nextPuffKey++}`,
        x: p.x,
        y: p.y,
        radius: conf.radius! * evolution.puffRadiusMul,
        damage: conf.damage * evolution.puffDamageMul,
        expiresAt: ctx.timeS + evolution.puffLifeS,
        // Bites on the frame it is dropped rather than waiting out an interval,
        // the same way a chord zone lands its first tick immediately.
        nextTickAt: ctx.timeS,
      });
      // Oldest out first. A player standing still would otherwise stack puffs on
      // one spot for as long as they stood there.
      while (this.puffs.length > evolution.maxPuffs) this.puffs.shift();
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (ctx.timeS >= puff.expiresAt) {
        this.puffs.splice(i, 1);
        continue;
      }
      ctx.fx({
        type: 'aura',
        x: puff.x,
        y: puff.y,
        radius: puff.radius,
        color: ctx.color,
        key: puff.key,
      });
      if (ctx.timeS < puff.nextTickAt) continue;
      puff.nextTickAt = ctx.timeS + this.stats.tickS;
      for (const e of ctx.near(puff.x, puff.y, puff.radius + QUERY_PAD)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - puff.x, e.y - puff.y) > puff.radius + e.radius) continue;
        ctx.damage(e, puff.damage);
      }
    }
  }

  reset(): void {
    this.nextTickAt = 0;
    this.puffs.length = 0;
    this.nextPuffAt = 0;
    this.nextPuffKey = 0;
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function aura(role: Role, stats: AuraStats): WeaponModule {
  return {
    role,
    stats,
    tickAt: 'zones' satisfies TickPhase,
    create: () => new AuraInstance(stats),
  };
}

// Small and strong: you have to be standing in the crowd for this to do
// anything, and when you are, it is the highest damage-per-second in the seat.
const PAD_STATS: AuraStats = {
  tiers: [
    { damage: 3, radius: 78 },
    { damage: 3.6, radius: 78 },
    { damage: 4.3, radius: 86 },
    { damage: 5, radius: 86 },
    { damage: 5.8, radius: 94 },
    { damage: 6.6, radius: 94 },
    { damage: 7.5, radius: 102 },
    { damage: 8.6, radius: 110 },
  ],
  tierLines: [
    'a close field that hurts to stand in',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'maximum bite',
  ],
  tickS: 0.35,
  evolution: {
    kind: 'tide',
    swellPeriodS: (60 / 122) * 8,
    troughRadiusMul: 0.7,
    crestRadiusMul: 1.6,
    troughDamageMul: 0.75,
    crestDamageMul: 1.5,
  },
};

// Wide and weak: covers ground rather than killing outright, and finishes
// what everything else left standing.
const AIR_STATS: AuraStats = {
  tiers: [
    { damage: 1, radius: 155 },
    { damage: 1.2, radius: 155 },
    { damage: 1.4, radius: 175 },
    { damage: 1.6, radius: 175 },
    { damage: 1.9, radius: 195 },
    { damage: 2.2, radius: 195 },
    { damage: 2.5, radius: 215 },
    { damage: 2.9, radius: 235 },
  ],
  tierLines: [
    'a wide, faint field',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'maximum spread',
  ],
  tickS: 0.5,
  evolution: {
    kind: 'slipstream',
    puffEveryS: 0.18,
    puffLifeS: 1.8,
    maxPuffs: 12,
    puffRadiusMul: 0.42,
    puffDamageMul: 0.75,
    liveRadiusMul: 0.75,
  },
};

export const PAD = aura('pad', PAD_STATS);
export const AIR = aura('air', AIR_STATS);
