// THE FRONTMAN's capture plan (#271). Paste into the console after
// docs/baseline/capture-rig.js, with the game running and the Sandbox open, then:
//
//   await __captureFrontman()
//
// Start the sink first, into THIS branch's directory:
//   node docs/baseline/receiver.mjs --out docs/frontman
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS AT ALL, AND WHY IT IS STILL NO REPO CODE
//
// The shared rig (docs/baseline/capture-rig.js) records a BUILD STATE: it sets
// levels, plays a phrase in, and takes sixteen bars. Every earlier capture set is
// arrangement-only for that reason, and `docs/palette-control/` proved the point
// the sets exist for — nineteen voices, loudness range still 0.3 to 0.7 LU
// everywhere, no peaks at any scale.
//
// This branch's whole claim is that the missing peaks come from a PERFORMANCE, so
// a rig that can only set a build cannot record what this branch does. This plan
// performs: it switches voices off where the player would have taken them, plays
// the hand's placements on the grid, drops the band for a solo, and brings it back
// with a fill.
//
// It still carries no repo code. It reaches `window.loop.engine` (the developer
// handle main.ts has always exposed) and `window.loop.frontman`, which game.ts
// adds for exactly this. Nothing here is imported by the game, and the game does
// not know it exists.
//
// ---------------------------------------------------------------------------
// WHAT IT DOES NOT DO, stated plainly
//
// The world is not stepping while this runs. The Pixi ticker is
// requestAnimationFrame and the Sandbox has waves off anyway, so these takes are
// ARRANGEMENT, exactly like every set before them: no combat, no damage, no
// enemies. What the hand does to the ARRANGEMENT is faithful — a placement makes
// the same sound through the same voice at the same instant — and what it does to
// the WORLD is measured in tools/verify-frontman.ts instead.
//
// So a number out of this plan is a claim about the track and never about the
// game feeling good.

