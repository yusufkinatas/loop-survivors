import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'dedicated-kick-calibration-facing-strips-and-rep', kind: 'gym', title: 'Dedicated Kick calibration: facing strips and repeat-hit lock', status: 'CURRENT',
  description: 'Give the pending parity gate a focused surface for Kick\'s front strip, delayed opposite strip, scale, damage, and shared per-target 1.35-second repeat-hit lock.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('dedicated-kick-calibration-facing-strips-and-rep', 'Dedicated Kick calibration: facing strips and repeat-hit lock', 'Give the pending parity gate a focused surface for Kick\'s front strip, delayed opposite strip, scale, damage, and shared per-target 1.35-second repeat-hit lock.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
