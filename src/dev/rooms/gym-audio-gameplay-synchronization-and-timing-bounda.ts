import { registerRoom } from '../registry';
import { informativeRoom } from './shared';

registerRoom({
  id: 'audio-gameplay-synchronization-and-timing-bounda', kind: 'gym', title: 'Audio–gameplay synchronization and timing-boundary inspector', status: 'CURRENT',
  description: 'Protect the core “one event, two outputs” contract by making sound and world timing inspectable.', tags: ['gym', 'production', 'reproducible'],
  create: () => informativeRoom('audio-gameplay-synchronization-and-timing-bounda', 'Audio–gameplay synchronization and timing-boundary inspector', 'Protect the core “one event, two outputs” contract by making sound and world timing inspectable.', [
    { title: 'Production seam', body: 'This room reads production configuration and runtime state. Reset reconstructs the fixture from its seed; automation can report regressions but cannot pass a developer gate.' },
    { title: 'Inspection workflow', body: 'Choose a canonical preset, pause at the boundary under test, advance one fixed simulation tick, and copy the URL with the observation.' },
    { title: 'Truthful result', body: 'Record what happened and the fixture that produced it. Taste, feel, hands, eyes, and ears remain developer judgments.' },
  ], ['canonical', 'edge-case', 'stress']),
});
