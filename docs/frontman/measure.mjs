// Measure every take in docs/frontman/audio/ and print the table.
//
//   node docs/frontman/measure.mjs
//
// Same instrument as docs/baseline/ and docs/palette-control/: ffmpeg's ebur128
// filter, integrated loudness and loudness range off the recorded file. LRA is
// the number the whole set exists for — #256's hard floor is that a run's
// loudness range must clear 0.6 LU, and every capture set before this one measured
// 0.3 to 0.7 LU at every single point.
//
// Developer tooling, run by hand. Nothing in the game talks to it.

import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const AUDIO = join(dirname(fileURLToPath(import.meta.url)), 'audio');

/** ffmpeg writes ebur128's summary to stderr; parse the three numbers out.
 *
 *  ONLY THE TEXT AFTER `Summary:`. ebur128 also prints a running `I: ... LRA: ...`
 *  line for every analysis frame, and the first of those is the silence at the head
 *  of the file — so a regex over the whole of stderr reports -70 LUFS and 0 LU for
 *  every take, which is exactly what the first version of this did. */
function parse(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = summary.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    lufs: num(/I:\s*(-?[\d.]+)\s*LUFS/),
    lra: num(/LRA:\s*(-?[\d.]+)\s*LU/),
    peak: num(/Peak:\s*(-?[\d.]+)\s*dBFS/),
  };
}

const files = (await readdir(AUDIO)).filter((f) => f.endsWith('.webm')).sort();
const rows = [];
for (const file of files) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', join(AUDIO, file),
    '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ]).catch((e) => ({ stderr: e.stderr ?? '' }));
  rows.push({ name: file.replace(/\.webm$/, ''), ...parse(stderr) });
}

const width = Math.max(...rows.map((r) => r.name.length), 7);
console.log(`| ${'capture'.padEnd(width)} | LUFS | LRA | true peak |`);
console.log(`|${'-'.repeat(width + 2)}|---|---|---|`);
for (const r of rows) {
  console.log(`| ${r.name.padEnd(width)} | ${r.lufs ?? '?'} | ${r.lra ?? '?'} | ${r.peak ?? '?'} |`);
}

const best = rows.reduce((a, b) => ((b.lra ?? 0) > (a.lra ?? 0) ? b : a), rows[0]);
console.log();
console.log(`widest loudness range: ${best.name} at ${best.lra} LU`);
console.log(`#256's hard floor is 0.6 LU — ${(best.lra ?? 0) > 0.6 ? 'CLEARED' : 'NOT CLEARED'}`);
