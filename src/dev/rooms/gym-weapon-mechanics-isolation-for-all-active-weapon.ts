import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'weapon-mechanics-isolation-for-all-active-weapon', kind: 'gym', title: 'Weapon mechanics isolation for all active weapons and tiers', status: 'CURRENT',
  description: 'Test each of the fourteen active weapons in isolation through the real trigger and damage paths.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('weapon-mechanics-isolation-for-all-active-weapon', 'Weapon mechanics isolation for all active weapons and tiers', 'Test each of the fourteen active weapons in isolation through the real trigger and damage paths.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
