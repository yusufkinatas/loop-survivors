// Download and correct the real one-shots used by the four development-only
// reference studies that can also be built as gameplay tracks.
//
//   node scripts/build-featured-track-samples.mjs
//
// The input files come from Sample Pi/Sonic Pi's CC0 sample collection.
// Every output goes through the same asset-first ffmpeg correction as the
// active House kit: remove silence, cap/fade the tail, normalize to a role-
// appropriate peak, and force mono 44.1 kHz 16-bit PCM. Runtime code only
// fetches and decodes these finished files.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FINAL_OUT = join(ROOT, 'public', 'samples', 'covers', 'featured');
const SAMPLE_PI_COMMIT = 'f14596be37abf227bf77d198c9b0b60d9eb4dca9';
const SAMPLE_PI =
  `https://raw.githubusercontent.com/alex-esc/sample-pi/${SAMPLE_PI_COMMIT}/`;

const SOURCES = {
  samplePi: {
    label: 'Sample Pi / Sonic Pi samples',
    url: `https://github.com/alex-esc/sample-pi/tree/${SAMPLE_PI_COMMIT}`,
    license: 'CC0 1.0 (public domain), per the repository README',
  },
};

// source paths are URL path segments. `kind` selects the source/license line.
const MANIFEST = [
  {
    track: 'showmelove',
    name: 'snare',
    kind: 'samplePi',
    path: 'drums/one-shots/snare/drum_snare_hard.flac',
    maxSec: 0.46,
    peakDb: -3,
  },
  {
    track: 'showmelove',
    name: 'tick',
    kind: 'samplePi',
    path: 'drums/one-shots/electric/elec_tick.flac',
    maxSec: 0.18,
    peakDb: -10,
  },
  {
    track: 'showmelove',
    name: 'bell',
    kind: 'samplePi',
    path: 'drums/one-shots/percussion/perc_bell2.flac',
    maxSec: 0.42,
    peakDb: -8,
  },
  {
    track: 'animals',
    name: 'kick',
    kind: 'samplePi',
    path: 'drums/one-shots/kick/bd_klub.flac',
    maxSec: 0.62,
    peakDb: -1,
  },
  {
    track: 'animals',
    name: 'snare',
    kind: 'samplePi',
    path: 'drums/one-shots/snare/drum_snare_hard.flac',
    maxSec: 0.46,
    peakDb: -3,
  },
  {
    track: 'animals',
    name: 'wood',
    kind: 'samplePi',
    path: 'drums/one-shots/electric/elec_wood.flac',
    maxSec: 0.24,
    peakDb: -7,
  },
  {
    track: 'pursuit',
    name: 'kick',
    kind: 'samplePi',
    path: 'drums/one-shots/kick/bd_tek.flac',
    maxSec: 0.34,
    peakDb: -1,
  },
  {
    track: 'pursuit',
    name: 'clap',
    kind: 'samplePi',
    path: 'drums/one-shots/snare/elec_hi_snare.flac',
    maxSec: 0.30,
    peakDb: -4,
  },
  {
    track: 'pursuit',
    name: 'hat_closed',
    kind: 'samplePi',
    path: 'drums/one-shots/cymbal/drum_cymbal_closed.flac',
    maxSec: 0.18,
    peakDb: -10,
  },
  {
    track: 'pursuit',
    name: 'hat_splash',
    kind: 'samplePi',
    path: 'drums/one-shots/cymbal/elec_cymbal.flac',
    maxSec: 0.52,
    peakDb: -9,
  },
  {
    track: 'pursuit',
    name: 'bass_c',
    kind: 'samplePi',
    path: 'bass/bass_hard_c.flac',
    maxSec: 0.25,
    peakDb: -4,
  },
  ...[
    ['kick', 'drums/one-shots/kick/bd_haus.flac', 0.58, -1],
    ['clap', 'drums/one-shots/percussion/perc_snap2.flac', 0.48, -4],
    ['hat_closed', 'drums/one-shots/cymbal/drum_cymbal_closed.flac', 0.18, -10],
    ['hat_open', 'drums/one-shots/cymbal/drum_cymbal_open.flac', 0.50, -9],
    ['crash', 'drums/one-shots/cymbal/drum_cymbal_hard.flac', 1.20, -4],
  ].map(([name, path, maxSec, peakDb]) => ({
    track: 'satisfaction',
    name,
    kind: 'samplePi',
    path,
    maxSec,
    peakDb,
  })),
];

