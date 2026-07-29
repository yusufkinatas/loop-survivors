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
    what: 'TR-808 sub bass, an octave up — the round bottom',
    // Already in the repo from the Track Lab cover work and never played by
    // anything. A sub is a near-pure tone, so it is the one pitched voice that
    // survives being stretched from a single recording: almost no overtones to
    // smear.
    //
    // RAISED AN OCTAVE after the listening pass: "I don't think it's easy to
    // hear against the other voices ... making my headphones make a weird thin
    // sound, due to going too deep". Correct — an unaccompanied sine near 55 Hz
    // is below what a laptop speaker or most headphones reproduce at all, so it
    // arrives as cone excursion rather than as a note. `tune` moves the whole
    // voice up twelve semitones into a register that actually plays back.
    trimMs: 900,
    tune: 12,
    local: 'public/samples/covers/misc/808-bass-sub.wav',
    single: true,
  },
  upright: {
    what: 'Double bass, pizzicato (plucked) — the palette\'s acoustic low voice',
    zeroAt: 'A1',
    // SHORTER, AND FADED ACROSS THE BACK HALF. The head noise was fixed last
    // pass; the listening pass then found the rest of it: "on its tier 1, the
    // first note has some white-noise in it ... closer to its end." A plucked
    // bass note is over well inside 900 ms, so the back of that window was
    // holding nothing but the room — audible, and enough to muddy the mix
    // whenever this voice is in the build. 650 ms with a long fade lands on the
    // note and leaves the room behind.
    trimMs: 650,
    fadeFrac: 0.45,
    // -42 dB, not the default -60. The listening pass caught "a kinda
    // whitenoise on the first note ... I can almost hear the rawness of the
    // recording", and it measured: the A1 file's first 25 ms held -28 dB of
    // room noise before the pluck. The Philharmonia noise floor sits above
    // -60 dB, so the default threshold heard it as signal and kept it. A1 is
    // note 0 — the most-played note in the voice — which is why it was the
    // first note that sounded wrong.
    silenceDb: -42,
    pitches: ['A1', 'D2', 'G2', 'A2'],
    phil: { instrument: 'double bass', articulation: 'pizz-normal', dynamics: ['piano', 'mezzo-forte', 'forte'] },
  },
  drone: {
    what: 'Double bass, bowed as quietly as the player can — the floor under everything',
    // WAS a forte cello, and the listening pass was blunt: "it sounds like the
    // most important cello solo right now ... it does not feel ambient". Both
    // halves are fixed here. Down an octave and a half to the lowest bowed
    // instrument there is, which sits under the band instead of on top of it,
    // and at `molto-pianissimo` — the quietest dynamic the library recorded —
    // so the player is barely touching the string. A drone should be noticed
    // only when it stops.
    zeroAt: 'A1',
    trimMs: 2600,
    silenceDb: -42,
    pitches: ['A1', 'D2', 'G2'],
    phil: { instrument: 'double bass', articulation: 'arco-normal', dynamics: ['pianissimo', 'piano', 'mezzo-piano'] },
  },
  // ---- Harmonic body ----------------------------------------------------
  rhodes: {
    what: 'FM electric piano (Yamaha TX81Z) — the bell-like keys seat',
    zeroAt: 'A3',
    // SHORTENED from 1.6 s. "I think I hear the notes overlapping due to
    // sustain / length of the notes ... sounds overwhelming when maxxed out" —
    // measured, that is right: the top rung fires four a bar, so a 1.6 s note
    // had six of itself ringing at once. The role also chokes now (ROLE_META),
    // so a new note cuts the last. Timbre is unchanged; it was liked.
    trimMs: 800,
    pitches: ['C3', 'C4', 'C5'],
    url: (n) => `${VCSL}/Electrophones/TX81Z/FM Piano/FMPiano_${n}_vl2.wav`,
  },
  organ: {
    what: 'Pipe organ, quiet manual — held and breathing',
    // WAS a Renaissance organ ("does not sound nice, needs to change"). This is
    // a different instrument entirely rather than a different stop on the same
    // one: a full church pipe organ, on its quiet manual, which is rounder and
    // far less reedy. It also has better pitch coverage — C, D#, F# and A in
    // every octave — so nothing shifts more than about two semitones.
    // The FULL manual, not the quiet one — this is a played part and needs
    // presence. The quiet registration goes to the pad bed instead, where being
    // barely there is the job.
    zeroAt: 'A3',
    trimMs: 1200,
    pitches: ['C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4'],
    url: (n) => `${VCSL}/Aerophones/Edge-blown Aerophones/Pipe Organ/Loud/Rode_Man3Open_${n}.wav`,
  },
  chank: {
    what: 'Acoustic guitar, chopped short — the dry percussive scratch',
    zeroAt: 'A3',
    // LONGER, AND FADED PROPERLY. "chank has a weird noise on it's audio file
    // at the end ... I can hear a small dot at the end of the chank notes."
    // Measured: at the old 220 ms cut the note was still at -21 dB, so a 60 ms
    // fade was slamming a ringing string shut. That is not a chank, it is an
    // edit. 340 ms with a fade over the whole back half decays instead of
    // stopping. Timbre was liked and is untouched.
    trimMs: 340,
    fadeFrac: 0.55,
    silenceDb: -42,
    pitches: ['A3', 'D4', 'G4', 'A4'],
    phil: { instrument: 'guitar', articulation: 'normal', dynamics: ['piano', 'forte'] },
  },
  // ---- Bright line ------------------------------------------------------
  bell: {
    what: 'Marimba — warm wooden mallet, short and round',
    // WAS a glockenspiel: "sounds annoying and each scratching, I don't like
    // the timbre, and it's not easy on ears. and it has a long sustain that
    // resonates inside my head." Every one of those is a property of struck
    // metal — bright inharmonic partials and a very long ring. A marimba is the
    // opposite instrument: struck wood, warm, round, and it stops quickly. It
    // is the "smooth xylophone" end of what was asked for.
    // zeroAt A3, not A4. The bell's chart plays 12-22 semitones above its root,
    // and the marimba's medium-dynamic recordings stop at C6 — at A4 those notes
    // would all have crowded onto the top sample and shifted up to seven
    // semitones. An octave down they land across G4/B4/F5 with two semitones of
    // shift at worst.
    //
    // THE "LASER" ON THE THIRD NOTE WAS THIS TOOL'S FAULT, NOT THE TAKE'S.
    // "the 3rd of them has a weird noise in it, sounds like a weird laser-audio
    // on the background." That note plays F5, and the raw library levels are:
    //
    //     C4 -48.2   G4 -52.3   B4 -48.6   F5 -64.5   C6 -61.4  (mean dB)
    //
    // F5 is sixteen decibels under C4. Seating every file to the same target
    // individually therefore handed F5 sixteen decibels more gain than its
    // neighbours and lifted its room noise with it. Fixed in `seatVoice` below,
    // which now gains a voice as a WHOLE. (The soft dynamic was tried first and
    // is unusable: it peaks at -68 dB.)
    zeroAt: 'A3',
    trimMs: 900,
    pitches: ['C4', 'G4', 'B4', 'F5', 'C6'],
    url: (n) => `${VCSL}/Idiophones/Struck Idiophones/Marimba/Marimba_hit_Outrigger_${n}_med_01.wav`,
  },
  flute: {
    what: 'Concert flute, short notes — breathy but not held',
    // "flute's timbre is good, but I think I want shorter notes for flute to
    // sound more interesting instead of these sustained longer notes." Cut from
    // 1.4 s to 550 ms, so the phrasing reads as a line being played rather than
    // as a note being leaned on.
    zeroAt: 'A4',
    trimMs: 550,
    pitches: ['A4', 'C5', 'E5', 'G5', 'C6'],
    phil: { instrument: 'flute', articulation: 'normal', dynamics: ['mezzo-forte', 'piano', 'forte'] },
  },
  // ---- Percussion -------------------------------------------------------
  shaker: {
    what: 'Small shaker, one hand stroke — the least machine-like voice here',
    unpitched: true,
    // A SINGLE stroke, not the "Double" articulation. This voice fires up to
    // twelve times a bar, so a two-stroke recording would double every one of
    // them into a blur. Approved by ear on the first pass; unchanged.
    trimMs: 160,
    single: `${VCSL}/Idiophones/Struck Idiophones/Shaker, Small/Mid_ShakerHighFaster_Down_rr1.wav`,
  },
  // ---- Texture ----------------------------------------------------------
  //
  // TWO VOICES, NOT THREE. `wind` was cut: asked what kind of track has a
  // constant wind sound, the honest answer is none — wind and noise sweeps are
  // TRANSITION devices, the same category as the riser this palette already
  // banned for meaning "something is about to change" and then never changing.
  // It was justified by its weapon rather than by its sound, which is backwards
  // from the rule the palette runs on.
  //
  // Both survivors are BEDS: continuous, seamless, and never triggered by the
  // sequencer. See makeSeamless below and Kit.bed in src/audio/kits.ts.
  pad: {
    what: 'Pipe organ, quiet manual, held — the warm cushion underneath',
    // WAS a "glass hum": "the current pad is almost creepy, I don't like how it
    // sounds at all." Glass and metal textures read as unsettling because their
    // partials do not line up; warmth comes from instruments whose overtones do.
    //
    // A soft bowed cello was the next attempt and could not work MECHANICALLY:
    // the Philharmonia notes top out at 1.5 seconds, which after crossfading
    // left a 2.1-second loop — short enough to wrap twice a bar, which is the
    // stutter this voice was already rejected for. A bed needs a long source.
    //
    // A pipe organ note runs twelve seconds and has NO VIBRATO, which is the
    // property that actually matters here: there is no wobble to line up, so a
    // long crossfade leaves nothing for the ear to catch. Same instrument as the
    // `organ` voice above but its softest registration, and it sits sixteen
    // decibels below it, so the two never read as the same thing.
    zeroAt: 'A3',
    bed: true,
    loopSec: 8,
    crossfadeSec: 1.5,
    single: `${VCSL}/Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/NT5_Man3Quiet_A3_rr1.wav`,
  },
  air: {
    what: 'Vinyl crackle, rolled off — lo-fi room tone, no notes',
    // ROLLED OFF HARD AND DROPPED SIX MORE DECIBELS. "air is too strong, and it
    // does not sound like the lo-fi ambient sound some lo-fi tracks have. it's
    // too noisy / annoying."
    //
    // Both halves of that are one cause. Raw vinyl hiss is broadband, and
    // broadband noise sitting on top of a mix reads as a fault in the equipment.
    // What lo-fi records actually carry is that same noise heard through a dull
    // playback chain — the top end gone, mostly crackle and warmth left. Two
    // cascaded low-passes at 2.8 kHz is that chain, and it is the difference
    // between "an old record" and "a bad signal".
    unpitched: true,
    bed: true,
    // 5 s of loop plus two 1 s crossfade margins fits the 8 s source. The loop
    // needs the pre-roll AND the tail, so the window costs loopSec + 2x.
    loopSec: 5,
    crossfadeSec: 1,
    lowpassHz: 2800,
    single: `${SPI}/vinyl/vinyl_hiss.flac`,
  },
};

