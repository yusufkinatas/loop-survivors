// Perform the track v2: swappable SECTIONS that re-arrange, and a charged DROP.
//
// A real track is not a monotonic ramp — it has a home groove, a stripped-back
// breakdown that buys space, an aggressive build that loads the spring, and a
// drop that releases it. Loop Survivors' build only ever ADDS instruments, so
// the mix only ever thickens. Sections give the player a live performance verb
// on top of the build: press a key to reshape what the band PLAYS right now.
//
// Two experts (a music producer and a game designer) converged on the model in
// docs/phases/perform-the-track-v2.md. The key moves over v1:
//   - Sections change PATTERNS, not just muting. A section is a bundle of
//     read-time chart transforms (thin / densify / drop-out) plus a master
//     low-pass sweep and transition synths, all owned by the audio engine.
//   - The baseline is the FLOOR, not the ceiling. GROOVE is neutral; BREAK
//     pushes toward defense, CLIMB pushes toward aggression (and IS the wind-up
//     that charges the drop). No section is "voluntarily play weaker".
//   - The drop is earned only by fighting through CLIMB, fired manually, and
//     lands quantized on the next phrase downbeat after a short gap.
//
// Coupling stays honest (Model A, docs/plan.md): the engine's per-section
// transform decides which chart events actually fire, and a trigger that does
// not fire deals no damage — so re-arranging the mix is re-arranging the damage.
//
// Determinism: GROOVE is the identity transform with every multiplier 1. The
// autoplay bot and every seeded replay never leave GROOVE and never press a
// key, so all section / charge / drop state is inert for them — bit-identical
// to before.

import type { Slot } from './band';

export type SectionId = 'groove' | 'break' | 'climb';

/** How the audio engine rewrites a voice's chart in this section. */
export type SectionTransform = 'identity' | 'strip' | 'build';

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
   *  that is not audible has its weapon silenced (no sound, no damage). Only
   *  meaningful for the 'strip' transform. */
  audible: 'all' | ReadonlySet<Slot>;
  /** How the engine rewrites the surviving voices' patterns. */
  transform: SectionTransform;
  /** Damage dealt by the weapons that ARE playing (explicit trade on top of the
   *  pattern change, so the stance reads even muted — Pillar 3). */
  dmgMul: number;
  /** Contact damage the player takes (the defense trade). Instant on request. */
  contactTakenMul: number;
  /** Player move speed. Instant on request. */
  moveMul: number;
  /** Soft unlock: the section is selectable only once the band owns this many
   *  voices. With too few instruments there is nothing to strip or build. */
  minVoices: number;
  /** Chip accent + arena edge tint. */
  color: number;
  /** Arena-vignette CSS suffix (perf-<tint>), or '' for the neutral home. */
  tint: string;
}

