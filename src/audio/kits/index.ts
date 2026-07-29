// The soundset kit: the voicing of the instrument catalog the engine plays.
// The eight live voices are freshly rendered by buildSoundsetKit (below); one
// selected drum palette overlays its signature hits. Pitched/melodic voices
// stay procedural so every palette remains locked to the same allowed notes.
//
// OfflineAudioContext work happens only inside builder functions, never at
// module load. Only browser code (engine.ts) imports here.

import { loadSample, makeKit, offline, type Kit, type Role } from '../kits';
import {
  DEFAULT_AUDIO_SET_ID,
  getAudioSet,
  type AudioSetId,
  type AudioSetSample,
} from '../audio-sets';
import { buildAfterhoursKit } from './afterhours';
import { buildPaletteKit } from './palette';

/** The roles that are sample-backed (their own real voicing). The dev-only
 *  ★ custom badge marks these on offers so they are easy to focus on. */
export function sampledRoles(setId: AudioSetId | string = DEFAULT_AUDIO_SET_ID): Set<Role> {
  return new Set(
    (Object.keys(getAudioSet(setId).samples) as Role[]).filter((role) => role !== 'shaker'),
  );
}

/** Blend the palette's extra percussion accent under its kick. The accent is
 * intentionally not a tenth weapon: it makes every one of the 18 sourced
 * files audible while keeping the eight-weapon arrangement coherent. */
async function mixKickTexture(kick: AudioBuffer, texture: AudioBuffer): Promise<AudioBuffer> {
  const textureDelay = 0.012;
  const ctx = offline(Math.max(kick.duration, textureDelay + texture.duration) + 0.02);
  const kickSource = ctx.createBufferSource();
  kickSource.buffer = kick;
  const kickGain = ctx.createGain();
  kickGain.gain.value = 0.9;
  kickSource.connect(kickGain).connect(ctx.destination);

  const textureSource = ctx.createBufferSource();
  textureSource.buffer = texture;
  const textureGain = ctx.createGain();
  textureGain.gain.value = 0.2;
  textureSource.connect(textureGain).connect(ctx.destination);
  kickSource.start(0);
  textureSource.start(textureDelay);
  return ctx.startRendering();
}

async function layerPercussionTexture(
  kit: Map<Role, Kit>,
  setId: AudioSetId | string,
): Promise<void> {
  const set = getAudioSet(setId);
  const spec = set.samples.shaker?.[0];
  const kick = kit.get('kick');
  const kickBuffer = kick?.samples.get('hard');
  if (!spec || !kick || !kickBuffer) return;
  try {
    const texture = await loadSample(`${set.sampleRoot}/${spec.file}`);
    const mixed = await mixKickTexture(kickBuffer, texture);
    const samples = new Map(kick.samples);
    samples.set('hard', mixed);
    kit.set('kick', makeKit('kick', samples));
  } catch (e) {
    console.warn(`[kits] ${set.id} percussion texture failed, keeping clean kick:`, e);
  }
}

/** Overlay one palette's real drum/percussion samples onto the synth kit. A
 *  role whose every variant loads is replaced atomically; if any file fails
 *  (offline, 404), that role is left unchanged. Roles absent from this partial
 *  kit fall back to the engine's builtin procedural buffers (never silent). */
async function overlaySamples(
  kit: Map<Role, Kit>,
  setId: AudioSetId | string,
): Promise<void> {
  const set = getAudioSet(setId);
  await Promise.all(
    (Object.entries(set.samples) as [Role, readonly AudioSetSample[]][]).map(async ([role, specs]) => {
      if (role === 'shaker') return;
      try {
        const entries = await Promise.all(
          specs.map(async ({ variant, file }) =>
            [variant, await loadSample(`${set.sampleRoot}/${file}`)] as const,
          ),
        );
        kit.set(role, makeKit(role, new Map(entries)));
      } catch (e) {
        console.warn(
          `[kits] ${set.id}/${role} sample load failed, keeping procedural voice:`,
          e,
        );
      }
    }),
  );
  await layerPercussionTexture(kit, set.id);
}

// Each palette/root pair renders once, then reuses the in-flight/resolved
// promise. Separate palette keys prevent an unlock/selection from returning
// whichever kit happened to load first.
const cache = new Map<string, Promise<Map<Role, Kit>>>();

/** The complete live soundset: eight fresh procedural voices with the selected
 *  real drum palette overlaid. Existing callers may omit `setId` and receive
 *  the default palette. Built lazily and cached. */
export function buildSoundsetKit(
  rootHz: number,
  setId: AudioSetId | string = DEFAULT_AUDIO_SET_ID,
): Promise<Map<Role, Kit>> {
  const set = getAudioSet(setId);
  const key = `${set.id}:${rootHz}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all([buildAfterhoursKit(rootHz), buildPaletteKit(rootHz)])
      .then(async ([kit, palette]) => {
        // The palette's twelve voices (#266) are merged in BEFORE the drum
        // overlay, in that order deliberately: the overlay only ever touches
        // roles the selected sample set names, and it must be able to replace a
        // palette voice too if a set ever ships one.
        for (const [role, voice] of palette) kit.set(role, voice);
        await overlaySamples(kit, set.id);
        return kit;
      })
      .catch((error: unknown) => {
        // Keep a run playable if a browser cannot create an offline render.
        // Deleting the failed promise lets a later palette change retry.
        cache.delete(key);
        console.warn('[kits] Afterhours render failed; keeping emergency voices:', error);
        return new Map<Role, Kit>();
      });
    cache.set(key, pending);
  }
  return pending;
}