// ---------------------------------------------------------------------------

/** Philharmonia filenames are `instrument_pitch_duration_dynamic_articulation`,
 *  and WHICH COMBINATIONS EXIST IS NOT UNIFORM: the double bass has a 15-second
 *  forte and only a 1-second molto-pianissimo, the cello has a 15-second
 *  mezzo-piano and no 15-second pianissimo. Hand-writing URLs against that
 *  meant a 404 per wrong guess, twice in a row.
 *
 *  So the index is fetched once and the file is RESOLVED: pick the first
 *  dynamic that exists at this pitch, preferring the quietest the caller asked
 *  for, and take the longest duration available for it. */
let philIndex = null;
async function philFiles() {
  if (philIndex) return philIndex;
  const res = await fetch(
    'https://api.github.com/repos/skratchdot/philharmonia-samples/git/trees/gh-pages?recursive=1',
  );
  if (!res.ok) throw new Error(`philharmonia index: ${res.status}`);
  const tree = await res.json();
  philIndex = tree.tree.map((t) => t.path).filter((p) => p.endsWith('.mp3'));
  return philIndex;
}

async function resolvePhil({ instrument, articulation, dynamics }, pitch) {
  const files = await philFiles();
  const slug = instrument.replace(/ /g, '-');
  const candidates = files.filter((p) => {
    const name = p.split('/').pop();
    return p.includes(`/${instrument}/`) && name.startsWith(`${slug}_${pitch}_`)
      && name.endsWith(`_${articulation}.mp3`);
  });
  for (const dynamic of dynamics) {
    const matches = candidates.filter((p) => p.split('/').pop().split('_')[3] === dynamic);
    if (!matches.length) continue;
    // Longest recording wins: sustained voices need length, and a short one can
    // always be trimmed further.
    const best = matches.sort((a, b) => {
      const dur = (p) => Number(p.split('/').pop().split('_')[2].replace(/^0/, '0.')) || 0;
      return dur(b) - dur(a);
    })[0];
    return `${PHIL}/${best}`;
  }
  throw new Error(`philharmonia: no ${instrument} ${pitch} in ${dynamics.join('/')}`);
}

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
  sub: -17, upright: -18, drone: -24,
  rhodes: -20, organ: -22, chank: -20,
  bell: -21, flute: -20,
  shaker: -26,
  // THE BEDS SIT FAR LOWER THAN EVERYTHING ELSE, and much lower than the first
  // pass put them. "both pad / air / wind sounds too strong with the rest of
  // the sounds. they don't feel like a low-prio aura / ambient effect to me ...
  // It will be really tiring when you have that throughout your whole run."
  // A bed plays for the entire run without stopping, so it has to sit under the
  // point where you notice it — a good bed is only audible when it is switched
  // off. -40 is roughly a tenth the loudness of the kick.
  pad: -38, air: -46,
};

