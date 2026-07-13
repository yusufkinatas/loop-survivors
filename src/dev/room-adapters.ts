import { exportEdits, getChart, resetChart, saveChart } from '../audio/chartstore';
import { validateChart, type Chart } from '../audio/charts';
import { SOUNDSET } from '../audio/soundset';
import { ROLE_META, ROLES, type Role } from '../audio/kits';
import { SIM_DT, VirtualConductor } from '../bot/conductor';
import { MOVERS, type MoverName } from '../bot/movers';
import { makePolicy } from '../bot/policies';
import { SIM_VIEW, simulateRun, type RunRecord } from '../bot/sim';
import { SLOT_LABEL, SLOTS, slotOf } from '../game/band';
import { LEVELUP, MAX_ALIVE_HARD, RUN, WEAPONS, madForestEnemyStats, xpForNextLevel } from '../game/config';
import { Hud } from '../game/hud';
import { rollOffers } from '../game/picks';
import { mulberry32 } from '../game/rng';
import { KICK_GEOMETRY, RunWorld } from '../game/run';
import {
  ACTIVE_WEAPONS,
  BAND_SLOTS,
  CURRENT_ENEMIES,
  DORMANT_AUDIO,
  EXPERIMENTS,
  FX,
  LEGACY_ENEMIES,
  SOURCES,
  STAGE_ENTRIES,
  STATUS_CATALOG,
  SYSTEM_STATUSES,
  UI_STATES,
} from './catalogs';
import { applyFixtureValues, cloneFixture, DEFAULT_FIXTURE, type DevFixture } from './fixture';
import { DisposeBag } from './lifecycle';
import { DEV_ROOMS } from './registry';
import type {
  DevRoomSession,
  RoomCapabilities,
  RoomMountContext,
} from './types';

type SessionActions = Partial<Pick<
  DevRoomSession,
  'setPlaying' | 'step' | 'setSpeed' | 'setAudio' | 'setOverlays' | 'reroll'
>> & {
  reset?(fixture: DevFixture): void | Promise<void>;
  serialize?(): DevFixture;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function button(parent: HTMLElement, text: string): HTMLButtonElement {
  return el('button', 'dev-button', parent, text);
}

function panel(parent: HTMLElement, title: string, body = ''): HTMLElement {
  const node = el('section', 'dev-panel', parent);
  el('h2', 'dev-panel-title', node, title);
  if (body) el('p', 'dev-copy', node, body);
  return node;
}

function badge(parent: HTMLElement, text: string): HTMLElement {
  return el('span', `dev-status status-${text.toLowerCase()}`, parent, text);
}

function table(parent: HTMLElement, headings: readonly string[]): HTMLTableElement {
  const node = el('table', 'dev-table', parent);
  const head = el('thead', '', node);
  const row = el('tr', '', head);
  for (const heading of headings) el('th', '', row, heading);
  el('tbody', '', node);
  return node;
}

function row(node: HTMLTableElement, values: readonly unknown[]): void {
  const tr = el('tr', '', node.tBodies[0]);
  for (const value of values) el('td', '', tr, fmt(value));
}

function fmt(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value == null) return '—';
  return JSON.stringify(value);
}

function makeSession(
  context: RoomMountContext,
  bag: DisposeBag,
  capabilities: RoomCapabilities,
  actions: SessionActions = {},
): DevRoomSession {
  const initialState = cloneFixture(context.fixture);
  let state = cloneFixture(context.fixture);
  bag.add(() => context.root.replaceChildren());
  return {
    initialState,
    capabilities,
    async reset(next): Promise<void> {
      state = cloneFixture(next);
      await actions.reset?.(state);
    },
    serialize(): DevFixture {
      const owned = actions.serialize?.();
      return cloneFixture(owned ? {
        ...owned,
        playing: state.playing,
        speed: state.speed,
        audio: state.audio,
        overlays: state.overlays,
      } : state);
    },
    async dispose(): Promise<void> {
      await bag.dispose();
    },
    setPlaying(playing): void {
      state.playing = playing;
      actions.setPlaying?.(playing);
    },
    step(): void {
      actions.step?.();
    },
    setSpeed(speed): void {
      state.speed = speed;
      actions.setSpeed?.(speed);
    },
    setAudio(audio): void {
      state.audio = audio;
      actions.setAudio?.(audio);
    },
    setOverlays(overlays): void {
      state.overlays = overlays;
      actions.setOverlays?.(overlays);
    },
    reroll(): void {
      actions.reroll?.();
    },
  };
}

function parseTiers(value: string | undefined): Map<Role, number> {
  const tiers = new Map<Role, number>();
  if (!value) return tiers;
  for (const item of value.split(',')) {
    const [rawRole, rawTier] = item.split(':');
    const role = rawRole as Role;
    if (!ACTIVE_WEAPONS.some((entry) => entry.role === role)) continue;
    tiers.set(role, Math.max(1, Math.min(4, Number(rawTier) || 1)));
  }
  return tiers;
}

function serializeTiers(tiers: ReadonlyMap<Role, number>): string {
  return [...tiers].map(([role, tier]) => `${role}:${tier}`).join(',');
}

async function mountPicks(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  let fixture = cloneFixture(context.fixture);
  let tiers = parseTiers(fixture.values.tiers);
  if (tiers.size === 0 && fixture.preset !== 'empty') tiers.set('kick', 1);
  let rollIndex = Number(fixture.values.roll) || 0;
  const timeS = Math.max(0, Number(fixture.values.time) || 0);
  const offersHost = panel(
    context.root,
    'Real offer generator',
    'These cards come from the same weighted, slot-aware function used by live level-ups and the bot.',
  );
  const current = el('div', 'dev-card-grid', offersHost);
  const trials = Math.max(100, Math.min(10_000, Number(fixture.values.trials) || 2000));
  const distributionHost = panel(context.root, `${trials.toLocaleString()} seeded rolls`);
  const buildHost = panel(context.root, 'Current permanent band');

  function render(): void {
    current.replaceChildren();
    buildHost.querySelectorAll('.dev-generated').forEach((node) => node.remove());
    const rng = mulberry32((fixture.seed + rollIndex) >>> 0);
    const offers = rollOffers(tiers, rng, timeS);
    if (offers.length === 0) el('p', 'dev-empty', current, 'No legal weapon remains; production grants the heal fallback.');
    for (const offer of offers) {
      const weapon = ACTIVE_WEAPONS.find((entry) => entry.role === offer.role)!;
      const card = el('button', 'dev-catalog-card', current);
      card.style.borderColor = weapon.color;
      el('strong', '', card, weapon.name);
      el('span', '', card, `${weapon.slotLabel} · tier ${offer.tier}`);
      card.onclick = () => {
        tiers.set(offer.role, offer.tier);
        fixture.values.tiers = serializeTiers(tiers);
        rollIndex++;
        fixture.values.roll = String(rollIndex);
        render();
      };
    }

    const build = el('div', 'dev-generated dev-card-grid', buildHost);
    for (const slot of SLOTS) {
      const owned = [...tiers].find(([role]) => slotOf(role) === slot);
      const card = el('div', 'dev-catalog-card', build);
      el('strong', '', card, SLOT_LABEL[slot]);
      el('span', '', card, owned ? `${ROLE_META[owned[0]].name} · tier ${owned[1]}` : 'empty');
    }

    distributionHost.querySelectorAll('.dev-generated').forEach((node) => node.remove());
    const counts = new Map<Role, number>();
    const batchRng = mulberry32(fixture.seed);
    for (let i = 0; i < trials; i++) {
      for (const offer of rollOffers(tiers, batchRng, timeS)) {
        counts.set(offer.role, (counts.get(offer.role) ?? 0) + 1);
      }
    }
    const dist = table(distributionHost, ['weapon', 'slot', 'appearances']);
    dist.classList.add('dev-generated');
    for (const weapon of ACTIVE_WEAPONS) {
      row(dist, [weapon.name, weapon.slotLabel, counts.get(weapon.role) ?? 0]);
    }
  }

  render();
  return makeSession(context, bag, { reroll: true }, {
    serialize: () => fixture,
    reroll(): void {
      rollIndex++;
      fixture.values.roll = String(rollIndex);
      render();
    },
    reset(next): void {
      fixture = cloneFixture(next);
      tiers = parseTiers(fixture.values.tiers);
      rollIndex = Number(fixture.values.roll) || 0;
      render();
    },
  });
}

