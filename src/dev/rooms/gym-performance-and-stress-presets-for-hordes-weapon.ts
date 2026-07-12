import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'performance-and-stress-presets-for-hordes-weapon', kind: 'gym', title: 'Performance and stress presets for hordes, weapons, FX, and pickups', status: 'CURRENT',
  description: 'Provide fixed, reproducible stress scenes and separate simulation, rendering, and audio costs.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('performance-and-stress-presets-for-hordes-weapon', 'Performance and stress presets for hordes, weapons, FX, and pickups', 'Provide fixed, reproducible stress scenes and separate simulation, rendering, and audio costs.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
