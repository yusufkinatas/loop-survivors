import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'world-simulation-pixi-view-cosmetic-fx-and-headl', kind: 'museum', title: 'World simulation, Pixi view, cosmetic FX, and headless mode', status: 'CURRENT',
  description: 'Explain which state is authoritative and how the same simulation runs live, replayed, or headless.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('world-simulation-pixi-view-cosmetic-fx-and-headl', 'World simulation, Pixi view, cosmetic FX, and headless mode', 'Explain which state is authoritative and how the same simulation runs live, replayed, or headless.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
