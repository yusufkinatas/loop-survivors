// Lo-Fi kit prototypes, built by scripts/build-lofi-protos.mjs from the packs
// under /Users/yusufeminkinatas/Desktop/soundpacks/lofi. Three distinct
// voicings; each covers kick / snare / rimshot / hat (closed+open). No pack
// ships a dedicated shaker, so the shaker role stays synthesized in all three.
// See ./types.ts.
import type { ProtoManifest, ProtoVariant } from './types';

// All three prototypes cover the same role set; only the samples differ.
const drums = (): ProtoVariant['overlay'] => ({
  kick: [['hard', 'kick'], ['soft', 'kick_soft']],
  snare: [['snare', 'snare']],
  rimshot: [['rimshot', 'rimshot']],
  hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
});

export const manifest: ProtoManifest = {
  variants: [
    {
      id: 'A',
      name: 'A · itslucid Tape Kit',
      desc: 'dusty tape drums, fuller kick and roomy open hat',
      overlay: drums(),
    },
    {
      id: 'B',
      name: 'B · MyLofi Bedroom',
      desc: 'tight bedroom-producer kit, short snappy hits',
      overlay: drums(),
    },
    {
      id: 'C',
      name: 'C · LoFi Pads Room',
      desc: 'crisp room kit, finger-snap rim and long open hat',
      overlay: drums(),
    },
  ],
};
