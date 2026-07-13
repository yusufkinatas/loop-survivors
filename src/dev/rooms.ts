import type { ContentStatus } from './catalog';

export type RoomKind = 'gym' | 'zoo' | 'museum' | 'archive';
export type RoomRenderer =
  | 'simulation'
  | 'weapons'
  | 'enemies'
  | 'picks'
  | 'stage'
  | 'music'
  | 'boss'
  | 'tracklab'
  | 'catalog'
  | 'museum'
  | 'parked';

export interface RoomControlSupport {
  play?: boolean;
  step?: boolean;
  speed?: boolean;
  audio?: boolean;
  overlays?: boolean;
  seed?: boolean;
}

export interface DevRoomDef {
  issue: number;
  kind: RoomKind;
  slug: string;
  title: string;
  status: ContentStatus;
  summary: string;
  tags: string[];
  renderer: RoomRenderer;
  presets: readonly string[];
  controls: RoomControlSupport;
}

const sim = { play: true, step: true, speed: true, audio: true, overlays: true, seed: true };
const audio = { play: true, speed: true, audio: true, seed: true };
const inspect = { overlays: true, seed: true };
const docs = {};

function room(
  issue: number,
  kind: RoomKind,
  slug: string,
  title: string,
  summary: string,
  renderer: RoomRenderer,
  presets: readonly string[] = ['shipped'],
  status: ContentStatus = 'CURRENT',
  controls: RoomControlSupport = docs,
  tags: string[] = [],
): DevRoomDef {
  return { issue, kind, slug, title, status, summary, renderer, presets, controls, tags };
}

/** The complete issue #27 room registry. Search/navigation/status all derive
 * from this table; individual rooms never register themselves ad hoc. */
