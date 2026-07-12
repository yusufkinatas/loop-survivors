import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'icon-palette-typography-and-readability-tokens', kind: 'zoo', title: 'Icon, palette, typography, and readability tokens', status: 'CURRENT',
  description: 'Provide one comparison surface for the game\'s procedural visual language and semantic UI tokens.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('icon-palette-typography-and-readability-tokens', 'Icon, palette, typography, and readability tokens', 'Provide one comparison surface for the game\'s procedural visual language and semantic UI tokens.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
