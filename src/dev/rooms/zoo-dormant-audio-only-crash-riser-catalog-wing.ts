import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'dormant-audio-only-crash-riser-catalog-wing', kind: 'zoo', title: 'Dormant audio-only crash/riser catalog wing', status: 'DORMANT',
  description: 'Preserve audible crash/riser catalog content without letting it masquerade as playable weapons.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('dormant-audio-only-crash-riser-catalog-wing', 'Dormant audio-only crash/riser catalog wing', 'Preserve audible crash/riser catalog content without letting it masquerade as playable weapons.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