/** Mean volume of a rendered file, in dBFS. Returns null for digital silence,
 *  which `volumedetect` reports as `-inf` and no arithmetic should swallow. */
async function meanVolume(file) {
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  if (!m) throw new Error(`could not measure ${file}`);
  return m[1] === '-inf' ? null : Number(m[1]);
}

/** How far a single recording may be pushed away from its voice's own gain, in
 *  dB. Some balancing between pitches is wanted — libraries are not perfectly
 *  even — but past a few decibels it stops being balance and starts being noise
 *  amplification. */
const TRIM_LIMIT_DB = 5;

/** Seat a whole voice at once.
 *
 *  ONE GAIN PER INSTRUMENT, NOT PER FILE, and that distinction is the entire
 *  point. The first version normalised every recording to the same target on its
 *  own, which sounds tidy and is actively harmful: a library's quiet notes get
 *  the most gain, so their ROOM NOISE gets the most gain too. The marimba's F5
 *  sits sixteen decibels under its C4, was handed sixteen decibels more gain,
 *  and arrived with an audible artefact on exactly that one note — which is what
 *  the listening pass heard and what band analysis could not find, because a
 *  uniform boost cancels out of every ratio you might measure.
 *
 *  So the voice is gained as a whole, referenced to its MEDIAN recording, and
 *  each file may then be trimmed by at most TRIM_LIMIT_DB to even out the worst
 *  library inconsistency. Natural level differences across an instrument's range
 *  survive; noise floors are never lifted above their neighbours'. */
