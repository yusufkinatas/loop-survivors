import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'boss-conductor-song-phases-and-attack-timing', kind: 'museum', title: 'Boss conductor, song phases, and attack timing', status: 'EXPERIMENTAL',
  description: 'Explain the standalone “boss track becomes fight” prototype without deciding whether it enters the game.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('boss-conductor-song-phases-and-attack-timing', 'Boss conductor, song phases, and attack timing', 'Explain the standalone “boss track becomes fight” prototype without deciding whether it enters the game.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
