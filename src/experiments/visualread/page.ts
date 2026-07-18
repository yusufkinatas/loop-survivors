import { LOGICAL_HEIGHT, LOGICAL_WIDTH, ViewportTransform } from '../../game/viewport';
import {
  VISUAL_READ_CATEGORIES,
  VISUAL_READ_REVEAL_MS,
  assertVisualReadPacket,
  playerClickResult,
  randomizedSampleOrder,
  type VisualReadAnswers,
  type VisualReadCategory,
  type VisualReadMode,
  type VisualReadPacket,
  type VisualReadPublicSample,
} from './protocol';
import './style.css';

interface SampleResult {
  id: string;
  seed: string;
  offsetS: number;
  vision: VisualReadPublicSample['vision'];
  revealMs: number;
  click?: { x: number; y: number; distance: number };
  category?: VisualReadCategory;
  correct: boolean;
}

function parseRoute(): { mode: VisualReadMode; reviewer: string } {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const mode: VisualReadMode = path.endsWith('/category') ? 'category' : 'player';
  const reviewer = new URLSearchParams(query).get('reviewer')?.trim() || 'unassigned-reviewer';
  return { mode, reviewer };
}

function control(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

export async function mountVisualReadReview(root: HTMLElement): Promise<void> {
  const [packetResponse, answerResponse] = await Promise.all([
    fetch('/art/pixel/clarity/packet.json'),
    fetch('/art/pixel/clarity/answers.json'),
  ]);
  if (!packetResponse.ok || !answerResponse.ok) {
    throw new Error('Visual-read packet is not generated; run the clarity capture workflow first');
  }
  const packet = await packetResponse.json() as VisualReadPacket;
  const answers = await answerResponse.json() as VisualReadAnswers;
  assertVisualReadPacket(packet, answers);

  const route = parseRoute();
  const samples = randomizedSampleOrder(packet[route.mode], route.reviewer, route.mode);
  const results: SampleResult[] = [];
  let index = 0;
  let awaitingAnswer = false;
  let revealStartedAt = 0;
  let lastRevealMs = 0;
  let revealTimer = 0;

  root.textContent = '';
  root.className = 'visual-read-root';
  root.dataset.mode = route.mode;

  const surface = document.createElement('main');
  surface.className = 'visual-read-surface';
  const stage = document.createElement('div');
  stage.className = 'visual-read-stage';
  const frame = document.createElement('img');
  frame.alt = '';
  frame.draggable = false;
  const mask = document.createElement('div');
  mask.className = 'visual-read-mask';
  const prompt = document.createElement('section');
  prompt.className = 'visual-read-prompt';
  const status = document.createElement('strong');
  const copy = document.createElement('span');
  const actions = document.createElement('div');
  actions.className = 'visual-read-actions';
  prompt.append(status, copy, actions);
  stage.append(frame, mask, prompt);
  surface.appendChild(stage);

  const notice = document.createElement('div');
  notice.className = 'visual-read-notice';
  notice.textContent = 'Use a landscape window at least 640 × 360.';
  root.append(surface, notice);

  let viewport = new ViewportTransform(innerWidth, innerHeight, devicePixelRatio || 1);
  function paintViewport(): void {
    viewport = new ViewportTransform(innerWidth, innerHeight, devicePixelRatio || 1);
    surface.style.left = `${viewport.offsetCssX}px`;
    surface.style.top = `${viewport.offsetCssY}px`;
    surface.style.transform = `scale(${viewport.cssScale})`;
    surface.hidden = !viewport.supported;
    notice.hidden = viewport.supported;
  }
  paintViewport();
  addEventListener('resize', paintViewport);
  visualViewport?.addEventListener('resize', paintViewport);

  function current(): VisualReadPublicSample {
    const sample = samples[index];
    if (!sample) throw new Error('visual-read sample index is out of bounds');
    return sample;
  }

  function setPrompt(title: string, description: string): void {
    status.textContent = title;
    copy.textContent = description;
  }

  function showReady(): void {
    frame.hidden = true;
    mask.hidden = false;
    prompt.hidden = false;
    actions.textContent = '';
    awaitingAnswer = false;
    setPrompt(
      `${route.mode === 'player' ? 'PLAYER LOCATION' : 'TARGET CATEGORY'} · ${index + 1}/${samples.length}`,
      route.mode === 'player'
        ? 'Reveal for 500 ms. After the mask appears, click where the player was.'
        : 'Reveal for 500 ms. After the mask appears, classify the highlighted target.',
    );
    actions.appendChild(control('REVEAL SAMPLE', () => void reveal()));
  }

  async function reveal(): Promise<void> {
    actions.textContent = '';
    prompt.hidden = true;
    mask.hidden = true;
    frame.src = current().image;
    await frame.decode();
    frame.hidden = false;
    revealStartedAt = performance.now();
    clearTimeout(revealTimer);
    revealTimer = window.setTimeout(maskSample, VISUAL_READ_REVEAL_MS);
  }

  function maskSample(): void {
    const actualReveal = performance.now() - revealStartedAt;
    lastRevealMs = actualReveal;
    frame.hidden = true;
    mask.hidden = false;
    awaitingAnswer = true;
    if (route.mode === 'category') {
      prompt.hidden = false;
      actions.textContent = '';
      setPrompt('WHAT WAS HIGHLIGHTED?', 'Choose one category. The sample will not be shown again.');
      for (const category of VISUAL_READ_CATEGORIES) {
        actions.appendChild(control(category.replace('-', ' ').toUpperCase(), () => recordCategory(category, actualReveal)));
      }
    }
  }

  function recordCategory(category: VisualReadCategory, revealMs: number): void {
    if (!awaitingAnswer) return;
    const sample = current();
    results.push({
      id: sample.id,
      seed: sample.seed,
      offsetS: sample.offsetS,
      vision: sample.vision,
      revealMs,
      category,
      correct: category === answers.category[sample.id],
    });
    advance();
  }

  stage.onclick = (event) => {
    if (route.mode !== 'player' || !awaitingAnswer) return;
    const rect = stage.getBoundingClientRect();
    const click = {
      x: (event.clientX - rect.left) * LOGICAL_WIDTH / rect.width,
      y: (event.clientY - rect.top) * LOGICAL_HEIGHT / rect.height,
    };
    const answer = answers.player[current().id];
    const scored = playerClickResult(click, answer);
    const sample = current();
    results.push({
      id: sample.id,
      seed: sample.seed,
      offsetS: sample.offsetS,
      vision: sample.vision,
      revealMs: lastRevealMs,
      click: { ...click, distance: scored.distance },
      correct: scored.hit,
    });
    advance();
  };

  function advance(): void {
    awaitingAnswer = false;
    index += 1;
    if (index < samples.length) {
      showReady();
      return;
    }
    finish();
  }

  function finish(): void {
    const correct = results.filter((result) => result.correct).length;
    const output = {
      schemaVersion: 1,
      commit: packet.commit,
      captureCommand: packet.captureCommand,
      reviewer: route.reviewer,
      mode: route.mode,
      completedAt: new Date().toISOString(),
      revealProtocolMs: VISUAL_READ_REVEAL_MS,
      transform: packet.transform,
      randomizedOrder: samples.map(({ id }) => id),
      samples: results,
      aggregate: { correct, total: results.length, score: correct / results.length },
    };
    localStorage.setItem(`loop-survivors:visual-read:${route.reviewer}:${route.mode}`, JSON.stringify(output));
    (window as Window & { __visualReadResult?: unknown }).__visualReadResult = output;
    actions.textContent = '';
    prompt.hidden = false;
    setPrompt(
      `${correct}/${results.length} · ${Math.round(correct / results.length * 100)}%`,
      correct / results.length >= 0.95 ? 'PASS · machine-readable result is ready.' : 'FAIL · preserve this result and revise the art.',
    );
  }

  showReady();
}
