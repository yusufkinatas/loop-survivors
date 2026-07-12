import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'audio-asset-provenance-licenses-processing-and-h', kind: 'museum', title: 'Audio asset provenance, licenses, processing, and health', status: 'CURRENT',
  description: 'Make every shipped or experimental sound asset\'s source and health inspectable before store preparation.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('audio-asset-provenance-licenses-processing-and-h', 'Audio asset provenance, licenses, processing, and health', 'Make every shipped or experimental sound asset\'s source and health inspectable before store preparation.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
