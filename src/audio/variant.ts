// Track variants: a genre is no longer one fixed set of patterns. Each genre
// carries several selectable "tracks" — different arrangements of the same
// twelve-plus instrument catalog — so the same character (tempo family, mood)
// can be auditioned as distinct songs. "Same tools, different track", one level
// deeper than the genre itself.
//
// Variant 0 of every genre is always "Classic" (the originally shipped
// patterns). The rest are alternatives researched from real production
// practice. The sandbox track-test room switches the active variant live; the
// choice persists so a picked variant becomes the default for real runs.

import type { Chart } from './charts';
import type { Role } from './kits';

export interface GenreVariant {
  /** Stable id, unique within a genre (e.g. 'classic', 'deep', 'jackin'). */
  id: string;
  /** Short display name for the track-test room. */
  name: string;
  /** One-line note: the reference sound / what makes this track different. */
  note?: string;
  /** Optional tempo/feel overrides. Omitted fields inherit the genre default. */
  bpm?: number;
  swing?: number;
  powerMul?: number;
  /** A full four-tier ladder for every role in the catalog. */
  ladders: Record<Role, Chart[]>;
}
