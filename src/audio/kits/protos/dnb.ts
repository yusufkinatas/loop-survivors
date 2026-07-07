// dnb kit prototypes, built by scripts/build-dnb-protos.mjs from the MusicRadar
// SampleRadar "Drum & Bass" packs (170bpm + 175bpm) under
// /Users/yusufeminkinatas/Desktop/soundpacks/drum-and-bass. See ./types.ts.
//
// Three voicings to A/B: two 170bpm break kits (A drier, B darker) and one
// 175bpm two-step kit (C, faster/brighter). Each covers kick, snare,
// hat (closed+open), ride and a pitched bass (sampled at C2 -> tune -3 to seat
// it at the engine's A reference, matching House).
import type { ProtoManifest } from './types';

export const manifest: ProtoManifest = {
  variants: [
    {
      id: 'A',
      name: 'A · MusicRadar 170 Kit A',
      desc: 'punchy 170 break kit, drier',
      overlay: {
        kick: [['hard', 'kick'], ['soft', 'kick']],
        snare: [['snare', 'snare']],
        hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
        ride: [['ride', 'ride']],
        bass: [['bass', 'bass']],
      },
      tune: { bass: -3 },
    },
    {
      id: 'B',
      name: 'B · MusicRadar 170 Kit B',
      desc: 'darker/rounder 170 break kit',
      overlay: {
        kick: [['hard', 'kick'], ['soft', 'kick']],
        snare: [['snare', 'snare']],
        hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
        ride: [['ride', 'ride']],
        bass: [['bass', 'bass']],
      },
      tune: { bass: -3 },
    },
    {
      id: 'C',
      name: 'C · MusicRadar 175 Two-Step',
      desc: 'faster, brighter two-step kit',
      overlay: {
        kick: [['hard', 'kick'], ['soft', 'kick']],
        snare: [['snare', 'snare']],
        hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
        ride: [['ride', 'ride']],
        bass: [['bass', 'bass']],
      },
      tune: { bass: -3 },
    },
  ],
};
