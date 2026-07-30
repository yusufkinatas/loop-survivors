// One function, called after every change: re-derive the whole band from the
// build and push it at the engine and the world.
//
// DELIBERATELY NOT INCREMENTAL. A toll can remove an instrument, silence another,
// fuse two patterns into a third and move two levels, all in one act — and a
// stack whose central mechanic is destructive cannot afford a band that is
// assembled from diffs. Nineteen voices' worth of `setVoiceChart` on a bar line
// costs nothing measurable, and in exchange there is exactly one code path that
// decides what is playing, so "the build says X but the band is playing Y" is not
// a state this branch can reach.

import type { MusicEngine } from '../../audio/engine';
import { ROLES, type Role } from '../../audio/kits';
import type { RunWorld } from '../run';
import { chartStageForLevel } from '../weapons/levels';
import type { RouteBuild } from './build';

export interface SyncOptions {
  /** Voices the developer number keys have switched off. Sticky: a level or a
   *  pattern lands on them, and they stay off until switched back on. */
  deactivated?: ReadonlySet<Role>;
}

/** Push the build into the engine (what plays, and how loud) and the world (what
 *  it hits for). Safe to call from a bar-line callback and safe to call twice. */
export function syncBand(
  engine: MusicEngine,
  world: RunWorld,
  build: RouteBuild,
  opts: SyncOptions = {},
): void {
  const deactivated = opts.deactivated;
  for (const role of ROLES) {
    const shell = build.shells.get(role);
    if (!shell) {
      engine.setVoiceEnabled(role, false);
      engine.setVoiceTrim(role, 0);
      world.tiers.delete(role);
      world.perWeaponMods.delete(role);
      continue;
    }
    // The tier still matters even though the chart no longer comes from it: a BED
    // has no notes at all and rides its level as PRESENCE (BED_LEVEL_BY_TIER), so
    // a bed shell's only audible growth is this call. Set it first — setVoiceTier
    // swaps in the ladder's chart as a side effect, and the line below is what
    // overrides that with the pattern.
    engine.setVoiceTier(role, chartStageForLevel(shell.level));
    engine.setVoiceChart(role, build.chartFor(role));
    engine.setVoiceTrim(role, build.trimDbFor(role));
    engine.setVoiceEnabled(role, !deactivated?.has(role));
    world.tiers.set(role, shell.level);
    world.perWeaponMods.set(role, {
      damageMul: build.damageMulFor(role),
      areaMul: build.areaMulFor(role),
    });
  }
}
