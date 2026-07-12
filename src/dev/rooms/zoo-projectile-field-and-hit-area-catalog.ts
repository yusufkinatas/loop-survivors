import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'projectile-field-and-hit-area-catalog', kind: 'zoo', title: 'Projectile, field, and hit-area catalog', status: 'CURRENT',
  description: 'Compare the visual/gameplay bodies created by every current weapon archetype.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('projectile-field-and-hit-area-catalog', 'Projectile, field, and hit-area catalog', 'Compare the visual/gameplay bodies created by every current weapon archetype.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
