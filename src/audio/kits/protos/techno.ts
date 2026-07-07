// techno kit prototypes. Built by scripts/build-techno-protos.mjs from the packs
// under /Users/yusufeminkinatas/Desktop/soundpacks/techno (MusicRadar free techno
// drum/FX pack + Cyclick "Bass Synthesis" C2 multisamples). See ./types.ts.
import type { ProtoManifest } from './types';

export const manifest: ProtoManifest = {
  variants: [
    {
      id: 'A',
      name: 'A · MusicRadar Digital',
      desc: 'clean, snappy modern techno core (digital drum hits)',
      overlay: {
        kick: [['hard', 'kick'], ['soft', 'kick']],
        clap: [['clap', 'clap']],
        rimshot: [['rimshot', 'rimshot']],
        hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
        ride: [['ride', 'ride']],
        bass: [['bass', 'bass']],
      },
      tune: { bass: -3 }, // bass recorded at C2, same as House -> -3 to engine A ref
    },
    {
      id: 'B',
      name: 'B · Analogue Machines',
      desc: 'gritty vintage drum-machine grit (Vermona / Jomox)',
      overlay: {
        kick: [['hard', 'kick'], ['soft', 'kick']],
        clap: [['clap', 'clap']],
        rimshot: [['rimshot', 'rimshot']],
        hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
        ride: [['ride', 'ride']],
        bass: [['bass', 'bass']],
      },
      tune: { bass: -3 },
    },
  ],
};
