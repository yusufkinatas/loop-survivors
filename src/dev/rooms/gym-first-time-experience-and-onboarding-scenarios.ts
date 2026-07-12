import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'first-time-experience-and-onboarding-scenarios', kind: 'gym', title: 'First-time experience and onboarding scenarios', status: 'PARKED',
  description: 'Reserve reproducible onboarding test cases without designing M4 before its grilling/spec.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('first-time-experience-and-onboarding-scenarios', 'First-time experience and onboarding scenarios', 'Reserve reproducible onboarding test cases without designing M4 before its grilling/spec.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
