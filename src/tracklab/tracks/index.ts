// The Track Lab cover registry. Order = display order in the lab.

import { SAHARA } from './sahara';
import { PURSUIT } from './pursuit';
import { SATISFACTION } from './satisfaction';
import { DA_FUNK } from './dafunk';
import type { LabTrack } from './types';

export const TRACKS: LabTrack[] = [SAHARA, PURSUIT, SATISFACTION, DA_FUNK];
