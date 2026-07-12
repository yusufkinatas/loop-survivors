import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'active-mad-forest-enemy-catalog', kind: 'zoo', title: 'Active Mad Forest enemy catalog', status: 'CURRENT',
  description: 'Show all twelve current enemies at comparable scale with production stats and states.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('active-mad-forest-enemy-catalog', 'Active Mad Forest enemy catalog', 'Show all twelve current enemies at comparable scale with production stats and states.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
