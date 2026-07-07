// Lo-Fi kit prototypes, sampled from the three lofi packs under
// /Users/yusufeminkinatas/Desktop/soundpacks/lofi. Mirrors the House pipeline
// (scripts/build-house-kit.mjs): per role strip silence, cap length + fade,
// peak-normalize to a per-role target, force mono / 44.1k / 16-bit. Writes both
// <base>.wav (corrected) and <base>.raw.wav (verbatim) per variant dir so
// #soundcheck can A/B, plus a CREDITS.md and health-report.md.
//
//   node scripts/build-lofi-protos.mjs [packRoot]
//
// Three prototypes, each a drop-in for the lofi sampled roles (kick, snare,
// rimshot, hat closed+open). None of the packs ship a dedicated shaker, so the
// shaker role falls back to the synth voice in every prototype. The LoFi-pads
// "melody" material is 10-17s loops, not clean chord one-shots, so no pitched
// chord/rhodes role is sampled here.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/lofi';

const ITS = join(PACK, 'lo-fi-drum-kit', 'lo-fi drum kit by itslucid');
const MY = join(PACK, 'MyLofiDrumKit', 'sounds');
const PADS = join(PACK, 'LoFi-pads', 'samples');

// per-role correction (from House PROC, ear-safe defaults)
const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.55, peakDb: -3 },
  rimshot:    { maxSec: 0.35, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
};

// Each variant: { id, name, license, files: { <fileBase>: { src, role } } }
const VARIANTS = [
  {
    id: 'A',
    name: 'A · itslucid Tape Kit',
    license: 'soundpacks.com free pack',
    files: {
      kick:       { src: join(ITS, 'kick', 'kick 09.wav'),   role: 'kick' },
      kick_soft:  { src: join(ITS, 'kick', 'kick 05.wav'),   role: 'kick' },
      snare:      { src: join(ITS, 'snare', 'snare 01.wav'), role: 'snare' },
      rimshot:    { src: join(ITS, 'perc', 'perc 01.wav'),   role: 'rimshot' },
      hat_closed: { src: join(ITS, 'hats', 'hat 08.wav'),    role: 'hat_closed' },
      hat_open:   { src: join(ITS, 'hats', 'hat 01.wav'),    role: 'hat_open' },
    },
  },
  {
    id: 'B',
    name: 'B · MyLofi Bedroom',
    license: 'MyLofiDrumKit personal pack',
    files: {
      kick:       { src: join(MY, 'kick.wav'),      role: 'kick' },
      kick_soft:  { src: join(MY, 'kick.wav'),      role: 'kick' }, // single kick -> soft = same, quieter via velocity
      snare:      { src: join(MY, 'snare.wav'),     role: 'snare' },
      rimshot:    { src: join(MY, 'perc.wav'),      role: 'rimshot' },
      hat_closed: { src: join(MY, 'hatClosed.wav'), role: 'hat_closed' },
      hat_open:   { src: join(MY, 'hatOpen.wav'),   role: 'hat_open' },
    },
  },
  {
    id: 'C',
    name: 'C · LoFi Pads Room',
    license: 'LoFi-pads web demo pack',
    files: {
      kick:       { src: join(PADS, 'Kick 1 - C.wav'),     role: 'kick' },
      kick_soft:  { src: join(PADS, 'Kick 1 - C.wav'),     role: 'kick' }, // single kick
      snare:      { src: join(PADS, 'Snare 1 - C.wav'),    role: 'snare' },
      rimshot:    { src: join(PADS, 'Snap 2.wav'),         role: 'rimshot' },
      hat_closed: { src: join(PADS, 'Closed Hihat 1.wav'), role: 'hat_closed' },
      hat_open:   { src: join(PADS, 'Open Hihat 1.wav'),   role: 'hat_open' },
    },
  },
];

const trimChain = (maxSec) =>
  `silenceremove=start_periods=1:start_threshold=-50dB:detection=peak:` +
  `stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05,atrim=end=${maxSec}`;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
  return r.stderr || '';
}

function processFile(rawPath, outPath, p) {
  const { maxSec, peakDb } = p;
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

let grandFlags = 0;
const credits = ['# lofi kit prototypes — sources & licensing', ''];

for (const v of VARIANTS) {
  const dir = join(ROOT, 'public', 'samples', 'lofi', v.id);
  mkdirSync(dir, { recursive: true });
  let out = `# lofi prototype ${v.name} — health report\n\nSource: ${v.license}. Corrected by scripts/build-lofi-protos.mjs.\n\n`;
  credits.push(`## ${v.name}  (${v.license})`, '');
  let flagged = 0;
  for (const [base, { src, role }] of Object.entries(v.files)) {
    if (!existsSync(src)) { console.error(`MISSING ${v.id}/${base}: ${src}`); process.exitCode = 1; continue; }
    writeFileSync(join(dir, `${base}.raw.wav`), readFileSync(src));  // verbatim for A/B
    const outPath = join(dir, `${base}.wav`);
    const p = PROC[role];
    processFile(src, outPath, p);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) { flagged++; grandFlags++; }
    out += `- **${base}** (${role}) <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, eff ${a.effMs}ms, peak ${a.peak}` +
      (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${base}.wav  <-  ${src.split('/').pop()}  (cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  out += `\nTotal files with flags: ${flagged}\n`;
  writeFileSync(join(dir, 'health-report.md'), out);
  credits.push('');
  console.log(out);
}

credits.push(
  'Note: no pack shipped a dedicated shaker, so the shaker role stays synthesized in every prototype.',
  'The LoFi-pads melody material is long loops, not clean chord one-shots, so no pitched chord/rhodes role is sampled.',
  'Licensing: soundpacks.com pack is a free download; MyLofiDrumKit and LoFi-pads are personal/demo project samples with',
  'no explicit license file — verify permissions before any commercial ship.',
);
writeFileSync(join(ROOT, 'public', 'samples', 'lofi', 'CREDITS.md'), credits.join('\n') + '\n');
console.log(`\nAll prototypes built. Total files with flags: ${grandFlags}`);
