// Fetch and process the palette's twelve voices (#266) from free sample
// libraries into public/samples/palette/.
//
// WHY THIS EXISTS. The palette's first pass synthesized all twelve voices from
// oscillators and was rejected outright by the designer's ear — "they sound
// fundamentally wrong to me". The diagnosis was that synthesis needs ears in the
// loop and the agent writing it has none: buffer levels and durations are
// measurable, "does this sound like a flute" is not. Recordings move the quality
// judgement out of that blind spot. A recording of a shaker is a shaker.
//
// MULTI-SAMPLING IS THE POINT. The engine pitches a voice by speeding one
// recording up or down, which is exactly what makes a single sampled melodic
// instrument fall apart across a run's octave and a half. Every pitched voice
// here therefore ships several recordings and the engine plays the nearest
// (Kit.zones, nearestZone in src/audio/kits.ts), so nothing is ever shifted more
// than a few semitones.
//
// Run:  node tools/fetch-palette-samples.mjs
// Needs: ffmpeg on PATH. Network access. Idempotent — re-running overwrites.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const OUT = 'public/samples/palette';
const TMP = '.palette-tmp';

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/master';
const PHIL = 'https://raw.githubusercontent.com/skratchdot/philharmonia-samples/gh-pages';
const SPI = 'https://raw.githubusercontent.com/alex-esc/sample-pi/f14596be37abf227bf77d198c9b0b60d9eb4dca9';

