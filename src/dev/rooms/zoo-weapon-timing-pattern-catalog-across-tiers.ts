import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'weapon-timing-pattern-catalog-across-tiers', kind: 'zoo', title: 'Weapon timing-pattern catalog across tiers', status: 'CURRENT',
  description: 'Show every active weapon\'s four shipped firing patterns side by side and make progression understandable by sight and ear.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('weapon-timing-pattern-catalog-across-tiers', 'Weapon timing-pattern catalog across tiers', 'Show every active weapon\'s four shipped firing patterns side by side and make progression understandable by sight and ear.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
