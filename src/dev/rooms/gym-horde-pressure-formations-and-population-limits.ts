import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'horde-pressure-formations-and-population-limits', kind: 'gym', title: 'Horde pressure, formations, and population limits', status: 'CURRENT',
  description: 'Test crowd pressure separately from the full stage timeline.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('horde-pressure-formations-and-population-limits', 'Horde pressure, formations, and population limits', 'Test crowd pressure separately from the full stage timeline.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
