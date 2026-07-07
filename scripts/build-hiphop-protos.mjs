// hiphop kit prototypes. Builds TWO distinct sampled voicings from the two
// downloaded trap packs so the developer can A/B them in-game:
//
//   A · MusicRadar Trap  — bright, modern, snappy trap drums (MusicRadar "Trap"
//                          free sample pack, Drum_Hits).
//   B · TriSamples 808   — deeper, crustier, vinyl-flavoured 808 Trapstep drums
//                          (TriSamples "808 Trapstep Pack Vol 1").
//
// Both take the sampled 808 sub-bass from the TriSamples "808 Bass" folder
// (MusicRadar's pack ships no pitched bass one-shot). The chosen 808 measures
// A1 (~55.8 Hz), which matches the engine's A reference (House's C2 bass used
// tune -3 to reach the same A), so bass tune = 0.
//
//   node scripts/build-hiphop-protos.mjs
//
// Local build tool: reads the packs from PACKS below (NOT downloaded here, NOT a
// build dependency) and runs the standard House ffmpeg correction (strip
// silence, cap length + fade, peak-normalize, mono/44.1k/16-bit) into
// public/samples/hiphop/<variant>/. Each corrected <role>.wav gets a
// <role>.raw.wav verbatim sibling so #soundcheck can A/B. Mirrors
// scripts/build-house-kit.mjs. See docs/tools/audio-sample-pipeline.md.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SP = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/hiphop';
const MR = join(SP, 'musicradar_trap_300', 'musicradar-trap-samples', 'Drum_Hits');
const TS = join(SP, 'trisamples_808_trapstep_v1', 'TriSamples - 808 Trapstep Pack Vol 1');
const TSD = join(TS, 'Snares & Claps');
const TSK = join(TS, 'Kick');
const TSH = join(TS, 'Hats & Cymbals');
const TSB = join(TS, '808 Bass');

const PROC = {
  kick:       { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.55, peakDb: -3 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  rimshot:    { maxSec: 0.35, peakDb: -5 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  shaker:     { maxSec: 0.35, peakDb: -9 },
  bass:       { maxSec: 0.85, peakDb: -3 },
  bass_fat:   { maxSec: 0.85, peakDb: -3 },
};

// A · MusicRadar Trap. Two distinct kicks (hard/soft), full percussion set.
const KIT_A = {
  kick:       join(MR, 'Kick_01.wav'),
  kick_soft:  join(MR, 'Kick_03.wav'),
  snare:      join(MR, 'Snare_01.wav'),
  clap:       join(MR, 'Clap_01.wav'),
  rimshot:    join(MR, 'Rimshot_01.wav'),
  hat_closed: join(MR, 'ClosedHat_01.wav'),
  hat_open:   join(MR, 'OpenHat_01.wav'),
  shaker:     join(MR, 'Shaker_01.wav'),
  bass:       join(TSB, '808 Bass A Deep.wav'),   // A1
  bass_fat:   join(TSB, '808 Bass A Knaw.wav'),   // A1, grittier
};

// B · TriSamples 808 Trapstep. Deeper vinyl character. No rimshot in this pack,
// so the rimshot is borrowed from MusicRadar (still a trap rim) to keep the role
// covered; everything else is TriSamples.
const KIT_B = {
  kick:       join(TSK, 'Kick 004 Blam.wav'),
  kick_soft:  join(TSK, 'Kick 003 Sensible.wav'),
  snare:      join(TSD, 'Snare 001.wav'),
  clap:       join(TSD, 'Clap 001.wav'),
  rimshot:    join(MR, 'Rimshot_01.wav'),
  hat_closed: join(TSH, 'HiHat Closed 007 Trap.wav'),
  hat_open:   join(TSH, 'HiHat Open 001.wav'),
  shaker:     join(TSH, 'Shaker 001.wav'),
  bass:       join(TSB, '808 Bass A Deep.wav'),   // A1
  bass_fat:   join(TSB, '808 Bass A Knaw.wav'),   // A1, grittier
};

// map the file key -> PROC role (kick_soft shares the kick correction)
const procKey = (k) => (k === 'kick_soft' ? 'kick' : k);

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

const VARIANTS = [
  { id: 'A', label: 'MusicRadar Trap', kit: KIT_A },
  { id: 'B', label: 'TriSamples 808 Trapstep', kit: KIT_B },
];

let totalFlagged = 0;
let report = '# hiphop kit prototypes — health report\n\n' +
  'Corrected by scripts/build-hiphop-protos.mjs (House ffmpeg pipeline).\n';

for (const { id, label, kit } of VARIANTS) {
  const dir = join(ROOT, 'public', 'samples', 'hiphop', id);
  mkdirSync(dir, { recursive: true });
  report += `\n## ${id} · ${label}\n\n`;
  const credits = [`# hiphop prototype ${id} · ${label}`, ''];
  for (const [key, src] of Object.entries(kit)) {
    if (!existsSync(src)) { console.error(`MISSING ${id}/${key}: ${src}`); process.exitCode = 1; continue; }
    // file base: kick_soft -> "kick_soft.wav" so hard/soft are distinct files
    const base = key;
    writeFileSync(join(dir, `${base}.raw.wav`), readFileSync(src));
    const outPath = join(dir, `${base}.wav`);
    const p = PROC[procKey(key)];
    processFile(src, outPath, p);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) totalFlagged++;
    report += `- **${base}** <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, ` +
      `eff ${a.effMs}ms, peak ${a.peak}` + (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${base}.wav  <-  ${src.split('/').pop()}  (cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  writeFileSync(join(dir, 'CREDITS.md'),
    credits.join('\n') +
    '\n\nSources & licensing:\n' +
    '- MusicRadar "Trap" free sample pack (MusicRadar / Computer Music). Free to use in your own productions.\n' +
    '- TriSamples "808 Trapstep Pack Vol 1" (trisamples.com): "free to use in anything you wish apart from reselling them or distributing them as your own creation."\n' +
    'Verify both licenses before commercial ship.\n');
}

report += `\nTotal files with flags across all prototypes: ${totalFlagged}\n`;
writeFileSync(join(ROOT, 'public', 'samples', 'hiphop', 'health-report.md'), report);
console.log(report);
