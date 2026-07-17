// Entry. The game is the default; the rehearsal room lives at #rehearsal.
// Both are driven by the same engine.

import { inject } from '@vercel/analytics';
import { buildKits } from './audio/kits';
import { MusicEngine } from './audio/engine';
import * as charts from './audio/chartstore';
import { SKELETON } from './audio/scale';
import { mountRehearsalRoom } from './experiments/rehearsal/room';
import { mountTrackLab } from './experiments/tracklab/lab';
import { mountBossFight } from './experiments/boss/page';
import { bootGame } from './game/game';
import './style.css';

inject();

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';

  const kits = await buildKits(SKELETON.rootHz);
  // Created suspended until a user gesture; the first click resumes it.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const engine = new MusicEngine(ctx, kits);

  // Mobile browsers suspend or interrupt the context on tab switches and
  // ring-switch events; any touch afterwards brings the sound back. An
  // intentional game/pick pause owns the context and ignores generic taps.
  document.addEventListener('pointerdown', () => {
    engine.resumeContextIfAllowed();
  });

  // Developer console handle (developer tools):
  // poke the engine from the browser console, e.g. loop.engine.outputLevel(),
  // or dump playground edits: copy(loop.charts.exportEdits()).
  (window as unknown as { loop: object }).loop = { engine, kits, charts };

  root.textContent = '';
  if (location.hash === '#rehearsal') {
    mountRehearsalRoom(root, engine);
  } else if (location.hash === '#tracklab') {
    // The Experimentation room: kept as a standalone lab for auditioning
    // reverse-engineered covers (see src/experiments/tracklab/lab.ts).
    mountTrackLab(root, ctx);
  } else if (location.hash === '#boss') {
    // Standalone Boss Fight area (not wired into the run — a separate
    // playtest surface).
    await mountBossFight(root, ctx);
  } else {
    await bootGame(root, engine, kits);
  }
  // switching modes reloads: both mount into the same root
  window.addEventListener('hashchange', () => location.reload());
}

void boot();
