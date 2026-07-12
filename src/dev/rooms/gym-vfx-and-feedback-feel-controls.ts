import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'vfx-and-feedback-feel-controls', kind: 'gym', title: 'VFX and feedback feel controls', status: 'CURRENT',
  description: 'Trigger and study feedback effects in isolation without needing the matching gameplay event.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('vfx-and-feedback-feel-controls', 'VFX and feedback feel controls', 'Trigger and study feedback effects in isolation without needing the matching gameplay event.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
