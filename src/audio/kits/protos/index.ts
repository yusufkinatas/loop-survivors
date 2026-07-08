// Prototype registry: maps each genre to its ProtoManifest. Each genre's
// manifest lives in its own file (conflict-free authoring); this file only
// gathers them. House is already finalized (it adopted "Tight Tech"), so it
// has no prototypes.

import type { GenreId } from '../../genres';
import { EMPTY, type ProtoManifest } from './types';
import { manifest as techno } from './techno';

export const PROTOS: Record<GenreId, ProtoManifest> = {
  house: EMPTY,
  techno,
};
