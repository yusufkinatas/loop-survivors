// The autoplay bot's batch harness (docs/tools/autoplay-bot.md).
//
//   npm run bot -- --runs 50 --mover kiter --policy deep,wide
//   npm run bot -- --runs 100 --policy focus:each --label per-instrument
//
// Each policy spec becomes an arm of --runs runs; arms fan out across CPU
// cores. Results land in bot-results/<stamp>-<label>/ as results.jsonl plus
// a report.txt readable in ten seconds. Every run records the git commit it
// ran under and its seed; replay any seed in the browser with
//   ?replay=<seed>&mover=<mover>&policy=<policy>

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../src/audio/kits';
import type { RunRecord } from '../src/bot/sim';
import type { MoverName } from '../src/bot/movers';
import { RUN } from '../src/game/config';

interface Args {
  runs: number;
  mover: MoverName;
  policies: string[];
  seedBase: number;
  workers: number;
  label: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const policyArg = get('policy') ?? 'random';
  const policies = policyArg
    .split(',')
    .flatMap((p) => (p === 'focus:each' ? ROLES.map((r) => `focus:${r}`) : [p]));
  return {
    runs: Number(get('runs') ?? 20),
    mover: (get('mover') ?? 'kiter') as MoverName,
    policies,
    seedBase: Number(get('seed-base') ?? 1),
    workers: Number(get('workers') ?? Math.max(1, cpus().length - 2)),
    label: get('label') ?? 'batch',
  };
}

function gitFingerprint(): string {
  try {
    const rev = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${rev}-dirty` : rev;
  } catch {
    return 'unknown';
  }
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.floor(s.length / 2)];
}

interface Arm {
  key: string;
  records: RunRecord[];
  winRate: number;
}

function report(records: RunRecord[], args: Args, config: string): string {
  const arms = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = `${r.mover}/${r.policy}`;
    if (!arms.has(key)) arms.set(key, []);
    arms.get(key)!.push(r);
  }
  const armList: Arm[] = [...arms.entries()].map(([key, rs]) => ({
    key,
    records: rs,
    winRate: rs.filter((r) => r.victory).length / rs.length,
  }));

  const lines: string[] = [];
  lines.push(`batch: ${args.label}   ${records.length} runs   config ${config}`);
  lines.push('');
  const header = ['arm'.padEnd(18), 'runs', ' win%', 'median death', 'avg lv', 'damage share'];
  lines.push(header.join('  '));
  for (const arm of armList) {
    const deaths = arm.records.filter((r) => !r.victory).map((r) => r.timeS);
    const avgLv = arm.records.reduce((s, r) => s + r.level, 0) / arm.records.length;
    // mean damage share per role across the arm's runs
    const shares = new Map<string, number>();
    for (const r of arm.records) {
      const total = Object.values(r.damageByRole).reduce((s, v) => s + v, 0) || 1;
      for (const [role, dmg] of Object.entries(r.damageByRole)) {
        shares.set(role, (shares.get(role) ?? 0) + dmg / total / arm.records.length);
      }
    }
    const top = [...shares.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([role, s]) => `${role} ${Math.round(s * 100)}%`)
      .join(' ');
    lines.push(
      [
        arm.key.padEnd(18),
        String(arm.records.length).padStart(4),
        `${Math.round(arm.winRate * 100)}%`.padStart(5),
        (deaths.length > 0 ? fmtTime(median(deaths)) : '—').padStart(12),
        avgLv.toFixed(1).padStart(6),
        top,
      ].join('  '),
    );
  }

  // outliers: the strangest runs — wins in losing arms, early deaths in
  // winning arms — each replayable in the browser from its seed
  const outliers: { r: RunRecord; surprise: number }[] = [];
  for (const arm of armList) {
    for (const r of arm.records) {
      const surprise = r.victory
        ? 1 - arm.winRate
        : arm.winRate * (1 - r.timeS / RUN.durationS);
      if (surprise >= 0.5) outliers.push({ r, surprise });
    }
  }
  outliers.sort((a, b) => b.surprise - a.surprise);
  if (outliers.length > 0) {
    lines.push('');
    lines.push('outliers worth replaying:');
    for (const { r } of outliers.slice(0, 4)) {
      const what = r.victory ? 'victory' : `death ${fmtTime(r.timeS)}`;
      lines.push(
        `  seed ${r.seed} (${r.mover}/${r.policy}, ${what})` +
          `  ?replay=${r.seed}&mover=${r.mover}&policy=${encodeURIComponent(r.policy)}`,
      );
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = gitFingerprint();

  const jobs = args.policies.flatMap((policy, ai) =>
    Array.from({ length: args.runs }, (_, i) => ({
      seed: args.seedBase + ai * args.runs + i,
      mover: args.mover,
      policy,
    })),
  );

  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const outDir = join('bot-results', `${stamp}-${args.label}`);
  mkdirSync(outDir, { recursive: true });

  const workerPath = join(fileURLToPath(new URL('.', import.meta.url)), 'bot-worker.ts');
  const workerCount = Math.min(args.workers, jobs.length);
  const chunks: (typeof jobs)[] = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, i) => chunks[i % workerCount].push(job));

  console.log(
    `${jobs.length} runs (${args.policies.length} arm${args.policies.length > 1 ? 's' : ''} × ${args.runs})` +
      ` on ${workerCount} workers, config ${config}`,
  );

  const records: RunRecord[] = [];
  let done = 0;
  const t0 = Date.now();
  await Promise.all(
    chunks.map((chunk, wi) => {
      const jobFile = join(tmpdir(), `loop-bot-${process.pid}-${wi}.json`);
      writeFileSync(jobFile, JSON.stringify({ config, jobs: chunk }));
      return new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', workerPath, jobFile], {
          stdio: ['ignore', 'pipe', 'inherit'],
        });
        let buf = '';
        child.stdout.on('data', (data: Buffer) => {
          buf += data.toString();
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            records.push(JSON.parse(line) as RunRecord);
            done++;
            const rate = done / ((Date.now() - t0) / 1000);
            const eta = Math.round((jobs.length - done) / (rate || 1));
            process.stdout.write(`\r${done}/${jobs.length} runs  (~${eta}s left)   `);
          }
        });
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`worker ${wi} exited ${code}`)),
        );
      });
    }),
  );
  process.stdout.write('\n');

  writeFileSync(
    join(outDir, 'results.jsonl'),
    records.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  const rep = report(records, args, config);
  writeFileSync(join(outDir, 'report.txt'), rep + '\n');
  console.log('');
  console.log(rep);
  console.log('');
  console.log(`results: ${outDir}/`);
}

void main();
