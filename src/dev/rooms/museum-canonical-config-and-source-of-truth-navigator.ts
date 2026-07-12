import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'canonical-config-and-source-of-truth-navigator', kind: 'museum', title: 'Canonical config and source-of-truth navigator', status: 'CURRENT',
  description: 'Provide a live index of where current gameplay truth comes from without becoming a static wiki.', tags: ['museum', 'live-example', 'architecture'],
  create: () => informativeRoom('canonical-config-and-source-of-truth-navigator', 'Canonical config and source-of-truth navigator', 'Provide a live index of where current gameplay truth comes from without becoming a static wiki.', [
    { title: 'Live example', body: 'The canonical preset names the production seam and provides a fixed seed. Pause and single-step to observe the boundary without replacing it with a teaching-only implementation.' },
    { title: 'Good invariant', body: 'The demonstrated production rule remains true after reset and under the edge-case preset.' },
    { title: 'Bad invariant', body: 'If the displayed source, status, or runtime result disagrees, treat it as documentation drift or a regression—not as a new design decision.' },
    { title: 'Deeper documentation', body: 'Follow the source-of-truth labels into the master plan, locked phase specifications, research notes, and canonical configuration.' },
  ], ['canonical', 'good-invariant', 'bad-invariant']),
});
