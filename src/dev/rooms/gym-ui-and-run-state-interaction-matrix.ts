import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'ui-and-run-state-interaction-matrix', kind: 'gym', title: 'UI and run-state interaction matrix', status: 'CURRENT',
  description: 'Jump directly into every shell/UI state and test behavior, focus, audio lifecycle, and resizing without playing through a full run.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('ui-and-run-state-interaction-matrix', 'UI and run-state interaction matrix', 'Jump directly into every shell/UI state and test behavior, focus, audio lifecycle, and resizing without playing through a full run.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