export const SECTIONS: Record<SectionId, Section> = {
  // GROOVE — the home floor. The whole band, balanced. This is the baseline the
  // rest of the game was tuned against: every multiplier is 1, the identity
  // transform, always available. The bot and every replay live here.
  groove: {
    id: 'groove',
    label: 'GROOVE',
    line: 'The whole band. Balanced.',
    key: '1',
    code: 'Digit1',
    audible: 'all',
    transform: 'identity',
    dmgMul: 1,
    contactTakenMul: 1,
    moveMul: 1,
    minVoices: 1,
    color: 0x59ffd1,
    tint: '',
  },
  // BREAK — the panic-and-setup valve (round-3 recast). Strip to the low end
  // and the pad, muffle the top (the engine sweeps a low-pass down). While held
  // it pulses a knockback + slow shove — the kit's only hard crowd-control, the
  // "make a hole" button when you're boxed in — AND banks a CONTRAST meter that
  // makes the next drop bigger (a breakdown's whole musical job is the contrast
  // that makes the release hit harder). You hit softer and are exposed, but you
  // buy space now and a huge drop later.
  break: {
    id: 'break',
    label: 'BREAK',
    line: 'Go quiet: shove the horde back, bank a bigger drop.',
    key: '2',
    code: 'Digit2',
    audible: new Set<Slot>(['pulse', 'bass', 'harmony']),
    transform: 'strip',
    dmgMul: 0.7,
    contactTakenMul: 0.5,
    moveMul: 1.25,
    minVoices: 2,
    color: 0x6ba8ff,
    tint: 'break',
  },
  // CLIMB — the aggressive build. The whole band climbs a rung and the density
  // ramps as you hold it, the filter opening; this is where the drop charges.
  // You deal the most damage AND take the most: loud and exposed at once. The
  // wind-up is a fight, not a wait. Reachable at a 3-voice band (something to
  // build with) — and the only way to arm the drop.
  climb: {
    id: 'climb',
    label: 'CLIMB',
    line: 'Expose yourself and arm the drop. No shield, no pickups.',
    key: '3',
    code: 'Digit3',
    audible: 'all',
    transform: 'build',
    // Round-4: CLIMB is a no-reward RISK stance, not a power spike. Weapon damage
    // is back to baseline (kill the old +35% that made it compete with the drop);
    // contactTakenMul below is the BASE of a ramp to CLIMB_CONTACT_MAX (run.ts).
    dmgMul: 1.0,
    contactTakenMul: 1.4,
    moveMul: 1.0,
    minVoices: 3,
    color: 0xffb454,
    tint: 'climb',
  },
};

export const SECTION_ORDER: readonly SectionId[] = ['groove', 'break', 'climb'];

/** The DROP: the payoff. Charged only in CLIMB, fired manually, resolves on the
 *  next phrase downbeat after a short gap (covered by i-frames so the silence
 *  reads as euphoric invulnerability, not helplessness). On resolve the band
 *  slams back to GROOVE, a screen-clearing shockwave rips out, and a short hype
 *  window doubles the whole band's damage. Requires a 3-voice band. */
export const DROP = {
  code: 'Space',
  /** Voices the band must own before the drop can arm (needs a low-end return
   *  + something to slam). Below this the payoff would not read. */
  minVoices: 3,
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
  /** A breath of safety AFTER the slam lands, added on top of the gap i-frames,
   *  so the drop always clears space. */
  iframesS: 0.7,
  color: 0xfff2a8,
};

// --- Charge economy (v2): the drop is earned by fighting through CLIMB -------
//
// v1 banked "energy" from time in ANY section plus a combat kicker, so a drop
// landed on a passive timer. v2 replaces that: charge accrues ONLY in CLIMB,
// from time held (the spring loading) plus a kicker from damage dealt (so
// fighting the climb, not just enduring it, fills the meter). No CLIMB, no
// charge; the music is the cooldown.

/** Charge per second of holding CLIMB (the spring loading on its own). At this
 *  rate a pure hold arms in ~14s; fighting fills it faster. */
export const CLIMB_CHARGE_PER_S = 0.11;
/** Charge per point of effective damage dealt while in CLIMB. Kept small so the
 *  kicker still rewards fighting but cannot trivially skip the min-climb. */
export const CHARGE_PER_DAMAGE = 0.00003;
/** Charge caps here. Past 1.0 (armed) the extra "overcharge" scales the drop's
 *  slam, so riding the climb longer trades exposure for a bigger clear — the
 *  "pop now vs push for the huge one" decision. At CLIMB_CHARGE_PER_S a pure
 *  hold reaches 1.0 (full drop) around 8.7s and the overcharge tail runs to the
 *  ceiling (~17.5s) for a bigger drop. */
export const CHARGE_MAX = 1.6;

