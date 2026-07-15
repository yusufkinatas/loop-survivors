// Bounded browser regression for the Living Lab. Chrome is controlled through
// its DevTools protocol instead of --dump-dom: this app intentionally keeps
// animation and audio timers alive, so waiting for the process to become idle
// can hang forever even when the page is healthy.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Could not reserve a local test port');
  return port;
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(1_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit'), delay(1_000)]);
  }
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    socket.on('message', (data) => this.onMessage(data.toString()));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DevTools WebSocket open timed out')), 8_000);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', () => {
        clearTimeout(timer);
        reject(new Error('DevTools WebSocket failed to open'));
      });
    });
    return new CdpClient(socket);
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      this.errors.push(detail.exception?.description ?? detail.text ?? 'browser exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      this.errors.push(
        message.params.args
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(' '),
      );
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(label, client, expression, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastValue = await client.evaluate(expression);
      if (predicate(lastValue)) return lastValue;
    } catch (error) {
      // Navigation destroys the old execution context. The next poll uses the
      // replacement context; other failures are included if the deadline wins.
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `${label} timed out; last value ${JSON.stringify(lastValue)}` +
      (lastError ? `; last error ${lastError.message}` : ''),
  );
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const preview = process.argv.includes('--preview');
const chromeBinary =
  process.env.CHROME_BIN ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');
const profile = await mkdtemp(join(tmpdir(), 'loop-lab-check-'));
let vite;
let chrome;
let client;
let serverLog = '';
let chromeLog = '';

