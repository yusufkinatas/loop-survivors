import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'audio-mix-mute-solo-and-low-end-interaction-cata', kind: 'zoo', title: 'Audio mix, mute/solo, and low-end interaction catalog', status: 'CURRENT',
  description: 'Compare active voices in the same musical context and expose mix interactions that cannot be judged from isolated one-shots.', tags: ['zoo', 'catalog', 'production'],
  create: () => informativeRoom('audio-mix-mute-solo-and-low-end-interaction-cata', 'Audio mix, mute/solo, and low-end interaction catalog', 'Compare active voices in the same musical context and expose mix interactions that cannot be judged from isolated one-shots.', [
    { title: 'Source of truth', body: 'Entries are generated from canonical runtime registries and shown at comparable scale. Status prevents current, dormant, experimental, and historical content from being confused.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
