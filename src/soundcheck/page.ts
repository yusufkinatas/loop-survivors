// Sound health-check screen (#soundcheck). A developer surface for ear-checking
// every genre's every voice: play each sound, see its live health metrics
// (duration, leading delay, effective tail, peak), and mark it pass / flag.
// Export the results as text to report back. This is the human ear-gate the
// automated analyzer (scripts/build-samples.mjs) can only point at.

import { SKELETON } from '../audio/scale';

interface Metrics {
  durationMs: number;
  onsetMs: number;
  effMs: number;
  peak: number;
  flags: string[];
}

// Effective-length ceilings per role (ms) — mirrors scripts/build-samples.mjs
// and the runtime trim. A voice ringing longer than this smears when repeated.
const ROLE_MAX_MS: Record<string, number> = {
  kick: 700, snare: 500, clap: 550, rimshot: 300, hat: 550, shaker: 350, ride: 1300,
  crash: 1600, tom: 600, cowbell: 500, heartbeat: 500, zap: 300, riser: 1000,
  bass: 800, pluck: 600, reese: 800, acid: 500, arp: 500, chord: 1800, rhodes: 900,
  choir: 2000, lead: 700, bell: 1000, whistle: 800,
};

function analyze(buf: AudioBuffer, role: string): Metrics {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0, onset = -1, tail = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    if (a > 0.02) { if (onset < 0) onset = i; tail = i; }
  }
  const toMs = (n: number) => Math.round((n / sr) * 1000);
  const durationMs = toMs(d.length);
  const onsetMs = onset < 0 ? durationMs : toMs(onset);
  const effMs = onset < 0 ? 0 : toMs(tail - onset);
  const flags: string[] = [];
  const max = ROLE_MAX_MS[role] ?? 1500;
  if (onset < 0) flags.push('SILENT');
  if (onsetMs > 15) flags.push(`leading delay ${onsetMs}ms`);
  if (effMs > max) flags.push(`long tail ${effMs}ms>${max}ms`);
  if (peak >= 0.999) flags.push('peak=1.0 (normalized/clip?)');
  if (peak > 0 && peak < 0.05) flags.push('very quiet');
  return { durationMs, onsetMs, effMs, peak: +peak.toFixed(2), flags };
}

export async function mountSoundCheck(root: HTMLElement, ctx: AudioContext): Promise<void> {
  const [genresMod, kitsMod] = await Promise.all([
    import('../audio/genres'),
    import('../audio/kits/index'),
  ]);
  const { GENRES, supportedRoles } = genresMod;
  const { kitForGenre } = kitsMod;
  const { ROLE_META } = await import('../audio/kits');

  const el = (tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement => {
    const n = document.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    parent.appendChild(n);
    return n;
  };

  const page = el('div', 'soundcheck', root);
  el('h1', '', page, 'Sound health check');
  el('p', 'sub', page,
    'Play each voice, judge it by ear, mark it. Badges are automated hints; your ear decides. Export at the bottom and paste the results back.');

  const verdicts = new Map<string, 'pass' | 'flag'>();
  const rowRefs: { key: string; genre: string; role: string; play: HTMLButtonElement }[] = [];

  const playBuffer = (buf: AudioBuffer, gainVal = 0.9): void => {
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(g).connect(ctx.destination);
    src.start();
  };

  for (const genre of GENRES) {
    const kit = await kitForGenre(genre.id, SKELETON.rootHz);
    const sec = el('div', 'sc-genre', page);
    const roles = supportedRoles(genre.id);
    el('h2', '', sec, `${genre.name} — ${roles.length} instruments · ${genre.bpm} BPM`);
    for (const role of roles) {
      const k = kit.get(role);
      if (!k) continue;
      const buf = k.samples.get(k.defaultVariant)!;
      const m = analyze(buf, role);
      const key = `${genre.id}.${role}`;
      const row = el('div', 'sc-row', sec);
      row.style.setProperty('--voice-color', ROLE_META[role].color);
      const play = el('button', 'sc-play', row, '▶') as HTMLButtonElement;
      play.onclick = () => {
        // Play every variant in sequence so open/closed, hard/soft are heard.
        let t = 0;
        for (const b of k.samples.values()) {
          setTimeout(() => playBuffer(b), t);
          t += 320;
        }
      };
      el('span', 'sc-name', row, ROLE_META[role].name);
      const badges = el('span', 'sc-badges', row);
      el('span', 'sc-badge', badges, `${m.durationMs}ms`);
      el('span', `sc-badge ${m.onsetMs > 15 ? 'warn' : ''}`, badges, `onset ${m.onsetMs}`);
      el('span', `sc-badge ${m.flags.some((f) => f.includes('long tail')) ? 'warn' : ''}`, badges, `tail ${m.effMs}`);
      el('span', `sc-badge ${m.peak >= 0.999 ? 'warn' : ''}`, badges, `pk ${m.peak}`);
      if (m.flags.length) el('span', 'sc-flags', row, '⚠ ' + m.flags.join('; '));

      const marks = el('span', 'sc-marks', row);
      const passBtn = el('button', 'sc-mark', marks, 'ok') as HTMLButtonElement;
      const flagBtn = el('button', 'sc-mark', marks, 'flag') as HTMLButtonElement;
      passBtn.onclick = () => { verdicts.set(key, 'pass'); passBtn.classList.add('on'); flagBtn.classList.remove('on'); };
      flagBtn.onclick = () => { verdicts.set(key, 'flag'); flagBtn.classList.add('on'); passBtn.classList.remove('on'); };
      rowRefs.push({ key, genre: genre.name, role, play });
    }
  }

  const footer = el('div', 'sc-footer', page);
  const exportBtn = el('button', '', footer, 'copy results') as HTMLButtonElement;
  const outArea = el('textarea', 'sc-out', footer) as HTMLTextAreaElement;
  outArea.readOnly = true;
  outArea.rows = 8;
  exportBtn.onclick = () => {
    const lines = ['Sound health check — developer ear results', ''];
    const flagged = rowRefs.filter((r) => verdicts.get(r.key) === 'flag');
    const passed = rowRefs.filter((r) => verdicts.get(r.key) === 'pass');
    const unmarked = rowRefs.filter((r) => !verdicts.has(r.key));
    lines.push(`FLAGGED (${flagged.length}): ` + (flagged.map((r) => `${r.genre}/${r.role}`).join(', ') || 'none'));
    lines.push(`PASSED (${passed.length}): ` + (passed.map((r) => `${r.genre}/${r.role}`).join(', ') || 'none'));
    lines.push(`UNMARKED (${unmarked.length}): ` + (unmarked.map((r) => `${r.genre}/${r.role}`).join(', ') || 'none'));
    outArea.value = lines.join('\n');
    outArea.select();
    void navigator.clipboard?.writeText(outArea.value);
  };
  const back = el('button', '', footer, '← back to game') as HTMLButtonElement;
  back.onclick = () => { location.hash = ''; location.reload(); };
}
