// Sample sets: named, switchable collections of pack samples that replace the
// builtin synth placeholders per role. This is the sample-curation surface of
// the rehearsal room (docs/phases/m1-demo.md): sets are auditioned with one
// click, roles a set does not cover fall back to the synth kit.
//
// All bundled files are from Sonic Pi's sample library (etc/samples in
// github.com/sonic-pi-net/sonic-pi), each licensed CC0 1.0 Universal.
// See public/samples/sonicpi/LICENSE.md.

import { ROLES, type Role } from './kits';
import type { MusicEngine } from './engine';

export interface SampleSetDef {
  id: string;
  name: string;
  source: string;
  /** role -> chart variant id -> file under BASE. Charted variants only. */
  files: Partial<Record<Role, Record<string, string>>>;
  /** role -> semitones retuning the file's own pitch to the run's root.
   *  Measured from the sample (names like bass_hard_c are pitched at C). */
  tune?: Partial<Record<Role, number>>;
}

const BASE = '/samples/sonicpi/';

export const SAMPLE_SETS: SampleSetDef[] = [
  {
    id: 'synth',
    name: 'Synth',
    source: 'builtin placeholders',
    files: {},
  },
  {
    id: '808',
    name: '808',
    source: 'Sonic Pi (CC0)',
    files: {
      kick: { hard: 'bd_808.flac', soft: 'bd_fat.flac' },
      snare: { snare: 'sn_dolf.flac', clap: 'perc_snap.flac' },
      hat: { closed: 'hat_star.flac', open: 'elec_cymbal.flac' },
      bass: { bass: 'bass_hit_c.flac' },
    },
    tune: { bass: 9 }, // C1 -> A1
  },
  {
    id: 'machine',
    name: 'Machine',
    source: 'Sonic Pi (CC0)',
    files: {
      kick: { hard: 'drum_heavy_kick.flac', soft: 'drum_bass_soft.flac' },
      snare: { snare: 'drum_snare_hard.flac', clap: 'perc_snap2.flac' },
      hat: { closed: 'drum_cymbal_closed.flac', open: 'drum_cymbal_open.flac' },
      bass: { bass: 'bass_hard_c.flac' },
      lead: { lead: 'tbd_highkey_c4.flac' },
    },
    tune: { bass: 9, lead: 9 }, // C -> A
  },
  {
    id: 'electro',
    name: 'Electro',
    source: 'Sonic Pi (CC0)',
    files: {
      kick: { hard: 'elec_hollow_kick.flac', soft: 'elec_soft_kick.flac' },
      snare: { snare: 'elec_hi_snare.flac', clap: 'elec_pop.flac' },
      hat: { closed: 'elec_tick.flac', open: 'elec_cymbal.flac' },
      bass: { bass: 'bass_thick_c.flac' },
      lead: { lead: 'elec_beep.flac' },
    },
    tune: { bass: -3, lead: -5 }, // C2 -> A1, D5 -> A4
  },
];

/** Which roles a set covers, for UI hints. */
export function coveredRoles(def: SampleSetDef): Role[] {
  return ROLES.filter((r) => def.files[r] !== undefined);
}

const decodedCache = new Map<string, Map<Role, Map<string, AudioBuffer>>>();

async function loadSet(
  ctx: AudioContext,
  def: SampleSetDef,
): Promise<Map<Role, Map<string, AudioBuffer>>> {
  const cached = decodedCache.get(def.id);
  if (cached) return cached;

  const decoded = new Map<Role, Map<string, AudioBuffer>>();
  await Promise.all(
    (Object.entries(def.files) as [Role, Record<string, string>][]).flatMap(
      ([role, variants]) =>
        Object.entries(variants).map(async ([variant, file]) => {
          const res = await fetch(BASE + file);
          if (!res.ok) throw new Error(`sample fetch failed: ${file} (${res.status})`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          let byVariant = decoded.get(role);
          if (!byVariant) decoded.set(role, (byVariant = new Map()));
          byVariant.set(variant, buf);
        }),
    ),
  );
  decodedCache.set(def.id, decoded);
  return decoded;
}

/** Fetch, decode (cached), and apply a set to every voice. Roles the set
 *  does not cover are restored to the builtin synth kit. */
export async function applySampleSet(engine: MusicEngine, def: SampleSetDef): Promise<void> {
  const decoded = await loadSet(engine.ctx, def);
  for (const role of ROLES) {
    const samples = decoded.get(role) ?? null;
    engine.setVoiceSamples(role, samples, def.tune?.[role] ?? 0);
  }
}
