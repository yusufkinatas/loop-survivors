import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'enemy-behavior-isolation-and-stat-level-presets', kind: 'gym', title: 'Enemy behavior isolation and stat-level presets', status: 'CURRENT',
  description: 'Inspect each current enemy\'s movement, collision, contact, knockback, death, and reward behavior without stage pressure.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('enemy-behavior-isolation-and-stat-level-presets', 'Enemy behavior isolation and stat-level presets', 'Inspect each current enemy\'s movement, collision, contact, knockback, death, and reward behavior without stage pressure.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
