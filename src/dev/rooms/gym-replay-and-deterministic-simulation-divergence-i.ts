import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'replay-and-deterministic-simulation-divergence-i', kind: 'gym', title: 'Replay and deterministic-simulation divergence inspector', status: 'CURRENT',
  description: 'Make live/browser/headless agreement inspectable rather than relying only on successful replay observation.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('replay-and-deterministic-simulation-divergence-i', 'Replay and deterministic-simulation divergence inspector', 'Make live/browser/headless agreement inspectable rather than relying only on successful replay observation.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
