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
import { isBedRole } from './patterns';

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
      world.silenced.delete(role);
      continue;
    }
    // The tier rides along with the chart, and it still matters even though the
    // chart no longer comes from it: a BED has no notes at all and rides its level
    // as PRESENCE (BED_LEVEL_BY_TIER), so a bed shell's only audible growth is
    // this argument. Passing them together is also the only safe form — the tier
    // parameter defaults to 1, so a call that omitted it would silently reset
    // every voice to its bottom rung.
    engine.setVoiceChart(role, build.chartFor(role), chartStageForLevel(shell.level));
    engine.setVoiceTrim(role, build.trimDbFor(role));
    const off = deactivated?.has(role) ?? false;
    engine.setVoiceEnabled(role, !off);
    // A SHELL WITH NO PATTERN IS NOT ATTACKING, and for most of the band that is
    // free: an empty chart fires no triggers, and a trigger IS the attack. The two
    // texture voices are the exception — a bed is never sequenced, so `pad` and
    // `air` are stepped by the clock and would keep damaging out of a silence
    // nobody could hear. `RunWorld.silenced` (adopted from #277, The Load-In, whose
    // own note names "a pattern nobody is holding" as this case) is where the world
    // is told. Registering every silent shell rather than only the beds keeps one
    // rule instead of an exception.
    if (off || (!isBedRole(role) && build.densityOf(role) === 0)) world.silenced.add(role);
    else world.silenced.delete(role);
    world.tiers.set(role, shell.level);
    world.perWeaponMods.set(role, {
      damageMul: build.damageMulFor(role),
      areaMul: build.areaMulFor(role),
    });
  }
}
