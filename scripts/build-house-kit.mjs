// The House kit, sampled from the Wave Point "House Essentials" pack (Bryan
// Richard Jones / Wave Point — "100% free to use for any purpose", per its
// Read Me.txt). This is the "Tight Tech" voicing the developer chose.
//
//   node scripts/build-house-kit.mjs
//
// Local build tool: reads the pack from PACK below (NOT downloaded, NOT a build
// dependency) and runs the standard ffmpeg correction (strip silence, cap
// length + fade, peak-normalize, mono/44.1k/16-bit; a reverse/strip/take-tail
// pass for the riser swell) into public/samples/house/. Each corrected
// The verbatim source is
// copied in as <role>.raw.wav (the ffmpeg input). See
// docs/tools/audio-sample-pipeline.md for the full pipeline description.
//
// House is sampled for: kick, clap, rimshot, hat_closed, hat_open, shaker,
// crash, riser, bass, bass_fat. Chord / rhodes / lead stay synthesized (they
// need pitched multi-sampling). House is OWNED here, not by build-samples.mjs.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ??
  '/Users/yusufeminkinatas/Downloads/Wave Point - Sample Packs';
const VOL1 = join(PACK, 'Wave Point - House Essentials Vol. 1');
const V1 = join(VOL1, 'DRUMS', 'DRUMS - ONE SHOTS');
const P = (sub, name) => join(V1, sub, name);            // drum one-shots (incl. CYMBAL)
const FX = (name) => join(VOL1, 'FX & FOLEY', 'FX LONG', name);
const BASS = (name) => join(VOL1, 'MUSIC', 'BASS ONE SHOTS', name);

const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  rimshot:    { maxSec: 0.35, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  shaker:     { maxSec: 0.35, peakDb: -9 },
  crash:      { maxSec: 1.20, peakDb: -3 },
  riser:      { maxSec: 1.40, peakDb: -6, swell: true },
  bass:       { maxSec: 0.60, peakDb: -3 },
  bass_fat:   { maxSec: 0.60, peakDb: -3 },
};

// The chosen "Tight Tech" House voicing: minimal, crisp, snappy.
const KIT = {
  kick:       P('KICK', 'WavePoint-KickPunchy.wav'),
  clap:       P('CLAP-SNARE', 'WavePoint-Clap5.wav'),
  rimshot:    P('PERC', 'WavePoint-Clave.wav'),
  hat_closed: P('HAT', 'WavePoint-TightClosedHat.wav'),
  hat_open:   P('HAT', 'WavePoint-OpenHatBig.wav'),
  shaker:     P('SHAKER-TAMBOURINE', 'WavePoint-Shaker2.wav'),
  crash:      P('CYMBAL', 'WavePoint-CrashSplash10Inch.wav'),
  riser:      FX('WavePoint-Riser.wav'),
  bass:       BASS('WavePoint-C-BassHit7.wav'),
  bass_fat:   BASS('WavePoint-C-BassHit2.wav'),
};

const trimChain = (maxSec) =>
  `silenceremove=start_periods=1:start_threshold=-50dB:detection=peak:` +
  `stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05,atrim=end=${maxSec}`;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.stderr || '';
}

function processFile(rawPath, outPath, p) {
  const { maxSec, peakDb, swell } = p;
  if (swell) {
    // Riser: a 15s build that ENDS in trailing silence. Reverse it, strip the
    // (now-leading) trailing silence, take the final maxSec climax, reverse
    // back to correct order, then fade head 20ms / tail 60ms and normalize.
    const shape =
      `areverse,silenceremove=start_periods=1:start_threshold=-50dB:detection=peak,` +
      `atrim=end=${maxSec},areverse,afade=t=in:d=0.02,afade=t=out:st=${(maxSec - 0.06).toFixed(2)}:d=0.06`;
    const log = ffmpeg(['-i', rawPath, '-af', `${shape},volumedetect`, '-f', 'null', '-']);
    const m = log.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
    const gainDb = (peakDb - (m ? parseFloat(m[1]) : 0)).toFixed(2);
    ffmpeg(['-i', rawPath, '-af', `${shape},volume=${gainDb}dB`, '-ac', '1', '-ar', '44100', '-acodec', 'pcm_s16le', outPath]);
    return;
  }
  const log = ffmpeg(['-i', rawPath, '-af', `${trimChain(maxSec)},volumedetect`, '-f', 'null', '-']);
  const m = log.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const gainDb = (peakDb - (m ? parseFloat(m[1]) : 0)).toFixed(2);
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

const dir = join(ROOT, 'public', 'samples', 'house');
mkdirSync(dir, { recursive: true });
let out = '# House kit (Wave Point "Tight Tech") — health report\n\nSource: Wave Point House Essentials (100% free to use). Corrected by scripts/build-house-kit.mjs.\n\n';
const credits = ['# house samples (Wave Point "Tight Tech")', '', 'Source: Wave Point House Essentials Vol. 1 (100% free to use for any purpose).', ''];
let flagged = 0;

for (const [role, src] of Object.entries(KIT)) {
  if (!existsSync(src)) { console.error(`MISSING ${role}: ${src}`); process.exitCode = 1; continue; }
  const rawPath = join(dir, `${role}.raw.wav`);
  writeFileSync(rawPath, readFileSync(src));       // verbatim source for A/B
  const outPath = join(dir, `${role}.wav`);
  const p = PROC[role];
  processFile(src, outPath, p);
  let a;
  try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
  if (a.flags.length) flagged++;
  out += `- **${role}** (${role}.wav) <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, eff ${a.effMs}ms, peak ${a.peak}` +
    (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
  credits.push(`- ${role}.wav  <-  ${src.split('/').pop()}  (ffmpeg: trimmed, cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
}

out += `\nTotal files with flags: ${flagged}\n`;
writeFileSync(join(dir, 'health-report.md'), out);
writeFileSync(join(dir, 'CREDITS.md'),
  credits.join('\n') + '\n\nLicensing: 100% free to use for any purpose (pack Read Me). Verify before commercial ship.\n');
console.log(out);
