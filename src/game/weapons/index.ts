// The roster: one import site for weapon identity. A migrated weapon and a
// not-yet-migrated one look identical to every consumer.

import type { Role } from '../../audio/kits';
import { TIER_LINES, WEAPONS, type WeaponConf } from '../config';
import { ARP } from './arp';
import { BASS } from './bass';
import { HAT } from './hat';
import { KICK } from './kick';
import { SNARE } from './snare';
import type { WeaponModule } from './module';

export type { ShockwaveSpec, WeaponContext, WeaponPlayer, WeaponTarget } from './context';
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

/** Weapons that own their behavior behind the weapon context. A role absent
 *  here still branches inside run.ts; this array emptying run.ts's switch is
 *  the end state of the migration.
 *
 *  ORDERED. Array order is the tick order WITHIN a phase and is behavioral —
 *  reordering it reorders damage and therefore the rng stream. Across phases,
 *  TickPhase decides; array order never overrides it. */
export const WEAPON_MODULES: readonly WeaponModule[] = [KICK, ARP, SNARE, HAT, BASS];

const BY_ROLE = new Map<Role, WeaponModule>(WEAPON_MODULES.map((m) => [m.role, m]));

export function weaponModule(role: Role): WeaponModule | undefined {
  return BY_ROLE.get(role);
}

/** Per-tier stats for any role, migrated or not. Modules win; config.WEAPONS is
 *  the shrinking remainder that deletes itself when weapon nine lands. */
export function weaponTiers(role: Role): readonly WeaponConf[] | undefined {
  return BY_ROLE.get(role)?.stats.tiers ?? WEAPONS[role];
}

/** Per-tier pedestal copy, same merge rule. Zero readers today — this is the
 *  door left open for when the pedestal wants copy, not a change. */
export function weaponTierLines(role: Role): readonly string[] | undefined {
  return BY_ROLE.get(role)?.stats.tierLines ?? TIER_LINES[role];
}
