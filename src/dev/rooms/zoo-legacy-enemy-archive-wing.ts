import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'legacy-enemy-archive-wing', kind: 'zoo', title: 'Legacy enemy archive wing', status: 'CURRENT',
  description: 'Keep swarmer, tank, darter, splitter, charger, circler, shielded, and elite discoverable without documenting them as the active stage roster.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('legacy-enemy-archive-wing', 'Legacy enemy archive wing', 'Keep swarmer, tank, darter, splitter, charger, circler, shielded, and elite discoverable without documenting them as the active stage roster.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
