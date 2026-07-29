// Sink for the baseline capture rig: the page POSTs each take here and it lands
// in docs/baseline/audio/, skipping the Downloads folder and its save prompts.
//
//   node docs/baseline/receiver.mjs
//   node docs/baseline/receiver.mjs --out docs/palette-control
//
// `--out` is a repo-relative directory to write into; it defaults to this one.
// A prototype branch takes its own comparable set and must not overwrite the
// reference the comparison is against.
//
// Developer tooling, run by hand. Nothing in the game talks to it.

import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf('--out');
const ROOT = outArg >= 0 && process.argv[outArg + 1]
  ? join(HERE, '..', '..', process.argv[outArg + 1])
  : HERE;
const AUDIO = join(ROOT, 'audio');
await mkdir(AUDIO, { recursive: true });

// Takes go in audio/; a run log is a document and belongs beside the README.
const dirFor = (name) => (name.endsWith('.md') ? ROOT : AUDIO);

createServer(async (req, res) => {
  // The page is served from :3200 and this listens on :3300, so every POST is
  // cross-origin and preflighted.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method !== 'POST') return res.writeHead(405).end();

  // basename, so a take name can never write outside the audio directory.
  const name = basename(decodeURIComponent((req.url ?? '/take').slice(1))) || 'take';
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  await writeFile(join(dirFor(name), name), body);
  console.log(`wrote ${name} (${(body.length / 1024).toFixed(0)} KB)`);
  res.writeHead(200).end('ok');
}).listen(3300, () => console.log(`receiver on :3300 -> ${AUDIO}`));
