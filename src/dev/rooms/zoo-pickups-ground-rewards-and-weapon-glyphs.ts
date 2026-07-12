import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'pickups-ground-rewards-and-weapon-glyphs', kind: 'zoo', title: 'Pickups, ground rewards, and weapon glyphs', status: 'CURRENT',
  description: 'Compare all collectible and offer visuals, their states, and their interaction ranges.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('pickups-ground-rewards-and-weapon-glyphs', 'Pickups, ground rewards, and weapon glyphs', 'Compare all collectible and offer visuals, their states, and their interaction ranges.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
