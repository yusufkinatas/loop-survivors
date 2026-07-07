// House kit prototypes from the Wave Point "House Essentials" pack (Bryan Richard
// Jones / Wave Point — "100% free to use for any purpose", per its Read Me.txt).
//
//   node scripts/build-house-protos.mjs
//
// Local prototyping tool: reads the pack from PACK below (NOT downloaded, NOT a
// build dependency), curates three candidate House drum kits, and runs the same
// ffmpeg correction as scripts/build-samples.mjs (strip silence, cap length +
// fade, peak-normalize, mono/44.1k/16-bit) into public/samples/house/<proto>/.
// Each corrected <role>.wav gets a <role>.raw.wav sibling (untouched source) so
// #soundcheck can A/B. Also writes a health report the developer's ear gates.
//
// The six sampled House drum roles: kick, clap, rimshot, hat_closed, hat_open,
// shaker. Everything else in the House kit stays synthesized.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Local source pack (developer's machine). Override with arg 1 if it moves.
const PACK = process.argv[2] ??
  '/Users/yusufeminkinatas/Downloads/Wave Point - Sample Packs';
const V1 = join(PACK, 'Wave Point - House Essentials Vol. 1', 'DRUMS', 'DRUMS - ONE SHOTS');
const P = (sub, name) => join(V1, sub, name);

// Per-role ffmpeg targets. Mirrors build-samples.mjs house numbers, but rimshot
// is capped a touch longer (0.35s) so a full-body rim keeps its crack + short
// tail instead of the 29ms micro-tick the old 808 RS gave.
const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  rimshot:    { maxSec: 0.35, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  shaker:     { maxSec: 0.35, peakDb: -9 },
};

// Three curated prototypes. role -> source file in the pack.
const PROTOS = {
  A: { // "909 Club" — classic Chicago/909, punchy and bright
    kick:       P('KICK', 'WavePoint-Kick909-1.wav'),
    clap:       P('CLAP-SNARE', 'WavePoint-Clap1.wav'),
    rimshot:    P('CLAP-SNARE', 'WavePoint-SnareRimShot.wav'),
    hat_closed: P('HAT', 'WavePoint-ClosedHat1.wav'),
    hat_open:   P('HAT', 'WavePoint-OpenHatShort.wav'),
    shaker:     P('SHAKER-TAMBOURINE', 'WavePoint-Shaker1.wav'),
  },
  B: { // "Deep & Live" — warm, organic, live-kit feel
    kick:       P('KICK', 'WavePoint-KickThump.wav'),
    clap:       P('CLAP-SNARE', 'WavePoint-Clap3.wav'),
    rimshot:    P('PERC', 'WavePoint-Cajon1.wav'),
    hat_closed: P('HAT', 'WavePoint-HatClosedLive1.wav'),
    hat_open:   P('HAT', 'WavePoint-OpenHatLive1.wav'),
    shaker:     P('SHAKER-TAMBOURINE', 'WavePoint-Shaker4.wav'),
  },
  C: { // "Tight Tech" — minimal, crisp, snappy
    kick:       P('KICK', 'WavePoint-KickPunchy.wav'),
    clap:       P('CLAP-SNARE', 'WavePoint-Clap5.wav'),
    rimshot:    P('PERC', 'WavePoint-Clave.wav'),
    hat_closed: P('HAT', 'WavePoint-TightClosedHat.wav'),
    hat_open:   P('HAT', 'WavePoint-OpenHatBig.wav'),
    shaker:     P('SHAKER-TAMBOURINE', 'WavePoint-Shaker2.wav'),
  },
};

const trimChain = (maxSec) =>
  `silenceremove=start_periods=1:start_threshold=-50dB:detection=peak:` +
  `stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05,atrim=end=${maxSec}`;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.stderr || '';
}

function processFile(rawPath, outPath, maxSec, peakDb) {
  const log = ffmpeg(['-i', rawPath, '-af', `${trimChain(maxSec)},volumedetect`, '-f', 'null', '-']);
  const m = log.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const maxVol = m ? parseFloat(m[1]) : 0;
  const gainDb = (peakDb - maxVol).toFixed(2);
  ffmpeg([
    '-i', rawPath,
    '-af', `${trimChain(maxSec)},volume=${gainDb}dB,areverse,afade=t=in:d=0.008,areverse`,
    '-ac', '1', '-ar', '44100', '-acodec', 'pcm_s16le', outPath,
  ]);
}

function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a WAV');
  let off = 12, fmt = null, dataOff = 0, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    else if (id === 'data') { dataOff = off + 8; dataLen = sz; }
    off += 8 + sz + (sz & 1);
  }
  const bytes = fmt.bits / 8, frames = Math.floor(dataLen / (bytes * fmt.channels));
  const ch0 = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const p = dataOff + i * bytes * fmt.channels;
    ch0[i] = fmt.bits === 16 ? buf.readInt16LE(p) / 32768 : buf.readInt32LE(p) / 2147483648;
  }
  return { ...fmt, frames, ch0 };
}

function analyze(w) {
  const sr = w.sampleRate, d = w.ch0, thr = 0.02;
  let peak = 0, onset = -1, tail = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    if (a > thr) { if (onset < 0) onset = i; tail = i; }
  }
  const toMs = (n) => +(n / sr * 1000).toFixed(0);
  const durationMs = toMs(d.length);
  const onsetMs = onset < 0 ? durationMs : toMs(onset);
  const effMs = onset < 0 ? 0 : toMs(tail - onset);
  const flags = [];
  if (onset < 0) flags.push('SILENT');
  if (onsetMs > 15) flags.push(`leading-delay ${onsetMs}ms`);
  if (peak >= 0.999) flags.push('clipping');
  if (effMs < 20) flags.push(`very short ${effMs}ms (micro-hit risk)`);
  return { durationMs, onsetMs, effMs, peak: +peak.toFixed(3), flags };
}

const NAMES = { A: '909 Club', B: 'Deep & Live', C: 'Tight Tech' };
let out = '# House kit prototypes — health report\n\nSource: Wave Point House Essentials (100% free to use). Corrected by scripts/build-house-protos.mjs.\n';
let flagged = 0;

for (const [proto, roles] of Object.entries(PROTOS)) {
  const dir = join(ROOT, 'public', 'samples', 'house', proto);
  mkdirSync(dir, { recursive: true });
  out += `\n## ${proto} — ${NAMES[proto]}\n\n`;
  const credits = [`# House prototype ${proto} (${NAMES[proto]})`, '', 'Source: Wave Point House Essentials Vol. 1 (100% free to use for any purpose).', ''];
  for (const [role, src] of Object.entries(roles)) {
    if (!existsSync(src)) { console.error(`MISSING ${proto}/${role}: ${src}`); process.exitCode = 1; continue; }
    const rawName = `${role}.raw.wav`;
    const rawPath = join(dir, rawName);
    // Copy source verbatim as the raw A/B reference (source is already .wav).
    writeFileSync(rawPath, readFileSync(src));
    const outName = `${role}.wav`;
    const outPath = join(dir, outName);
    const p = PROC[role];
    processFile(src, outPath, p.maxSec, p.peakDb);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) flagged++;
    out += `- **${role}** (${outName}) <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, eff ${a.effMs}ms, peak ${a.peak}` +
      (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${outName}  <-  ${src.split('/').pop()}  (ffmpeg: trimmed, cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  writeFileSync(join(dir, 'CREDITS.md'), credits.join('\n') + '\n');
}

out += `\nTotal files with flags: ${flagged}\n`;
writeFileSync(join(ROOT, 'public', 'samples', 'house', 'protos-health.md'), out);
console.log(out);
