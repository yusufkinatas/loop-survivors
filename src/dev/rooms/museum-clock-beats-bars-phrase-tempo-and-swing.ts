import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'clock-beats-bars-phrase-tempo-and-swing', kind: 'museum', title: 'Clock, beats, bars, phrase, tempo, and swing', status: 'CURRENT',
  description: 'Explain the musical clock in plain language for a non-musician developer.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('clock-beats-bars-phrase-tempo-and-swing', 'Clock, beats, bars, phrase, tempo, and swing', 'Explain the musical clock in plain language for a non-musician developer.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