window.__captureFrontman = (() => {
  const e = window.loop.engine;
  const ctx = e.ctx;
  const dest = ctx.createMediaStreamDestination();
  e.analyser.connect(dest);

  const STEPS_PER_BAR = 16;
  const stepS = () => 60 / e.clock.bpm / e.clock.stepsPerBeat / (e.clock.rate || 1);
  const barS = () => stepS() * STEPS_PER_BAR;
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const stage = (level) => Math.max(1, Math.min(4, Math.ceil(level / 2)));

  const SUPPORTED = [...e.voices.keys()].filter((role) => {
    const chart = window.loop.charts.getChart(role, 1);
    return !!chart && chart.events.length > 0;
  });

  /** Put the band on the field. `off` is the set the player has TAKEN — the mic,
   *  or the whole band during a solo — and it is the only difference between a
   *  Frontman take and a control take of the same build. */
  const setBuild = (levels, off = []) => {
    const silenced = new Set(off);
    for (const role of e.voices.keys()) {
      if (!SUPPORTED.includes(role)) { e.setVoiceEnabled(role, false); continue; }
      const level = levels[role] ?? 0;
      if (!level || silenced.has(role)) { e.setVoiceEnabled(role, false); continue; }
      e.setVoiceTier(role, stage(level));
      e.setVoiceEnabled(role, true);
    }
  };

  const atPhrase = () =>
    new Promise((res) => e.atNextPhrase((t) => res(t))).then(async (t) => {
      await sleep((t - ctx.currentTime) * 1000);
      return t;
    });

  // THE FEELS, copied rather than imported — the rig may not import repo code, and
  // a plan that silently drifted from src/game/frontman.ts would be worse than one
  // that obviously duplicates it. Keep in step by hand; verify-frontman.ts is the
  // side that actually tests them.
  const FEELS = {
    straight: [0, 2, 4, 6, 8, 10, 12, 14],
    anchor: [0, 4, 8, 12],
    push: [2, 6, 10, 14],
    roll: [0, 3, 6, 9, 12],
  };

  /** Play `places` of the feel's ticks in the bar starting at `barStartT`, on the
   *  audio clock, through the voice the player is holding.
   *
   *  Scheduled with setTimeout against ctx.currentTime, which is exactly how a
   *  human hand's press arrives — the same path, minus the human. A placement
   *  therefore lands on the grid to within the timer's own jitter, which is the
   *  best case a player could ever hit and the honest one for a loudness take. */
  const playBar = (role, barStartT, ticks, places, gain = 1) => {
    const chart = window.loop.charts.getChart(role, 4);
    const events = chart.events.length ? chart.events : [{ step: 0, velocity: 0.95 }];
    const chosen = ticks.slice(0, places);
    for (let i = 0; i < chosen.length; i++) {
      const at = barStartT + chosen[i] * stepS();
      const ev = { ...events[i % events.length], step: 0 };
      setTimeout(() => e.handStrike(role, ev, gain), (at - ctx.currentTime) * 1000);
    }
  };

  async function record(name, bars, drive) {
    const rec = new MediaRecorder(dest.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 128000,
    });
    const chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    const t0 = await atPhrase();
    rec.start();
    if (drive) drive(t0);
    await sleep(barS() * bars * 1000);
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    await fetch('http://localhost:3300/' + name + '.webm', { method: 'POST', body: blob });
    return { name, bars, kb: Math.round(blob.size / 1024) };
  }

  /** The five-piece maxed build every point below is a variation of. Same weapons
   *  as `07-maxed-five` in docs/baseline/ and docs/palette-control/, so this whole
   *  set hangs off a point that has already been measured twice. */
  const FIVE = { kick: 8, bass: 8, hat: 8, chord: 8, lead: 8 };

  return async function captureFrontman() {
    window.__progress = { done: 0, total: 7, current: null, error: null };
    const log = [];
    const one = async (name, total, setup, drive) => {
      window.__progress.current = name;
      try {
        await atPhrase();
        setup();
        await sleep(barS() * 4 * 1000); // play in for a phrase, as the rig does
        log.push(await record(name, total, drive));
      } catch (err) {
        window.__progress.error = `${name}: ${err.message}`;
        throw err;
      }
      window.__progress.done++;
    };

    // f01 — THE ANCHOR OF THE SET. The same build as 07-maxed-five with nothing
    // taken, so if this does not come back at the control's number the rest of the
    // set means nothing.
    await one('f01-band-five-maxed', 16, () => setBuild(FIVE));

    // f02 / f03 — one voice at the mic. The hat, because it is the busiest chart in
    // the build (12 triggers a bar of the five-piece's 34), so taking it is the
    // biggest hole the mic can make. f02 is a rank-0 hand, f03 a maxed one.
    await one('f02-mic-on-hat-3-places', 16,
      () => setBuild(FIVE, ['hat']),
      (t0) => { for (let b = 0; b < 16; b++) playBar('hat', t0 + b * barS(), FEELS.straight, 3); });
    await one('f03-mic-on-hat-8-places', 16,
      () => setBuild(FIVE, ['hat']),
      (t0) => { for (let b = 0; b < 16; b++) playBar('hat', t0 + b * barS(), FEELS.straight, 8); });

    // f04 / f05 — SOLO. Auto-fire off entirely; only the hand. This is the valley,
    // and the number that matters here is how far below f01 it sits.
    const ALL = Object.keys(FIVE);
    await one('f04-solo-3-places', 16,
      () => setBuild(FIVE, ALL),
      (t0) => { for (let b = 0; b < 16; b++) playBar('hat', t0 + b * barS(), FEELS.straight, 3); });
    await one('f05-solo-8-places', 16,
      () => setBuild(FIVE, ALL),
      (t0) => { for (let b = 0; b < 16; b++) playBar('hat', t0 + b * barS(), FEELS.straight, 8); });

    // f06 — THE ARC, and the only take in this set that is trying to prove
    // anything. Four bars of full band, four bars of solo, then the band back on
    // the phrase line carrying a fill, then four bars of band and hand together.
    // The hard floor #256 set is a loudness range clearing 0.6 LU; every set before
    // this measured 0.3 to 0.7 LU at every single point, and this is the shape that
    // is supposed to break that.
    await one('f06-the-arc', 16,
      () => setBuild(FIVE),
      (t0) => {
        const bar = barS();
        // bars 0-3: the band, played over.
        for (let b = 0; b < 4; b++) playBar('hat', t0 + b * bar, FEELS.straight, 4);
        // bar 4: the band drops. Solo through bars 4-7, the hand working.
        setTimeout(() => setBuild(FIVE, ALL), (t0 + 4 * bar - ctx.currentTime) * 1000);
        for (let b = 4; b < 8; b++) playBar('hat', t0 + b * bar, FEELS.straight, 8);
        // bar 8: back in, with a fill across the whole band on the phrase line.
        setTimeout(() => {
          setBuild(FIVE);
          const fillRoles = ALL;
          for (let i = 0; i < 14; i++) {
            const ev = { step: 0, velocity: 0.85 + 0.15 * (i / 14) };
            setTimeout(() => e.handStrike(fillRoles[i % fillRoles.length], ev, 1),
              (i * stepS() * 0.5) * 1000);
          }
        }, (t0 + 8 * bar - ctx.currentTime) * 1000);
        // bars 8-15: band and hand together, the ordinary home to depart from.
        for (let b = 8; b < 16; b++) playBar('hat', t0 + b * bar, FEELS.straight, 4);
      });

    // f07 — THE SAME ARC WITH THE HAND OFF. The control for f06: identical voice
    // switching, no placements at all. Anything f06 has that this does not is the
    // hand's doing rather than the drop's.
    await one('f07-the-arc-no-hand', 16,
      () => setBuild(FIVE),
      (t0) => {
        const bar = barS();
        setTimeout(() => setBuild(FIVE, ALL), (t0 + 4 * bar - ctx.currentTime) * 1000);
        setTimeout(() => setBuild(FIVE), (t0 + 8 * bar - ctx.currentTime) * 1000);
      });

    setBuild(FIVE);
    window.__progress.current = 'DONE';
    return log;
  };
})();