async function seatVoice(role, staged) {
  const measured = [];
  for (const file of staged) measured.push(await meanVolume(file));
  const usable = measured.filter((v) => v !== null).sort((a, b) => a - b);
  if (!usable.length) throw new Error(`${role}: every file is silent`);
  const median = usable[Math.floor(usable.length / 2)];
  const voiceGain = SEATING[role] - median;
  const spread = usable[usable.length - 1] - usable[0];
  for (let i = 0; i < staged.length; i++) {
    const own = measured[i];
    const trim = own === null
      ? 0
      : Math.max(-TRIM_LIMIT_DB, Math.min(TRIM_LIMIT_DB, median - own));
    const dest = staged[i].replace(/\.stage\.wav$/, '');
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', staged[i],
      '-af', `volume=${(voiceGain + trim).toFixed(2)}dB,alimiter=limit=0.891`,
      '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
      dest,
    ]);
    await rm(staged[i], { force: true });
  }
  return { voiceGain, spread };
}

/** Decode a file to mono 44.1 kHz float samples. */
async function pcm(file) {
  const { stdout } = await run(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 28 },
  );
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4));
}

/** Write mono 44.1 kHz 16-bit PCM WAV. */
async function writeWav(file, samples) {
  const sr = 44100;
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([header, data]));
}

const BLOCK = 2205; // 50 ms

/** Per-block RMS, used to find the steady part of a recording. */
function envelope(a) {
  const out = [];
  for (let i = 0; i + BLOCK <= a.length; i += BLOCK) {
    let sum = 0;
    for (let j = 0; j < BLOCK; j++) sum += a[i + j] * a[i + j];
    out.push(Math.sqrt(sum / BLOCK));
  }
  return out;
}

