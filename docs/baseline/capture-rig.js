// Baseline capture rig. Paste into the browser console with the game running
// and the Sandbox open, then: await __capture(PLAN)
//
// Needs no repo code — it works against `window.loop`, the developer handle
// main.ts already exposes. That is the point: a prototype branch can produce a
// directly comparable set without carrying a harness around.
//
// Start the sink first so takes land in the repo rather than Downloads:
//   node docs/baseline/receiver.mjs
//
// DO NOT edit anything under src/ while this is running. Vite's hot reload
// replaces the page and takes the rig with it, and the run dies silently.

window.__capture = (() => {
  const e = window.loop.engine;
  const ctx = e.ctx;
  // The soundset's eight roles. Everything else in e.voices is a retired
  // rehearsal instrument with no ladder, and is explicitly silenced so a take
  // can never contain a voice the game does not ship.
  const SUPPORTED = ['kick', 'clap', 'snare', 'hat', 'bass', 'chord', 'lead', 'arp'];

  // The tap: analyser sits after the master limiter and immediately before
  // ctx.destination, so this is the signal the speakers get, not a re-render.
  const dest = ctx.createMediaStreamDestination();
  e.analyser.connect(dest);

  const secPerBar = () => (4 * 60) / e.clock.bpm;
  // Gameplay level -> authored chart stage, the same two-levels-per-stage
  // banding as chartStageForLevel in src/game/weapons/levels.ts.
  const stage = (level) => Math.max(1, Math.min(4, Math.ceil(level / 2)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const setBuild = (levels) => {
    for (const role of e.voices.keys()) {
      if (!SUPPORTED.includes(role)) { e.setVoiceEnabled(role, false); continue; }
      const level = levels[role] ?? 0;
      if (!level) { e.setVoiceEnabled(role, false); continue; }
      e.setVoiceTier(role, stage(level));
      e.setVoiceEnabled(role, true);
    }
  };

  // atNextPhrase hands back the AUDIO time of the next unheard four-bar
  // downbeat and fires early, inside the scheduler's ~120ms lookahead. Wait out
  // that gap in wall clock so a take genuinely starts on the downbeat.
  const atPhrase = () =>
    new Promise((res) => e.atNextPhrase((t) => res(t))).then(async (t) => {
      const wait = (t - ctx.currentTime) * 1000;
      if (wait > 0) await sleep(wait);
      return t;
    });

  async function one(name, levels, bars) {
    await atPhrase();
    setBuild(levels);                     // the build changes on a phrase line
    await sleep(secPerBar() * 4 * 1000);  // and plays in for a full phrase
    await atPhrase();                     // the take starts on the NEXT one
    const rec = new MediaRecorder(dest.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    });
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    await sleep(secPerBar() * bars * 1000);
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await fetch('http://localhost:3300/' + name + '.webm', { method: 'POST', body: blob });
    return { name, bars, kb: Math.round(blob.size / 1024) };
  }

  /** Run a whole plan. Progress is readable mid-run at window.__progress. */
  return async function capture(plan, bars = 16) {
    window.__progress = { done: 0, total: plan.length, current: null, error: null };
    const log = [];
    for (const [name, levels] of plan) {
      window.__progress.current = name;
      try {
        log.push(await one(name, levels, bars));
      } catch (err) {
        window.__progress.error = `${name}: ${err.message}`;
        throw err;
      }
      window.__progress.done++;
    }
    window.__progress.current = 'DONE';
    return log;
  };
})();

// Open-ended recording, for capturing a whole played run with combat on top of
// the arrangement: __recordUntilStopped() before the run, __stopRecording(name)
// when it ends. ~29 MB for 30 minutes, so decide deliberately whether it lands
// in git. Uses the same post-limiter tap as the take rig.
window.__recordUntilStopped = () => {
  const e = window.loop.engine;
  const dest = e.ctx.createMediaStreamDestination();
  e.analyser.connect(dest);
  const rec = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000,
  });
  const chunks = [];
  rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
  rec.start(5000); // flush every 5s so a crash costs at most one chunk
  window.__stopRecording = async (name = 'full-run') => {
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.stop();
    await stopped;
    e.analyser.disconnect(dest);
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await fetch('http://localhost:3300/' + name + '.webm', { method: 'POST', body: blob });
    return { name, mb: (blob.size / 1024 / 1024).toFixed(1) };
  };
  return 'recording — call __stopRecording("full-run") when the run ends';
};

/** The nine baseline build states. 01-07 trace one plausible run; 08 and 09 are
 *  bounds — the sparsest maxed build the catalog allows, and all eight roles at
 *  once, which the weapon cap of 5 makes unreachable. */
window.PLAN = [
  ['01-opening-one-weapon',  { kick: 1 }],
  ['02-early-two',           { kick: 2, bass: 1 }],
  ['03-building-three',      { kick: 3, bass: 3, hat: 1 }],
  ['04-mid-four',            { kick: 4, bass: 4, hat: 3, chord: 2 }],
  ['05-band-full-five',      { kick: 5, bass: 5, hat: 4, chord: 4, lead: 3 }],
  ['06-late-five',           { kick: 7, bass: 7, hat: 6, chord: 6, lead: 6 }],
  ['07-maxed-five',          { kick: 8, bass: 8, hat: 8, chord: 8, lead: 8 }],
  ['08-thinnest-maxed-five', { kick: 8, clap: 8, snare: 8, bass: 8, lead: 8 }],
  ['09-all-eight-maxed',     { kick: 8, clap: 8, snare: 8, hat: 8, bass: 8, chord: 8, lead: 8, arp: 8 }],
];
