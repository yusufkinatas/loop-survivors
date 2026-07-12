import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'xp-gems-diegetic-level-up-and-reward-queue', kind: 'gym', title: 'XP, gems, diegetic level-up, and reward queue', status: 'CURRENT',
  description: 'Exercise the full reward path, including shell-owned behavior absent from headless bot resolution.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('xp-gems-diegetic-level-up-and-reward-queue', 'XP, gems, diegetic level-up, and reward queue', 'Exercise the full reward path, including shell-owned behavior absent from headless bot resolution.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