const trimChain = (maxSec) =>
  `silenceremove=start_periods=1:start_threshold=-50dB:detection=peak:` +
  `stop_periods=-1:stop_threshold=-50dB:stop_silence=0.05,atrim=end=${maxSec}`;

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr?.slice(-700)}`);
  }
  return result.stderr ?? '';
}

function processFile(rawPath, outputPath, maxSec, peakDb) {
  const trimmed = trimChain(maxSec);
  // Measure the exact post-trim, post-fade, mono/44.1k/16-bit signal that will
  // be normalized. Measuring the stereo pre-fade source can miss downmix loss
  // and made a nominally green file several dB quieter than its target.
  const corrected =
    `${trimmed},areverse,afade=t=in:d=0.008,areverse,` +
    `aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono`;
  const measure = ffmpeg([
    '-i',
    rawPath,
    '-af',
    `${corrected},volumedetect`,
    '-f',
    'null',
    '-',
  ]);
  const match = measure.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  const measuredPeak = match ? Number(match[1]) : 0;
  const gainDb = (peakDb - measuredPeak).toFixed(2);
  ffmpeg([
    '-i',
    rawPath,
    '-af',
    `${corrected},volume=${gainDb}dB`,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-acodec',
    'pcm_s16le',
    outputPath,
  ]);
}

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a WAV');
  let offset = 12;
  let format = null;
  let dataOffset = 0;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bits: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataLength = size;
    }
    offset += 8 + size + (size & 1);
  }
  if (!format || !dataOffset) throw new Error('incomplete WAV');
  const bytes = format.bits / 8;
  const frames = Math.floor(dataLength / (bytes * format.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const p = dataOffset + i * bytes * format.channels;
    samples[i] =
      format.bits === 16
        ? buffer.readInt16LE(p) / 32768
        : buffer.readInt32LE(p) / 2147483648;
  }
  return { ...format, samples };
}

function analyze(wav, maxSec, peakDb) {
  let peak = 0;
  let sumSq = 0;
  let onset = -1;
  let tail = 0;
  for (let i = 0; i < wav.samples.length; i++) {
    const value = wav.samples[i];
    const amplitude = Math.abs(value);
    peak = Math.max(peak, amplitude);
    sumSq += value * value;
    if (amplitude > 0.02) {
      if (onset < 0) onset = i;
      tail = i;
    }
  }
  const ms = (frames) => Math.round((frames / wav.sampleRate) * 1000);
  const durationMs = ms(wav.samples.length);
  const onsetMs = onset < 0 ? durationMs : ms(onset);
  const effectiveMs = onset < 0 ? 0 : ms(tail - onset);
  const flags = [];
  if (onset < 0) flags.push('silent');
  if (onsetMs > 15) flags.push(`leading delay ${onsetMs}ms`);
  if (peak >= 0.999) flags.push('clipping');
  if (durationMs > maxSec * 1000 + 2) flags.push(`over cap ${durationMs}ms > ${maxSec * 1000}ms`);
  if (peak > 0) {
    const actualDb = 20 * Math.log10(peak);
    if (Math.abs(actualDb - peakDb) > 0.6) {
      flags.push(`peak ${actualDb.toFixed(1)}dB misses ${peakDb}dB target`);
    }
  }
  if (peak < 0.05) flags.push('very quiet');
  if (effectiveMs > 0 && effectiveMs < 8) flags.push(`very short ${effectiveMs}ms`);
  if (wav.sampleRate !== 44100 || wav.channels !== 1 || wav.bits !== 16) {
    flags.push(`${wav.channels}ch/${wav.sampleRate}Hz/${wav.bits}bit`);
  }
  return {
    durationMs,
    onsetMs,
    effectiveMs,
    peak: peak.toFixed(3),
    rms: Math.sqrt(sumSq / wav.samples.length).toFixed(3),
    flags,
  };
}

// Build and validate in unique temporary locations. The currently playable
// asset set is replaced only after the entire manifest is green, so a network,
// ffmpeg, or health failure cannot leave a partial/bad public directory.
mkdirSync(dirname(FINAL_OUT), { recursive: true });
const OUT = mkdtempSync(join(ROOT, '.featured-staging-'));
const RAW = mkdtempSync(join(tmpdir(), 'loop-survivors-featured-raw-'));

try {
  const reports = [];
  const credits = [
    '# Featured Track Lab samples',
    '',
    'Development/reference-cover assets processed by `scripts/build-featured-track-samples.mjs`.',
    '',
  ];

  for (const entry of MANIFEST) {
    const source = SOURCES[entry.kind];
    const url = SAMPLE_PI + entry.path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

    const directory = join(OUT, entry.track);
    mkdirSync(directory, { recursive: true });
    const extension = entry.path.split('.').pop();
    const rawPath = join(RAW, `${entry.track}-${entry.name}.raw.${extension}`);
    const outputPath = join(directory, `${entry.name}.wav`);
    writeFileSync(rawPath, Buffer.from(await response.arrayBuffer()));
    processFile(rawPath, outputPath, entry.maxSec, entry.peakDb);
    const health = analyze(parseWav(readFileSync(outputPath)), entry.maxSec, entry.peakDb);
    reports.push({ ...entry, source, ...health });
    credits.push(
      `- \`${entry.track}/${entry.name}.wav\` ← [${source.label}](${source.url}) \`${entry.path}\`; ` +
        `${source.license}; ffmpeg cap ${entry.maxSec}s, peak ${entry.peakDb}dB.`,
    );
  }

  writeFileSync(join(OUT, 'CREDITS.md'), `${credits.join('\n')}\n`);

  let flagged = 0;
  const report = ['# Featured track sample health', ''];
  for (const track of [...new Set(reports.map((row) => row.track))]) {
    report.push(`## ${track}`, '');
    for (const row of reports.filter((candidate) => candidate.track === track)) {
      if (row.flags.length > 0) flagged++;
      report.push(
        `- **${row.name}**: ${row.durationMs}ms, onset ${row.onsetMs}ms, ` +
          `effective ${row.effectiveMs}ms, peak ${row.peak}, RMS ${row.rms}` +
          (row.flags.length > 0 ? ` ⚠ ${row.flags.join('; ')}` : ' ✓'),
      );
    }
    report.push('');
  }
  report.push(`Total files with flags: ${flagged}`, '');
  writeFileSync(join(OUT, 'health-report.md'), report.join('\n'));
  console.log(report.join('\n'));
  if (flagged > 0) throw new Error(`featured sample health failed: ${flagged} file(s) flagged`);

  // The staging folder contains only corrected runtime WAVs and its reports.
  // Replace stale files as one completed set after every check passes.
  rmSync(FINAL_OUT, { recursive: true, force: true });
  renameSync(OUT, FINAL_OUT);
} finally {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(RAW, { recursive: true, force: true });
}