export const DEV_ROOMS: readonly DevRoomDef[] = [
  room(33, 'gym', 'parity-run', 'Mad Forest parity run', 'Canonical eight-minute manual gate, fixed seeds, minute checkpoints, and observation checklist.', 'simulation', ['manual-full', 'kiter-full', 'greedy-full', 'minute-0', 'minute-1', 'minute-2', 'minute-3', 'minute-4', 'minute-5', 'minute-6', 'minute-7'], 'CURRENT', sim, ['hands gate', 'run', 'checkpoint']),
  room(34, 'gym', 'movement', 'Movement, collision, and contact', 'Measure cardinal/diagonal travel, circles, separation, armor, and the 120 ms contact lock.', 'simulation', ['empty', 'single-pursuer', 'squeeze', 'dense-overlap', 'knockback-immune'], 'CURRENT', sim, ['player', 'hitbox', 'touch']),
  room(35, 'gym', 'weapons', 'Weapon mechanics isolation', 'Fire every active weapon and tier through the production trigger and damage path.', 'weapons', ['single', 'line', 'cluster', 'ring', 'moving-horde', 'high-health', 'knockback-immune'], 'CURRENT', sim, ['damage', 'geometry', 'projectile', 'field']),
  room(36, 'gym', 'enemies', 'Enemy behavior isolation', 'Inspect every current enemy at selected level, count, formation, contact, knockback, death, and XP.', 'enemies', ['pursuit', 'contact', 'overlap', 'knockback', 'immune', 'elite-death', 'xp-drop'], 'CURRENT', sim, ['horde', 'stats', 'AI']),
  room(37, 'gym', 'rewards', 'XP, gems, and diegetic rewards', 'Exercise XP walls, gem ranges, ground choices, stacked rewards, slowdown, cue, and next-bar application.', 'simulation', ['single-level', 'stacked-levels', 'boss-reward', 'full-build-heal'], 'CURRENT', sim, ['level up', 'pickup', 'queue']),
  room(38, 'gym', 'picks', 'Pick pool and seven-slot band', 'Construct a band, inspect legal/rejected candidates, and run reproducible offer distributions.', 'picks', ['empty-early', 'empty-late', 'partial-band', 'tier-four', 'full-band'], 'CURRENT', inspect, ['offers', 'weights', 'slots']),
  room(39, 'gym', 'music', 'Current music/build rehearsal', 'Audition current voices, tiers, slot forks, wide/deep builds, and a full seven-slot band.', 'music', ['one-hit', 'one-voice', 'slot-forks', 'wide', 'deep', 'full-band', 'dormant-audio'], 'CURRENT', audio, ['rehearsal', 'soundset', 'ear gate']),
  room(40, 'gym', 'determinism', 'Replay divergence inspector', 'Step equivalent seeded worlds, compare hashes, seek, and capture the first mismatch.', 'simulation', ['known-good', 'unsafe-random-example'], 'CURRENT', sim, ['replay', 'RNG', 'hash']),
  room(41, 'gym', 'ui-states', 'UI and run-state matrix', 'Reproduce shell states and interaction transitions across representative viewports.', 'catalog', ['start', 'run', 'pause', 'reward', 'end', 'replay', 'sandbox'], 'CURRENT', inspect, ['UI', 'pause', 'background']),
  room(42, 'gym', 'scratch', 'Scratch Gym', 'Free-form production RunWorld/RunView testing with stage off, named fixtures, reset, step, and canonical catalogs.', 'simulation', ['empty', 'full-band', 'enemy-ring', 'dense-horde', 'projectile-heavy'], 'CURRENT', sim, ['sandbox', 'free form']),
  room(43, 'gym', 'devices', 'Input, viewport, and interruption', 'Test keyboard/touch, fixed device sizes, safe areas, and background/audio recovery.', 'catalog', ['desktop', 'tablet', 'phone-portrait', 'phone-landscape', 'interruption'], 'CURRENT', inspect, ['responsive', 'safe area', 'input']),
  room(44, 'gym', 'stage', 'Stage timeline and event windows', 'Select canonical wave/event rows and deterministically simulate their lead-in windows.', 'stage', ['0:00', '1:00', '2:05-sweeps', '3:00', '4:10-sweeps', '5:00-flowers', '6:00', '7:00-finale'], 'CURRENT', sim, ['director', 'wave', 'event']),
  room(45, 'gym', 'kick', 'Kick calibration', 'Compare every tier’s facing strips, opposite-side delay, damage, area, and shared repeat-hit lock.', 'weapons', ['tier-I', 'tier-II', 'tier-III', 'tier-IV', 'fresh-targets', 'repeat-target'], 'CURRENT', sim, ['whip', 'strip', 'lock']),
  room(46, 'gym', 'hordes', 'Horde pressure and formations', 'Fire active formations independently and observe population floors, classes, and hard caps.', 'simulation', ['quota', 'bat-sweep', 'flower-wall', 'boss', 'hard-cap'], 'CURRENT', sim, ['formation', 'population']),
  room(47, 'gym', 'sync', 'Audio–gameplay synchronization', 'Trace one timing event into sound and gameplay, including heard-time changes and pause/speed boundaries.', 'weapons', ['one-trigger', 'next-bar-tier', 'pause-resume', 'speed-change', 'muted'], 'CURRENT', sim, ['causality', 'lookahead', 'heard time']),
  room(48, 'gym', 'bot', 'Visible bot and outlier workflow', 'Run small production bot batches and reproduce outliers without granting automation design authority.', 'simulation', ['kiter-random', 'greedy-deep', 'active-focus-each'], 'CURRENT', sim, ['balance', 'policy', 'replay']),
  room(49, 'gym', 'stress', 'Performance and stress', 'Reproducible horde, weapon, FX, pickup, and cap stress scenes with split metrics.', 'simulation', ['45-enemies', '90-enemies', '150-enemies', '240-enemies', '300-enemies', '500-enemies', 'fx-heavy', 'gems'], 'CURRENT', sim, ['FPS', 'caps', 'spatial hash']),
  room(50, 'gym', 'vfx', 'VFX and feedback feel', 'Trigger every current feedback family, pause on keyframes, and restore shipped values on reset.', 'catalog', ['rings', 'death', 'kick', 'arc', 'damage', 'spark', 'shake', 'flash', 'slam', 'level-up', 'caps'], 'CURRENT', inspect, ['juice', 'effect']),
  room(51, 'gym', 'boss-hazards', 'Boss hazard isolation', 'Run every standalone BossWorld hazard and inspect telegraph/live/damage phases.', 'boss', ['bullets', 'rings', 'shockwave', 'beam', 'lane', 'zone', 'arc', 'lunge'], 'EXPERIMENTAL', sim, ['boss', 'hazard']),
  room(52, 'gym', 'boss-fights', 'Existing boss fights', 'Play the standalone track-driven boss prototypes with fast phase access and visible dash state.', 'boss', ['metamorphosis', 'satisfaction', 'pursuit'], 'EXPERIMENTAL', sim, ['boss', 'dodge', 'prototype']),
  room(53, 'gym', 'accessibility', 'Accessibility and readability', 'Stress muted play, low motion, contrast, density, hit areas, and visual separation without setting policy.', 'catalog', ['muted', 'low-motion', 'contrast', 'dense-horde', 'phone'], 'CURRENT', inspect, ['readability', 'motion']),
  room(54, 'gym', 'onboarding', 'First-time experience scenarios', 'Awaiting the locked M4 first-time-experience specification.', 'parked', ['spec-required'], 'PARKED', docs, ['M4', 'placeholder']),
  room(55, 'gym', 'future-systems', 'Future-system Gym placeholders', 'Searchable placeholders for systems that require a future locked phase specification.', 'parked', ['stage-music-hooks', 'tempo-progression', 'weapon-swapping', 'visual-style'], 'PARKED', docs, ['placeholder', 'spec required']),

  room(56, 'zoo', 'dormant-audio', 'Dormant crash/riser audio', 'Audition the two retained catalog sounds without enabling either as a production weapon.', 'catalog', ['crash', 'riser'], 'DORMANT', audio, ['audio only']),
  room(57, 'zoo', 'weapons', 'Active weapon catalog', 'Fourteen current weapons × four tiers generated from weapon, slot, and ladder registries.', 'weapons', ['tier-I', 'tier-II', 'tier-III', 'tier-IV'], 'CURRENT', inspect, ['14 weapons', 'tiers']),
  room(58, 'zoo', 'enemies', 'Active Mad Forest enemies', 'Twelve current enemies at comparable scale with production stats and level-dependent health.', 'enemies', ['level-1', 'level-5', 'level-10', 'level-20', 'level-40'], 'CURRENT', inspect, ['12 enemies', 'bestiary']),
  room(59, 'zoo', 'weapon-bodies', 'Projectile, field, and hit areas', 'Compare every active weapon body, field, strip, cone, trajectory, and collision area.', 'weapons', ['paused', 'live', 'tier-IV'], 'CURRENT', inspect, ['geometry', 'field']),
  room(60, 'zoo', 'sounds', 'Production sounds and one-shots', 'Canonical voice/variation catalog with active/dormant and synthesized/sample-backed status.', 'catalog', ['active', 'dormant', 'missing-sample'], 'CURRENT', audio, ['sample', 'license']),
  room(61, 'zoo', 'legacy-enemies', 'Legacy enemy archive wing', 'Eight pre-parity enemies preserved behind an explicit historical boundary.', 'enemies', ['bodies', 'stats', 'behaviors'], 'HISTORICAL', inspect, ['archive', 'dormant']),
  room(62, 'zoo', 'vfx', 'VFX and feedback catalog', 'Comparable current feedback specimens, capped stress variants, and stable screenshot fixtures.', 'catalog', ['black', 'game-grey', 'light', 'stress'], 'CURRENT', inspect, ['visual regression']),
  room(63, 'zoo', 'patterns', 'Weapon timing patterns', 'All active four-tier timing patterns side by side with sight/ear progression.', 'weapons', ['alone', 'band-context'], 'CURRENT', audio, ['grid', 'ladder']),
  room(64, 'zoo', 'pickups', 'Pickups, rewards, and glyphs', 'Gem and active ground-choice visuals with all production interaction circles.', 'catalog', ['idle', 'collect', 'reject', 'queued', 'stacked'], 'CURRENT', inspect, ['gem', 'glyph']),
  room(65, 'zoo', 'ui', 'UI and responsive layouts', 'Real UI family launchers and canonical responsive states for comparison.', 'catalog', ['desktop', 'tablet', 'phone', 'maximum', 'error'], 'CURRENT', inspect, ['HUD', 'responsive']),
  room(66, 'zoo', 'tokens', 'Icons, palette, and readability tokens', 'Canonical weapon/enemy/slot/semantic tokens on game and diagnostic backgrounds.', 'catalog', ['game', 'black', 'light'], 'CURRENT', inspect, ['color', 'typography']),
  room(67, 'zoo', 'mix', 'Audio mix and low-end interaction', 'Full-band, slot isolation, mute/solo, output level, and kick/low-instrument interaction.', 'music', ['full-band', 'slot-alone', 'wide', 'deep', 'kick-low'], 'CURRENT', audio, ['meter', 'ducking']),
  room(68, 'zoo', 'boss', 'Boss bodies, hazards, and HUD', 'Standalone boss content side by side with unavoidable experimental status.', 'boss', ['bodies', 'telegraphs', 'hazards', 'HUD'], 'EXPERIMENTAL', inspect, ['boss', 'prototype']),
  room(69, 'archive', 'track-lab', 'Track Lab covers and superseded experiments', 'Live historical cover experiments, provenance, and a clear boundary from current build-made music.', 'tracklab', ['sahara', 'metamorphosis', 'pursuit', 'satisfaction', 'da-funk'], 'HISTORICAL', audio, ['covers', 'dropped direction']),

  room(70, 'museum', 'causality', 'One trigger, two outputs', 'A live event feeds the same sound and gameplay attack; a split-trigger counterexample is labeled forbidden.', 'museum', ['correct', 'muted', 'forbidden-split'], 'CURRENT', sim, ['pillar', 'causality']),
  room(71, 'museum', 'clock', 'Clock, beats, bars, phrase, tempo, and swing', 'Plain-language live timeline: smaller steps group into beats, beats into bars, and four bars into the repeating phrase.', 'museum', ['straight', 'swing', 'tempo'], 'CURRENT', audio, ['music terms', 'playhead']),
  room(72, 'museum', 'scheduling', 'Audio scheduling and heard-time changes', 'Lookahead, due time, next-bar entry, pause, and the intentionally wrong early-application example.', 'museum', ['next-bar', 'pause', 'background-stall', 'bad-early'], 'CURRENT', sim, ['scheduler', 'queue']),
  room(73, 'museum', 'audio-path', 'Audio signal path and volume groups', 'Voice → voice volume → weapons group → master → limiter/output, with mute and reward dip.', 'museum', ['voice', 'slot-mute', 'global-mute', 'reward-dip', 'kick-low'], 'CURRENT', audio, ['gain', 'routing']),
  room(74, 'museum', 'band', 'Seven-slot band and offers', 'Live legal/rejected picks, early weighting, permanent positions, four tiers, and heal fallback.', 'museum', ['legal', 'rejected', 'full-band'], 'CURRENT', inspect, ['offers', 'build']),
  room(75, 'museum', 'archetypes', 'Weapon archetypes and geometry', 'Live strips, cones, projectiles, homing, boomerangs, orbiters, lob/shards, and fields.', 'museum', ['archetypes', 'boundaries'], 'CURRENT', sim, ['weapon', 'geometry']),
  room(76, 'museum', 'progression', 'XP and reward lifecycle', 'Kill through XP, physical choice, queueing, and next-bar application with ownership boundaries.', 'museum', ['single', 'stacked', 'full-build'], 'CURRENT', sim, ['state diagram', 'reward']),
  room(77, 'museum', 'collision', 'Enemy movement and spatial hash', 'Live hash cells, circle checks, pursuit, overlap, contact lock, knockback, and recycling.', 'museum', ['cell-edge', 'dense', 'immune'], 'CURRENT', sim, ['collision', 'performance']),
  room(78, 'museum', 'stage', 'Stage director and dividing rule', 'The canonical 0:00–8:00 pressure schedule, live fixture links, and separation from build music.', 'stage', ['timeline'], 'CURRENT', inspect, ['director', 'dividing rule']),
  room(79, 'museum', 'reference', 'Mad Forest reference provenance', 'CURRENT, LEGACY, DERIVED, ADOPTED, and INFERENCE evidence kept visibly distinct.', 'museum', ['movement', 'enemies', 'waves', 'rewards', 'kick'], 'CURRENT', inspect, ['research', 'provenance']),
  room(80, 'museum', 'time', 'Global speed and fixed ticks', 'Developer speed × reward slowdown, fixed-step payout, audio rate, visual time, and separate replay speed.', 'museum', ['normal', 'slowdown', 'fast', 'pause', 'zero'], 'CURRENT', sim, ['timeScale', 'fixed dt']),
  room(81, 'museum', 'determinism', 'Seeded determinism and exact replay', 'Seeded RNG, fixed ticks, virtual conductor, bot, browser replay, and deliberate divergence.', 'museum', ['matching', 'unsafe-random'], 'CURRENT', sim, ['bot', 'replay']),
  room(82, 'museum', 'audio-provenance', 'Audio asset provenance and health', 'Source, license, use status, processing, duration, peak, format, fallback, and health flags.', 'museum', ['production', 'dormant', 'missing-metadata'], 'CURRENT', inspect, ['license', 'samples']),
  room(83, 'museum', 'world-view', 'Simulation, view, FX, and headless mode', 'Live production objects show authoritative world state, optional rendering/FX, and shell-owned rewards.', 'museum', ['live', 'no-fx', 'headless'], 'CURRENT', sim, ['architecture', 'Pixi']),
  room(84, 'museum', 'performance', 'Horde performance architecture', 'Spatial occupancy, culling, entity/FX caps, fixed-step debt, and separated cost counters.', 'museum', ['normal', 'caps', 'stress'], 'CURRENT', sim, ['budget', 'culling']),
  room(85, 'museum', 'status', 'System status map', 'Current, dormant, removed, parked, historical, and experimental systems with authoritative links.', 'museum', ['all-statuses'], 'CURRENT', docs, ['source of truth']),
  room(86, 'museum', 'boss-conductor', 'Boss conductor and song phases', 'Standalone track sections become prototype fight phases and timed attacks.', 'boss', ['synth', 'record', 'phase'], 'EXPERIMENTAL', sim, ['boss', 'conductor']),
  room(87, 'museum', 'source', 'Canonical source navigator', 'Live index from runtime registries to specimens, focused rooms, code, and rationale documents.', 'museum', ['all-systems'], 'CURRENT', docs, ['config', 'source']),
] as const;

export function roomPath(room: DevRoomDef): string {
  return `#dev/${room.kind}/${room.slug}`;
}

export function findRoom(kind: string, slug: string): DevRoomDef | undefined {
  return DEV_ROOMS.find((room) => room.kind === kind && room.slug === slug);
}

export function assertRoomRegistry(): void {
  const issues = new Set<number>();
  const paths = new Set<string>();
  for (const room of DEV_ROOMS) {
    if (issues.has(room.issue)) throw new Error(`duplicate Dev Campus issue #${room.issue}`);
    if (paths.has(roomPath(room))) throw new Error(`duplicate Dev Campus path ${roomPath(room)}`);
    if (room.presets.length === 0) throw new Error(`${roomPath(room)} has no default preset`);
    issues.add(room.issue);
    paths.add(roomPath(room));
  }
  for (let issue = 33; issue <= 87; issue++) {
    if (!issues.has(issue)) throw new Error(`Dev Campus issue #${issue} is not registered`);
  }
}

assertRoomRegistry();
