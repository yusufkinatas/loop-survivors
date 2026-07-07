// Techno kit prototypes, sampled from the packs under
// /Users/yusufeminkinatas/Desktop/soundpacks/techno:
//   - musicradar-techno-drum-fx-samples (MusicRadar free techno drum/FX pack)
//   - Bass Synthesis (Cyclick Samples) — pitched bass multisamples (C2 roots)
//
//   node scripts/build-techno-protos.mjs
//
// Local build tool: reads the packs from PACK below (NOT downloaded, NOT a build
// dependency) and runs the standard ffmpeg correction (strip silence, cap
// length + fade, peak-normalize, mono/44.1k/16-bit) into
// public/samples/techno/<variantId>/. Each corrected <base>.wav gets a
// <base>.raw.wav verbatim sibling so #soundcheck can A/B. Mirrors
// scripts/build-house-kit.mjs. See docs/tools/audio-sample-pipeline.md.
//
// Two prototypes, both full-coverage (kick/clap/rimshot/hat closed+open/ride)
// plus a pitched bass:
//   A · MusicRadar Digital — clean, snappy modern techno core (Drum_Hits).
//   B · Analogue Machines  — gritty vintage drum-machine grit (Vermona/Jomox).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/techno';
const DRUM = join(PACK, 'musicradar-techno-drum-fx-samples');
const HITS = join(DRUM, 'Drum_Hits');
const ANA = join(DRUM, 'Bonus_Analogue_DrumHits');
const BASS = join(PACK, 'Bass Synthesis', 'Multisamples');

// output base -> processing params
const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  rimshot:    { maxSec: 0.35, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  ride:       { maxSec: 1.30, peakDb: -7 },
  bass:       { maxSec: 0.60, peakDb: -3 },
};

const VARIANTS = {
  A: {
    name: 'A · MusicRadar Digital',
    kick:       join(HITS, 'Kick05.wav'),
    clap:       join(HITS, 'Clap03.wav'),
    rimshot:    join(HITS, 'Rimshot01.wav'),
    hat_closed: join(HITS, 'Closedhat05.wav'),
    hat_open:   join(HITS, 'Openhat05.wav'),
    ride:       join(ANA, 'Jomox_Cymbal05.wav'),   // digital pack has no ride/cymbal
    bass:       join(BASS, 'Digital', 'OppenCrusher', 'BassSynth_OppenCrusher_Multi_C2.wav'),
  },
  B: {
    name: 'B · Analogue Machines',
    kick:       join(ANA, 'Vermona_Kick08.wav'),
    clap:       join(HITS, 'Clap03.wav'),          // analogue bonus pack has no clap
    rimshot:    join(ANA, 'Jomox_Rim05.wav'),
    hat_closed: join(ANA, 'Jomox_Hat05.wav'),
    hat_open:   join(ANA, 'Vermona_Hat08.wav'),
    ride:       join(ANA, 'Jomox_Cymbal05.wav'),
    bass:       join(BASS, 'Analogue', 'MonoPunch', 'BassSynth_MonoPunch_Multi_C2.wav'),
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

let report = '# Techno kit prototypes — health report\n\n' +
  'Sources: MusicRadar free techno drum/FX pack; Cyclick Samples "Bass Synthesis" ' +
  '(pitched C2 bass multisamples). Corrected by scripts/build-techno-protos.mjs.\n';
const credits = ['# techno samples (prototypes)', '',
  'Drums/FX: MusicRadar free "Techno & Tech-House" drum & FX sample pack (royalty-free).',
  'Bass: Cyclick Samples "Bass Synthesis" multisamples, root C2 (royalty-free).', ''];
let flagged = 0;

for (const [vid, kit] of Object.entries(VARIANTS)) {
  const dir = join(ROOT, 'public', 'samples', 'techno', vid);
  mkdirSync(dir, { recursive: true });
  report += `\n## ${kit.name}  (public/samples/techno/${vid}/)\n\n`;
  credits.push(`## ${kit.name}`);
  for (const base of Object.keys(PROC)) {
    const src = kit[base];
    if (!src) continue;
    if (!existsSync(src)) { console.error(`MISSING ${vid}/${base}: ${src}`); process.exitCode = 1; continue; }
    writeFileSync(join(dir, `${base}.raw.wav`), readFileSync(src));   // verbatim A/B
    const outPath = join(dir, `${base}.wav`);
    const p = PROC[base];
    processFile(src, outPath, p);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) flagged++;
    report += `- **${base}** <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, eff ${a.effMs}ms, peak ${a.peak}` +
      (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${vid}/${base}.wav  <-  ${src.split('/').pop()}  (ffmpeg: trimmed, cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  credits.push('');
}

report += `\nTotal files with flags: ${flagged}\n`;
const outDir = join(ROOT, 'public', 'samples', 'techno');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'health-report.md'), report);
writeFileSync(join(outDir, 'CREDITS.md'),
  credits.join('\n') + '\nLicensing: royalty-free sample packs (MusicRadar free downloads; ' +
  'Cyclick Samples). Verify pack PDFs before commercial ship.\n');
console.log(report);