// --- CLIMB: the exposed-risk ramp + the brownout (round-4) -------------------
//
// CLIMB gets more dangerous every bar (contact damage taken ramps from the base
// to a ceiling), the horde leans in, and you cannot resolve until a real climb
// has happened (min-arm), nor hold the build forever (the ceiling browns out).
// All of these are player-only (the bot stays in GROOVE), so a GROOVE-only world
// is bit-identical to before.

/** Contact-damage-taken ceiling at the end of a max climb (base is
 *  SECTIONS.climb.contactTakenMul = 1.4; run.ts ramps base -> this by climbT). */
export const CLIMB_CONTACT_MAX = 1.8;
/** The horde leans in during CLIMB: enemy speed toward the player ×this. */
export const CLIMB_ENEMY_SPEED_MUL = 1.15;
/** Minimum seconds in CLIMB before the drop can arm (~2 bars @110bpm). */
export const CLIMB_MIN_S = 4.4;
/** The build's hard ceiling (~8 bars); overstaying browns out (loses the payoff). */
export const CLIMB_CEILING_S = 17.5;

// --- BREAK: the crowd-control pulse + the contrast bank (round-3 recast) -----
//
// BREAK earns its key two ways. (1) A repeating knockback + slow "shove" — the
// only hard crowd-control in the kit, the panic button when you're surrounded.
// (2) A CONTRAST meter that banks while you sit in it and multiplies the next
// drop, so going quiet sets up a bigger release (a breakdown's real job).

/** Seconds between BREAK shove pulses (roughly a bar at mid tempo). */
export const BREAK_PULSE_S = 0.9;
/** Radius the shove reaches around the player. */
export const BREAK_PULSE_RADIUS = 260;
/** How far the shove throws caught enemies (at full potency). */
export const BREAK_PULSE_KNOCK = 190;
/** Seconds the shove slows caught enemies (at full potency). */
export const BREAK_PULSE_SLOW_S = 1.4;

// --- The shove tires (kills BREAK-camping without a forced switch) -----------
//
// The developer's principle: sections are stances you hold at will — the game
// must never switch for you. So BREAK-camping is fixed by an opportunity cost,
// not a kick-out: the shove LOSES potency the longer you sit in BREAK, and only
// recovers once you LEAVE (any other stance resets it to full). You can still
// camp as long as you like; it just stops being a free wall — by the time the
// shove is a limp nudge the crowd (which leans in during BREAK, see moveEnemies)
// walks through it. Leaving to "breathe" and returning is your call, not the
// game's. Player-only: the bot never enters BREAK, so GROOVE stays bit-identical.
//
/** Seconds of continuous BREAK for the shove to fade from full to its floor. */
export const BREAK_SHOVE_FADE_S = 6;
/** Potency floor the fading shove settles at (a nudge, never nothing). */
export const BREAK_SHOVE_FLOOR = 0.2;

// --- The horde reacts to the section you're performing (round-5) -------------
//
// Sections were a player-side monologue the board ignored. Now the crowd answers
// the stance you're in — the same enum the sim already tracks, so a GROOVE-only
// run (bot/replay) sees every multiplier at its identity value and stays
// bit-identical. This makes the muted game read better too (Pillar 3): you can
// SEE the music in how the horde moves.
//
/** BREAK: the crowd leans IN on the beat. Chase speed pulses from this floor
 *  (just after a shove) up to BREAK_LEAN_MAX (right before the next one), so
 *  they creep back between shoves and surge into the next pulse. */
export const BREAK_LEAN_MIN = 0.5;
export const BREAK_LEAN_MAX = 1.15;
/** DROP hype window: survivors reel from the slam — dazed, slow to recover. */
export const DROP_DAZE_MUL = 0.6;

/** Contrast banked per second held in BREAK (caps at CONTRAST_MAX ~= 2 bars). */
export const CONTRAST_PER_S = 0.22;
/** Contrast cap. The next drop's slam scales by (1 + contrast), so a full
 *  breakdown roughly doubles the clear; a quick dip barely changes it. */
export const CONTRAST_MAX = 0.9;
