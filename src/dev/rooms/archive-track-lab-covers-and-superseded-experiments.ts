import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'track-lab-covers-and-superseded-experiments', kind: 'archive', title: 'Track Lab covers and superseded experiments', status: 'HISTORICAL',
  description: 'Preserve valuable Track Lab and prototype work without presenting it as current game documentation.', tags: ['archive', 'catalog', 'production'],
  create: () => informativeRoom('track-lab-covers-and-superseded-experiments', 'Track Lab covers and superseded experiments', 'Preserve valuable Track Lab and prototype work without presenting it as current game documentation.', [
    { title: 'Source of truth', body: 'This room preserves superseded experiments without presenting them as current production truth.' },
    { title: 'Inspection workflow', body: 'Choose a preset, compare entries under the same conditions, pause or advance one fixed tick where supported, then copy the exact URL.' },
    { title: 'Status boundary', body: 'The badge is part of the result: parked work is not implemented, experimental work is not current, and archived work is not production guidance.' },
  ], ['canonical', 'comparison', 'edge-case']),
});
