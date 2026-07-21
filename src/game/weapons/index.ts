// The roster: one import site for weapon identity. A migrated weapon and a
// not-yet-migrated one look identical to every consumer.

import type { Role } from '../../audio/kits';
import { WEAPONS, type WeaponConf } from '../config';
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

export type { WeaponContext, WeaponTarget } from './context';
export type { TickPhase, ProjectileBehavior, WeaponInstance } from './module';
export { KICK } from './kick';

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

/** Per-tier stats for any role. Modules win. config.WEAPONS is now EMPTY — the
 *  bell's ladder was the last one in it — so the fallback never fires today; it
 *  stays as the honest answer for a role no module owns. */
export function weaponTiers(role: Role): readonly WeaponConf[] | undefined {
  return BY_ROLE.get(role)?.stats.tiers ?? WEAPONS[role];
}
