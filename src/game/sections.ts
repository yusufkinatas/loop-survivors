// Perform the track: swappable SECTIONS.
//
// A real track is not a monotonic ramp — it has an intro, a groove, a
// stripped-back breakdown, a build-up, and a drop. Loop Survivors' build only
// ever ADDS instruments, so the mix only ever thickens. Sections give the
// player a live performance verb on top of the build: press a key to reshape
// which band members are playing right now, each swap a real offense / defense /
// economy trade, and bank ENERGY toward a screen-clearing DROP.
//
// Coupling stays honest (Model A, docs/plan.md): a section decides which slots
// are AUDIBLE, and a muted slot's weapon does not fire — so pulling instruments
// out of the mix is exactly pulling their damage out of the world. The section
// is the arrangement and the fire-control at once.
//
// This is player-only live input: the bot never switches section, so the
// default GROOVE section (all multipliers 1, all slots audible, no drop) leaves
// every existing seeded replay bit-identical.

import type { Slot } from './band';

export type SectionId = 'groove' | 'breakdown' | 'buildup';

export interface Section {
  id: SectionId;
  /** Player-facing name (Pillar 2: no producer jargon — these are plain). */
  label: string;
  /** One plain-words line for the HUD chip / tooltip. */
  line: string;
  /** Display key and its KeyboardEvent.code. */
  key: string;
  code: string;
  /** Which band positions play in this section. 'all' = the full band. A slot
   *  that is not audible has its weapon silenced (no sound, no damage). */
  audible: 'all' | ReadonlySet<Slot>;
  /** Damage dealt by the weapons that ARE playing, on top of the muting. */
  dmgMul: number;
  /** Contact damage the player takes (defense trade). */
  contactTakenMul: number;
  /** Player move speed. */
  moveMul: number;
  /** Energy charge-rate multiplier (economy trade). */
  chargeMul: number;
  /** Chip accent color. */
  color: number;
}

export const SECTIONS: Record<SectionId, Section> = {
  // The verse: the whole band, balanced. This is the baseline the rest of the
  // game was tuned against — every multiplier is 1 and every slot is audible.
  groove: {
    id: 'groove',
    label: 'FULL',
    line: 'The whole band. Balanced.',
    key: '1',
    code: 'Digit1',
    audible: 'all',
    dmgMul: 1,
    contactTakenMul: 1,
    moveMul: 1,
    chargeMul: 1,
    color: 0x59ffd1,
  },
  // The breakdown: strip to the low end and the pad — sparse and quiet. You
  // hit softer, but you shrug off contact and move quick, and energy pours in.
  // The regroup: go here to survive a swarm and load the spring.
  breakdown: {
    id: 'breakdown',
    label: 'BREAKDOWN',
    line: 'Stripped back. Tough, quick, soft-hitting. Banks energy.',
    key: '2',
    code: 'Digit2',
    audible: new Set<Slot>(['pulse', 'bass', 'harmony']),
    dmgMul: 0.55,
    contactTakenMul: 0.5,
    moveMul: 1.2,
    chargeMul: 1.8,
    color: 0x6ba8ff,
  },
  // The build-up: everything drops out but the kick and the FX riser. Nearly
  // disarmed and exposed, but the energy floods — the tense bar before the
  // drop. A gamble: buy the drop faster by going briefly toothless.
  buildup: {
    id: 'buildup',
    label: 'BUILD-UP',
    line: 'Almost silent and exposed — but energy floods in.',
    key: '3',
    code: 'Digit3',
    audible: new Set<Slot>(['pulse', 'fx']),
    dmgMul: 0.2,
    contactTakenMul: 1.1,
    moveMul: 1.0,
    chargeMul: 3.0,
    color: 0xffb454,
  },
};

export const SECTION_ORDER: readonly SectionId[] = ['groove', 'breakdown', 'buildup'];

/** The DROP: the payoff. Armed at full energy, spent with SPACE. In a beat it
 *  all slams back to the full band, a screen-clearing shockwave rips out, and a
 *  short hype window doubles the whole band's damage. */
export const DROP = {
  code: 'Space',
  /** Hype window after the slam: the whole band amped. */
  windowS: 6,
  dmgMul: 2.0,
  areaMul: 1.4,
  moveMul: 1.15,
  /** The slam shockwave (scaled by the run's powerMul like any weapon). */
  radius: 660,
  shockDamage: 280,
  shockSpeed: 940,
  knockback: 150,
  /** A breath of safety as the drop lands, so it always clears space. */
  iframesS: 0.7,
  color: 0xfff2a8,
};

/** Energy (0..1) charges from time-in-section (so BUILD-UP and BREAKDOWN can
 *  bank it despite dealing little) plus a combat kicker from damage dealt (so
 *  GROOVE rewards fighting). Tuned for a drop roughly every 20-30s of play. */
export const ENERGY_BASE_RATE = 0.032; // per second at chargeMul 1
export const ENERGY_PER_DAMAGE = 0.000028; // per point of effective damage dealt
