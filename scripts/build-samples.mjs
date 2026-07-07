// One-shot: download per-genre signature drum samples from the freely-distributed
// TidalCycles Dirt-Samples set, PROCESS each into a correct game-ready asset with
// ffmpeg (strip silence, cap length + fade tail, peak-normalize, force format),
// then analyze the processed files for gameplay-safety and write CREDITS + report.
//
//   node scripts/build-samples.mjs
//
// The fix lives in the ASSET, not the game: ffmpeg makes each file correct once,
// so the runtime loader is dumb (fetch + decode, no per-role trimming). Signature
// UNPITCHED drums only (kick/snare/clap/hat/rimshot/shaker/ride) — these carry a
// genre's identity (909 vs 808 vs LinnDrum vs break) and need no tuning. Melodic +
// bass voices stay synthesized (src/audio/kits/<genre>.ts).

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/';
const SRC = 'TidalCycles/Dirt-Samples (https://github.com/tidalcycles/Dirt-Samples), freely distributed for music-making; mixed provenance — verify per-folder before commercial ship.';

// Per-role processing targets: maxSec caps the length (no smear when repeated);
// peakDb is the normalize target that balances the kit ON DISK (kick loudest,
// hats quiet) so the game needs no per-voice gain. Keyed by local role/variant.
const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.50, peakDb: -3 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  rimshot:    { maxSec: 0.30, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  shaker:     { maxSec: 0.35, peakDb: -9 },
  ride:       { maxSec: 1.30, peakDb: -6 },
};

// genre -> local role/variant -> repo path. Two entries (closed/open) for hat.
const MANIFEST = {
  lofi: {
    'kick': '808bd/BD0025.WAV', 'snare': 'sd/rytm-01-classic.wav', 'rimshot': '808/RS.WAV',
    'hat_closed': 'hh/000_hh3closedhh.wav', 'hat_open': 'hh/007_hh3openhh.wav', 'shaker': '808/MA.WAV',
  },
  // house is NOT here: it is sampled from the local Wave Point pack by
  // scripts/build-house-kit.mjs (the developer-chosen "Tight Tech" voicing).
  synthwave: {
    'kick': 'kicklinn/Linn Kick 1.wav', 'snare': 'sd/rytm-00-hard.wav', 'clap': 'drumtraks/001_DT Claps.wav',
    'hat_closed': 'drumtraks/004_DT Hat Closed.wav', 'hat_open': 'drumtraks/005_DT Hat Open.wav',
  },
  hiphop: {
    'kick': '808bd/BD1000.WAV', 'snare': '808sd/SD0010.WAV', 'clap': '808/CP.WAV', 'rimshot': '808/RS.WAV',
    'hat_closed': '808hc/HC00.WAV', 'hat_open': '808oh/OH00.WAV', 'shaker': '808/MA.WAV',
  },
  dnb: {
    'kick': 'hardkick/VEC1 BD Distortion 06.wav', 'snare': 'sd/rytm-00-hard.wav',
    'hat_closed': 'hh27/000_hh27closedhh.wav', 'hat_open': 'hh27/007_hh27opendhh.wav', 'ride': 'drumtraks/007_DT Ride.wav',
  },
  techno: {
    'kick': 'bd/BT0AAD0.wav', 'clap': 'realclaps/2.wav', 'rimshot': '808/RS.WAV',
    'hat_closed': 'hh/000_hh3closedhh.wav', 'hat_open': 'hh/007_hh3openhh.wav', 'ride': 'drumtraks/007_DT Ride.wav',
  },
};

const ONSET_MAX_MS = 15;

// Shared trim/silence filter (leading + trailing silence, hard length cap).
const trimChain = (maxSec) =>
  `silenceremove=start_periods=1:start_threshold=-50dB:detection=peak:` +
  `stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05,atrim=end=${maxSec}`;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.stderr || '';
}

