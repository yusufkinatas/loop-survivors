import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'xp-reward-queue-physical-choice-and-next-bar-app', kind: 'museum', title: 'XP, reward queue, physical choice, and next-bar application', status: 'CURRENT',
  description: 'Explain the complete progression lifecycle through a functional state diagram and live example.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('xp-reward-queue-physical-choice-and-next-bar-app', 'XP, reward queue, physical choice, and next-bar application', 'Explain the complete progression lifecycle through a functional state diagram and live example.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