/** Build a genuinely seamless loop.
 *
 *  THE FIRST ATTEMPT AT THIS WAS NOT SEAMLESS AND THE MEASUREMENT SAID SO. It
 *  trimmed from a fixed 0.4 s offset and crossfaded the tail against the head,
 *  which sounds right and is not: a pipe organ pipe is still SPEAKING at 0.4 s,
 *  so the window captured the attack. The produced pad measured -61 dB across
 *  its first 5 ms and -37 dB across its last, with a wrap discontinuity sixteen
 *  times a typical sample step. Every loop slammed from full level back to
 *  near-silence — which is exactly the "crunch / noise during the looping" the
 *  listening pass reported.
 *
 *  Two things fix it, and both need real sample access rather than a filter
 *  string, which is why this is JavaScript now.
 *
 *  1. FIND THE STEADY PART. Scan the block envelope for the window whose level
 *     varies least, so the loop is cut from where the recording is holding
 *     rather than from where it is starting or dying.
 *
 *  2. CROSSFADE AGAINST THE PRE-ROLL, not against the head. The last X samples
 *     dissolve into the X samples immediately BEFORE the loop point, so the
 *     final sample is adjacent to the first one in the original recording. The
 *     wrap is then continuous by construction rather than by hope.
 *
 *         source  ..[pre][= = = = = the loop = = = = =].....
 *                    \____ dissolved into the loop's tail
 *
 *  Equal-power curves, because the two sides are uncorrelated for a noise bed
 *  and a linear fade would dip through the join. */
async function makeSeamless(src, dest, { loopSec, crossfadeSec }) {
  const a = await pcm(src);
  const sr = 44100;
  const len = Math.floor(loopSec * sr);
  const x = Math.floor(crossfadeSec * sr);
  if (a.length < len + 2 * x) {
    throw new Error(`${src}: ${(a.length / sr).toFixed(1)}s is too short for a ${loopSec}s loop`);
  }

  // 1. Steadiest window, searched on the envelope. The candidate start must
  // leave room for the pre-roll, and must be loud enough that we do not settle
  // on a stable patch of silence.
  const env = envelope(a);
  const peak = Math.max(...env);
  const needBlocks = Math.ceil((len + x) / BLOCK);
  const firstBlock = Math.ceil(x / BLOCK);
  let bestBlock = firstBlock;
  let bestScore = Infinity;
  for (let b = firstBlock; b + needBlocks < env.length; b++) {
    const win = env.slice(b, b + needBlocks);
    const mean = win.reduce((s, v) => s + v, 0) / win.length;
    if (mean < peak * 0.35) continue; // not the sustaining part
    const varr = win.reduce((s, v) => s + (v - mean) ** 2, 0) / win.length;
    const score = Math.sqrt(varr) / mean; // coefficient of variation
    if (score < bestScore) { bestScore = score; bestBlock = b; }
  }
  const start = bestBlock * BLOCK;

  // 2. Copy the loop, then dissolve its tail into the pre-roll.
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = a[start + i];
  for (let j = 0; j < x; j++) {
    const t = (j + 1) / x;
    const wOut = Math.cos((t * Math.PI) / 2);
    const wIn = Math.sin((t * Math.PI) / 2);
    out[len - x + j] = out[len - x + j] * wOut + a[start - x + j] * wIn;
  }

  // 3. Verify, loudly. A bed that fails this is worse than no bed at all, and
  // the last one shipped because nothing checked it.
  const rms = (from, n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += out[from + i] ** 2;
    return 20 * Math.log10(Math.sqrt(s / n) + 1e-12);
  };
  const headDb = rms(0, sr / 10);
  const tailDb = rms(len - sr / 10, sr / 10);
  let step = 0;
  for (let i = 1; i < Math.min(len, sr); i++) step += Math.abs(out[i] - out[i - 1]);
  step /= Math.min(len, sr) - 1;
  const jump = Math.abs(out[len - 1] - out[0]);
  const drift = Math.abs(headDb - tailDb);
  if (drift > 3 || jump > step * 4) {
    console.warn(
      `  ! ${dest}: seam looks wrong — head ${headDb.toFixed(1)} dB, tail ${tailDb.toFixed(1)} dB, ` +
      `jump ${jump.toFixed(5)} vs step ${step.toFixed(5)}`,
    );
  } else {
    console.log(
      `  loop ok: head/tail within ${drift.toFixed(1)} dB, ` +
      `seam jump ${(jump / step).toFixed(2)}x a sample step, cut at ${(start / sr).toFixed(1)}s`,
    );
  }
  await writeWav(dest, out);
}

