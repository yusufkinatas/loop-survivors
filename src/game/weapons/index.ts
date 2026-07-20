// The roster: one import site for weapon identity. A migrated weapon and a
// not-yet-migrated one look identical to every consumer.

import type { Role } from '../../audio/kits';
import { TIER_LINES, WEAPONS, type WeaponConf } from '../config';
import { ARP } from './arp';
import { BASS } from './bass';
import { BELL } from './bell';
import { CHORD } from './chord';
import { CLAP } from './clap';
import { HAT } from './hat';
import { KICK } from './kick';
import { LEAD } from './lead';
import { SNARE } from './snare';
import type { WeaponModule } from './module';

export type {
  GravityWellSpec,
  ShockwaveSpec,
  WeaponContext,
  WeaponPlayer,
  WeaponTarget,
  ZoneSpec,
} from './context';
export {
  TICK_PHASES,
  type TickPhase,
  type ProjectileBehavior,
  type WeaponInstance,
  type WeaponModule,
  type WeaponStats,
} from './module';
export { KICK, type KickStats } from './kick';
export { ARP, type ArpStats } from './arp';
export { SNARE, type SnareStats } from './snare';
export { HAT, type HatStats } from './hat';
export { BASS, type BassStats } from './bass';
export { CHORD, type ChordStats } from './chord';
export { LEAD, type LeadStats } from './lead';
export { CLAP, type ClapStats } from './clap';
export { BELL, type BellStats } from './bell';

/** Weapons that own their behavior behind the weapon context. THE MIGRATION IS
 *  COMPLETE (#141): every supported weapon is here, run.ts's switch is gone
 *  along with the last of its weapon-specific code, and a role absent from this
 *  array is now a role with no gameplay at all rather than one that falls back.
 *
 *  ORDERED. Array order is the tick order WITHIN a phase and is behavioral —
 *  reordering it reorders damage and therefore the rng stream. Across phases,
 *  TickPhase decides; array order never overrides it. */
export const WEAPON_MODULES: readonly WeaponModule[] = [
  KICK, ARP, SNARE, HAT, BASS, CHORD, LEAD, CLAP, BELL,
];

const BY_ROLE = new Map<Role, WeaponModule>(WEAPON_MODULES.map((m) => [m.role, m]));

export function weaponModule(role: Role): WeaponModule | undefined {
  return BY_ROLE.get(role);
}

/** Per-tier stats for any role. Modules win. config.WEAPONS is now EMPTY — the
 *  bell's ladder was the last one in it — so the fallback never fires today; it
 *  stays as the honest answer for a role no module owns. */
export function weaponTiers(role: Role): readonly WeaponConf[] | undefined {
  return BY_ROLE.get(role)?.stats.tiers ?? WEAPONS[role];
}

/** Per-tier pedestal copy, same merge rule. Zero readers today — this is the
 *  door left open for when the pedestal wants copy, not a change. */
export function weaponTierLines(role: Role): readonly string[] | undefined {
  return BY_ROLE.get(role)?.stats.tierLines ?? TIER_LINES[role];
}
