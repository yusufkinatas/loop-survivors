// The soundset kit: the voicing of the instrument catalog the engine plays.
// The synthesized voices are built by buildSoundsetKit (below); the signature
// drums (and the sub-bass) are real one-shots overlaid on top, since drums
// carry a kit's identity in a way one synth engine cannot.
//
// IMPORTANT (Node safety): this module and everything it imports run
// OfflineAudioContext only INSIDE builder functions, never at module load — the
// headless bot never imports this file and must stay importable under Node.
// Only browser code (engine.ts) imports here.

import { loadSample, makeKit, type Kit, type Role } from '../kits';
import { buildHouseKit } from './house';

// Real signature-drum samples that override the synthesized drums, plus the
// sampled sub-bass. Each entry: role -> [variantId, fileBase]. Files live at
// public/samples/house/<fileBase>.wav and are pre-corrected at build time
// (scripts/build-house-kit.mjs), so nothing about them is fixed up here.
type SampleSpec = [variant: string, file: string];

const DIR = 'house';

const SAMPLE_OVERLAY: Partial<Record<Role, SampleSpec[]>> = {
  kick: [['hard', 'kick'], ['soft', 'kick']],
  clap: [['clap', 'clap']],
  hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
  shaker: [['shaker', 'shaker']],
  crash: [['crash', 'crash']],
  riser: [['riser', 'riser']],
  bass: [['bass', 'bass'], ['fat', 'bass_fat']], // pitched — see SAMPLE_TUNE
};

// Semitone tune for PITCHED sampled roles: aligns the sample's recorded root to
// the engine's A reference (note 0). The bass hits are C2 (~64 Hz, +3 semis
// above A1), so -3 seats them in the synth bass's octave.
const SAMPLE_TUNE: Partial<Record<Role, number>> = {
  bass: -3,
};

/** The roles that are sample-backed (their own real voicing). The dev-only
 *  ★ custom badge marks these on offers so they are easy to focus on. */
export function sampledRoles(): Set<Role> {
  return new Set(Object.keys(SAMPLE_OVERLAY) as Role[]);
}

/** Overlay the real drum/bass samples onto the synth kit. A role whose every
 *  variant loads is replaced by the sampled kit; if any file fails to load
 *  (offline, 404), that role keeps its synthesized voice (never silent). */
async function overlaySamples(kit: Map<Role, Kit>): Promise<void> {
  await Promise.all(
    (Object.entries(SAMPLE_OVERLAY) as [Role, SampleSpec[]][]).map(async ([role, specs]) => {
      try {
        const entries = await Promise.all(
          specs.map(async ([variant, file]) =>
            [variant, await loadSample(`/samples/${DIR}/${file}.wav`)] as const,
          ),
        );
        kit.set(role, makeKit(role, new Map(entries), SAMPLE_TUNE[role] ?? 0));
      } catch (e) {
        console.warn(`[kits] ${role} sample load failed, keeping synth voice:`, e);
      }
    }),
  );
}

// The soundset kit is rendered once, on first use, then reused. The promise is
// cached (not the resolved map) so concurrent callers share one render pass.
let cache: Promise<Map<Role, Kit>> | null = null;

/** The soundset voicing of the catalog: the synth kit with its real drum/bass
 *  samples overlaid. Built lazily and cached. */
export function buildSoundsetKit(rootHz: number): Promise<Map<Role, Kit>> {
  if (!cache) {
    cache = buildHouseKit(rootHz).then(async (kit) => {
      await overlaySamples(kit);
      return kit;
    });
  }
  return cache;
}
