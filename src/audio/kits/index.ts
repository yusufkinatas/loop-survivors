// The soundset kit: the voicing of the instrument catalog the engine plays.
// The synthesized voices are built by buildSoundsetKit (below); the signature
// drums (and the sub-bass) are real one-shots overlaid on top, since drums
// carry a kit's identity in a way one synth engine cannot.
//
// IMPORTANT (Node safety): this module and everything it imports run
// OfflineAudioContext only INSIDE builder functions, never at module load — the
// headless bot never imports this file and must stay importable under Node.
// Only browser code (engine.ts) imports here.

import { loadSample, makeKit, ROLE_META, type Kit, type Role } from '../kits';
import { ACTIVE_ROLES } from '../soundset';
import { buildHouseKit, HOUSE_KIT_ROLES } from './house';

// Real signature-drum samples that override the synthesized drums, plus the
// sampled sub-bass. Each entry: role -> [variantId, fileBase]. Files live at
// public/samples/house/<fileBase>.wav and are pre-corrected at build time
// (scripts/build-house-kit.mjs), so nothing about them is fixed up here.
type SampleSpec = [variant: string, file: string];

const DIR = 'house';

const SAMPLE_OVERLAY: Partial<Record<Role, SampleSpec[]>> = {
  kick: [['hard', 'kick'], ['soft', 'kick']],
  clap: [['clap', 'clap']],
  rimshot: [['rimshot', 'rimshot']],
  hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
  shaker: [['shaker', 'shaker']],
  crash: [['crash', 'crash']],
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

/** Overlay real drum/bass samples onto the explicit House kit. Loaded variants
 *  replace their synthesized counterparts while un-sampled variants stay in
 *  place (notably Bass's tier-four `sub`). If a file fails, the complete synth
 *  voice remains available, so no active weapon can become silent. */
async function overlaySamples(kit: Map<Role, Kit>): Promise<void> {
  await Promise.all(
    (Object.entries(SAMPLE_OVERLAY) as [Role, SampleSpec[]][]).map(async ([role, specs]) => {
      try {
        const entries = await Promise.all(
          specs.map(async ([variant, file]) =>
            [variant, await loadSample(`/samples/${DIR}/${file}.wav`)] as const,
          ),
        );
        const base = kit.get(role);
        if (!base) throw new Error(`sample overlay targets inactive House role ${role}`);
        const merged = new Map(base.samples);
        for (const [variant, buffer] of entries) merged.set(variant, buffer);
        kit.set(role, makeKit(role, merged, SAMPLE_TUNE[role] ?? 0));
      } catch (e) {
        console.warn(`[kits] ${role} sample load failed, keeping synth voice:`, e);
      }
    }),
  );
}

/** Fail loudly if the active catalog, declared House builder, returned kit, or
 *  required variants drift apart. This runs on the first soundset build before
 *  playback, turning the old silent generic-fallback failure into a startup
 *  error with an exact missing/extra list. */
function assertExactCoverage(kit: ReadonlyMap<Role, Kit>): void {
  const active = new Set<Role>(ACTIVE_ROLES);
  const declared = new Set<Role>(HOUSE_KIT_ROLES);
  const actual = new Set<Role>(kit.keys());
  const missingDeclaration = ACTIVE_ROLES.filter((role) => !declared.has(role));
  const extraDeclaration = HOUSE_KIT_ROLES.filter((role) => !active.has(role));
  const missingKit = ACTIVE_ROLES.filter((role) => !actual.has(role));
  const extraKit = [...actual].filter((role) => !active.has(role));
  if (
    missingDeclaration.length > 0 ||
    extraDeclaration.length > 0 ||
    missingKit.length > 0 ||
    extraKit.length > 0
  ) {
    throw new Error(
      '[kits] House coverage mismatch ' +
        `(declared missing: ${missingDeclaration.join(', ') || 'none'}; ` +
        `declared extra: ${extraDeclaration.join(', ') || 'none'}; ` +
        `kit missing: ${missingKit.join(', ') || 'none'}; ` +
        `kit extra: ${extraKit.join(', ') || 'none'})`,
    );
  }
  for (const role of ACTIVE_ROLES) {
    const roleKit = kit.get(role)!;
    const missingVariants = ROLE_META[role].variants.filter(
      (variant) => !roleKit.samples.has(variant),
    );
    if (missingVariants.length > 0) {
      throw new Error(`[kits] ${role} is missing variants: ${missingVariants.join(', ')}`);
    }
  }
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
      assertExactCoverage(kit);
      return kit;
    });
  }
  return cache;
}
