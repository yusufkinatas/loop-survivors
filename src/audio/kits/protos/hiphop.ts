// hiphop kit prototypes. Built by scripts/build-hiphop-protos.mjs from the packs
// under /Users/yusufeminkinatas/Desktop/soundpacks/hiphop. See ./types.ts.
//
// Two distinct trap voicings to A/B:
//   A · MusicRadar Trap        — bright, modern, snappy.
//   B · TriSamples 808 Trapstep — deeper, crustier, vinyl-flavoured.
// Both take the sampled 808 sub-bass from the TriSamples "808 Bass" folder; it
// measures A1 (~55.8 Hz), which matches the engine's A reference, so bass tune 0.
import type { ProtoManifest, ProtoVariant } from './types';

const overlay: ProtoVariant['overlay'] = {
  kick: [['hard', 'kick'], ['soft', 'kick_soft']],
  snare: [['snare', 'snare']],
  clap: [['clap', 'clap']],
  rimshot: [['rimshot', 'rimshot']],
  hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
  shaker: [['shaker', 'shaker']],
  bass: [['bass', 'bass'], ['fat', 'bass_fat']],
};

export const manifest: ProtoManifest = {
  variants: [
    {
      id: 'A',
      name: 'A · MusicRadar Trap',
      desc: 'bright, modern, snappy trap drums + A1 808',
      overlay,
    },
    {
      id: 'B',
      name: 'B · TriSamples 808 Trapstep',
      desc: 'deeper, crustier vinyl-flavoured drums + A1 808',
      overlay,
    },
  ],
};
