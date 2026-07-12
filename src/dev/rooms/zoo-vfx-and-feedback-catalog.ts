import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'vfx-and-feedback-catalog', kind: 'zoo', title: 'VFX and feedback catalog', status: 'CURRENT',
  description: 'Display every current visual-feedback family in one comparable, regression-friendly surface.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('vfx-and-feedback-catalog', 'VFX and feedback catalog', 'Display every current visual-feedback family in one comparable, regression-friendly surface.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
