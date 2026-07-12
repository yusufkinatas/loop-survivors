import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'stage-timeline-scrub-and-event-window-runner', kind: 'gym', title: 'Stage timeline scrub and event-window runner', status: 'CURRENT',
  description: 'Inspect the data-driven 0:00–7:00 schedule and its exact event neighborhoods without playing unrelated minutes.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('stage-timeline-scrub-and-event-window-runner', 'Stage timeline scrub and event-window runner', 'Inspect the data-driven 0:00–7:00 schedule and its exact event neighborhoods without playing unrelated minutes.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