async function process(src, dest, spec) {
  const { trimMs, bed, role, silenceDb = -60, fadeFrac, lowpassHz } = spec;
  const seconds = trimMs / 1000;
  const stage = `${dest}.stage.wav`;
  if (bed) {
    await makeSeamless(src, stage, spec);
  } else {
    // `fadeFrac` fades over a fraction of the whole sample rather than a fixed
    // tail. A short percussive voice cut mid-ring needs most of its length to
    // get out of the way (chank); a note that has already decayed needs almost
    // none.
    const fade = fadeFrac ? seconds * fadeFrac : Math.min(0.06, seconds * 0.2);
    const filters = [
      `silenceremove=start_periods=1:start_threshold=${silenceDb}dB:start_silence=0`,
      `atrim=duration=${seconds}`,
      `afade=t=out:st=${Math.max(0, seconds - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
    ];
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', src,
      '-af', filters.join(','),
      '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le',
      stage,
    ]);
  }
  if (lowpassHz) {
    const rolled = `${dest}.lp.wav`;
    await run('ffmpeg', ['-v', 'error', '-y', '-i', stage,
      '-af', `lowpass=f=${lowpassHz}:poles=2,lowpass=f=${lowpassHz}:poles=2`,
      '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', rolled]);
    await rm(stage, { force: true });
    await run('ffmpeg', ['-v', 'error', '-y', '-i', rolled, '-c:a', 'pcm_s16le', stage]);
    await rm(rolled, { force: true });
  }
  // Seating is deliberately NOT done here: it happens once per voice, over all
  // that voice's recordings together. See seatVoice.
  return stage;
}

const manifest = {};

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

for (const [role, spec] of Object.entries(VOICES)) {
  const dir = path.join(OUT, role);
  await mkdir(dir, { recursive: true });
  const entry = { what: spec.what, bed: !!spec.bed, tune: spec.tune ?? 0, samples: [] };
  const staged = [];

  if (spec.single) {
    const source = spec.local ?? spec.single;
    let raw = source;
    if (!spec.local) {
      raw = path.join(TMP, `${role}-raw`);
      await download(spec.single, raw);
    }
    staged.push(await process(raw, path.join(dir, `${role}.wav`), { ...spec, role }));
    entry.samples.push({ variant: role, rootSemitone: 0, source });
    console.log(`${role.padEnd(9)} 1 sample${spec.local ? ' (from repo)' : ''}`);
  } else {
    const zero = midi(spec.zeroAt);
    for (const note of spec.pitches) {
      const variant = note.replace('#', 's');
      const raw = path.join(TMP, `${role}-${variant}-raw`);
      const url = spec.phil ? await resolvePhil(spec.phil, note) : spec.url(note);
      await download(url, raw);
      staged.push(await process(raw, path.join(dir, `${variant}.wav`), { ...spec, role }));
      entry.samples.push({
        variant,
        rootSemitone: midi(note) - zero,
        source: url,
      });
    }
    console.log(
      `${role.padEnd(9)} ${spec.pitches.length} pitches, zero at ${spec.zeroAt} ` +
      `(${entry.samples.map((s) => s.rootSemitone).join(', ')})`,
    );
  }
  const { voiceGain, spread } = await seatVoice(role, staged);
  if (spread > 8) {
    console.log(`  ${role}: library spread ${spread.toFixed(0)} dB across pitches, gained as one voice`);
  }
  void voiceGain;
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
  '  /** A BED: a continuous background sound the sequencer never triggers.',
  '   *  Started when the weapon is owned, stopped when it is not, and looped',
  '   *  seamlessly in between. Texture seat only. */',
  '  bed: boolean;',
  '  /** Semitones the whole voice is transposed by. */',
  '  tune: number;',
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
  lines.push(`    bed: ${entry.bed},`);
  lines.push(`    tune: ${entry.tune},`);
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
