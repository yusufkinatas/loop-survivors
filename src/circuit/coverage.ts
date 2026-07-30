// COVERAGE (#255 package 10): the answer matrix.
//
// Enemies are answerable only by certain kinds of sound. Armour only IMPACT
// cracks. Shields only a BRIGHT TRANSIENT cuts. Phasing things only a SUSTAINED
// sound catches. Three of one kind leaves a hole some wave walks through. This
// is the layer where musical balance is literally the win condition, and that
// sentence contains no theory words.
//
// IT RIDES THE PALETTE'S ATTACK AXIS, NOT ITS SEAT AXIS, and #256 called that
// separation load-bearing. Keyed to seat (low anchor / harmonic body / bright
// line) it would be role-exclusivity in a different hat and this stack would
// collapse into The Route with its exclusivity toggle on. Keyed to ATTACK, you
// can own a full band — one voice in every seat, a complete-looking mix — and
// still have nothing that cuts a shield.
//
// PLAYER-FACING WORDS, and none of them is a theory word (the L2 ceiling, #255):
// a body is ARMOURED, SHIELDED or PHASING, and what answers it is PUNCH, CUT or
// HOLD. "Impact", "bright transient" and "sustained" never reach the screen.

import { PALETTE_ATTACK, type Attack, type Role } from '../audio/kits';
import type { EnemyKind } from '../game/config';

/** What a body is wearing. `none` is the ordinary Hush body: anything hurts it. */
export type Armour = 'none' | 'armoured' | 'shielded' | 'phasing';

/** The armour a given attack answers. The matrix, in one map. */
const ANSWERED_BY: Readonly<Record<Attack, Armour>> = {
  impact: 'armoured',
  'bright-transient': 'shielded',
  sustained: 'phasing',
};

/** The attack that answers a given armour — the same matrix, read backwards. */
export const ANSWERS: Readonly<Record<Exclude<Armour, 'none'>, Attack>> = {
  armoured: 'impact',
  shielded: 'bright-transient',
  phasing: 'sustained',
};

/** The three words the player sees for the three answers. PUNCH / CUT / HOLD. */
export const ATTACK_VERB: Readonly<Record<Attack, string>> = {
  impact: 'PUNCH',
  'bright-transient': 'CUT',
  sustained: 'HOLD',
};

/** And the three words for what is wearing the armour. */
export const ARMOUR_LABEL: Readonly<Record<Armour, string>> = {
  none: '—',
  armoured: 'ARMOURED',
  shielded: 'SHIELDED',
  phasing: 'PHASING',
};

/** Ring colours for the tell drawn on the body. Deliberately NOT the weapon
 *  colours — a body's armour is a property of the enemy, and reusing a voice's
 *  hue would read as "this enemy belongs to that instrument". Cold steel for
 *  armour, white-blue for a shield, violet for something half-there. */
export const ARMOUR_COLOR: Readonly<Record<Armour, number>> = {
  none: 0x000000,
  armoured: 0xc2a878,
  shielded: 0x9fe8ff,
  phasing: 0xc79bff,
};

/**
 * WHAT AN OFF-KIND HIT DOES, and this is the number the whole layer turns on.
 *
 * Hard immunity is the legible version — "armour only impact cracks" reads as
 * zero. It is also a hard lock: a build with nothing that punches meets a wall
 * of armoured bodies it can never clear, they pile into the player, and the run
 * is over for a reason the player could not act on. That collides with #255's
 * floor rule in spirit if not in letter.
 *
 * So off-kind damage is CHIP: it lands, it is visibly pathetic, and it says
 * "wrong tool" rather than "nothing happened". The number has to clear one bar
 * to be worth anything, and that bar is the pistol test:
 *
 *   four maxed off-kind weapons must out-damage NOTHING, and one fresh on-kind
 *   weapon must out-damage all four of them.
 *
 * A maxed weapon runs roughly 4x a fresh one's per-trigger damage at roughly 3x
 * the triggers, so four maxed off-kind voices are worth about 48 fresh-weapon
 * units before the multiplier. 0.12 puts them at about 5.8 against the fresh
 * on-kind weapon's 1.0 per trigger over its own chart — which the on-kind weapon
 * beats outright once armoured HP is where ARMOURED_HP_MUL puts it. Anything
 * near 0.3 and depth beats breadth, which is Coverage failing to do its one job.
 */
export const CHIP_MUL = 0.12;

