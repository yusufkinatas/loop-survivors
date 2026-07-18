import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
if (!rootBlock) throw new Error('src/style.css has no :root token block');

const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)]
    .map((match) => [match[1], match[2].toLowerCase()]),
);

function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = linearChannel((value >> 16) & 0xff);
  const green = linearChannel((value >> 8) & 0xff);
  const blue = linearChannel(value & 0xff);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

const checks = [
  ['primary text on panel', 'ink', 'bg-2', 4.5],
  ['secondary functional text on panel', 'ink-dim', 'bg-2', 4.5],
  ['cyan focal text on panel', 'signal', 'bg-2', 4.5],
  ['warning/currency text on panel', 'warn', 'bg-2', 4.5],
  ['primary text on arena void', 'ink', 'bg-0', 4.5],
];

const failures = [];
for (const [label, foregroundId, backgroundId, minimum] of checks) {
  const foreground = tokens[foregroundId];
  const background = tokens[backgroundId];
  if (!foreground || !background) {
    failures.push(`${label}: missing --${!foreground ? foregroundId : backgroundId}`);
    continue;
  }
  const ratio = contrast(foreground, background);
  if (ratio + Number.EPSILON < minimum) {
    failures.push(`${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  }
}

for (const requiredSnippet of [
  'button:focus-visible',
  'image-rendering: pixelated',
  '--arcade-accent: #ff31ad',
  '--arcade-danger: #a83aff',
  '--arcade-attack: #ff8b18',
]) {
  if (!css.includes(requiredSnippet)) failures.push(`missing UI contract ${JSON.stringify(requiredSnippet)}`);
}

const meterIconBlock = css.match(/\.meter-icon\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
if (/transform\s*:\s*scale\s*\(/.test(meterIconBlock)) {
  failures.push('meter icons must render at native 1x without CSS scale transforms');
}
if (css.includes('background-size: 128px 128px')) {
  failures.push('UI atlas CSS still contains the obsolete 128x128 atlas assumption');
}

if (failures.length > 0) {
  throw new Error(`UI accessibility/style checks failed:\n- ${failures.join('\n- ')}`);
}

console.log(`UI contrast checks passed (${checks.length} functional color pairs, visible focus, pixel rendering, Arcade role colors)`);
