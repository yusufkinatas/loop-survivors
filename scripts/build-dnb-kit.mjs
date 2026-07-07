// The dnb kit, sampled from MusicRadar SampleRadar "Drum & Bass" 170bpm pack
// ("Read me.txt": royalty-free — free to use in any music incl. commercial;
// only re-distribution of the samples is barred). This is the "170 Kit A"
// voicing the developer chose (drier, punchy 170 break kit).
//
//   node scripts/build-dnb-kit.mjs [PACK_DIR]
//
// Local build tool: reads the pack from PACK below (NOT downloaded, NOT a build
// dependency) and runs the standard ffmpeg correction (strip silence, cap
// length + fade, peak-normalize, mono/44.1k/16-bit) into public/samples/dnb/.
// Each corrected <role>.wav gets a <role>.raw.wav verbatim sibling so
// #soundcheck can A/B. See docs/tools/audio-sample-pipeline.md.
//
// Roles covered: kick, snare, hat (closed+open), ride, bass. The bass is
// pitched: sampled at C2, tuned -3 semitones to seat it at the engine's A
// reference (same as House's C2 bass -> tune -3).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/drum-and-bass';
const P170 = join(PACK, 'musicradar-drumnbass-170bpm');

const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.55, peakDb: -3 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  ride:       { maxSec: 1.30, peakDb: -7 },
  bass:       { maxSec: 0.60, peakDb: -3 },
};

// The chosen "170 Kit A" dnb voicing: Drum Kit 1 "A" hits + Bass A (C2 root).
const HITS170A = join(P170, 'Drum Kits', 'Drum Hits A');
const BASS170A = join(P170, 'Bass', 'Bass A Multis');

const KIT = {
  kick:       join(HITS170A, 'DnBk1DHitA-Kick01.wav'),
  snare:      join(HITS170A, 'DnBk1DHitA-Snare01.wav'),
  hat_closed: join(HITS170A, 'DnBk1DHitA-Hat01.wav'),
  hat_open:   join(HITS170A, 'DnBk1DHitA-Hat03.wav'),
  ride:       join(HITS170A, 'DnBk1DHitA-Ride01.wav'),
  bass:       join(BASS170A, 'DnBk1BassA-C2.wav'),
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

const dir = join(ROOT, 'public', 'samples', 'dnb');
mkdirSync(dir, { recursive: true });
let out = '# dnb kit (MusicRadar "170 Kit A") — health report\n\nSource: MusicRadar SampleRadar Drum & Bass 170bpm (royalty-free). Corrected by scripts/build-dnb-kit.mjs.\n\n';
const credits = ['# dnb samples (MusicRadar "170 Kit A")', '', 'Source: MusicRadar.com SampleRadar "Drum & Bass" 170bpm pack.', 'License: royalty-free — free to use in any music (incl. commercial); re-distribution of the samples (individually or as collections) is not permitted.', ''];
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
  credits.join('\n') + '\n\nLicensing: royalty-free per pack Read me. Verify before commercial ship.\n');
console.log(out);
