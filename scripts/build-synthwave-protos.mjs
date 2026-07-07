// Synthwave kit prototypes, sampled from three free MusicRadar / Cyclick packs
// under /Users/yusufeminkinatas/Desktop/soundpacks/synthwave:
//   clean-808     — MusicRadar "808 samples" (classic, pure Roland TR-808 hits)
//   proc-808-909  — Cyclick "808 & 909 Reimagined" (processed / characterful)
//   80s-synths    — Cyclick "80s Synths" (multisampled analog + FM bass)
//
//   node scripts/build-synthwave-protos.mjs
//
// Local build tool: reads the packs from PACK below (NOT downloaded, NOT a build
// dependency) and runs the standard ffmpeg correction (strip silence, cap
// length + fade, peak-normalize, mono/44.1k/16-bit) into
// public/samples/synthwave/<variant>/. Each corrected <role>.wav gets a
// <role>.raw.wav sibling so #soundcheck can A/B. Mirrors scripts/build-house-kit.mjs.
//
// Two prototypes, distinguished by their DRUM voicing:
//   A "Clean 808"   — pure analog TR-808 (clean-808 pack)
//   B "Reimagined"  — processed 808/909 hits (proc-808-909, KDFX chain)
// Both share the same pitched synthwave bass overlay from the 80s-synths pack
// (Jupiter analog = bass, DX/FM = bass_fat). Both bass notes are rooted at A1,
// so they seat on the engine's A reference with no tune (tune omitted in manifest).
// Lead / chord / pad stay synthesized (wide-range pitched, need multisampling).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = process.argv[2] ?? '/Users/yusufeminkinatas/Desktop/soundpacks/synthwave';

const CLEAN = join(PACK, 'clean-808', 'musicradar-808-samples', 'Hits');
const PROC_PACK = join(PACK, 'proc-808-909', '808 and 909 Reimagined', 'Hits');
const MULTI = join(PACK, '80s-synths', '80s Synths Samples', 'Multisamples');

// Per-role correction targets (from the brief's ear-safe defaults).
const PROC = {
  kick_hard:  { maxSec: 0.70, peakDb: -1 },
  kick_soft:  { maxSec: 0.70, peakDb: -1 },
  snare:      { maxSec: 0.55, peakDb: -3 },
  clap:       { maxSec: 0.55, peakDb: -4 },
  hat_closed: { maxSec: 0.22, peakDb: -9 },
  hat_open:   { maxSec: 0.55, peakDb: -9 },
  bass:       { maxSec: 0.60, peakDb: -3 },
  bass_fat:   { maxSec: 0.60, peakDb: -3 },
};

// Shared pitched bass overlay (both prototypes). A1-rooted -> no tune needed.
const BASS = {
  bass:     join(MULTI, 'Jupiter Bass A', '80s_JupiBassA-A1.wav'), // analog, round
  bass_fat: join(MULTI, 'DX Bass A', '80s_DXbassA-A1.wav'),        // FM, punchy
};

const VARIANTS = {
  A: {
    kick_hard:  join(CLEAN, 'Bass Drum [BD]', 'E808_BD[long]-03.wav'),
    kick_soft:  join(CLEAN, 'Bass Drum [BD]', 'E808_BD[short]-05.wav'),
    snare:      join(CLEAN, 'Snare Drum [SD]', 'E808_SD-05.wav'),
    clap:       join(CLEAN, 'Clap [CP]', 'E808_CP-03.wav'),
    hat_closed: join(CLEAN, 'Closed Hi Hat [CH]', 'E808_CH-03.wav'),
    hat_open:   join(CLEAN, 'Open Hi Hat [OH]', 'E808_OH-03.wav'),
    ...BASS,
  },
  B: {
    kick_hard:  join(PROC_PACK, 'KDFX', 'TReImag_KDFX_Kick_01.wav'),
    kick_soft:  join(PROC_PACK, 'KDFX', 'TReImag_KDFX_Kick_04.wav'),
    snare:      join(PROC_PACK, 'KDFX', 'TReImag_KDFX_Snare_01.wav'),
    clap:       join(PROC_PACK, 'KDFX', 'TReImag_KDFX_Clap_01.wav'),
    hat_closed: join(PROC_PACK, 'KDFX', 'TReImag_KDFX_HatClosed_01.wav'),
    hat_open:   join(PROC_PACK, 'KDFX', 'TReImag_KDFX_HatOpen_01.wav'),
    ...BASS,
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

let report = '# Synthwave kit prototypes — health report\n\n' +
  'Sources: MusicRadar "808 samples" (clean-808), Cyclick "808 & 909 Reimagined" (proc-808-909),\n' +
  'Cyclick "80s Synths" (80s-synths). All free/royalty-free. Corrected by scripts/build-synthwave-protos.mjs.\n\n';
const credits = [
  '# synthwave kit prototypes — credits',
  '',
  'Prototype A "Clean 808" drums: MusicRadar / Computer Music "808 samples" (free royalty-free SampleRadar download).',
  'Prototype B "Reimagined" drums: Cyclick Samples "808 & 909 Reimagined" (free, distributed via MusicRadar/SampleRadar).',
  'Shared bass (both): Cyclick Samples "80s Synths" multisamples (free, via MusicRadar/SampleRadar).',
  '',
];
let flagged = 0;

for (const [id, kit] of Object.entries(VARIANTS)) {
  const dir = join(ROOT, 'public', 'samples', 'synthwave', id);
  mkdirSync(dir, { recursive: true });
  report += `## Variant ${id}\n\n`;
  credits.push(`## Variant ${id}`);
  for (const [role, src] of Object.entries(kit)) {
    if (!existsSync(src)) { console.error(`MISSING ${id}/${role}: ${src}`); process.exitCode = 1; continue; }
    writeFileSync(join(dir, `${role}.raw.wav`), readFileSync(src)); // verbatim source for A/B
    const outPath = join(dir, `${role}.wav`);
    const p = PROC[role];
    processFile(src, outPath, p);
    let a;
    try { a = analyze(parseWav(readFileSync(outPath))); } catch (e) { a = { flags: [`PARSE-FAIL ${e}`] }; }
    if (a.flags.length) flagged++;
    report += `- **${role}** <- ${src.split('/').pop()}: dur ${a.durationMs}ms, onset ${a.onsetMs}ms, ` +
      `eff ${a.effMs}ms, peak ${a.peak}` + (a.flags.length ? `  ⚠️ ${a.flags.join('; ')}` : '  ✓') + '\n';
    credits.push(`- ${role}.wav  <-  ${src.split('/').pop()}  (ffmpeg: trimmed, cap ${p.maxSec}s, peak ${p.peakDb}dB)`);
  }
  report += '\n';
  credits.push('');
}

report += `Total files with flags: ${flagged}\n`;
const outDir = join(ROOT, 'public', 'samples', 'synthwave');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'health-report.md'), report);
writeFileSync(join(outDir, 'CREDITS.md'),
  credits.join('\n') + '\nLicensing: MusicRadar / Computer Music / Cyclick free sample packs, royalty-free for any use (incl. commercial). Verify before commercial ship.\n');
console.log(report);
