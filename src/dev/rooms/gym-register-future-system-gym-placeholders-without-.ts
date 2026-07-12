import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'register-future-system-gym-placeholders-without-', kind: 'gym', title: 'Register future-system Gym placeholders without implementing mechanics', status: 'PARKED',
  description: 'Reserve discoverable status entries for future testing surfaces while preventing a Dev Campus task from silently implementing parked mechanics.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('register-future-system-gym-placeholders-without-', 'Register future-system Gym placeholders without implementing mechanics', 'Reserve discoverable status entries for future testing surfaces while preventing a Dev Campus task from silently implementing parked mechanics.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
