// The Gig's capture rig. Paste into the browser console with the game running
// and the Sandbox open, then: await __capture(PLAN)
//
// Same tap, same phrase alignment, same 16-bar takes as
// docs/baseline/capture-rig.js — deliberately, so the two sets compare point for
// point — with two things that rig cannot do.
//
//   1. IT SETS A BUILD BY INSTALLING PERFORMANCES. The baseline rig names a
//      build as weapon levels and lets `setVoiceTier` fetch the authored rung.
//      Under The Gig nobody authored your pattern, so a build is a set of takes
//      and no level can name it. This one installs takes through
//      `loop.gig.setTake`, which is on the dev handle for exactly this reason.
//   2. IT SETS A TEMPO PER POINT. The run changes tempo three times, so a
//      capture set that measured everything at one tempo would be measuring a
//      game nobody plays.
//
// Start the sink first so takes land in the repo rather than Downloads:
//   node docs/baseline/receiver.mjs --out docs/gig --port 3302
//
// PORT 3302, NOT 3300. Five branches are live at once and the receiver's port
// used to be hardcoded, so whichever stack started one first silently collected
// everybody else's captures into its own directory. This rig pins 3302 the way
// this branch pins dev server port 3202.
//
// DO NOT edit anything under src/ while this is running. Vite's hot reload
// replaces the page and takes the rig with it.

