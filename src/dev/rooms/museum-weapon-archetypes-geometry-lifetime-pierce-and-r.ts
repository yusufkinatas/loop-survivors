import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'weapon-archetypes-geometry-lifetime-pierce-and-r', kind: 'museum', title: 'Weapon archetypes, geometry, lifetime, pierce, and repeat hits', status: 'CURRENT',
  description: 'Teach how one shared trigger contract branches into the game\'s different weapon behaviors.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('weapon-archetypes-geometry-lifetime-pierce-and-r', 'Weapon archetypes, geometry, lifetime, pierce, and repeat hits', 'Teach how one shared trigger contract branches into the game\'s different weapon behaviors.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
