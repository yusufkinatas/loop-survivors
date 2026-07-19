// Three unlock-ready drum palettes for the fixed house arrangement. These
// definitions replace unpitched one-shots; bass, chords, lead, arp, and bell
// use the fresh procedural Afterhours voicing tuned to the allowed notes. The
// internal `shaker` entry is a kick-layer texture, not a playable weapon.

import type { Role } from './kits';

export const SAMPLE_PI_SOURCE = {
  repository: 'https://github.com/alex-esc/sample-pi',
  commit: 'f14596be37abf227bf77d198c9b0b60d9eb4dca9',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const;

export const AUDIO_SET_IDS = [
  'midnight-warehouse',
  'velvet-rooftop',
  'acid-circuit',
] as const;

export type AudioSetId = (typeof AUDIO_SET_IDS)[number];

export interface AudioSetSample {
  /** Variant id already used by the role's charts/kit. */
  variant: string;
  /** Normalized WAV basename inside the palette directory. */
  file: string;
  /** Exact CC0 FLAC path in Sample Pi at SAMPLE_PI_SOURCE.commit. */
  sourcePath: string;
  /** Immutable raw download URL for provenance and reproducible conversion. */
  sourceUrl: string;
  /** Original Freesound page recorded by Sample Pi, when available. */
  originalUrl: string;
}

export interface AudioSetDefinition {
  id: AudioSetId;
  name: string;
  description: string;
  /** Stable ordering for collection/unlock UI. */
  unlockOrder: number;
  /** The first palette is immediately usable; later palettes can be rewards. */
  unlockedByDefault: boolean;
  /** Public URL root containing this palette's normalized WAV files. */
  sampleRoot: string;
  samples: Partial<Record<Role, readonly AudioSetSample[]>>;
}

const sample = (
  variant: string,
  file: string,
  sourcePath: string,
  originalUrl: string,
): AudioSetSample => ({
  variant,
  file,
  sourcePath,
  sourceUrl:
    `https://raw.githubusercontent.com/alex-esc/sample-pi/${SAMPLE_PI_SOURCE.commit}/${sourcePath}`,
  originalUrl,
});

const root = (id: AudioSetId): string => `/samples/audio-sets/${id}`;

export const AUDIO_SETS: Record<AudioSetId, AudioSetDefinition> = {
  'midnight-warehouse': {
    id: 'midnight-warehouse',
    name: 'Midnight Warehouse',
    description: 'A deep club kick, smoky backbeat, crisp metal hats, and a dry wooden tick.',
    unlockOrder: 0,
    unlockedByDefault: true,
    sampleRoot: root('midnight-warehouse'),
    samples: {
      kick: [
        sample('hard', 'kick.wav', 'drums/one-shots/kick/bd_haus.flac',
          'https://freesound.org/people/Rodrigo%20The%20Mad/sounds/137722/'),
      ],
      snare: [
        sample('snare', 'snare.wav', 'drums/one-shots/snare/sn_dub.flac',
          'https://freesound.org/people/Adriak909/sounds/173142/'),
      ],
      clap: [
        sample('clap', 'clap.wav', 'drums/one-shots/percussion/perc_snap.flac',
          'https://freesound.org/people/SoundCollectah/sounds/109400/'),
      ],
      hat: [
        sample('closed', 'hat_closed.wav', 'drums/one-shots/cymbal/drum_cymbal_closed.flac',
          'https://freesound.org/people/menegass/sounds/100053/'),
        sample('open', 'hat_open.wav', 'drums/one-shots/cymbal/drum_cymbal_open.flac',
          'https://freesound.org/people/menegass/sounds/100055/'),
      ],
      shaker: [
        sample('shaker', 'percussion.wav', 'drums/one-shots/electric/elec_wood.flac',
          'https://freesound.org/people/looppool/sounds/13135/'),
      ],
    },
  },
  'velvet-rooftop': {
    id: 'velvet-rooftop',
    name: 'Velvet Rooftop',
    description: 'A round clean kick with soft drums, airy cymbals, and a bright triangle accent.',
    unlockOrder: 1,
    unlockedByDefault: false,
    sampleRoot: root('velvet-rooftop'),
    samples: {
      kick: [
        sample('hard', 'kick.wav', 'drums/one-shots/kick/bd_pure.flac',
          'https://freesound.org/people/EKVelika/sounds/209571/'),
      ],
      snare: [
        sample('snare', 'snare.wav', 'drums/one-shots/snare/drum_snare_soft.flac',
          'https://freesound.org/people/menegass/sounds/100059/'),
      ],
      clap: [
        sample('clap', 'clap.wav', 'drums/one-shots/percussion/perc_snap2.flac',
          'https://freesound.org/people/Peram/sounds/158615/'),
      ],
      hat: [
        sample('closed', 'hat_closed.wav', 'drums/one-shots/cymbal/drum_cymbal_pedal.flac',
          'https://freesound.org/people/menegass/sounds/100054/'),
        sample('open', 'hat_open.wav', 'drums/one-shots/cymbal/drum_cymbal_soft.flac',
          'https://freesound.org/people/menegass/sounds/100057/'),
      ],
      shaker: [
        sample('shaker', 'percussion.wav', 'drums/one-shots/electric/elec_triangle.flac',
          'https://freesound.org/people/looppool/sounds/13147/'),
      ],
    },
  },
  'acid-circuit': {
    id: 'acid-circuit',
    name: 'Acid Circuit',
    description: 'A hard electronic kick with filtered snares, tiny ticks, and glitch percussion.',
    unlockOrder: 2,
    unlockedByDefault: false,
    sampleRoot: root('acid-circuit'),
    samples: {
      kick: [
        sample('hard', 'kick.wav', 'drums/one-shots/kick/bd_tek.flac',
          'https://freesound.org/people/DWSD/sounds/171104/'),
      ],
      snare: [
        sample('snare', 'snare.wav', 'drums/one-shots/snare/elec_filt_snare.flac',
          'https://freesound.org/people/looppool/sounds/13141/'),
      ],
      clap: [
        sample('clap', 'clap.wav', 'drums/one-shots/snare/elec_hi_snare.flac',
          'https://freesound.org/people/looppool/sounds/13125/'),
      ],
      hat: [
        sample('closed', 'hat_closed.wav', 'drums/one-shots/electric/elec_tick.flac',
          'https://freesound.org/people/looppool/sounds/13113/'),
        sample('open', 'hat_open.wav', 'drums/one-shots/cymbal/elec_cymbal.flac',
          'https://freesound.org/people/looppool/sounds/13143/'),
      ],
      shaker: [
        sample('shaker', 'percussion.wav', 'drums/one-shots/glitchy/glitch_perc5.flac',
          'https://freesound.org/people/hullum/sounds/415552/'),
      ],
    },
  },
};

export const AUDIO_SET_LIST: readonly AudioSetDefinition[] = AUDIO_SET_IDS.map(
  (id) => AUDIO_SETS[id],
);

export const DEFAULT_AUDIO_SET_ID: AudioSetId = 'midnight-warehouse';

export function isAudioSetId(value: string): value is AudioSetId {
  return (AUDIO_SET_IDS as readonly string[]).includes(value);
}

/** Resolve persisted/user-provided ids safely; stale ids fall back to default. */
export function getAudioSet(id: AudioSetId | string = DEFAULT_AUDIO_SET_ID): AudioSetDefinition {
  return AUDIO_SETS[isAudioSetId(id) ? id : DEFAULT_AUDIO_SET_ID];
}
