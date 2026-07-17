import type { VenueId } from '../game/tour';
import type { AudioSetId } from './audio-sets';

/** Venues conduct timbre, never notes or charts. Shared by the run and sandbox
 * so the visible room and its drum palette cannot diverge. */
export const VENUE_AUDIO_SET: Record<VenueId, AudioSetId> = {
  alley: 'midnight-warehouse',
  warehouse: 'acid-circuit',
  rooftop: 'velvet-rooftop',
  metro: 'acid-circuit',
  basement: 'midnight-warehouse',
  dawn: 'velvet-rooftop',
};