try {
  vite = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      ...(preview ? ['preview'] : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  vite.stdout.on('data', (chunk) => (serverLog += chunk));
  vite.stderr.on('data', (chunk) => (serverLog += chunk));

  const serverDeadline = Date.now() + 15_000;
  while (Date.now() < serverDeadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited early:\n${serverLog}`);
    try {
      const response = await fetch(base);
      if (response.ok) break;
    } catch {
      // Starting.
    }
    await delay(100);
  }
  try {
    const response = await fetch(base);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Vite did not become ready: ${error.message}\n${serverLog}`);
  }

  chrome = spawn(
    chromeBinary,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      '--remote-debugging-port=0',
      '--window-size=1440,900',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  chrome.stdout.on('data', (chunk) => (chromeLog += chunk));
  chrome.stderr.on('data', (chunk) => (chromeLog += chunk));

  let devtoolsPort = 0;
  const chromeDeadline = Date.now() + 15_000;
  while (Date.now() < chromeDeadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early:\n${chromeLog}`);
    try {
      const [line] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
      devtoolsPort = Number(line);
      if (devtoolsPort) break;
    } catch {
      // Chrome has not written the endpoint yet.
    }
    await delay(100);
  }
  if (!devtoolsPort) throw new Error(`Chrome DevTools did not become ready:\n${chromeLog}`);

  const targets = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`).then((r) => r.json());
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome did not expose a page target');
  client = await CdpClient.connect(page.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: `${base}/?lab=auto` });

  const lab = await waitFor(
    'Living Lab auto-drive',
    client,
    `(() => {
      const marker = document.querySelector('[data-lab-autodrive-state]');
      return {
        state: marker?.getAttribute('data-lab-autodrive-state') ?? 'missing',
        text: marker?.textContent ?? '',
      };
    })()`,
    (value) => value?.state === 'passed' || value?.state === 'failed',
  );
  if (lab.state !== 'passed' || lab.text !== 'PASS · 4 rooms · globals restored') {
    throw new Error(`Living Lab auto-drive failed: ${lab.text || lab.state}`);
  }
  if (client.errors.length > 0) {
    throw new Error(`Living Lab browser errors:\n${client.errors.join('\n')}`);
  }

  // Repeat the real auto-drive at the locked narrow layout. This catches
  // fixture controls or readouts that only work at desktop width.
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send('Page.navigate', { url: `${base}/?lab=auto&viewport=mobile` });
  const mobileLab = await waitFor(
    'mobile Living Lab auto-drive',
    client,
    `(() => {
      const marker = document.querySelector('[data-lab-autodrive-state]');
      return {
        state: marker?.getAttribute('data-lab-autodrive-state') ?? 'missing',
        text: marker?.textContent ?? '',
      };
    })()`,
    (value) => value?.state === 'passed' || value?.state === 'failed',
  );
  if (mobileLab.state !== 'passed') {
    throw new Error(`Mobile Living Lab auto-drive failed: ${mobileLab.text || mobileLab.state}`);
  }
  const mobileLayout = await client.evaluate(`(() => {
    const root = document.querySelector('[data-lab-ready]');
    const rect = root?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      rootLeft: rect?.left ?? -1,
      rootRight: rect?.right ?? -1,
    };
  })()`);
  if (
    mobileLayout.width !== 390 || mobileLayout.height !== 844 ||
    mobileLayout.scrollWidth > 391 || mobileLayout.rootLeft < -1 || mobileLayout.rootRight > 391
  ) {
    throw new Error(`Mobile Living Lab layout regression: ${JSON.stringify(mobileLayout)}`);
  }
  if (client.errors.length > 0) {
    throw new Error(`Mobile Living Lab browser errors:\n${client.errors.join('\n')}`);
  }

  // Exercise the real exit path. It restores/disposes the shared context and
  // reloads the ordinary game; a failed restore marks the resulting URL.
  await client.evaluate('window.loop.lab.exit(); true');
  const normal = await waitFor(
    'normal game boot after lab exit',
    client,
    `(() => ({
      heading: document.querySelector('.start-btn')?.closest('.screen')?.querySelector('h1')?.textContent ?? '',
      start: Boolean(document.querySelector('.start-btn')),
      labEntryPresent: Boolean(document.querySelector('.start-lab-btn')),
      labEntryVisible: (() => {
        const button = document.querySelector('.start-lab-btn');
        return Boolean(button && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
      })(),
      lab: Boolean(document.querySelector('[data-lab-ready]')),
      restoreFailed: new URLSearchParams(location.search).has('labRestoreFailed'),
    }))()`,
    (value) => value?.start === true,
  );
  if (
    normal.heading !== 'Loop Survivors' ||
    !normal.labEntryPresent ||
    normal.labEntryVisible ||
    normal.lab ||
    normal.restoreFailed
  ) {
    throw new Error(`Normal boot regression after lab exit: ${JSON.stringify(normal)}`);
  }
  if (client.errors.length > 0) {
    throw new Error(`Browser errors after normal boot:\n${client.errors.join('\n')}`);
  }

  await client.send('Emulation.clearDeviceMetricsOverride');

  await client.evaluate("document.querySelector('.start-dev-toggle').click(); true");
  await waitFor(
    'expanded Living Lab menu entry',
    client,
    `(() => {
      const button = document.querySelector('.start-lab-btn');
      return Boolean(button && button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height > 0);
    })()`,
    (value) => value === true,
  );
  await client.evaluate("document.querySelector('.start-lab-btn').click(); true");
  await waitFor(
    'public Living Lab menu entry',
    client,
    `(() => ({
      ready: Boolean(document.querySelector('[data-lab-ready]')),
      room: document.querySelector('[data-lab-room]')?.getAttribute('data-lab-room') ?? '',
    }))()`,
    (value) => value?.ready === true && value?.room === 'hub',
  );

  // Re-enter the ordinary shell and exercise the evolved-audio rehearsal
  // controls. This is structural browser coverage; the developer's ear still
  // owns whether the resulting legal mixes sound good.
  await client.evaluate('window.loop.lab.exit(); true');
  await waitFor(
    'normal game boot before rehearsal check',
    client,
    'Boolean(document.querySelector(".start-btn"))',
    (value) => value === true,
  );
  await client.evaluate("document.querySelector('.start-dev-toggle').click(); true");
  await client.evaluate("document.querySelector('.start-rehearsal-btn').click(); true");
  const rehearsal = await waitFor(
    'rehearsal evolved-audio controls',
    client,
    `(() => ({
      ready: Boolean(document.querySelector('.evolved-audition')),
      bands: document.querySelectorAll('[data-rehearsal-band]').length,
      baseSolo: document.querySelectorAll('[data-rehearsal-solo="base"]').length,
      evolvedSolo: document.querySelectorAll('[data-rehearsal-solo="evolved"]').length,
    }))()`,
    (value) => value?.ready === true,
  );
  if (rehearsal.bands !== 4 || rehearsal.baseSolo !== 9 || rehearsal.evolvedSolo !== 9) {
    throw new Error(`Rehearsal evolved controls drift: ${JSON.stringify(rehearsal)}`);
  }
  const rehearsalState = await client.evaluate(`(() => {
    const state = () => ({
      enabled: document.querySelectorAll('.voice input[type="checkbox"]:checked').length,
      evolved: document.querySelectorAll('.voice.voice-evolved').length,
    });
    document.querySelector('[data-rehearsal-full="evolved"]').click();
    const fullEvolved = state();
    document.querySelector('[data-rehearsal-full="base"]').click();
    const fullBase = state();
    const soloStates = [...document.querySelectorAll('[data-rehearsal-solo="evolved"]')].map((button) => {
      button.click();
      return { role: button.dataset.role, ...state() };
    });
    return { fullEvolved, fullBase, soloStates };
  })()`);
  if (
    rehearsalState.fullEvolved.enabled !== 7 || rehearsalState.fullEvolved.evolved !== 7 ||
    rehearsalState.fullBase.enabled !== 7 || rehearsalState.fullBase.evolved !== 0 ||
    rehearsalState.soloStates.some((state) => state.enabled !== 1 || state.evolved !== 1)
  ) {
    throw new Error(`Rehearsal evolved state mismatch: ${JSON.stringify(rehearsalState)}`);
  }
  await client.evaluate("document.querySelector('[data-rehearsal-band]').click(); document.querySelector('[data-rehearsal-full=\"evolved\"]').click(); document.querySelector('.play').click(); true");
  const mixLevels = [];
  for (let bandIndex = 0; bandIndex < 4; bandIndex++) {
    await client.evaluate(`document.querySelectorAll('[data-rehearsal-band]')[${bandIndex}].click(); true`);
    let maxRms = 0;
    for (let sample = 0; sample < 18; sample++) {
      await delay(75);
      maxRms = Math.max(maxRms, await client.evaluate('window.loop.engine.outputLevel()'));
    }
    mixLevels.push(maxRms);
  }
  await client.evaluate("document.querySelector('.play').click(); true");
  if (mixLevels.some((level) => level <= 0.001 || level > 1.05)) {
    throw new Error(`Rehearsal evolved full-mix output out of bounds: ${JSON.stringify(mixLevels)}`);
  }
  if (client.errors.length > 0) {
    throw new Error(`Browser errors after rehearsal checks:\n${client.errors.join('\n')}`);
  }

  console.log('Living Lab: PASS (4 rooms at 1440×900 + 390×844, fail-fast browser drive, globals restored)');
  console.log('Normal game: PASS (fresh start, Lab entry collapsed then opened through dev tools)');
  console.log(`Rehearsal: PASS (9 Base/Evolved solos, 4 audible legal bands; peak RMS ${Math.max(...mixLevels).toFixed(3)})`);
} finally {
  client?.close();
  await terminate(chrome);
  await terminate(vite);
  await rm(profile, { recursive: true, force: true });
}
