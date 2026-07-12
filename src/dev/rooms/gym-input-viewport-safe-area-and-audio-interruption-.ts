import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'input-viewport-safe-area-and-audio-interruption-', kind: 'gym', title: 'Input, viewport, safe-area, and audio-interruption testing', status: 'CURRENT',
  description: 'Exercise required mobile behavior and current desktop inputs across representative devices and lifecycle interruptions.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('input-viewport-safe-area-and-audio-interruption-', 'Input, viewport, safe-area, and audio-interruption testing', 'Exercise required mobile behavior and current desktop inputs across representative devices and lifecycle interruptions.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
