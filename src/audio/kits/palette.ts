// The palette (#266): the twelve voices that widen the live band from eight to
// twenty. Afterhours (./afterhours.ts) still renders the original eight exactly
// as it did — untouched, so the base stays readable as the control that all
// five round-1 prototypes are measured against. This file is everything added
// on top.
//
// THESE ARE RECORDINGS, AND THE FIRST PASS WAS NOT.
//
// #266 left the method to the agent under one bar from the designer: every
// voice a convincing version of itself, and all twenty able to be on one real
// record. The first pass synthesized all twelve from oscillators and was
// rejected outright — "they sound fundamentally wrong to me", with the
// sustained voices worst.
//
// The diagnosis matters more than the verdict, because it decides what not to
// try again. Synthesis needs ears in the loop, and the agent writing it has
// none: a buffer's level and duration are measurable, "does this sound like a
// flute" is not. Tuning oscillator parameters against a mental model of how an
// instrument is built works for a kick drum, where the model is simple — the
// existing eight prove that. It does not survive contact with a band that has
// to sound like real instruments. A recording of a shaker is a shaker whether
// or not anyone in the loop can hear it, which is the whole argument for this
// file.
//
// MULTI-SAMPLING IS WHAT MADE RECORDINGS POSSIBLE AT ALL. The engine pitches a
// voice by speeding one recording up or down, and a single recording stretched
// across a run's octave and a half turns chipmunky at the top and sludgy at the
// bottom. That was the honest reason the first pass went synthetic. The fix was
// to stop restating it as a blocker and build it: every pitched voice here
// ships several recordings, and the engine plays whichever is nearest the
// wanted note (`Kit.zones`, `nearestZone` in ../kits.ts), so nothing is ever
// shifted more than a few semitones. `organ` is the best-covered at six
// recordings; `rhodes` the worst at three, because the source library only
// sampled it every octave.
//
// TEXTURE VOICES LOOP. The designer's own suggestion, and it is right: a held
// sound has no firing moment, so a one-shot leaves a hole whenever the
// recording is shorter than the phrase. `pad`, `air` and `wind` set `loop` and
// ring until the next trigger chokes them, which is also what lets a texture
// weapon damage continuously while it sounds.
//
// The files are fetched and processed by tools/fetch-palette-samples.mjs, which
// records where every one came from. Nothing here is generated at runtime.

import { loadSample, makeKit, type Kit, type PitchZone, type Role } from '../kits';
import { PALETTE_SAMPLES, PALETTE_SAMPLE_ROOT } from '../palette-samples';

/** Load one voice's recordings and stamp them into a kit.
 *
 *  A voice whose files fail to load is SKIPPED rather than fatal. One 404 must
 *  not take the other nineteen voices down with it — `buildSoundsetKit` catches
 *  a throw by returning an empty kit map, which would silence the whole band
 *  including the control's eight. */
async function loadVoice(role: Role): Promise<Kit | null> {
  const voice = PALETTE_SAMPLES[role];
  if (!voice) return null;
  try {
    const loaded = await Promise.all(
      voice.samples.map(async (s) =>
        [s.variant, await loadSample(`${PALETTE_SAMPLE_ROOT}/${role}/${s.variant}.wav`)] as const,
      ),
    );
    const samples = new Map(loaded);
    // Zones only where there is something to choose between. A single-recording
    // voice keeps the original path — whole note shifted, no zone lookup — so
    // `sub`, `shaker` and the texture beds behave exactly as an unzoned kit.
    const zones: PitchZone[] | undefined =
      voice.samples.length > 1
        ? voice.samples.map((s) => ({ variant: s.variant, rootSemitone: s.rootSemitone }))
        : undefined;
    return makeKit(role, samples, 0, { zones, loop: voice.loop });
  } catch (e) {
    console.warn(`[palette] ${role} samples failed to load; voice will be silent:`, e);
    return null;
  }
}

/** Load the palette's twelve voices. Merged over the Afterhours eight by
 *  buildSoundsetKit; the two never overlap, so a change here cannot move the
 *  control's eight voices. */
export async function buildPaletteKit(): Promise<Map<Role, Kit>> {
  const roles = Object.keys(PALETTE_SAMPLES) as Role[];
  const loaded = await Promise.all(roles.map(async (role) => [role, await loadVoice(role)] as const));
  const kits = new Map<Role, Kit>();
  for (const [role, kit] of loaded) if (kit) kits.set(role, kit);
  if (kits.size !== roles.length) {
    console.warn(`[palette] ${kits.size}/${roles.length} voices loaded`);
  }
  return kits;
}
