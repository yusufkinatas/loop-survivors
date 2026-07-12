import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'existing-boss-fights-and-dodge-calibration', kind: 'gym', title: 'Existing boss fights and dodge calibration', status: 'EXPERIMENTAL',
  description: 'Migrate the standalone Boss Fights area into the Dev Campus while preserving its status as an undecided experiment.', tags: ['gym', 'catalog', 'production'],
  create: () => informativeRoom('existing-boss-fights-and-dodge-calibration', 'Existing boss fights and dodge calibration', 'Migrate the standalone Boss Fights area into the Dev Campus while preserving its status as an undecided experiment.', [
    { title: 'Source of truth', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation never passes a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
