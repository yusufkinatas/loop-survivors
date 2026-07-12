import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'pick-pool-offer-distribution-and-seven-slot-band', kind: 'gym', title: 'Pick pool, offer distribution, and seven-slot band rules', status: 'CURRENT',
  description: 'Make offer eligibility, weighting, slot exclusion, tier progression, and full-build behavior observable and reproducible.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('pick-pool-offer-distribution-and-seven-slot-band', 'Pick pool, offer distribution, and seven-slot band rules', 'Make offer eligibility, weighting, slot exclusion, tier progression, and full-build behavior observable and reproducible.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
