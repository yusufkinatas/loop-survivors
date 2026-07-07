// Per-genre kits: the registry that gives every genre its OWN voicing of the
// soundset. A genre no longer shares one global kit — a Lo-Fi kick and a Drum &
// Bass kick are different sounds, not the same sound played differently.
//
// Each genre supplies a builder that renders (or loads) buffers for the roles
// it supports and stamps them with the canonical role identity (kits.ts
// ROLE_META / makeKit), so charts and visuals keep working across genres. The
// engine swaps a voice's active buffers to the active genre's kit on setGenre.
//
// IMPORTANT (Node safety): this module and everything it imports run
// OfflineAudioContext only INSIDE builder functions, never at module load — the
// headless bot imports genres.ts/kits.ts but never this file, and must stay
// importable under Node. Only browser code (main.ts, engine.ts) imports here.

import type { GenreId } from '../genres';
import { loadSample, makeKit, type Kit, type Role } from '../kits';
import { buildLofiKit } from './lofi';
import { buildHouseKit } from './house';
import { buildSynthwaveKit } from './synthwave';
import { buildHiphopKit } from './hiphop';
import { buildDnbKit } from './dnb';
import { buildTechnoKit } from './techno';

export type KitBuilder = (rootHz: number) => Promise<Map<Role, Kit>>;

const BUILDERS: Record<GenreId, KitBuilder> = {
  lofi: buildLofiKit,
  house: buildHouseKit,
  synthwave: buildSynthwaveKit,
  hiphop: buildHiphopKit,
  dnb: buildDnbKit,
  techno: buildTechnoKit,
};

// Real signature-drum samples that override the synthesized drums per genre
// (909 for house, 808 for hiphop, LinnDrum for synthwave, ...). Genres differ
// most audibly in their drums; real one-shots carry that identity in a way one
// synth engine cannot. Melodic/bass voices stay synthesized (in the builders
// above). Each entry: role -> [variantId, fileBase]. Files live at
// public/samples/<genre>/<fileBase>.wav and are pre-corrected at build time
// (scripts/build-samples.mjs), so nothing about them is fixed up here.
type SampleSpec = [variant: string, file: string];
const SAMPLE_OVERLAY: Record<GenreId, Partial<Record<Role, SampleSpec[]>>> = {
  lofi: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    snare: [['snare', 'snare']],
    rimshot: [['rimshot', 'rimshot']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    shaker: [['shaker', 'shaker']],
  },
  house: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    clap: [['clap', 'clap']],
    rimshot: [['rimshot', 'rimshot']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    shaker: [['shaker', 'shaker']],
    crash: [['crash', 'crash']],
    riser: [['riser', 'riser']],
    bass: [['bass', 'bass'], ['fat', 'bass_fat']], // pitched — see SAMPLE_TUNE
  },
  synthwave: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    snare: [['snare', 'snare']],
    clap: [['clap', 'clap']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
  },
  hiphop: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    snare: [['snare', 'snare']],
    clap: [['clap', 'clap']],
    rimshot: [['rimshot', 'rimshot']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    shaker: [['shaker', 'shaker']],
  },
  dnb: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    snare: [['snare', 'snare']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    ride: [['ride', 'ride']],
  },
  techno: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    clap: [['clap', 'clap']],
    rimshot: [['rimshot', 'rimshot']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    ride: [['ride', 'ride']],
  },
};

/** The raw/corrected sample file bases backing a role for a genre, or [] if the
 *  role is synthesized (no sample). Used by #soundcheck to A/B the untouched
 *  `<file>.raw.wav` against the corrected `<file>.wav`. */
export function sampleFilesFor(id: GenreId, role: Role): string[] {
  const specs = SAMPLE_OVERLAY[id]?.[role];
  if (!specs) return [];
  return [...new Set(specs.map(([, file]) => file))];
}

// Semitone tune for PITCHED sampled roles: aligns the sample's recorded root to
// the engine's A reference (note 0). The Wave Point House bass hits are C2
// (~64 Hz, +3 semis above A1), so -3 seats them in the synth bass's octave.
const SAMPLE_TUNE: Partial<Record<GenreId, Partial<Record<Role, number>>>> = {
  house: { bass: -3 },
};

/** Overlay a genre's real drum samples onto its synth kit. A role whose every
 *  variant loads is replaced by the sampled kit; if any file fails to load
 *  (offline, 404), that role keeps its synthesized voice (never silent). */
async function overlaySamples(id: GenreId, kit: Map<Role, Kit>): Promise<void> {
  const overlay = SAMPLE_OVERLAY[id];
  await Promise.all(
    (Object.entries(overlay) as [Role, SampleSpec[]][]).map(async ([role, specs]) => {
      try {
        const entries = await Promise.all(
          specs.map(async ([variant, file]) =>
            [variant, await loadSample(`/samples/${id}/${file}.wav`)] as const,
          ),
        );
        kit.set(role, makeKit(role, new Map(entries), SAMPLE_TUNE[id]?.[role] ?? 0));
      } catch (e) {
        console.warn(`[kits] ${id}/${role} sample load failed, keeping synth voice:`, e);
      }
    }),
  );
}

// A genre's kit is rendered once, on first use, then reused. The promise is
// cached (not the resolved map) so concurrent callers share one render pass.
const cache = new Map<GenreId, Promise<Map<Role, Kit>>>();

/** The active-genre voicing of the soundset, built lazily and cached. */
export function kitForGenre(id: GenreId, rootHz: number): Promise<Map<Role, Kit>> {
  let p = cache.get(id);
  if (!p) {
    p = BUILDERS[id](rootHz).then(async (kit) => {
      await overlaySamples(id, kit);
      return kit;
    });
    cache.set(id, p);
  }
  return p;
}
