// dnb kit prototypes, sampled from MusicRadar SampleRadar "Drum & Bass"
// (170bpm + 175bpm packs, royalty-free per each pack's "Read me.txt": free to
// use in any music incl. commercial; only re-distribution is barred).
//
//   node scripts/build-dnb-protos.mjs [PACK_DIR]
//
// Local build tool: reads the pack from PACK below (NOT downloaded, NOT a build
// dependency) and runs the standard House ffmpeg correction (strip silence, cap
// length + fade, peak-normalize, mono/44.1k/16-bit) into
// public/samples/dnb/<variant>/. Each corrected <role>.wav gets a <role>.raw.wav
// verbatim sibling so #soundcheck can A/B. See docs/tools/audio-sample-pipeline.md.
//
// Three prototypes are auditioned:
//   A · 170 Kit A     — Drum Kit 1 "A" hits + Bass A (C2 root)
//   B · 170 Kit B     — Drum Kit 1 "B" hits + Bass B (C2 root)
//   C · 175 Two-Step  — Kit 2 Two-Step A hits + Bass A (C2 root), faster/brighter
//
// Roles covered per prototype: kick, snare, hat (closed+open), ride, bass.
// The bass is pitched: sampled at C2, tuned -3 semitones to seat it at the
// engine's A reference (same as House's C2 bass -> tune -3).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/drum-and-bass';
const P170 = join(PACK, 'musicradar-drumnbass-170bpm');
const P175 = join(PACK, 'musicradar-drumnbass-175bpm');

const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.55, peakDb: -3 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  ride:       { maxSec: 1.30, peakDb: -7 },
  bass:       { maxSec: 0.60, peakDb: -3 },
};

// role -> source file, per prototype.
const HITS170A = join(P170, 'Drum Kits', 'Drum Hits A');
const HITS170B = join(P170, 'Drum Kits', 'Drum Hits B');
const HITS175  = join(P175, 'Drum Kits', 'Samples');
const BASS170A = join(P170, 'Bass', 'Bass A Multis');
const BASS170B = join(P170, 'Bass', 'Bass B Multis');
const BASS175A = join(P175, 'Bass', 'Bass Multis A');

const VARIANTS = {
  A: {
    name: 'A · MusicRadar 170 Kit A',
    desc: 'punchy 170 break kit, drier',
    files: {
      kick:       join(HITS170A, 'DnBk1DHitA-Kick01.wav'),
      snare:      join(HITS170A, 'DnBk1DHitA-Snare01.wav'),
      hat_closed: join(HITS170A, 'DnBk1DHitA-Hat01.wav'),
      hat_open:   join(HITS170A, 'DnBk1DHitA-Hat03.wav'),
      ride:       join(HITS170A, 'DnBk1DHitA-Ride01.wav'),
      bass:       join(BASS170A, 'DnBk1BassA-C2.wav'),
    },
  },
  B: {
    name: 'B · MusicRadar 170 Kit B',
    desc: 'darker/rounder 170 break kit',
    files: {
      kick:       join(HITS170B, 'DnBk1DHitB-Kick01.wav'),
      snare:      join(HITS170B, 'DnBk1DHitB-Snare01.wav'),
      hat_closed: join(HITS170B, 'DnBk1DHitB-Hat01.wav'),
      hat_open:   join(HITS170B, 'DnBk1DHitB-Hat03.wav'),
      ride:       join(HITS170B, 'DnBk1DHitB-Ride01.wav'),
      bass:       join(BASS170B, 'DnBk1BassB-C2.wav'),
    },
  },
  C: {
    name: 'C · MusicRadar 175 Two-Step',
    desc: 'faster, brighter two-step kit',
    files: {
      kick:       join(HITS175, 'DnBk2TwoStepAHit-Kick01.wav'),
      snare:      join(HITS175, 'DnBk2TwoStepAHit-Snare01.wav'),
      hat_closed: join(HITS175, 'DnBk2TwoStepAHit-Hat01.wav'),
      hat_open:   join(HITS175, 'DnBk2TwoStepAHit-Hat03.wav'),
      ride:       join(HITS175, 'DnBk2TwoStepAHit-Ride01.wav'),
      bass:       join(BASS175A, 'DnBk2BassA-C2.wav'),
    },
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

// map role key -> output fileBase in the variant dir
const OUTBASE = {
  kick: 'kick', snare: 'snare', hat_closed: 'hat_closed',
  hat_open: 'hat_open', ride: 'ride', bass: 'bass',
};

let report = '# dnb kit prototypes — health report\n\n' +
  'Source: MusicRadar SampleRadar Drum & Bass (170bpm + 175bpm), royalty-free.\n' +
  'Corrected by scripts/build-dnb-protos.mjs.\n';
const credits = [
  '# dnb samples (MusicRadar SampleRadar Drum & Bass)', '',
  'Source: MusicRadar.com SampleRadar "Drum & Bass" 170bpm + 175bpm packs.',
  'License: royalty-free — free to use in any music (incl. commercial); ',
  're-distribution of the samples (individually or as collections) is not permitted.', '',
];
let flagged = 0;

for (const [vid, v] of Object.entries(VARIANTS)) {
  const dir = join(ROOT, 'public', 'samples', 'dnb', vid);
  mkdirSync(dir, { recursive: true });
  report += `\n## ${v.name}\n${v.desc}\n\n`;
  credits.push(`## ${vid} — ${v.name}`);
  for (const [role, src] of Object.entries(v.files)) {
    if (!existsSync(src)) { console.error(`MISSING ${vid}/${role}: ${src}`); process.exitCode = 1; continue; }
    const base = OUTBASE[role];
    const procKey = role === 'bass' ? 'bass' : role; // PROC keyed by role name
    writeFileSync(join(dir, `${base}.raw.wav`), readFileSync(src));
    const outPath = join(dir, `${base}.wav`);
    const p = PROC[procKey];
    processFile(src, outPath, p);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) flagged++;
    report += `- **${base}** (${base}.wav) <- ${src.split('/').pop()}: dur ${a.durationMs}ms, ` +
      `onset ${a.onsetMs}ms, eff ${a.effMs}ms, peak ${a.peak}` +
      (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${vid}/${base}.wav  <-  ${src.split('/').pop()}  (cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  credits.push('');
}

report += `\nTotal files with flags: ${flagged}\n`;
const dnbDir = join(ROOT, 'public', 'samples', 'dnb');
mkdirSync(dnbDir, { recursive: true });
writeFileSync(join(dnbDir, 'health-report.md'), report);
writeFileSync(join(dnbDir, 'CREDITS.md'), credits.join('\n') + '\n');
console.log(report);