window.__capture = (() => {
  const e = window.loop.engine;
  const ctx = e.ctx;
  const gig = window.loop.gig;

  // The tap: analyser sits after the master limiter and immediately before
  // ctx.destination, so this is the signal the speakers get, not a re-render.
  const dest = ctx.createMediaStreamDestination();
  e.analyser.connect(dest);

  const secPerBar = () => (4 * 60) / e.clock.bpm;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Install one capture point: silence everything, set the tempo, then install
   *  each track's take. */
  const setBuild = (point) => {
    gig.clearTakes();
    for (const role of e.voices.keys()) e.setVoiceEnabled(role, false);
    e.clock.bpm = point.bpm;
    e.clock.swing = point.swing;
    for (const [role, take] of Object.entries(point.takes ?? {})) {
      gig.setTake(role, take.bars, take.steps, take.level ?? 8);
    }
    // THE CONTROL ARM: the system's own take off the authored ladder, at the same
    // rung and the same hit budget as the performed points.
    for (const role of point.auto ?? []) gig.setAutoTake(role, point.autoLevel ?? 8);
    // A track being recorded is silent and not attacking; the capture point that
    // measures the valley expresses that as a track simply switched off.
    for (const role of point.silent ?? []) e.setVoiceEnabled(role, false);
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

  async function one(point, bars) {
    await atPhrase();
    setBuild(point);                      // the build changes on a phrase line
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
    await fetch('http://localhost:3302/' + point.name + '.webm', { method: 'POST', body: blob });
    return { name: point.name, bpm: point.bpm, density: +gig.density().toFixed(2), kb: Math.round(blob.size / 1024) };
  }

  /** Run a whole plan. Progress is readable mid-run at window.__progress. */
  return async function capture(plan, bars = 16) {
    window.__progress = { done: 0, total: plan.length, current: null, error: null };
    const log = [];
    for (const point of plan) {
      window.__progress.current = point.name;
      try {
        log.push(await one(point, bars));
      } catch (err) {
        window.__progress.error = `${point.name}: ${err.message}`;
        throw err;
      }
      window.__progress.done++;
    }
    window.__progress.current = 'DONE';
    return log;
  };
})();

// ---------------------------------------------------------------------------
// The takes
// ---------------------------------------------------------------------------
//
// A capture has to be REPRODUCIBLE, and a performance is not — so these are
// authored step lists rather than a recording of someone's hands, and they are
// authored the way the tape ladder actually builds a take: as one
// PRIORITY-ORDERED list per instrument, sliced to whatever the rung's hit budget
// is. That is not a convenience. It is how a track genuinely accumulates here —
// each overdub adds a hit or three on top of what is already down — so slicing
// the same list at 2, 7, 11 and 28 gives the same track at rungs 1, 3, 5 and 8,
// which is exactly what a capture set needs to trace.
//
// The five lists are deliberately UNLIKE each other. #266's floor is that you
// can always tell which instrument just fired, and two voices landing on the
// same steps read as one thicker instrument rather than two.
//
// Steps are 0..63 across a four-bar loop.
window.TAKE_PRIORITY = {
  // The pulse: the four downbeats of every bar first, then the backbeats, then
  // the pickups into each bar, then 16th ghosts.
  kick: [0, 16, 32, 48, 8, 24, 40, 56, 4, 20, 36, 52, 12, 28, 44, 60, 62, 30, 46, 14, 2, 18, 34, 50, 6, 22, 38, 54],
  // The low end answers the kick, never with it: offbeat 8ths, then 16ths.
  bass: [2, 18, 34, 50, 10, 26, 42, 58, 6, 22, 38, 54, 14, 30, 46, 62, 13, 29, 45, 61, 3, 19, 35, 51, 11, 27, 43, 59],
  // The tick rides the offbeats, then closes the gaps.
  hat: [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62, 0, 8, 16, 24, 32, 40, 48, 56, 4, 12, 20, 28],
  // Syncopated stabs. Never on the downbeat at low rungs; step 15 anticipates.
  chord: [2, 18, 34, 50, 7, 23, 39, 55, 10, 26, 42, 58, 15, 31, 47, 63, 4, 20, 36, 52, 12, 28, 44, 60, 1, 17, 33, 49],
  // The melody phrases in threes and twos over the whole four bars.
  lead: [0, 11, 22, 35, 3, 14, 27, 38, 6, 19, 30, 43, 8, 24, 40, 56, 46, 51, 58, 62, 5, 13, 21, 29, 37, 45, 53, 61],
};

const T = (role, bars, hits, opts = {}) => {
  const loop = bars * 16;
  let pool = window.TAKE_PRIORITY[role].filter((s) => s < loop);
  // THE FRONT-LOADED SHAPE. The SAME hits, all of them folded into the first half
  // of the phrase, so bars 3 and 4 are empty. Folding rather than filtering is
  // what keeps the total identical — filtering would just be a sparser take, and
  // then the comparison would be measuring density instead of shape. Same mean
  // per phrase, completely different four bars: that is the whole exercise.
  if (opts.frontHalf) {
    const half = loop / 2;
    pool = [...new Set(pool.map((s) => s % half))];
  }
  return { bars, steps: pool.slice(0, hits), level: opts.level ?? 8 };
};

/** Nine capture points, matching `docs/baseline/`'s count so the sets read side
 *  by side. 01-06 trace one plausible gig; 07-09 are the three things this stack
 *  claims the control cannot do. */
window.PLAN = [
  { name: 'g01-first-take-95', bpm: 95, swing: 0.18,
    takes: { kick: T('kick', 1, 2, { level: 1 }) } },
  { name: 'g02-three-tracks-95', bpm: 95, swing: 0.18,
    takes: { kick: T('kick', 2, 7, { level: 3 }), bass: T('bass', 2, 7, { level: 3 }), chord: T('chord', 1, 3, { level: 2 }) } },
  { name: 'g03-band-of-five-124', bpm: 124, swing: 0.1,
    takes: { kick: T('kick', 2, 11, { level: 5 }), bass: T('bass', 2, 11, { level: 5 }), hat: T('hat', 2, 9, { level: 4 }), chord: T('chord', 2, 9, { level: 4 }), lead: T('lead', 2, 7, { level: 3 }) } },
  { name: 'g04-maxed-five-even-124', bpm: 124, swing: 0.1,
    takes: { kick: T('kick', 4, 28), bass: T('bass', 4, 28), hat: T('hat', 4, 28), chord: T('chord', 4, 28), lead: T('lead', 4, 28) } },
  { name: 'g05-maxed-five-front-loaded-124', bpm: 124, swing: 0.1,
    takes: { kick: T('kick', 4, 28, { frontHalf: true }), bass: T('bass', 4, 28, { frontHalf: true }), hat: T('hat', 4, 28, { frontHalf: true }), chord: T('chord', 4, 28, { frontHalf: true }), lead: T('lead', 4, 28, { frontHalf: true }) } },
  { name: 'g06-maxed-five-even-140', bpm: 140, swing: 0,
    takes: { kick: T('kick', 4, 28), bass: T('bass', 4, 28), hat: T('hat', 4, 28), chord: T('chord', 4, 28), lead: T('lead', 4, 28) } },
  // THE DENSITY FALL the hard floor (#256) asks for, and the player chose it: the
  // same five tracks at the SAME top rung — nothing has been given up, the tape
  // is still four bars long and still holds 28 — re-cut to four hits each. This
  // is the floor `density.md` claims, reachable at any moment for the price of
  // five recording passes.
  { name: 'g07-thin-by-choice-140', bpm: 140, swing: 0,
    takes: { kick: T('kick', 4, 4), bass: T('bass', 4, 4), hat: T('hat', 4, 4), chord: T('chord', 4, 4), lead: T('lead', 4, 4) } },
  // What the valley sounds like: g04 with one instrument down being recorded.
  { name: 'g08-recording-hole-124', bpm: 124, swing: 0.1, silent: ['bass'],
    takes: { kick: T('kick', 4, 28), bass: T('bass', 4, 28), hat: T('hat', 4, 28), chord: T('chord', 4, 28), lead: T('lead', 4, 28) } },
  // THE CONTROL ARM, and the one point that answers #268's actual question. The
  // same five instruments at the same rung with the SYSTEM's takes — the
  // authored ladder, trimmed to the same hit budget.
  { name: 'g09-auto-takes-124', bpm: 124, swing: 0.1, auto: ['kick', 'bass', 'hat', 'chord', 'lead'] },
];
