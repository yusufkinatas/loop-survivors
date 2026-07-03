// M1 sub-phase A entry: boots straight into the rehearsal room. The game
// (sub-phase B) will mount alongside it later, driven by the same engine.

import { buildKits } from './audio/kits';
import { MusicEngine } from './audio/engine';
import { SKELETON } from './audio/scale';
import { mountRehearsalRoom } from './rehearsal/room';
import './style.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';

  const kits = await buildKits(SKELETON.rootHz);
  // Created suspended until a user gesture; the play button resumes it.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const engine = new MusicEngine(ctx, kits);

  mountRehearsalRoom(root, engine);

  // Developer console handle (docs/phases/m1-demo.md, developer tools):
  // poke the engine from the browser console, e.g. loop.engine.outputLevel().
  (window as unknown as { loop: object }).loop = { engine, kits };
}

void boot();
