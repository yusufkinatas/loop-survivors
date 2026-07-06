// The gameplay layer for per-weapon effects (Feature 4): the twin of the
// audio nodes in ../audio/voicefx.ts. An effect changes a weapon's numbers
// (drive/crush/weight/bloom via applyEffectConf) or its firing behavior
// (echo re-fire, split extra emission — handled in run.ts). Deterministic and
// headless-safe: pure conf math, no rng, no fx.

import { EFFECT_IDS, type EffectId } from '../audio/voicefx';
import { ROLES, type Role } from '../audio/kits';
import { WEAPON_TAGS, type WeaponConf, type WeaponTag } from './config';

export const ECHO_DELAY_S = 0.18;
export const ECHO_DAMAGE_MUL = 0.55;
export const BLOOM_RESIDUAL_LIFES = 1.2;
export const BLOOM_RESIDUAL_DMG_MUL = 0.4;
export const SPLIT_SPREAD = 0.3; // rad, extra shot jitter

/** Each effect names the weapon capability tags it needs (D10). Eligibility
 *  is DERIVED from these against WEAPON_TAGS, never hand-listed, so a modifier
 *  can never land where it makes no sense (e.g. split on an aura weapon). */
export const EFFECT_META: Record<EffectId, { name: string; line: string; requires: WeaponTag[] }> = {
  drive: { name: 'Drive', line: 'hits harder', requires: [] },
  crush: { name: 'Crush', line: 'punches through more', requires: ['pierce'] },
  echo: { name: 'Echo', line: 'fires a weaker second time', requires: [] },
  bloom: { name: 'Bloom', line: 'hits linger and swell', requires: ['area'] },
  weight: { name: 'Weight', line: 'bigger, heavier, slower hits', requires: ['area'] },
  split: { name: 'Split', line: 'one more shot each time', requires: ['count'] },
};

/** Legal effects per weapon, computed at module load from WEAPON_TAGS +
 *  EFFECT_META.requires. Adding a weapon later = declare its tags and its
 *  legal modifiers fall out automatically (D10). */
export const WEAPON_EFFECTS: Record<Role, EffectId[]> = Object.fromEntries(
  ROLES.map((r) => [
    r,
    EFFECT_IDS.filter((id) => EFFECT_META[id].requires.every((tag) => WEAPON_TAGS[r].has(tag))),
  ]),
) as Record<Role, EffectId[]>;

/** Pure conf transform. Behavioral twins (echo re-fire, bloom residual zone,
 *  split extra spawn) are handled in run.ts, not here. */
export function applyEffectConf(conf: WeaponConf, id: EffectId, usesPierce: boolean): WeaponConf {
  switch (id) {
    case 'drive':
      return { ...conf, damage: conf.damage * 1.35 };
    case 'crush':
      return usesPierce
        ? { ...conf, pierce: (conf.pierce ?? 1) + 2 }
        : { ...conf, radius: (conf.radius ?? 0) * 1.15 };
    case 'weight':
      return {
        ...conf,
        radius: (conf.radius ?? 0) * 1.3,
        damage: conf.damage * 1.15,
        speed: conf.speed ? conf.speed * 0.8 : conf.speed,
      };
    case 'bloom':
      return {
        ...conf,
        lifetimeS: conf.lifetimeS ? conf.lifetimeS * 1.6 : conf.lifetimeS,
        radius: (conf.radius ?? 0) * 1.15,
      };
    case 'split':
      return {
        ...conf,
        count: conf.count ? conf.count + 1 : conf.count,
        strikes: conf.strikes ? conf.strikes + 1 : conf.strikes,
      };
    case 'echo':
      return conf; // purely behavioral
  }
}