// Peak-normalize + trim + tail-fade + force mono/44.1k/16-bit, all in the file.
function process(rawPath, outPath, maxSec, peakDb) {
  // pass 1: measure peak on the trimmed signal
  const log = ffmpeg(['-i', rawPath, '-af', `${trimChain(maxSec)},volumedetect`, '-f', 'null', '-']);
  const m = log.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const maxVol = m ? parseFloat(m[1]) : 0;
  const gainDb = (peakDb - maxVol).toFixed(2);
  // pass 2: apply gain, fade the last 8ms (areverse trick works without knowing length)
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

function analyze(w, role) {
  const sr = w.sampleRate, d = w.ch0, thr = 0.02;
  let peak = 0, sumSq = 0, onset = -1, tail = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sumSq += d[i] * d[i];
    if (a > thr) { if (onset < 0) onset = i; tail = i; }
  }
  const toMs = (n) => +(n / sr * 1000).toFixed(0);
  const durationMs = toMs(d.length);
  const onsetMs = onset < 0 ? durationMs : toMs(onset);
  const effMs = onset < 0 ? 0 : toMs(tail - onset);
  const flags = [];
  if (onset < 0) flags.push('SILENT');
  if (onsetMs > ONSET_MAX_MS) flags.push(`leading-delay ${onsetMs}ms`);
  if (peak >= 0.999) flags.push('clipping (peak=1.0)');
  if (w.sampleRate !== 44100) flags.push(`sampleRate ${w.sampleRate}`);
  return { role, durationMs, onsetMs, effMs, peak: +peak.toFixed(3), rms: +Math.sqrt(sumSq / d.length).toFixed(3), flags };
}

const report = {};
for (const [genre, roles] of Object.entries(MANIFEST)) {
  const dir = join(ROOT, 'public', 'samples', genre);
  mkdirSync(dir, { recursive: true });
  report[genre] = [];
  const credits = [];
  for (const [local, repoPath] of Object.entries(roles)) {
    const url = RAW + repoPath.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(url);
    if (!res.ok) { console.error(`FAIL ${genre}/${local}: ${res.status}`); process.exitCode = 1; continue; }
    // Keep the raw download ON DISK next to the corrected file (<role>.raw.wav)
    // so the #soundcheck screen can A/B the untouched source against the ffmpeg
    // result. These .raw.wav files are audition-only; delete them once the
    // developer signs off on the corrections (they should not ship).
    const rawName = `${local}.raw.wav`;
    const rawPath = join(dir, rawName);
    writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));
    const outName = `${local}.wav`;
    const outPath = join(dir, outName);
    const p = PROC[local] ?? { maxSec: 1.0, peakDb: -3 };
    process(rawPath, outPath, p.maxSec, p.peakDb);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath)), local); } catch (e) { a = { role: local, error: String(e), flags: ['PARSE-FAIL'] }; }
    a.file = outName; a.source = repoPath; a.targetPeakDb = p.peakDb; a.capSec = p.maxSec;
    report[genre].push(a);
    credits.push(`- ${outName}  <-  Dirt-Samples/${repoPath}  (ffmpeg: silence-trimmed, capped ${p.maxSec}s, peak ${p.peakDb}dB, mono/44.1k/16-bit)`);
  }
  writeFileSync(join(dir, 'CREDITS.md'),
    `# ${genre} samples\n\nSource: ${SRC}\n\nProcessed by scripts/build-samples.mjs (ffmpeg).\n\n${credits.join('\n')}\n\n` +
    `Licensing: freely redistributable for music-making; **verify before commercial ship** (docs/plan.md ship checklist).\n`);
}

let out = '# Sample health report (processed assets)\n\n';
let flaggedCount = 0;
for (const [genre, rows] of Object.entries(report)) {
  out += `## ${genre}\n\n`;
  for (const r of rows) {
    const bad = r.flags && r.flags.length;
    if (bad) flaggedCount++;
    out += `- **${r.role}** (${r.file}): dur ${r.durationMs}ms, onset ${r.onsetMs}ms, effective ${r.effMs}ms, peak ${r.peak}, rms ${r.rms}` +
      (bad ? `  ⚠️ ${r.flags.join('; ')}` : '  ✓') + '\n';
  }
  out += '\n';
}
out += `\nTotal files with flags: ${flaggedCount}\n`;
writeFileSync(join(ROOT, 'public', 'samples', 'health-report.md'), out);
console.log(out);
