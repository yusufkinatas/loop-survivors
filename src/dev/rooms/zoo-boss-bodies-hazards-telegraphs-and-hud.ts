import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'boss-bodies-hazards-telegraphs-and-hud', kind: 'zoo', title: 'Boss bodies, hazards, telegraphs, and HUD', status: 'EXPERIMENTAL',
  description: 'Lay out boss-specific content side by side while preserving its undecided status.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('boss-bodies-hazards-telegraphs-and-hud', 'Boss bodies, hazards, telegraphs, and HUD', 'Lay out boss-specific content side by side while preserving its undecided status.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
