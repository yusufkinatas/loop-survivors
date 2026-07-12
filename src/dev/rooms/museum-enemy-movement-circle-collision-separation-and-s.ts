import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'enemy-movement-circle-collision-separation-and-s', kind: 'museum', title: 'Enemy movement, circle collision, separation, and spatial hash', status: 'CURRENT',
  description: 'Explain how the horde moves and collides efficiently at scale.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('enemy-movement-circle-collision-separation-and-s', 'Enemy movement, circle collision, separation, and spatial hash', 'Explain how the horde moves and collides efficiently at scale.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
