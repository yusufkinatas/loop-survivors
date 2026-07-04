// Batch worker: runs its share of simulations and prints one JSON line per
// finished run. Spawned by scripts/bot.ts, one per CPU core.

import { readFileSync } from 'node:fs';
import { simulateRun, type SimSpec } from '../src/bot/sim';

const { config, jobs } = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  config: string;
  jobs: SimSpec[];
};

for (const job of jobs) {
  const record = simulateRun(job, config);
  process.stdout.write(JSON.stringify(record) + '\n');
}
