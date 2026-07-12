import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'active-weapon-catalog-fourteen-weapons-four-tier', kind: 'zoo', title: 'Active weapon catalog: fourteen weapons × four tiers', status: 'CURRENT',
  description: 'Display every offered weapon side by side, grouped by the seven band slots, at consistent scale and context.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('active-weapon-catalog-fourteen-weapons-four-tier', 'Active weapon catalog: fourteen weapons × four tiers', 'Display every offered weapon side by side, grouped by the seven band slots, at consistent scale and context.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