/**
 * ARMOUR ADDS NO HP. Its identity is WHAT ANSWERS IT, and nothing else.
 *
 * This started at 2.2, went to 1.5, and ended at 1.0 — three measurements, and the
 * reasoning is worth keeping because the intuition it kills is a strong one.
 *
 * The intuition: an armoured body should feel heavier, and #273's finding says a
 * coverage hole has to be visible in the DAMAGE numbers rather than as a kill count
 * (`damageByRole` credits `Math.min(hp, amount)`, so a 10 hp body absorbs nothing
 * measurable). Both argue for a multiplier.
 *
 * What measuring showed: the two taxes multiply and the result is unplayable. A
 * room's effective output is already only the share of the band that answers it —
 * the first full night ran 14% of its hits on-kind — so doubling HP on top put
 * time-to-kill roughly six times the base's, and the harness died in its second
 * room at 3:00, then at 4:03 with the multiplier at 1.5. The base's whole damage
 * curve is authored against unarmoured bodies at full damage; a layer that halves
 * effective damage cannot also double effective HP.
 *
 * And the multiplier turned out to be REDUNDANT rather than merely expensive.
 * Armour was assigned to the kinds that are already the bestiary's heavy bodies —
 * cabinets at 70 and 150 hp, husks at 500, the Giants at 150 to 250 — because those
 * are the bodies armour reads as. The bare kinds are the 1-5 hp mites. So the
 * bestiary was already carrying the weight the multiplier was trying to add, and
 * #273's measurement concern is answered by the same accident: an armoured body in
 * this game has 70 hp or more, which absorbs what it is actually dealt.
 *
 * Kept as a named constant at 1.0 rather than deleted, because it is the first
 * thing a spec-time balance pass will want to touch.
 */
export const ARMOUR_HP_MUL = 1;

/** The armour every body in the bestiary wears.
 *
 *  AUTHORED PER KIND, NOT PER VENUE. The alternative — a venue assigning armour
 *  to whatever it spawns — makes the same Cable Husk armoured in one room and
 *  bare in the next, so the player can never learn the bestiary and the tell
 *  becomes the only information. Fixed per kind means "Cable Husks are
 *  armoured" is knowledge you carry between runs, which is #253's build
 *  knowledge > judgment > execution ordering.
 *
 *  The MIX is where the venues do their work: a venue's roster is chosen to
 *  demand a particular answer, and its card says which before you walk in.
 *
 *  Weighting: 8 armoured, 5 shielded, 5 phasing, 4 bare. Deliberately skewed
 *  toward armour because the palette is skewed the same way — 10 of the 19
 *  voices are impact, 4 are bright transients, 5 are sustained. A roster that
 *  demanded the rarest answer most often would make coverage a lottery on the
 *  offer roll rather than a decision. */
export const ARMOUR_BY_KIND: Readonly<Record<EnemyKind, Armour>> = {
  // The bare bodies: the mites and their swarm. Early pressure stays readable,
  // and the opening minutes never punish a build that has not been offered a
  // second attack kind yet.
  bat: 'none',
  redBat: 'none',
  redBat2: 'none',
  batSwarm: 'none',
  // Armoured — cabinets, husks and the heavy bodies. Something to hit hard.
  zombie: 'armoured',
  greenMudman: 'armoured',
  grayMudman: 'armoured',
  giantBat: 'armoured',
  werewolf: 'armoured',
  bigMummy: 'armoured',
  giantWerewolf: 'armoured',
  giantMummy: 'armoured',
  // Shielded — the crowns and the shears, everything bright and quick. Cut it.
  skeleton: 'shielded',
  glowingBat: 'shielded',
  mantis: 'shielded',
  silverBat: 'shielded',
  giantMantis: 'shielded',
  // Phasing — the half-there things. Only something held catches them.
  ghost: 'phasing',
  ghostSwarm: 'phasing',
  flower: 'phasing',
  venus: 'phasing',
  giantBlueVenus: 'phasing',
  // The practice target answers to everything, or it cannot measure anything.
  dummy: 'none',
};

/** The damage multiplier for a hit of `attack` on a body wearing `armour`. */
export function coverageMul(armour: Armour, attack: Attack): number {
  if (armour === 'none') return 1;
  return ANSWERED_BY[attack] === armour ? 1 : CHIP_MUL;
}

/** What a set of ACTIVE voices can answer.
 *
 *  ACTIVE, NOT OWNED, and that is the tightest interlock in the stack: under
 *  Headroom the player mutes voices to afford the band, and muting the only
 *  voice that cuts opens a hole in the coverage wheel. The build you own is not
 *  the build that is playing, and the wheel reports the one that is playing. */
export function coveredAttacks(active: Iterable<Role>): Set<Attack> {
  const out = new Set<Attack>();
  for (const role of active) {
    const attack = PALETTE_ATTACK[role];
    if (attack) out.add(attack);
  }
  return out;
}

/** The attack a role's hits count as, or null for a voice outside the palette
 *  (the retired catalog kinds the Sandbox can still load). A null-attack voice
 *  chips everything, which is the honest answer for a sound the palette never
 *  placed on the grid. */
export function attackOf(role: Role): Attack | null {
  return PALETTE_ATTACK[role] ?? null;
}