/** Note name -> MIDI number. The engine's note 0 is A3 = MIDI 57. */
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(s|#)?(-?\d+)$/.exec(name);
  if (!m) throw new Error(`bad note name: ${name}`);
  return SEMITONE[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
}
const A3 = midi('A3'); // 57

// Each voice: where its note 0 sounds, which recordings cover it, and how the
// file should be processed. `zeroAt` is the pitch the chart's note 0 should
// play at — it is what puts each voice in the right octave, and it mirrors the
// octave the synthesized first pass used so the arrangement is unchanged.
const VOICES = {
  // ---- Low anchor -------------------------------------------------------
  sub: {
    what: 'TR-808 sub bass — the round bottom, felt more than heard',
    // Already in the repo from the Track Lab cover work and never played by
    // anything. A sub is a near-pure tone, so it is the one pitched voice that
    // survives being stretched across the whole range from a single recording:
    // there are almost no overtones to smear.
    zeroAt: 'A1',
    trimMs: 900,
    local: 'public/samples/covers/misc/808-bass-sub.wav',
    single: true,
  },
  upright: {
    what: 'Double bass, pizzicato (plucked) — the palette\'s acoustic low voice',
    zeroAt: 'A1',
    trimMs: 900,
    pitches: ['A1', 'D2', 'G2', 'A2'],
    url: (n) => `${PHIL}/audio/double bass/double-bass_${n}_025_piano_pizz-normal.mp3`,
  },
  drone: {
    what: 'Cello, bowed and sustained — held, looped under everything',
    zeroAt: 'A2',
    trimMs: 3200,
    loop: true,
    pitches: ['A2', 'D3', 'G3'],
    url: (n) => `${PHIL}/audio/cello/cello_${n}_15_forte_arco-normal.mp3`,
  },
  // ---- Harmonic body ----------------------------------------------------
  rhodes: {
    what: 'FM electric piano (Yamaha TX81Z) — the bell-like keys seat',
    zeroAt: 'A3',
    trimMs: 1600,
    pitches: ['C3', 'C4', 'C5'],
    url: (n) => `${VCSL}/Electrophones/TX81Z/FM Piano/FMPiano_${n}_vl2.wav`,
  },
  organ: {
    what: 'Renaissance pipe organ, 8-foot stop — held and breathing',
    zeroAt: 'A3',
    trimMs: 1500,
    pitches: ['C3', 'E3', 'G#3', 'C4', 'E4', 'G#4'],
    url: (n) => `${VCSL}/Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/RenOrgan_8foot_Room_${n}_rr1.wav`,
  },
  chank: {
    what: 'Acoustic guitar, chopped short — the dry percussive scratch',
    zeroAt: 'A3',
    // Chopped hard: a chank is a muted chop, so the recording's long ring is
    // cut away and only the attack survives. This is the one voice where the
    // processing does more than clean up — it changes the articulation.
    trimMs: 220,
    pitches: ['A3', 'D4', 'G4', 'A4'],
    url: (n) => `${PHIL}/audio/guitar/guitar_${n}_very-long_piano_normal.mp3`,
  },
  // ---- Bright line ------------------------------------------------------
  bell: {
    what: 'Glockenspiel — bright metallic ping',
    zeroAt: 'A4',
    trimMs: 1800,
    // The `medium` dynamic covers G4 C5 G5 C6 G6 C7. G#6 exists only in `loud`,
    // and mixing dynamics inside one instrument makes a ladder that jumps in
    // volume as it climbs, which reads as a bug rather than as expression.
    pitches: ['C5', 'G5', 'C6', 'G6'],
    url: (n) => `${VCSL}/Idiophones/Struck Idiophones/Glockenspiel/glock_medium_${n}_01.wav`,
  },
  flute: {
    what: 'Concert flute, sustained — breathy held notes',
    zeroAt: 'A4',
    trimMs: 1400,
    pitches: ['A4', 'C5', 'E5', 'G5', 'C6'],
    url: (n) => `${PHIL}/audio/flute/flute_${n}_1_mezzo-forte_normal.mp3`,
  },
  // ---- Percussion -------------------------------------------------------
  shaker: {
    what: 'Small shaker, one hand stroke — the least machine-like voice here',
    unpitched: true,
    // A SINGLE stroke, not the "Double" articulation. This voice fires up to
    // twelve times a bar, so a two-stroke recording would double every one of
    // them into a blur. Trimmed hard for the same reason.
    trimMs: 160,
    single: `${VCSL}/Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerHighFaster_Down_rr1.wav`,
  },
  // ---- Texture ----------------------------------------------------------
  pad: {
    what: 'Glass hum — the soft held cushion',
    zeroAt: 'A3',
    trimMs: 3600,
    loop: true,
    // NOT ambi_choir, which was the obvious pick and is 1.57 s long. A bed that
    // short wraps twice a bar, and a choir's vibrato wrapping twice a bar reads
    // as a stutter rather than as a cushion. This one is 10 s at source, so the
    // loop is long enough that the wrap stops being a rhythmic event.
    single: `${SPI}/ambient/ambi_glass_hum.flac`,
  },
  air: {
    what: 'Vinyl hiss and crackle — room tone, no notes',
    unpitched: true,
    trimMs: 3600,
    loop: true,
    single: `${SPI}/vinyl/vinyl_hiss.flac`,
  },
  wind: {
    what: 'Pink-noise stream — the moving wash, already a seamless loop',
    unpitched: true,
    trimMs: 3600,
    loop: true,
    single: `${SPI}/noise loops/rand-stream-pink.wav`,
  },
};

// ---------------------------------------------------------------------------

/** Encode a URL's path for fetch. Sharps matter: `G#3` is a real note name in
 *  both libraries, and `#` is a URL fragment delimiter — left raw it silently
 *  truncates the path and every sharp sample 404s. Spaces are equally real
 *  (VCSL's folders are human-readable) and equally need encoding. */
function encode(url) {
  return encodeURI(url).replace(/#/g, '%23');
}

async function download(url, dest) {
  const res = await fetch(encode(url));
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Where each voice should sit in the mix, as RMS dBFS.
 *
 *  RMS, NOT LUFS, AND MEASURED RATHER THAN TARGETED. `loudnorm` alone put the
 *  pink-noise bed at -6 dB and the guitar chop at -9 while the glockenspiel
 *  landed at -24, all from the same target: perceptual loudness and RMS diverge
 *  hugely between a dense continuous noise and a short sparse transient, and
 *  single-pass loudnorm cannot close that. Left alone, `wind` would have been
 *  louder than the kick.
 *
 *  So every file is measured after processing and given a corrective gain. The
 *  numbers below are a mix seating, chosen against the control's own spread
 *  (kick -12, hat -29): the things that carry the track sit high, the beds that
 *  live underneath it sit low. Fixing this in the ASSET rather than in
 *  VOICE_MIX_GAIN is deliberate — the arp's comment in engine.ts records mix
 *  gain once being used to paper over a broken render, and hid it for months. */
const SEATING = {
  sub: -16, upright: -18, drone: -24,
  rhodes: -20, organ: -22, chank: -20,
  bell: -22, flute: -20,
  shaker: -26,
  pad: -28, air: -30, wind: -26,
};

/** Mean volume of a rendered file, in dBFS. */
async function meanVolume(file) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  if (!m) throw new Error(`could not measure ${file}`);
  return Number(m[1]);
}

/** Decode, strip leading silence, cap the length, fade the tail, normalise, and
 *  write mono 44.1 kHz 16-bit WAV. Same recipe docs/audio-sources.md documents
 *  for the drum palette, so every sample in the game is seated the same way,
 *  plus the measured seating pass above.
 *
 *  LOOPED beds skip the tail fade and the silence strip: a fade would dip the
 *  bed every time it wrapped, and a bed has no attack to trim to. */
async function process(src, dest, { trimMs, loop, role }) {
  const seconds = trimMs / 1000;
  const filters = loop
    ? [`atrim=start=0.15:duration=${seconds}`, 'afade=t=in:st=0:d=0.02']
    : [
        'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0',
        `atrim=duration=${seconds}`,
        `afade=t=out:st=${Math.max(0, seconds - 0.06)}:d=0.06`,
      ];
  const stage = `${dest}.stage.wav`;
  await run('ffmpeg', [
    '-v', 'error', '-y', '-i', src,
    '-af', filters.join(','),
    '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
    stage,
  ]);
  // Measure, then seat. A ceiling of -1 dBFS true peak keeps the loudest voices
  // off the limiter, which docs/baseline/ measured as already eating most of
  // this game's dynamic range.
  const gain = SEATING[role] - (await meanVolume(stage));
  await run('ffmpeg', [
    '-v', 'error', '-y', '-i', stage,
    '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891`,
    '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
    dest,
  ]);
  await rm(stage, { force: true });
}

const manifest = {};

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

for (const [role, spec] of Object.entries(VOICES)) {
  const dir = path.join(OUT, role);
  await mkdir(dir, { recursive: true });
  const entry = { what: spec.what, loop: !!spec.loop, samples: [] };

  if (spec.single) {
    const source = spec.local ?? spec.single;
    let raw = source;
    if (!spec.local) {
      raw = path.join(TMP, `${role}-raw`);
      await download(spec.single, raw);
    }
    await process(raw, path.join(dir, `${role}.wav`), { ...spec, role });
    entry.samples.push({ variant: role, rootSemitone: 0, source });
    console.log(`${role.padEnd(9)} 1 sample${spec.local ? ' (from repo)' : ''}`);
  } else {
    const zero = midi(spec.zeroAt);
    for (const note of spec.pitches) {
      const variant = note.replace('#', 's');
      const raw = path.join(TMP, `${role}-${variant}-raw`);
      await download(spec.url(note), raw);
      await process(raw, path.join(dir, `${variant}.wav`), { ...spec, role });
      entry.samples.push({
        variant,
        rootSemitone: midi(note) - zero,
        source: spec.url(note),
      });
    }
    console.log(
      `${role.padEnd(9)} ${spec.pitches.length} pitches, zero at ${spec.zeroAt} ` +
      `(${entry.samples.map((s) => s.rootSemitone).join(', ')})`,
    );
  }
  manifest[role] = entry;
}

// The manifest is emitted as TYPESCRIPT, not JSON, so the palette's shape is
// typechecked with the rest of the game and knip can see it. Provenance rides
// along: every sample records the exact URL it came from, which is the only
// thing that makes this reproducible later.
const TS_OUT = 'src/audio/palette-samples.ts';
const lines = [
  '// GENERATED by tools/fetch-palette-samples.mjs — do not edit by hand.',
  '//',
  "// The palette's twelve voices (#266), as real recordings. The first pass",
  '// synthesized them and was rejected by ear; see the tool for why, and for the',
  '// libraries these come from (VCSL, Philharmonia, Sample Pi — all free).',
  '//',
  '// `rootSemitone` is the pitch a recording actually sounds, relative to the',
  "// engine's note 0. The engine plays the nearest one and shifts only the",
  '// remainder (Kit.zones, nearestZone in kits.ts), which is what makes a',
  '// recorded melodic instrument survive a run\'s octave and a half.',
  '',
  "import type { Role } from './kits';",
  '',
  'interface PaletteSample {',
  '  variant: string;',
  '  rootSemitone: number;',
  '  /** Immutable source URL, or a repo path for samples already shipped. */',
  '  source: string;',
  '}',
  '',
  'export interface PaletteVoice {',
  '  /** What the recording is, in plain words. */',
  '  what: string;',
  '  /** Held voices loop until the next trigger chokes them. Texture only. */',
  '  loop: boolean;',
  '  samples: readonly PaletteSample[];',
  '}',
  '',
  '/** Where the processed files live, under public/. */',
  "export const PALETTE_SAMPLE_ROOT = '/samples/palette';",
  '',
  'export const PALETTE_SAMPLES: Readonly<Partial<Record<Role, PaletteVoice>>> = {',
];
for (const [role, entry] of Object.entries(manifest)) {
  lines.push(`  ${role}: {`);
  lines.push(`    what: ${JSON.stringify(entry.what)},`);
  lines.push(`    loop: ${entry.loop},`);
  lines.push('    samples: [');
  for (const s of entry.samples) {
    lines.push(
      `      { variant: ${JSON.stringify(s.variant)}, rootSemitone: ${s.rootSemitone}, ` +
      `source: ${JSON.stringify(s.source)} },`,
    );
  }
  lines.push('    ],');
  lines.push('  },');
}
lines.push('};', '');
await writeFile(TS_OUT, lines.join('\n'));

await rm(TMP, { recursive: true, force: true });
console.log(`\nwrote ${TS_OUT}`);
console.log(`note 0 = A3 = MIDI ${A3}`);
