// synthwave kit prototypes. Built by scripts/build-synthwave-protos.mjs from the
// packs under /Users/yusufeminkinatas/Desktop/soundpacks/synthwave. See ./types.ts.
//
// Two prototypes, distinguished by their DRUM voicing; both share the same
// pitched synthwave bass overlay (Jupiter analog = bass, DX/FM = bass_fat), both
// rooted at A1 so they seat on the engine's A reference with no tune.
//   A "Clean 808"  — pure analog TR-808 (MusicRadar 808 pack)
//   B "Reimagined" — processed 808/909 hits (Cyclick 808 & 909 Reimagined, KDFX)
// Lead / chord / pad stay synthesized (wide-range pitched, need multisampling).
import type { ProtoManifest, ProtoVariant } from './types';

const overlay: ProtoVariant['overlay'] = {
  kick: [['hard', 'kick_hard'], ['soft', 'kick_soft']],
  snare: [['snare', 'snare']],
  clap: [['clap', 'clap']],
  hat: [['closed', 'hat_closed'], ['open', 'hat_open']],
  bass: [['bass', 'bass'], ['fat', 'bass_fat']],
};

export const manifest: ProtoManifest = {
  variants: [
    {
      id: 'A',
      name: 'A · Clean 808',
      desc: 'pure analog TR-808 drums, round Jupiter + FM bass',
      overlay: { ...overlay },
    },
    {
      id: 'B',
      name: 'B · Reimagined',
      desc: 'processed 808/909 hits (KDFX chain), same synth bass',
      overlay: { ...overlay },
    },
  ],
};
