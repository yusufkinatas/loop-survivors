// The single drum palette for the fixed house arrangement. These definitions
// replace unpitched one-shots; bass, chords, lead, arp, and bell use the fresh
// procedural Afterhours voicing tuned to the allowed notes. The internal
// `shaker` entry is a kick-layer texture, not a playable weapon.

import type { Role } from './kits';

const SAMPLE_PI_SOURCE = {
  repository: 'https://github.com/alex-esc/sample-pi',
  commit: 'f14596be37abf227bf77d198c9b0b60d9eb4dca9',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const;

const AUDIO_SET_IDS = [
  'midnight-warehouse',
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

const AUDIO_SETS: Record<AudioSetId, AudioSetDefinition> = {
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
};

export const DEFAULT_AUDIO_SET_ID: AudioSetId = 'midnight-warehouse';

function isAudioSetId(value: string): value is AudioSetId {
  return (AUDIO_SET_IDS as readonly string[]).includes(value);
}

/** Resolve persisted/user-provided ids safely; stale ids fall back to default. */
export function getAudioSet(id: AudioSetId | string = DEFAULT_AUDIO_SET_ID): AudioSetDefinition {
  return AUDIO_SETS[isAudioSetId(id) ? id : DEFAULT_AUDIO_SET_ID];
}
