// Entry. The game is the default; the rehearsal room lives at #rehearsal.
// Both are driven by the same engine.

import { buildKits } from './audio/kits';
import { MusicEngine } from './audio/engine';
import { SKELETON } from './audio/scale';
import { mountRehearsalRoom } from './rehearsal/room';
import { bootGame } from './game/game';
import './style.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';

  const kits = await buildKits(SKELETON.rootHz);
  // Created suspended until a user gesture; the first click resumes it.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const engine = new MusicEngine(ctx, kits);

  // Developer console handle (docs/phases/m1-demo.md, developer tools):
  // poke the engine from the browser console, e.g. loop.engine.outputLevel().
  (window as unknown as { loop: object }).loop = { engine, kits };

  root.textContent = '';
  if (location.hash === '#rehearsal') {
    mountRehearsalRoom(root, engine);
  } else {
    await bootGame(root, engine, kits);
  }
  // switching modes reloads: both mount into the same root
  window.addEventListener('hashchange', () => location.reload());
}

void boot();
