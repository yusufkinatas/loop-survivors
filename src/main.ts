// Entry. The game is the default; the rehearsal room lives at #rehearsal.
// Both are driven by the same engine.

import { buildSoundsetKit } from './audio/kits/index';
import { MusicEngine } from './audio/engine';
import * as charts from './audio/chartstore';
import { SKELETON } from './audio/scale';
import { mountRehearsalRoom } from './rehearsal/room';
import { mountTrackLab } from './tracklab/lab';
import { mountBossFight } from './boss/page';
import { bootGame } from './game/game';
import './style.css';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.textContent = 'rendering kits…';

  // Build only the twelve voices in the active House catalog. The larger
  // legacy synthesis library remains an offline prototype toolbox, but it no
  // longer delays every game boot by rendering unavailable instruments.
  const kits = await buildSoundsetKit(SKELETON.rootHz);
  // Created suspended until a user gesture; the first click resumes it.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const engine = new MusicEngine(ctx, kits);
  await engine.ready;

  // Mobile browsers suspend or interrupt the context on tab switches and
  // ring-switch events; any touch afterwards brings the sound back.
  document.addEventListener('pointerdown', () => {
    if (ctx.state !== 'running') void ctx.resume();
  });

  // Developer console handle (docs/phases/m1-demo.md, developer tools):
  // poke the engine from the browser console, e.g. loop.engine.outputLevel(),
  // or dump playground edits: copy(loop.charts.exportEdits()).
  (window as unknown as { loop: object }).loop = { engine, kits, charts };

  root.textContent = '';
  if (location.hash === '#rehearsal') {
    mountRehearsalRoom(root, engine);
  } else if (location.hash === '#tracklab') {
    // The Experimentation room: kept as a standalone lab for auditioning
    // reverse-engineered covers (see src/tracklab/lab.ts).
    mountTrackLab(root, ctx);
  } else if (location.hash === '#boss') {
    // Standalone Boss Fight area (not wired into the run — a separate
    // playtest surface). See docs/phases/boss-fights.md.
    await mountBossFight(root, ctx);
  } else {
    await bootGame(root, engine, kits);
  }
  // switching modes reloads: both mount into the same root
  window.addEventListener('hashchange', () => location.reload());
}

void boot();
