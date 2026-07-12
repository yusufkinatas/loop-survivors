import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'current-dormant-removed-parked-and-experimental-', kind: 'museum', title: 'Current, dormant, removed, parked, and experimental system status', status: 'CURRENT',
  description: 'Prevent future developers and AI agents from resurrecting superseded mechanics or treating experiments as shipped systems.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('current-dormant-removed-parked-and-experimental-', 'Current, dormant, removed, parked, and experimental system status', 'Prevent future developers and AI agents from resurrecting superseded mechanics or treating experiments as shipped systems.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
