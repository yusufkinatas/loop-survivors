import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'complete-ui-state-and-responsive-layout-catalog', kind: 'zoo', title: 'Complete UI state and responsive-layout catalog', status: 'CURRENT',
  description: 'Render real UI components in canonical states for visual comparison and regression.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('complete-ui-state-and-responsive-layout-catalog', 'Complete UI state and responsive-layout catalog', 'Render real UI components in canonical states for visual comparison and regression.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
