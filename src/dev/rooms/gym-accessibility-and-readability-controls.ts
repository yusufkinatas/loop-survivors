import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'accessibility-and-readability-controls', kind: 'gym', title: 'Accessibility and readability controls', status: 'CURRENT',
  description: 'Evaluate whether gameplay remains readable across visual, motion, input, and audio conditions.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('accessibility-and-readability-controls', 'Accessibility and readability controls', 'Evaluate whether gameplay remains readable across visual, motion, input, and audio conditions.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
