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
import { PROTOS } from './protos';
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

// The 'original' (currently-shipped) overlay per genre: which drum/bass roles
// are real one-shots vs synthesized, loaded from public/samples/<genre>/.
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

// ---- Kit prototypes: alternative sampled voicings a genre is auditioning ----
// A genre can be switched between its shipped 'original' kit and any prototype
// declared in src/audio/kits/protos/<genre>.ts. The choice persists in
// localStorage and drops the cached kit so engine.setGenre / kitForGenre
// re-render from the chosen files. This is the House A/B process, generalized.

const ORIGINAL = 'original';
const varKey = (id: GenreId) => `kitVariant.${id}`;
const activeVariant = new Map<GenreId, string>();

function currentVariant(id: GenreId): string {
  if (!activeVariant.has(id)) {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(varKey(id)) : null;
    // A stored id that no longer exists (folder removed) falls back to original.
    const ok = stored && (stored === ORIGINAL || PROTOS[id].variants.some((v) => v.id === stored));
    activeVariant.set(id, ok ? stored! : ORIGINAL);
  }
  return activeVariant.get(id)!;
}

/** The selector list for a genre: 'original' first, then its prototypes.
 *  A genre with no prototypes returns just 'original'. */
export function variantsFor(id: GenreId): { id: string; name: string; desc?: string }[] {
  return [{ id: ORIGINAL, name: 'Original (shipped)' }, ...PROTOS[id].variants];
}

export function getGenreVariant(id: GenreId): string {
  return currentVariant(id);
}

/** Switch a genre's active kit prototype and drop its cached render so the next
 *  kitForGenre(id) / engine.setGenre re-renders from the chosen files. */
export function setGenreVariant(id: GenreId, variant: string): void {
  if (currentVariant(id) === variant) return;
  activeVariant.set(id, variant);
  try { localStorage.setItem(varKey(id), variant); } catch { /* non-browser */ }
  cache.delete(id);
}

/** The overlay (role -> sample specs), sample directory, and pitched-role tune
 *  in force for a genre right now, accounting for the active prototype. Under a
 *  prototype ONLY that prototype's roles are sampled; all others stay synth. */
function activeOverlay(id: GenreId): {
  overlay: Partial<Record<Role, SampleSpec[]>>;
  dir: string;
  tune: Partial<Record<Role, number>>;
} {
  const v = currentVariant(id);
  if (v === ORIGINAL) {
    return { overlay: SAMPLE_OVERLAY[id], dir: id, tune: SAMPLE_TUNE[id] ?? {} };
  }
  const proto = PROTOS[id].variants.find((p) => p.id === v)!;
  return { overlay: proto.overlay, dir: `${id}/${v}`, tune: proto.tune ?? {} };
}

/** The roles that are sample-backed (a genre's own custom voicing) under the
 *  active variant — the sandbox marks these so they're easy to focus on. */
export function sampledRoles(id: GenreId): Set<Role> {
  return new Set(Object.keys(activeOverlay(id).overlay) as Role[]);
}

/** The raw/corrected sample file bases backing a role for a genre under the
 *  ACTIVE variant, or [] if synthesized. Used by #soundcheck to A/B the
 *  untouched `<file>.raw.wav` against the corrected `<file>.wav`. */
export function sampleFilesFor(id: GenreId, role: Role): string[] {
  const specs = activeOverlay(id).overlay[role];
  if (!specs) return [];
  return [...new Set(specs.map(([, file]) => file))];
}

/** Directory (under /samples) the active variant's raw A/B files live in. */
export function sampleDir(id: GenreId): string {
  return activeOverlay(id).dir;
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
  const { overlay, dir, tune } = activeOverlay(id);
  await Promise.all(
    (Object.entries(overlay) as [Role, SampleSpec[]][]).map(async ([role, specs]) => {
      try {
        const entries = await Promise.all(
          specs.map(async ([variant, file]) =>
            [variant, await loadSample(`/samples/${dir}/${file}.wav`)] as const,
          ),
        );
        kit.set(role, makeKit(role, new Map(entries), tune[role] ?? 0));
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