async function mountMusic(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const engine = context.createEngine();
  bag.add(() => engine.dispose());
  let fixture = cloneFixture(context.fixture);
  if ([60, 63, 67].includes(context.room.issue)) renderCatalog(context);
  if (context.room.issue >= 70 && context.room.issue <= 73) renderMusicMuseumNarrative(context);
  const supportsDormantFilter = context.room.issue === 39 || context.room.issue === 60;
  const selectableRoles = supportsDormantFilter ? ROLES : ACTIVE_WEAPONS.map(({ role }) => role);
  let selected = (fixture.values.role as Role | undefined) ?? 'kick';
  if (!selectableRoles.includes(selected)) selected = 'kick';
  let tier = Math.max(1, Math.min(4, Number(fixture.values.tier) || 1));
  const controls = panel(
    context.root,
    'Current production mix',
    'A timing pattern is the list of grid moments when a weapon fires. Choose one instrument or assemble the whole seven-part band.',
  );
  const roleSelect = el('select', 'dev-select', controls);
  const dormantOptions: HTMLOptionElement[] = [];
  for (const role of selectableRoles) {
    const weapon = ACTIVE_WEAPONS.find((entry) => entry.role === role);
    const dormant = DORMANT_AUDIO.find((entry) => entry.role === role);
    const option = el('option', '', roleSelect, `${ROLE_META[role].name} — ${weapon?.slotLabel ?? dormant?.status ?? 'catalog'}`);
    option.value = role;
    if (dormant) dormantOptions.push(option);
  }
  roleSelect.value = selected;
  let showDormant = fixture.values.dormant === '1' || selected === 'crash' || selected === 'riser';
  const dormantToggle = supportsDormantFilter ? button(controls, showDormant ? 'Hide dormant audio' : 'Show dormant audio') : null;
  const paintDormantFilter = (): void => {
    for (const option of dormantOptions) option.hidden = !showDormant;
    if (dormantToggle) dormantToggle.textContent = showDormant ? 'Hide dormant audio' : 'Show dormant audio';
    fixture.values.dormant = showDormant ? '1' : '0';
  };
  if (dormantToggle) {
    dormantToggle.onclick = () => {
      showDormant = !showDormant;
      if (!showDormant && (selected === 'crash' || selected === 'riser')) {
        selected = 'kick';
        roleSelect.value = selected;
      }
      paintDormantFilter();
      applyBuild();
    };
  }
  paintDormantFilter();
  const tierSelect = el('select', 'dev-select', controls);
  for (let i = 1; i <= 4; i++) {
    const option = el('option', '', tierSelect, `tier ${i}`);
    option.value = String(i);
  }
  tierSelect.value = String(tier);
  const single = button(controls, 'Solo selected');
  const full = button(controls, 'Full band');
  const hit = button(controls, 'Play one hit');
  const volumeLabel = el('label', 'dev-tool-field', controls, 'voice volume ');
  const volume = el('input', '', volumeLabel);
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.value = fixture.values.volume ?? '100';
  const mute = button(controls, 'Mute selected');
  let muted = fixture.values.muted === '1';
  const sampleInput = el('input', '', controls);
  sampleInput.type = 'file';
  sampleInput.accept = 'audio/*';
  sampleInput.hidden = true;
  const loadSample = button(controls, 'Local sample override');
  const clearSample = button(controls, 'Clear sample override');
  const eventLog = panel(context.root, 'Heard triggers');
  const readout = el('pre', 'dev-live-readout', eventLog, 'Waiting for the next sound…');
  const meter = el('div', 'dev-meter', eventLog);
  const meterFill = el('span', '', meter);
  const showCausality = context.room.issue === 47 || context.room.issue === 70;
  const causalReadout = showCausality
    ? el('pre', 'dev-live-readout', eventLog, 'Production world attack waiting for the same heard event…')
    : null;
  let causalWorld: RunWorld | null = null;

  function resetCausalWorld(): void {
    if (!showCausality) return;
    causalWorld = new RunWorld(SIM_VIEW, {
      onLevelUp() {}, onDeath() {}, onVictory() {}, onHit() {},
    }, { scripted: false, rng: mulberry32(fixture.seed), fx: false, control: () => ({ x: 0, y: 0 }) });
    causalWorld.invincible = true;
    causalWorld.addWeapon(selected, tier);
    causalWorld.spawnEnemy('greenMudman');
    const target = causalWorld.enemies[0];
    target.hp = 500;
    target.speed = 0;
    target.x = causalWorld.player.x + 22;
    target.y = causalWorld.player.y;
  }
  let fullBand = fixture.values.build === 'full' || fixture.preset.includes('full') || context.room.issue === 67;

  function applyVoiceGain(): void {
    const gain = muted ? 0 : Number(volume.value) / 100;
    engine.setVoiceGain(selected, gain);
    fixture.values.volume = volume.value;
    fixture.values.muted = muted ? '1' : '0';
    mute.textContent = muted ? 'Unmute selected' : 'Mute selected';
  }

  function applyBuild(): void {
    for (const role of ROLES) engine.setVoiceEnabled(role, false);
    if (fullBand) {
      for (const slot of BAND_SLOTS) {
        const role = ACTIVE_WEAPONS.find((weapon) => weapon.slot === slot.id)?.role;
        if (!role) continue;
        engine.setVoiceTier(role, tier);
        engine.setVoiceEnabled(role, true);
      }
    } else {
      engine.setVoiceTier(selected, tier);
      engine.setVoiceEnabled(selected, true);
    }
    fixture.values.role = selected;
    fixture.values.tier = String(tier);
    fixture.values.build = fullBand ? 'full' : 'solo';
    applyVoiceGain();
    resetCausalWorld();
  }

  roleSelect.onchange = () => {
    selected = roleSelect.value as Role;
    fullBand = false;
    applyBuild();
  };
  tierSelect.onchange = () => {
    tier = Number(tierSelect.value);
    applyBuild();
  };
  single.onclick = () => {
    fullBand = false;
    applyBuild();
  };
  full.onclick = () => {
    fullBand = true;
    applyBuild();
  };
  hit.onclick = () => {
    void engine.ctx.resume();
    engine.preview(selected);
  };
  volume.oninput = applyVoiceGain;
  mute.onclick = () => { muted = !muted; applyVoiceGain(); };
  loadSample.onclick = () => sampleInput.click();
  sampleInput.onchange = async () => {
    const file = sampleInput.files?.[0];
    if (!file) return;
    engine.voices.get(selected)!.override = await engine.ctx.decodeAudioData(await file.arrayBuffer());
    loadSample.textContent = `Override: ${file.name}`;
  };
  clearSample.onclick = () => {
    engine.voices.get(selected)!.override = null;
    sampleInput.value = '';
    loadSample.textContent = 'Local sample override';
  };

  if (context.room.issue === 39 || context.room.issue === 63) {
    const draftPanel = panel(context.root, 'Draft timing pattern', 'Draft JSON is isolated in this room until Apply is pressed. Export and reset are explicit.');
    const draftStatus = el('p', 'dev-copy', draftPanel, 'SHIPPED — no local draft');
    const editor = el('textarea', '', draftPanel);
    editor.rows = 8;
    editor.style.width = '100%';
    let draft: Chart = { ...getChart(selected, tier), events: getChart(selected, tier).events.map((event) => ({ ...event })) };
    const loadDraft = (): void => {
      const source = getChart(selected, tier);
      draft = { role: selected, bars: source.bars, events: source.events.map((event) => ({ ...event })) };
      editor.value = JSON.stringify({ bars: draft.bars, events: draft.events }, null, 2);
      draftStatus.textContent = 'SHIPPED — draft reset from the current production chart';
    };
    const parseDraft = (): Chart => {
      const parsed = JSON.parse(editor.value) as Pick<Chart, 'bars' | 'events'>;
      const chart: Chart = { role: selected, bars: parsed.bars, events: parsed.events };
      validateChart(chart);
      return chart;
    };
    editor.oninput = () => { draftStatus.textContent = 'DRAFT — production and other rooms are unchanged'; };
    const auditionDraft = button(draftPanel, 'Audition draft one hit');
    auditionDraft.onclick = () => {
      try {
        draft = parseDraft();
        engine.preview(selected, draft.events[0]);
        draftStatus.textContent = 'DRAFT AUDITION — production remains unchanged';
      } catch (error) {
        draftStatus.textContent = `INVALID DRAFT — ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    const applyDraft = button(draftPanel, 'Apply draft explicitly');
    applyDraft.onclick = () => {
      try {
        draft = parseDraft();
        const live = getChart(selected, tier);
        live.bars = draft.bars;
        live.events = draft.events.map((event) => ({ ...event }));
        saveChart(selected, tier);
        draftStatus.textContent = 'APPLIED — saved working production chart; export it to review/bake';
      } catch (error) {
        draftStatus.textContent = `NOT APPLIED — ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    const exportDraft = button(draftPanel, 'Copy exported edits');
    exportDraft.onclick = () => { void navigator.clipboard.writeText(exportEdits()); };
    const resetDraft = button(draftPanel, 'Reset draft only');
    resetDraft.onclick = loadDraft;
    const restoreShipped = button(draftPanel, 'Restore shipped chart explicitly');
    restoreShipped.onclick = () => { resetChart(selected, tier); loadDraft(); draftStatus.textContent = 'SHIPPED RESTORED — saved local edit removed'; };
    roleSelect.addEventListener('change', loadDraft);
    tierSelect.addEventListener('change', loadDraft);
    loadDraft();
  }
  let scheduledAt = 0;
  bag.add(engine.addScheduledTriggerListener((trigger) => {
    scheduledAt = engine.ctx.currentTime;
    readout.textContent = `${ROLE_META[trigger.role].name}\nprepared ${Math.max(0, trigger.time - scheduledAt).toFixed(3)}s before it is heard\ngrid step ${trigger.step + 1}`;
  }));
  bag.add(engine.addTriggerListener((trigger) => {
    readout.textContent = `${ROLE_META[trigger.role].name}\nstep ${trigger.step + 1} · strength ${trigger.velocity.toFixed(2)}\nheard now · prepared ${(trigger.time - scheduledAt).toFixed(3)}s after the observation clock sample`;
    if (causalWorld && causalReadout && trigger.role === selected) {
      causalWorld.fireTrigger(trigger);
      for (let i = 0; i < 30; i++) causalWorld.update(SIM_DT);
      causalReadout.textContent = [
        `SAME EVENT → RunWorld.fireTrigger(${trigger.role})`,
        `world damage ${Math.round(causalWorld.damageByRole[trigger.role] ?? 0)}`,
        `audio monitoring ${fixture.audio ? 'audible' : 'muted'}; gameplay dispatch unchanged`,
      ].join('\n');
    }
  }));
  bag.listen(context.root, 'pointerdown', () => engine.resumeContextIfAllowed(), { passive: true });
  bag.animationFrame(() => {
    engine.update();
    meterFill.style.width = `${Math.min(100, engine.outputLevel() * 260)}%`;
  });
  applyBuild();
  engine.clock.rate = fixture.speed;
  engine.setMasterGain(fixture.audio ? 0.8 : 0);
  if (fixture.playing) engine.clock.start();

  return makeSession(context, bag, { play: true, speed: true, audio: true }, {
    serialize: () => fixture,
    setPlaying(playing): void {
      fixture.playing = playing;
      if (playing) engine.clock.start();
      else engine.clock.stop();
    },
    setSpeed(speed): void {
      fixture.speed = speed;
      engine.clock.rate = speed;
    },
    setAudio(audio): void {
      fixture.audio = audio;
      engine.setMasterGain(audio ? 0.8 : 0);
    },
    reset(next): void {
      fixture = cloneFixture(next);
      roleSelect.value = fixture.values.role ?? 'kick';
      tierSelect.value = fixture.values.tier ?? '1';
      selected = roleSelect.value as Role;
      tier = Number(tierSelect.value);
      fullBand = fixture.values.build === 'full';
      applyBuild();
    },
  });
}

interface DeterministicSimulation {
  world: RunWorld;
  conductor: VirtualConductor;
  ended: boolean;
}

function makeDeterministicSimulation(seed: number, moverName: MoverName, policySpec: string): DeterministicSimulation {
  const rng = mulberry32(seed);
  const policy = makePolicy(policySpec);
  const mover = MOVERS[moverName]();
  let conductor!: VirtualConductor;
  let ended = false;
  const sim = {} as DeterministicSimulation;
  let world!: RunWorld;
  world = new RunWorld(SIM_VIEW, {
    onLevelUp: () => conductor.onLevelUp(),
    onDeath: () => { ended = true; sim.ended = true; },
    onVictory: () => { ended = true; sim.ended = true; },
    onHit: () => {},
  }, { rng, control: (): { x: number; y: number } => mover(world), fx: false });
  world.powerMul = SOUNDSET.powerMul;
  conductor = new VirtualConductor(world, policy.choose, rng);
  conductor.start(policy.startingKit(rng));
  sim.world = world;
  sim.conductor = conductor;
  sim.ended = ended;
  return sim;
}

function worldDigest(world: RunWorld): string {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return JSON.stringify({
    time: round(world.timeS),
    player: [round(world.player.x), round(world.player.y), round(world.player.hp)],
    level: world.level,
    xp: round(world.xp),
    kills: world.kills,
    tiers: [...world.tiers],
    enemies: world.enemies.map((enemy) => [enemy.id, enemy.kind, round(enemy.x), round(enemy.y), round(enemy.hp)]),
    projectiles: world.projectiles.map((projectile) => [projectile.role, round(projectile.x), round(projectile.y)]),
    gems: world.gems.map((gem) => [round(gem.x), round(gem.y), gem.xp]),
  });
}

async function mountDeterminism(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  let fixture = cloneFixture(context.fixture);
  const mover = (fixture.values.mover as MoverName | undefined) ?? 'kiter';
  const policy = fixture.values.policy ?? 'random';
  let left = makeDeterministicSimulation(fixture.seed, mover, policy);
  let right = makeDeterministicSimulation(fixture.seed, mover, policy);
  let ticks = 0;
  let playing = fixture.playing;
  let speed = fixture.speed;
  let accumulator = 0;
  let last = performance.now();
  const summary = panel(
    context.root,
    'Twin production simulations',
    'Both copies use the real RunWorld, real timing patterns, real pick rules, and the same seeded random-number stream.',
  );
  const status = el('div', 'dev-verdict', summary);
  const metrics = el('pre', 'dev-live-readout', summary);

  function paint(): void {
    const same = worldDigest(left.world) === worldDigest(right.world);
    status.className = `dev-verdict ${same ? 'pass' : 'fail'}`;
    status.textContent = same ? 'MATCH — no divergence' : 'DIVERGED — inspect this tick';
    metrics.textContent = [
      `fixed ticks  ${ticks}`,
      `sim time     ${left.world.timeS.toFixed(2)}s`,
      `hp           ${left.world.player.hp.toFixed(1)}`,
      `enemies      ${left.world.enemyCount}`,
      `kills        ${left.world.kills}`,
      `build        ${[...left.world.tiers].map(([role, tier]) => `${role} ${tier}`).join(', ')}`,
    ].join('\n');
  }

  function oneTick(): void {
    if (!left.ended) {
      left.conductor.tick(SIM_DT);
      left.world.update(SIM_DT);
    }
    if (!right.ended) {
      right.conductor.tick(SIM_DT);
      right.world.update(SIM_DT);
    }
    ticks++;
    fixture.values.tick = String(ticks);
    paint();
  }

  function rebuild(next = fixture): void {
    fixture = cloneFixture(next);
    left = makeDeterministicSimulation(fixture.seed, mover, policy);
    right = makeDeterministicSimulation(fixture.seed, mover, policy);
    ticks = 0;
    const target = Math.min(3600, Math.max(0, Number(fixture.values.tick) || 0));
    for (let i = 0; i < target; i++) oneTick();
    paint();
  }

  bag.animationFrame((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!playing) return;
    accumulator += dt * speed;
    let guard = 0;
    while (accumulator >= SIM_DT && guard++ < 20) {
      accumulator -= SIM_DT;
      oneTick();
    }
  });
  rebuild();
  return makeSession(context, bag, { play: true, step: true, speed: true }, {
    serialize: () => fixture,
    setPlaying(value): void { playing = value; },
    setSpeed(value): void { speed = value; },
    step: oneTick,
    reset: rebuild,
  });
}

async function mountUi(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  let fixture = cloneFixture(context.fixture);
  const controls = panel(
    context.root,
    'Production UI state matrix',
    'The list is canonical. Start, HUD rack, result screens, and toast are mounted through the real production Hud class; shell/Pixi-owned states are labeled instead of being reimplemented here.',
  );
  const select = el('select', 'dev-select', controls);
  for (const state of UI_STATES) {
    const option = el('option', '', select, `${state.label} — ${state.status}`);
    option.value = state.id;
  }
  select.value = fixture.values.state ?? UI_STATES[0].id;
  const preview = panel(context.root, 'Responsive preview');
  const frame = el('div', 'dev-ui-preview', preview);
  frame.style.position = 'relative';
  frame.style.minHeight = '30rem';
  frame.style.overflow = 'hidden';
  const details = el('pre', 'dev-live-readout', preview);

  function fullBand(): Map<Role, number> {
    const tiers = new Map<Role, number>();
    for (const slot of BAND_SLOTS) {
      const role = ACTIVE_WEAPONS.find((weapon) => weapon.slot === slot.id)?.role;
      if (role) tiers.set(role, 4);
    }
    return tiers;
  }

  function paint(): void {
    const state = UI_STATES.find((item) => item.id === select.value) ?? UI_STATES[0];
    fixture.values.state = state.id;
    frame.replaceChildren();
    const production = el('div', 'dev-production-hud-host', frame);
    production.style.position = 'absolute';
    production.style.inset = '0';
    production.style.overflow = 'hidden';
    production.style.background = 'radial-gradient(circle, #17202b, #090c12)';
    const isExperimental = state.status === 'EXPERIMENTAL';
    const hudOwned = new Set(['start', 'run-empty-rack', 'run-full-rack', 'run-muted-rack', 'death', 'victory', 'toast']);
    if (isExperimental) {
      const warning = el('div', 'dev-callout warning', production, 'EXPERIMENTAL — the boss HUD is segregated from current production UI and is not recreated as a current Hud state.');
      badge(warning, 'EXPERIMENTAL');
    } else if (hudOwned.has(state.id)) {
      const hud = new Hud(production, context.kits);
      if (state.id === 'start') {
        hud.showStart(() => hud.showToast('Start callback reached'), () => hud.showToast('Sandbox callback reached'));
      } else if (state.id === 'death' || state.id === 'victory') {
        hud.showEnd(state.id === 'victory', {
          timeS: state.id === 'victory' ? RUN.durationS : 214,
          kills: state.id === 'victory' ? 1234 : 386,
          level: state.id === 'victory' ? 28 : 13,
          damageByRole: { kick: 4800, bass: 3100, lead: 1700 },
          killsByRole: { kick: 420, bass: 250, lead: 98 },
        }, () => hud.showToast('Retry callback reached'));
      } else {
        const tiers = state.id === 'run-empty-rack' ? new Map<Role, number>() : fullBand();
        const muted = state.id === 'run-muted-rack' ? new Set<Role>(['kick']) : undefined;
        hud.showHud(true);
        hud.setStatus(0.68, 0.42, 12, 192);
        hud.renderBand(tiers, undefined, muted);
        if (state.id === 'toast') hud.showToast('Production toast — lifecycle owned by Hud');
      }
    } else {
      const hud = new Hud(production, context.kits);
      hud.showHud(true);
      hud.setStatus(0.68, 0.42, 12, 192);
      hud.renderBand(fullBand());
      const note = el('div', 'dev-callout', production, `${state.label} is owned by ${state.owner}, not Hud. The real Hud remains behind this ownership label; use its linked Gym for the live shell/Pixi state.`);
      note.style.position = 'absolute';
      note.style.left = '1rem';
      note.style.right = '1rem';
      note.style.bottom = '1rem';
    }
    details.textContent = `status     ${state.status}\nowner      ${state.owner}\nsource     ${state.source}\ncomponent  ${hudOwned.has(state.id) ? 'production Hud' : 'ownership-safe labeled state'}\nviewport   ${fixture.viewport}`;
  }
  select.onchange = paint;
  paint();
  return makeSession(context, bag, { overlays: true }, {
    serialize: () => fixture,
    setOverlays(show): void { details.hidden = !show; },
    reset(next): void {
      fixture = cloneFixture(next);
      select.value = fixture.values.state ?? UI_STATES[0].id;
      paint();
    },
  });
}

async function mountInput(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  let fixture = cloneFixture(context.fixture);
  const live = panel(
    context.root,
    'Live browser input probe',
    'Press movement keys, resize the window, change tabs, or use a pointer. This room observes; it never sends input into a hidden game world.',
  );
  const readout = el('pre', 'dev-live-readout', live);
  const log = el('ol', 'dev-event-log', live);
  const audioPanel = panel(context.root, 'Audio interruption');
  const suspend = button(audioPanel, 'Simulate interruption');
  const resume = button(audioPanel, 'Resume audio');
  let lastEvent = 'mounted';
  if (context.room.issue === 34) {
    const metrics = panel(context.root, 'Production movement and body metrics');
    const out = table(metrics, ['measurement', 'production value']);
    row(out, ['cardinal travel in one second', `${RUN.playerSpeed} world units`]);
    row(out, ['diagonal travel in one second', `${RUN.playerSpeed} world units (normalized, not faster)`]);
    row(out, ['player collision radius', RUN.playerRadius]);
    row(out, ['damage immunity after contact', `${RUN.iframesS}s`]);
  }

  function record(message: string): void {
    lastEvent = message;
    const item = el('li', '', log, `${new Date().toLocaleTimeString()} — ${message}`);
    while (log.children.length > 12) log.firstElementChild?.remove();
    item.scrollIntoView({ block: 'nearest' });
  }
  function paint(): void {
    fixture.viewport = `${window.innerWidth}x${window.innerHeight}`;
    readout.textContent = [
      `viewport     ${fixture.viewport}`,
      `pixel ratio  ${window.devicePixelRatio}`,
      `visibility   ${document.visibilityState}`,
      `audio        ${context.audioContext.state}`,
      `last event   ${lastEvent}`,
    ].join('\n');
  }
  bag.listen(window, 'keydown', (event) => { record(`key down ${event.code}`); paint(); });
  bag.listen(window, 'keyup', (event) => { record(`key up ${event.code}`); paint(); });
  bag.listen(window, 'pointerdown', (event) => { record(`pointer ${event.pointerType} at ${event.clientX},${event.clientY}`); paint(); });
  bag.listen(window, 'resize', () => { record('window resized'); paint(); });
  bag.listen(window, 'blur', () => { record('window blur'); paint(); });
  bag.listen(document, 'visibilitychange', () => { record(`visibility ${document.visibilityState}`); paint(); });
  const audioState = () => { record(`audio ${context.audioContext.state}`); paint(); };
  context.audioContext.addEventListener('statechange', audioState);
  bag.add(() => context.audioContext.removeEventListener('statechange', audioState));
  bag.add(() => {
    if (context.audioContext.state === 'suspended') void context.audioContext.resume();
  });
  suspend.onclick = () => void context.audioContext.suspend();
  resume.onclick = () => void context.audioContext.resume();
  bag.animationFrame(paint);
  paint();
  return makeSession(context, bag, { audio: true }, {
    serialize: () => fixture,
    setAudio(audio): void {
      void (audio ? context.audioContext.resume() : context.audioContext.suspend());
    },
    reset(next): void {
      fixture = cloneFixture(next);
      log.replaceChildren();
      record('hard reset fixture applied');
      paint();
    },
  });
}

async function mountBot(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  let fixture = cloneFixture(context.fixture);
  let live = true;
  bag.add(() => { live = false; });
  const controls = panel(
    context.root,
    'Real headless balance batch',
    'Each run uses the production world, virtual music conductor, pick policy, and fixed 60 Hz ticks. Results expose regressions; they never pass a playtest gate.',
  );
  const runButton = button(controls, 'Run batch');
  const status = el('span', 'dev-inline-status', controls, 'ready');
  const results = panel(context.root, 'Results');
  const records: RunRecord[] = [];

  async function runBatch(): Promise<void> {
    if (runButton.disabled) return;
    runButton.disabled = true;
    records.length = 0;
    results.querySelectorAll('.dev-generated').forEach((node) => node.remove());
    const count = Math.max(1, Math.min(20, Number(fixture.values.runs) || 2));
    const mover = (fixture.values.mover as MoverName | undefined) ?? 'kiter';
    const policy = fixture.values.policy ?? 'random';
    for (let i = 0; i < count && live; i++) {
      status.textContent = `running ${i + 1}/${count}…`;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      records.push(simulateRun({ seed: (fixture.seed + i) >>> 0, mover, policy }, 'dev-campus'));
    }
    if (!live) return;
    const output = table(results, ['seed', 'result', 'time', 'level', 'kills', 'lowest hp', 'peak horde']);
    output.classList.add('dev-generated');
    for (const record of records) {
      row(output, [record.seed, record.victory ? 'victory' : 'death', `${record.timeS}s`, record.level, record.kills, record.minHp, record.peakAlive]);
    }
    status.textContent = `${records.length} production runs complete`;
    runButton.disabled = false;
  }
  runButton.onclick = () => void runBatch();
  if (fixture.values.autorun === '1') void runBatch();
  return makeSession(context, bag, { reroll: true }, {
    serialize: () => fixture,
    reroll(): void {
      fixture.seed = (fixture.seed + Math.max(1, records.length)) >>> 0;
      void runBatch();
    },
    reset(next): void {
      fixture = cloneFixture(next);
      records.length = 0;
      status.textContent = 'ready';
    },
  });
}

function renderCatalog(context: RoomMountContext): void {
  const root = context.root;
  switch (context.room.issue) {
    case 29: {
      const host = panel(root, 'Current serialized fixture');
      const out = table(host, ['field', 'value', 'URL-owned']);
      row(out, ['preset', context.fixture.preset, true]);
      row(out, ['seed', context.fixture.seed, true]);
      row(out, ['playing', context.fixture.playing, true]);
      row(out, ['speed', context.fixture.speed, true]);
      row(out, ['audio', context.fixture.audio, true]);
      row(out, ['overlays', context.fixture.overlays, true]);
      row(out, ['viewport', context.fixture.viewport, true]);
      for (const [key, value] of Object.entries(context.fixture.values)) row(out, [`room.${key}`, value, true]);
      break;
    }
    case 30: {
      const host = panel(root, 'Complete typed room registry');
      const out = table(host, ['issue', 'kind', 'title', 'status', 'adapter', 'presets']);
      for (const room of DEV_ROOMS) row(out, [`#${room.issue}`, room.kind, room.title, room.status, room.adapter, room.presets.length]);
      break;
    }
    case 31: {
      const host = panel(root, 'Canonical catalog completeness');
      const out = table(host, ['catalog', 'count', 'status separation']);
      row(out, ['band slots', BAND_SLOTS.length, 'CURRENT']);
      row(out, ['active weapons', ACTIVE_WEAPONS.length, 'CURRENT']);
      row(out, ['dormant audio', DORMANT_AUDIO.length, 'DORMANT / gameplay REMOVED']);
      row(out, ['current enemies', CURRENT_ENEMIES.length, 'CURRENT']);
      row(out, ['legacy enemies', LEGACY_ENEMIES.length, 'HISTORICAL']);
      row(out, ['FX types', FX.length, 'CURRENT']);
      row(out, ['UI states', UI_STATES.length, 'CURRENT / EXPERIMENTAL']);
      row(out, ['experiments', EXPERIMENTS.length, 'HISTORICAL / EXPERIMENTAL']);
      break;
    }
    case 56: {
      const host = panel(root, 'Dormant audio-only voices', 'These sounds remain auditionable, but they have no weapon, slot, pick card, or gameplay mechanic.');
      for (const item of DORMANT_AUDIO) {
        const card = el('article', 'dev-catalog-card', host);
        badge(card, item.status);
        el('h3', '', card, item.name);
        el('p', '', card, item.note);
      }
      break;
    }
    case 57: {
      const host = panel(root, '14 active weapons × 4 production tiers');
      const grid = el('div', 'dev-card-grid', host);
      for (const weapon of ACTIVE_WEAPONS) {
        for (let tier = 1; tier <= 4; tier++) {
          const conf = weapon.tiers[tier - 1];
          const card = el('article', 'dev-catalog-card', grid);
          card.style.borderColor = weapon.color;
          el('h3', '', card, `${weapon.name} · ${tier}`);
          el('p', '', card, weapon.tierLines[tier - 1]);
          el('small', '', card, Object.entries(conf).map(([key, value]) => `${key} ${fmt(value)}`).join(' · '));
        }
      }
      break;
    }
    case 58:
    case 61: {
      const entries = context.room.issue === 58 ? CURRENT_ENEMIES : LEGACY_ENEMIES;
      const host = panel(root, context.room.issue === 58 ? 'Current Mad Forest enemies' : 'Legacy enemy archive');
      const out = table(host, ['enemy', 'status', 'hp @ lv1', 'damage', 'speed', 'xp', 'radius']);
      for (const enemy of entries) {
        const stats = madForestEnemyStats(enemy.kind, 1);
        row(out, [enemy.name, enemy.status, stats.hp, stats.damage, stats.speed, stats.xp, enemy.stats.radius]);
      }
      break;
    }
    case 59: {
      const host = panel(root, 'Projectile, field, and hit-area families');
      const out = table(host, ['weapon', 'slot', 'shape/mechanic fields at tier 4']);
      for (const weapon of ACTIVE_WEAPONS) {
        const conf = WEAPONS[weapon.role]![3];
        row(out, [weapon.name, weapon.slotLabel, Object.entries(conf).filter(([key]) => key !== 'damage').map(([key, value]) => `${key} ${fmt(value)}`).join(' · ')]);
      }
      break;
    }
    case 60: {
      const host = panel(root, 'Production sound identities and one-shots');
      const out = table(host, ['voice', 'status', 'pitched', 'cuts previous hit', 'variants']);
      for (const role of ROLES) {
        const meta = ROLE_META[role];
        const status = DORMANT_AUDIO.some((entry) => entry.role === role) ? 'DORMANT' : ACTIVE_WEAPONS.some((entry) => entry.role === role) ? 'CURRENT' : 'HISTORICAL';
        row(out, [meta.name, status, meta.pitched, meta.choke, meta.variants.join(', ')]);
      }
      break;
    }
    case 62: {
      const host = panel(root, 'Every production FX request type');
      const out = table(host, ['type', 'family', 'status', 'producer']);
      for (const item of FX) row(out, [item.type, item.family, item.status, 'RunWorld → RunView']);
      break;
    }
    case 63: {
      const host = panel(root, 'Every active timing pattern');
      const out = table(host, ['weapon', 'tier', 'bars', 'events', 'grid steps']);
      for (const weapon of ACTIVE_WEAPONS) {
        for (let tier = 1; tier <= 4; tier++) {
          const chart = getChart(weapon.role, tier);
          row(out, [weapon.name, tier, chart.bars, chart.events.length, chart.events.map((event) => event.step + 1).join(', ')]);
        }
      }
      break;
    }
    case 64: {
      const host = panel(root, 'Pickups, ground rewards, and weapon identities');
      el('p', 'dev-copy', host, `A level-up drops choices ${LEVELUP.itemRadius} world units from the player; collection range is fixed at ${LEVELUP.itemPickupRadius}.`);
      const out = table(host, ['weapon glyph identity', 'color', 'slot', 'pickup label']);
      for (const weapon of ACTIVE_WEAPONS) row(out, [weapon.name, weapon.color, weapon.slotLabel, `${weapon.name} · 1 or 2 → 3`]);
      break;
    }
    case 65: {
      const host = panel(root, 'Complete registered UI states');
      const out = table(host, ['state', 'status', 'owner', 'source']);
      for (const state of UI_STATES) row(out, [state.label, state.status, state.owner, state.source]);
      break;
    }
    case 66: {
      const host = panel(root, 'Identity and readability tokens');
      const grid = el('div', 'dev-card-grid', host);
      for (const role of ROLES) {
        const meta = ROLE_META[role];
        const card = el('article', 'dev-catalog-card', grid);
        card.style.borderColor = meta.color;
        el('strong', '', card, meta.name);
        el('span', '', card, meta.color);
      }
      break;
    }
    case 67: {
      const host = panel(root, 'Production mix interactions');
      el('pre', 'dev-signal-path', host, 'voice gain → per-voice low-end dip → weapons group → master → pause gate → limiter → meter → speakers');
      const out = table(host, ['voice', 'slot', 'variants', 'mix behavior']);
      for (const weapon of ACTIVE_WEAPONS) {
        row(out, [weapon.name, weapon.slotLabel, ROLE_META[weapon.role].variants.join(', '), weapon.role === 'bass' || weapon.role === 'pluck' ? 'briefly dips under Kick' : 'normal group path']);
      }
      break;
    }
    case 68: {
      const host = panel(root, 'Experimental boss catalog', 'Nothing in this wing is integrated into the current run.');
      const out = table(host, ['experiment', 'family', 'status', 'truth warning']);
      for (const experiment of EXPERIMENTS.filter((item) => item.family === 'boss-fight')) row(out, [experiment.name, experiment.family, experiment.status, experiment.note]);
      break;
    }
    case 85: {
      const host = panel(root, 'Every encoded system status');
      const out = table(host, ['system', 'status', 'source', 'meaning']);
      for (const system of SYSTEM_STATUSES) row(out, [system.label, system.status, system.source, system.note]);
      break;
    }
    case 87: {
      const host = panel(root, 'Live source-of-truth stations');
      const out = table(host, ['owner', 'status', 'path', 'facts owned']);
      for (const source of SOURCES) row(out, [source.label, source.status, source.path, source.owns.join(', ')]);
      break;
    }
    default: {
      const host = panel(root, 'Canonical system catalog');
      const out = table(host, ['system', 'status', 'source', 'meaning']);
      for (const system of SYSTEM_STATUSES) row(out, [system.label, system.status, system.source, system.note]);
    }
  }
}

async function mountCatalog(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  renderCatalog(context);
  if (context.room.issue === 56) {
    const engine = context.createEngine();
    bag.add(() => engine.dispose());
    const audition = panel(context.root, 'Audition dormant audio without restoring gameplay');
    el('p', 'dev-copy', audition, 'These buttons call the production kit preview only. No weapon, slot, stats, or offer is created.');
    for (const voice of DORMANT_AUDIO) {
      const play = button(audition, `Play ${voice.name}`);
      play.onclick = () => {
        void engine.ctx.resume();
        engine.preview(voice.role);
      };
    }
    bag.animationFrame(() => engine.update());
    engine.setMasterGain(context.fixture.audio ? 0.8 : 0);
    return makeSession(context, bag, { audio: true }, {
      setAudio(audio): void { engine.setMasterGain(audio ? 0.8 : 0); },
    });
  }
  return makeSession(context, bag, {});
}

interface MuseumPage {
  summary: string;
  terms: readonly [string, string][];
  facts: () => readonly string[];
  related: readonly number[];
  sources: readonly string[];
}

const MUSEUMS: Record<number, MuseumPage> = {
  70: { summary: 'A single scheduled event is both a sound and a weapon firing. Neither side imitates the other afterward.', terms: [['trigger', 'one scheduled event that produces both sound and gameplay']], facts: () => [`${ACTIVE_WEAPONS.length} active weapons share this rule`, 'MusicEngine announces the heard event; RunWorld applies its weapon mechanic'], related: [35, 47], sources: ['src/audio/engine.ts', 'src/game/run.ts'] },
  71: { summary: 'The clock divides time into small equal grid steps so separate instruments agree on when to act.', terms: [['beat', 'the steady pulse you would tap your foot to'], ['bar', 'a repeating group of four beats'], ['phrase', 'four bars treated as one larger loop'], ['swing', 'delaying some in-between hits slightly so the rhythm feels less rigid']], facts: () => [`tempo ${SOUNDSET.bpm} beats per minute`, `swing ${SOUNDSET.swing}`, '16 small steps per bar'], related: [39, 63], sources: ['src/audio/clock.ts', 'src/audio/scale.ts'] },
  72: { summary: 'The scheduler prepares sound slightly early, while gameplay waits until that sound is actually heard.', terms: [['lookahead', 'preparing near-future sounds early so browser hiccups do not ruin timing'], ['next-bar entry', 'a new weapon waits for the next group-of-four-beats boundary']], facts: () => ['scheduler wakes every 25 ms', 'audio is prepared 120 ms ahead', 'heard-time actions run before triggers at the same timestamp'], related: [47, 76], sources: ['src/audio/clock.ts', 'src/audio/engine.ts'] },
  73: { summary: 'Every voice follows one explicit route to the speakers, with group volume and a final safety limiter.', terms: [['signal path', 'the route sound follows through volume and processing nodes'], ['ducking', 'briefly lowering one sound so another stays clear'], ['limiter', 'a final safety net that catches sudden loud peaks']], facts: () => ['Kick briefly lowers Bass or Pluck Bass', 'weapon group volume can dip under the level-up cue'], related: [39, 67], sources: ['src/audio/engine.ts'] },
  74: { summary: 'The build has seven permanent jobs. Hiring one instrument closes its job to the competing instrument.', terms: [['slot', 'one permanent job in the band/build']], facts: () => BAND_SLOTS.map((slot) => `${slot.label}: ${slot.roles.map((role) => ROLE_META[role].name).join(' or ')}`), related: [38, 57], sources: ['src/game/band.ts', 'src/game/picks.ts'] },
  75: { summary: 'Weapon identity comes from geometry, lifespan, target rules, and repeat-hit rules—not only damage.', terms: [['pierce', 'how many targets a moving attack can pass through'], ['repeat-hit lock', 'a short wait before the same attack may hurt the same enemy again']], facts: () => [`Kick strip starts ${KICK_GEOMETRY.baseWidth.toFixed(1)} units wide`, ...ACTIVE_WEAPONS.map((weapon) => `${weapon.name}: ${weapon.tierLines[0]}`)], related: [35, 59], sources: ['src/game/config.ts', 'src/game/run.ts'] },
  76: { summary: 'XP fills a threshold, choices appear physically in the arena, and the chosen weapon joins on the next bar.', terms: [['reward queue', 'stored level-up rewards waiting to be presented one at a time']], facts: () => [`starting XP threshold ${xpForNextLevel(1)}`, `choice ring radius ${LEVELUP.itemRadius}`, `collection radius ${LEVELUP.itemPickupRadius}`], related: [37, 38, 64], sources: ['src/game/game.ts', 'src/game/picks.ts'] },
  77: { summary: 'Enemies and the player are circles for collision; nearby candidates come from a spatial grid instead of scanning everything.', terms: [['spatial hash', 'a grid that quickly finds nearby bodies'], ['separation', 'small steering forces that stop a crowd occupying one point']], facts: () => [`${CURRENT_ENEMIES.length} current enemy kinds`, 'collision candidates are queried from nearby grid cells'], related: [34, 36, 58], sources: ['src/game/spatial.ts', 'src/game/run.ts'] },
  78: { summary: 'The stage decides pressure and boss timing; the build alone decides the music.', terms: [['dividing rule', 'the stage conducts gameplay pressure, while only the build composes the music']], facts: () => [`${STAGE_ENTRIES.length} current scheduled stage entries`, `${RUN.durationS / 60} minute run`], related: [33, 44], sources: ['src/game/madforest.ts', 'docs/plan.md'] },
  79: { summary: 'Parity values are version-pinned evidence or clearly labeled inference, never folklore silently copied into code.', terms: [['provenance', 'where a value came from and which version it describes']], facts: () => ['reference evidence is version-pinned', 'exact values and inferences are labeled separately'], related: [33, 58], sources: ['docs/research/mad-forest-reference.md'] },
  80: { summary: 'The simulation always advances in fixed 1/60-second ticks; speed changes how many ticks are paid out, not their size.', terms: [['fixed tick', 'one simulation step with an unchanging duration'], ['slowdown', 'temporarily paying out fewer fixed ticks per real second']], facts: () => [`fixed tick ${(SIM_DT * 1000).toFixed(2)} ms`, 'developer speed and reward slowdown multiply together', 'replay speed is a separate control'], related: [21, 40], sources: ['src/game/game.ts', 'src/audio/clock.ts'] },
  81: { summary: 'A seed gives the same random-number stream, and the virtual conductor reproduces the audio grid without speakers.', terms: [['seed', 'a number that recreates the same sequence of random choices'], ['virtual conductor', 'the headless version of the music clock']], facts: () => ['same seed + policy + fixed ticks = exact replay', 'view-only randomness never enters headless state'], related: [40, 48], sources: ['src/game/rng.ts', 'src/bot/conductor.ts'] },
  82: { summary: 'Every shipped audio file needs a traceable source, license, and processing record.', terms: [['provenance', 'the origin and permission trail for an asset']], facts: () => ['house samples carry credits beside the files', 'health reports describe processing and validation'], related: [60], sources: ['public/samples/house/CREDITS.md', 'public/samples/health-report.md'] },
  83: { summary: 'RunWorld owns deterministic facts; Pixi reads those facts and adds disposable cosmetic feedback.', terms: [['headless', 'running the simulation without drawing or playing sound'], ['cosmetic FX', 'feedback that can disappear without changing the result']], facts: () => ['RunWorld imports no Pixi', 'headless worlds can disable the FX request queue'], related: [40, 62], sources: ['src/game/run.ts', 'src/game/view.ts'] },
  84: { summary: 'Caps, culling, pooled searches, and bounded queues keep a dense horde responsive.', terms: [['culling', 'skipping drawing work for things outside the screen'], ['budget', 'a hard limit on work allowed in one frame']], facts: () => ['hard enemy cap 500', 'ground gems merge after their cap', 'hidden tabs cannot bank unbounded audio events'], related: [46, 49], sources: ['src/game/run.ts', 'src/game/view.ts'] },
  85: { summary: 'Status is data. Inspectable does not mean current, and a tool never resolves a parked design decision.', terms: [['dormant', 'kept and inspectable but unused by the current game'], ['parked', 'deliberately undecided until a named future phase']], facts: () => STATUS_CATALOG.map((item) => `${item.label}: ${item.meaning}`), related: [56, 69], sources: ['src/dev/catalogs.ts', 'docs/STATUS.md'] },
  86: { summary: 'The experimental boss conductor turns song sections into fight phases and beat-aligned attack instructions.', terms: [['conductor', 'the part that keeps song sections and attacks on the same timeline']], facts: () => [`${EXPERIMENTS.filter((item) => item.family === 'boss-fight').length} boss prototypes`, 'experimental: no normal-run integration'], related: [51, 52, 68], sources: ['src/boss/conductor.ts', 'src/boss/bosses.ts'] },
  87: { summary: 'Each system has one named owner; rooms read those owners rather than copying lists.', terms: [['source of truth', 'the one place allowed to define a fact']], facts: () => SOURCES.map((source) => `${source.label}: ${source.owns.join(', ')}`), related: [31, 32], sources: ['src/dev/catalogs.ts'] },
};

function renderMusicMuseumNarrative(context: RoomMountContext): void {
  const page = MUSEUMS[context.room.issue];
  if (!page) return;
  const intro = panel(context.root, 'Plain-language guide', page.summary);
  const terms = el('dl', 'dev-terms', intro);
  for (const [term, meaning] of page.terms) {
    el('dt', '', terms, term);
    el('dd', '', terms, meaning);
  }
  const facts = page.facts();
  const fact = el('p', 'dev-live-fact', intro, facts[Math.abs(context.fixture.seed) % Math.max(1, facts.length)] ?? 'No registered fact.');
  let factIndex = Math.abs(context.fixture.seed) % Math.max(1, facts.length);
  const next = button(intro, 'Show next production fact');
  next.onclick = () => {
    factIndex = (factIndex + 1) % Math.max(1, facts.length);
    fact.textContent = facts[factIndex] ?? 'No registered fact.';
  };
  const links = panel(context.root, 'Sources and related live rooms');
  for (const source of page.sources) {
    const anchor = el('a', 'dev-source-link', links, source);
    anchor.href = `https://github.com/yusufkinatas/loop-survivors/blob/HEAD/${source}`;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
  }
  for (const issue of page.related) {
    const target = DEV_ROOMS.find((room) => room.issue === issue);
    if (!target) continue;
    const related = button(links, `Open ${target.title}`);
    related.onclick = () => context.navigate(target);
  }
}

async function mountMuseum(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const page = MUSEUMS[context.room.issue] ?? MUSEUMS[87];
  const intro = panel(context.root, 'What this system does', page.summary);
  const terms = el('dl', 'dev-terms', intro);
  for (const [term, meaning] of page.terms) {
    el('dt', '', terms, term);
    el('dd', '', terms, meaning);
  }
  const proof = panel(context.root, 'Live production facts');
  const facts = page.facts();
  const fact = el('p', 'dev-live-fact', proof);
  const nextFact = button(proof, 'Show next live fact');
  let index = Math.abs(context.fixture.seed) % Math.max(1, facts.length);
  const paintFact = () => { fact.textContent = facts[index] ?? 'No registered fact.'; };
  nextFact.onclick = () => { index = (index + 1) % Math.max(1, facts.length); paintFact(); };
  paintFact();

  if (context.room.issue >= 70 && context.room.issue <= 73) {
    const engine = context.createEngine();
    bag.add(() => engine.dispose());
    const demo = button(proof, 'Play one Kick event');
    const heard = el('span', 'dev-inline-status', proof, 'ready');
    bag.add(engine.addTriggerListener((trigger) => { heard.textContent = `heard ${ROLE_META[trigger.role].name} at ${trigger.time.toFixed(3)}s`; }));
    bag.animationFrame(() => engine.update());
    demo.onclick = () => {
      void engine.ctx.resume();
      engine.preview('kick');
      heard.textContent = 'scheduled: one event is now travelling to sound + observer';
    };
    engine.setMasterGain(context.fixture.audio ? 0.8 : 0);
  }

  const links = panel(context.root, 'Go deeper');
  for (const source of [...page.sources, ...(context.room.sourceLinks ?? []).map((item) => item.path)]) {
    const anchor = el('a', 'dev-source-link', links, source);
    anchor.href = `https://github.com/yusufkinatas/loop-survivors/blob/HEAD/${source}`;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
  }
  for (const issue of page.related) {
    const related = button(links, `Open related room #${issue}`);
    related.onclick = () => {
      const target = DEV_ROOMS.find((room) => room.issue === issue);
      if (target) context.navigate(target);
    };
  }
  return makeSession(context, bag, { audio: context.room.issue >= 70 && context.room.issue <= 73 });
}

async function mountLegacy(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const boss = context.room.issue === 52 || context.room.issue === 68 || context.room.issue === 86;
  const warning = panel(
    context.root,
    `${context.room.status}: opens outside the current production run`,
    boss
      ? 'Boss fights are a standalone experiment. Playing them does not mean boss integration is approved or current.'
      : 'Track Lab contains superseded cover experiments. It is an archive, not the current build-makes-music truth.',
  );
  badge(warning, context.room.status);
  const link = el('a', 'dev-button', warning, boss ? 'Open legacy Boss Fights in a new tab' : 'Open legacy Track Lab in a new tab');
  link.href = boss ? '/?legacy=boss' : '/?legacy=tracklab';
  link.target = '_blank';
  link.rel = 'noreferrer';
  const catalog = panel(context.root, boss ? 'Registered boss experiments' : 'Preserved track experiments');
  const out = table(catalog, ['name', 'status', 'warning']);
  for (const experiment of EXPERIMENTS.filter((item) => item.family === (boss ? 'boss-fight' : 'track-lab'))) {
    row(out, [experiment.name, experiment.status, experiment.note]);
  }
  return makeSession(context, bag, {});
}

async function mountParked(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const host = panel(
    context.root,
    'PARKED — intentionally no mechanic exists here',
    'This placeholder preserves the future question without inventing behavior before its locked phase specification.',
  );
  badge(host, 'PARKED');
  if (context.room.blockers?.length) el('p', 'dev-copy', host, `Blocked by issues ${context.room.blockers.map((issue) => `#${issue}`).join(', ')}.`);
  for (const link of context.room.sourceLinks ?? []) {
    const anchor = el('a', 'dev-source-link', host, `${link.label}: ${link.path}`);
    anchor.href = `https://github.com/yusufkinatas/loop-survivors/blob/HEAD/${link.path}`;
    anchor.target = '_blank';
  }
  return makeSession(context, bag, {});
}

async function mountHealth(context: RoomMountContext): Promise<DevRoomSession> {
  const bag = new DisposeBag();
  const host = panel(
    context.root,
    'Campus health assertions',
    'These checks catch missing catalog entries, nondeterministic foundations, and disposable-audio regressions. Passing them is engineering evidence, not a developer gate.',
  );
  const run = button(host, 'Run assertions');
  const output = el('ul', 'dev-health-list', host);
  const browserSmoke = context.room.issue === 32 ? button(host, 'Run all 60 room mounts') : null;
  const smokeOutput = browserSmoke ? el('ol', 'dev-health-list', host) : null;
  if (context.room.issue === 82) {
    const provenance = panel(context.root, 'Audio provenance owners');
    const out = table(provenance, ['source station', 'status', 'path', 'owns']);
    for (const source of SOURCES.filter((item) => item.id === 'roles' || item.id === 'soundset' || item.id === 'patterns' || item.id.includes('track'))) {
      row(out, [source.label, source.status, source.path, source.owns.join(', ')]);
    }
    row(out, ['Production sample credits', 'CURRENT', 'public/samples/house/CREDITS.md', 'source and license']);
    row(out, ['Production sample health', 'CURRENT', 'public/samples/house/health-report.md', 'format, onset, duration, peak']);
  }
  if (context.room.issue === 49 || context.room.issue === 84) {
    const budgets = panel(context.root, 'Canonical bounded-work values');
    const out = table(budgets, ['budget', 'production value', 'owner']);
    row(out, ['hard alive-enemy ceiling', MAX_ALIVE_HARD, 'src/game/config.ts']);
    row(out, ['ground gem ceiling', RUN.maxGems, 'src/game/config.ts']);
    row(out, ['fixed simulation tick', `${(SIM_DT * 1000).toFixed(2)} ms`, 'src/bot/conductor.ts']);
    row(out, ['run duration', `${RUN.durationS}s`, 'src/game/config.ts']);
  }

  function check(label: string, assertion: () => void): void {
    const item = el('li', '', output);
    try {
      assertion();
      item.className = 'pass';
      item.textContent = `PASS — ${label}`;
    } catch (error) {
      item.className = 'fail';
      item.textContent = `FAIL — ${label}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  function assert(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
  }
  function execute(): void {
    output.replaceChildren();
    check('seven current slots, two active weapons each', () => {
      assert(BAND_SLOTS.length === 7, `got ${BAND_SLOTS.length} slots`);
      for (const slot of BAND_SLOTS) assert(ACTIVE_WEAPONS.filter((weapon) => weapon.slot === slot.id).length === 2, slot.id);
    });
    check('fourteen unique offered weapons; crash/riser absent', () => {
      assert(ACTIVE_WEAPONS.length === 14, `got ${ACTIVE_WEAPONS.length}`);
      assert(new Set(ACTIVE_WEAPONS.map((weapon) => weapon.role)).size === 14, 'duplicate role');
      assert(!ACTIVE_WEAPONS.some((weapon) => weapon.role === 'crash' || weapon.role === 'riser'), 'dormant role active');
    });
    check('generated catalogs have unique identities', () => {
      const groups = [CURRENT_ENEMIES.map((item) => item.kind), LEGACY_ENEMIES.map((item) => item.kind), FX.map((item) => item.type), UI_STATES.map((item) => item.id), SOURCES.map((item) => item.id)];
      for (const ids of groups) assert(ids.length === new Set(ids).size, 'duplicate catalog id');
    });
    check('same seed produces the same offers', () => {
      const tiers = new Map<Role, number>([['kick', 1]]);
      const a = JSON.stringify(rollOffers(tiers, mulberry32(context.fixture.seed), 0));
      const b = JSON.stringify(rollOffers(tiers, mulberry32(context.fixture.seed), 0));
      assert(a === b, 'offer sequences differ');
    });
    check('two production worlds stay byte-equivalent for 120 ticks', () => {
      const a = makeDeterministicSimulation(context.fixture.seed, 'kiter', 'random');
      const b = makeDeterministicSimulation(context.fixture.seed, 'kiter', 'random');
      for (let i = 0; i < 120; i++) {
        a.conductor.tick(SIM_DT); a.world.update(SIM_DT);
        b.conductor.tick(SIM_DT); b.world.update(SIM_DT);
      }
      assert(worldDigest(a.world) === worldDigest(b.world), 'world digests differ');
    });
    check('MusicEngine listener and graph are disposable', () => {
      const engine = context.createEngine();
      const unsubscribe = engine.addTriggerListener(() => {});
      unsubscribe();
      engine.dispose();
      engine.dispose();
    });
  }
  run.onclick = execute;
  if (browserSmoke && smokeOutput) {
    browserSmoke.onclick = async () => {
      browserSmoke.disabled = true;
      smokeOutput.replaceChildren();
      for (const room of DEV_ROOMS) {
        const result = el('li', '', smokeOutput, `RUN — #${room.issue} ${room.title}`);
        const scratch = document.createElement('div');
        scratch.style.position = 'fixed';
        scratch.style.left = '-20000px';
        scratch.style.top = '0';
        scratch.style.width = '960px';
        scratch.style.height = '600px';
        document.body.appendChild(scratch);
        try {
          const canonical = room.presets[0];
          const fixture = applyFixtureValues({
            ...DEFAULT_FIXTURE,
            preset: canonical.id,
            playing: false,
            audio: false,
            values: {},
          }, canonical.values);
          const session = await mountRoomAdapter({
            ...context,
            root: scratch,
            room,
            fixture,
            navigate: () => {},
          });
          session.setPlaying?.(false);
          session.step?.();
          await session.reset(cloneFixture(fixture));
          await session.dispose();
          result.className = 'pass';
          result.textContent = `PASS — #${room.issue} ${room.title}`;
        } catch (error) {
          result.className = 'fail';
          result.textContent = `FAIL — #${room.issue}: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          scratch.remove();
        }
      }
      browserSmoke.disabled = false;
    };
  }
  execute();
  return makeSession(context, bag, { reroll: true }, { reroll: execute, reset: execute });
}

/** Adapter fan-out kept separate from the registry: definitions classify a
 * room, while these mounts provide the smallest production-backed behavior
 * shared by rooms of that class. */
export async function mountRoomAdapter(context: RoomMountContext): Promise<DevRoomSession> {
  switch (context.room.adapter) {
    case 'world': {
      const { mountWorldRoom } = await import('./world-room');
      return mountWorldRoom(context);
    }
    case 'picks': return mountPicks(context);
    case 'music': return mountMusic(context);
    case 'determinism': return mountDeterminism(context);
    case 'ui': return mountUi(context);
    case 'input': return mountInput(context);
    case 'bot': return mountBot(context);
    case 'catalog': return mountCatalog(context);
    case 'museum': return mountMuseum(context);
    case 'boss-hazard': {
      const { mountBossHazardRoom } = await import('./boss-hazard-room');
      return mountBossHazardRoom(context);
    }
    case 'legacy-frame': return mountLegacy(context);
    case 'parked': return mountParked(context);
    case 'health': return mountHealth(context);
  }
}
