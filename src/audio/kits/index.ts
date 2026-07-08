// Per-genre kits: the registry that gives every genre its OWN voicing of the
// soundset. A genre no longer shares one global kit — a House kick and a Techno
// kick are different sounds, not the same sound played differently.
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
import { buildHouseKit } from './house';
import { buildTechnoKit } from './techno';

export type KitBuilder = (rootHz: number) => Promise<Map<Role, Kit>>;

const BUILDERS: Record<GenreId, KitBuilder> = {
  house: buildHouseKit,
  techno: buildTechnoKit,
};

// Real signature-drum samples that override the synthesized drums per genre
// (909 for house, distinct machine drums for techno). Genres differ
// most audibly in their drums; real one-shots carry that identity in a way one
// synth engine cannot. Melodic/bass voices stay synthesized (in the builders
// above). Each entry: role -> [variantId, fileBase]. Files live at
// public/samples/<genre>/<fileBase>.wav and are pre-corrected at build time
// (scripts/build-samples.mjs), so nothing about them is fixed up here.
type SampleSpec = [variant: string, file: string];

// The 'original' (currently-shipped) overlay per genre: which drum/bass roles
// are real one-shots vs synthesized, loaded from public/samples/<genre>/.
const SAMPLE_OVERLAY: Record<GenreId, Partial<Record<Role, SampleSpec[]>>> = {
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
  techno: {
    kick: [['hard', 'kick'], ['soft', 'kick']],
    clap: [['clap', 'clap']],
    rimshot: [['rimshot', 'rimshot']],
    hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
    ride: [['ride', 'ride']],
    bass: [['bass', 'bass']], // pitched, C2 root — see SAMPLE_TUNE
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

// Semitone tune for PITCHED sampled roles: aligns the sample's recorded root to
// the engine's A reference (note 0). The Wave Point House bass hits are C2
// (~64 Hz, +3 semis above A1), so -3 seats them in the synth bass's octave.
const SAMPLE_TUNE: Partial<Record<GenreId, Partial<Record<Role, number>>>> = {
  house: { bass: -3 },
  techno: { bass: -3 }, // Cyclick Bass Synthesis sampled at C2
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
