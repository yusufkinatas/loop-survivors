import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'boss-hazard-and-attack-pattern-isolation', kind: 'gym', title: 'Boss hazard and attack-pattern isolation', status: 'EXPERIMENTAL',
  description: 'Expose each reusable `BossWorld` hazard independently from a whole song or boss arrangement.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('boss-hazard-and-attack-pattern-isolation', 'Boss hazard and attack-pattern isolation', 'Expose each reusable `BossWorld` hazard independently from a whole song or boss arrangement.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
