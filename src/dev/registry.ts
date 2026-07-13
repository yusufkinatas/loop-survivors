/** Complete Dev Campus room registry.
 *
 * GitHub issues #28–#87 are represented exactly once. Foundation work is
 * listed under Museum because it documents/inspects the campus itself; the
 * player-facing taxonomy intentionally has no fourth "Foundation" room kind.
 */

import type { DevRoomDefinition, DevRoomKind, DevStatus, RoomAdapter, RoomPreset } from './types';

const preset = (id: string, label: string, description: string, values?: Record<string, string>): RoomPreset =>
  ({ id, label, description, values });

type RoomInput = Omit<DevRoomDefinition, 'presets' | 'systems' | 'keywords' | 'sourceLinks'> & {
  presets: readonly RoomPreset[];
  systems: readonly string[];
  keywords: readonly string[];
  sourceLinks?: readonly { label: string; path: string }[];
};

const room = (definition: RoomInput): DevRoomDefinition => definition;

export const DEV_ROOMS: readonly DevRoomDefinition[] = [
  room({
    issue: 28, slug: 'lifecycle', kind: 'museum', status: 'CURRENT', title: 'Disposable room lifecycle and isolated session contract',
    purpose: 'Define the lifecycle that makes fast switching safe. Current pages rely on full reloads to clean up audio state, trigger listeners, keyboard handlers, Pixi tickers, and animation loops.',
    systems: ['Dev Campus', 'session lifecycle', 'cleanup'], keywords: ['mount', 'reset', 'dispose', 'listeners', 'timers', 'Pixi', 'Web Audio'], adapter: 'health',
    presets: [preset('mount-reset-dispose', 'Mount → reset → dispose', 'Exercise one complete isolated-session lifecycle.'), preset('switch-stress', 'Repeated switching', 'Switch repeatedly and watch owned resource counts return to zero.')],
    statusNote: 'Current tooling infrastructure only; it cannot pass or change a developer gate.', sourceLinks: [{ label: 'Lifecycle contract', path: 'src/dev/lifecycle.ts' }],
  }),
  room({
    issue: 29, slug: 'scenario-controls', kind: 'museum', status: 'CURRENT', title: 'Shared scenario controls, deterministic presets, and copyable deep links',
    purpose: 'Give every room the same reproducible control language so a developer can reproduce a finding without memorizing console commands.',
    systems: ['fixtures', 'deep links', 'shared controls'], keywords: ['preset', 'seed', 'hard reset', 'play', 'pause', 'single step', 'speed', 'audio', 'overlays', 'viewport'], adapter: 'catalog',
    presets: [preset('round-trip', 'URL round trip', 'Serialize every shared control and restore the same fixture.'), preset('single-step', 'One fixed tick', 'Pause and advance exactly one fixed simulation tick.')], blockers: [28],
    statusNote: 'Current campus infrastructure; local storage may remember ergonomics but never scenario truth.', sourceLinks: [{ label: 'Fixture codec', path: 'src/dev/fixture.ts' }],
  }),
  room({
    issue: 30, slug: 'campus-shell', kind: 'museum', status: 'CURRENT', title: 'Unified #dev shell, registry, navigation, and status badges',
    purpose: 'Replace fragmented dev entrances with one fast, searchable campus while keeping the player-facing start screen clean.',
    systems: ['Dev Campus shell', 'navigation', 'search'], keywords: ['hub', 'breadcrumbs', 'previous', 'next', 'command palette', 'status badge', 'redirect'], adapter: 'catalog',
    presets: [preset('registry', 'All rooms', 'Browse the complete typed room registry and its status badges.'), preset('compatibility-links', 'Compatibility links', 'Verify old Rehearsal, Track Lab, and Boss links resolve to campus rooms.')], blockers: [28],
    statusNote: 'Current developer-only navigation; experimental and parked status is visible before launch.', sourceLinks: [{ label: 'Room registry', path: 'src/dev/registry.ts' }],
  }),
  room({
    issue: 31, slug: 'canonical-catalogs', kind: 'museum', status: 'CURRENT', title: 'Canonical content/status registries and documentation-drift cleanup',
    purpose: 'Make the game itself the source of truth. Generated rooms must not maintain parallel handwritten lists that drift from current content.',
    systems: ['catalogs', 'content status', 'source of truth'], keywords: ['fourteen weapons', 'seven slots', 'current enemies', 'legacy enemies', 'dormant audio', 'FX', 'UI states', 'experiments'], adapter: 'catalog',
    presets: [preset('completeness', 'Completeness audit', 'Assert exact current, dormant, historical, and experimental catalog membership.'), preset('status-separation', 'Status separation', 'Show content grouped by status and verify illegal crossovers are impossible.')], blockers: [28],
    statusNote: 'Current canonical tooling data; crash/riser are audio-only and legacy enemies are never current.', sourceLinks: [{ label: 'Canonical catalogs', path: 'src/dev/catalogs.ts' }],
  }),
  room({
    issue: 32, slug: 'room-smoke-tests', kind: 'museum', status: 'CURRENT', title: 'Automated room smoke tests, catalog assertions, and visual regression',
    purpose: "Turn the Dev Campus into regression infrastructure without letting automation replace the developer's judgment.",
    systems: ['room automation', 'catalog assertions', 'visual regression'], keywords: ['smoke', 'lifecycle leak', 'deep link', 'screenshot', 'invariant', 'CI'], adapter: 'health',
    presets: [preset('all-defaults', 'All room defaults', 'Boot, reset, and dispose every room at its canonical default.'), preset('zoo-screenshots', 'Zoo screenshots', 'Capture stable catalog fixtures without claiming an eye gate.')], blockers: [29, 30, 31],
    statusNote: 'Current regression tooling; output may report failures but never a passed hands, ear, or eye gate.',
  }),

  room({
    issue: 33, slug: 'parity-run', kind: 'gym', status: 'CURRENT', title: 'Mad Forest parity run and current hands-gate scenarios',
    purpose: 'Provide the canonical manual eight-minute gate with reproducible seeds and fast access to every minute without falsifying simulation state.',
    systems: ['RunWorld', 'Mad Forest stage', 'hands gate'], keywords: ['manual', 'Kiter', 'Greedy', 'checkpoint', '0:00', '7:00', 'replay', 'Kick'], adapter: 'world',
    presets: [preset('manual-full', 'Manual eight minutes', 'Play the full production run from 0:00.'), preset('minute-4', '4:00 checkpoint', 'Reconstruct the minute-four state by deterministic simulation.'), preset('finale', '7:00 finale', 'Reconstruct the final minute and continue manually.')], blockers: [29, 30, 31],
    statusNote: 'Current pending parity gate; the room records observations and never marks the developer gate passed.', sourceLinks: [{ label: 'Current gate', path: 'docs/STATUS.md' }],
  }),
  room({
    issue: 34, slug: 'movement-contact', kind: 'gym', status: 'CURRENT', title: 'Player movement, collision, and contact metrics',
    purpose: 'Make player movement weight, collision, crowd separation, and contact danger directly measurable.',
    systems: ['player movement', 'collision', 'contact damage'], keywords: ['cardinal', 'diagonal', 'touch', 'auto mover', 'hitbox', 'feet anchor', '120 ms', 'invulnerability'], adapter: 'world',
    presets: [preset('empty-grid', 'One-second travel', 'Compare cardinal and diagonal distance on a marked grid.'), preset('squeeze', 'Crowd squeeze', 'Measure separation and repeated contact in a dense corridor.'), preset('immune-contact', 'Knockback-resistant contact', 'Inspect contact timing against a body that ignores combat pushes.')], blockers: [29, 30, 31],
    statusNote: 'Current production movement and collision values; no Gym-only motion model.',
  }),
  room({
    issue: 35, slug: 'weapon', kind: 'gym', status: 'CURRENT', title: 'Weapon mechanics isolation for all active weapons and tiers',
    purpose: 'Test each of the fourteen active weapons in isolation through the real trigger and damage paths.',
    systems: ['weapons', 'RunWorld.fireTrigger', 'damage'], keywords: ['tier', 'event strength', 'facing', 'target', 'pierce', 'repeat hit', 'field', 'DPS', 'muted'], adapter: 'world',
    presets: [preset('single-target', 'Single target', 'Fire the selected production weapon at one durable target.'), preset('line', 'Piercing line', 'Expose travel, width, and pierce against aligned bodies.'), preset('cluster', 'Dense cluster', 'Expose area, fields, repeat hits, and overkill.')], blockers: [29, 30, 31],
    statusNote: 'Current weapons only: fourteen roles × four tiers; crash/riser cannot be selected.',
  }),
  room({
    issue: 36, slug: 'enemy', kind: 'gym', status: 'CURRENT', title: 'Enemy behavior isolation and stat-level presets',
    purpose: "Inspect each current enemy's movement, collision, contact, knockback, death, and reward behavior without stage pressure.",
    systems: ['enemies', 'movement', 'rewards'], keywords: ['pursuit', 'contact', 'overlap', 'knockback', 'immunity', 'elite', 'XP', 'player level'], adapter: 'world',
    presets: [preset('pursuit', 'Pursuit', 'One selected current enemy pursues in open space.'), preset('overlap', 'Dense overlap', 'Reset a reproducible overlapping formation.'), preset('elite-death', 'Elite death and reward', 'Kill an elite through production damage and inspect its drop.')], blockers: [29, 30, 31],
    statusNote: 'Current twelve-enemy Mad Forest roster only; pre-parity enemies live in the Legacy Zoo.',
  }),
  room({
    issue: 37, slug: 'xp-reward', kind: 'gym', status: 'CURRENT', title: 'XP, gems, diegetic level-up, and reward queue',
    purpose: 'Exercise the full reward path, including shell-owned behavior absent from headless bot resolution.',
    systems: ['XP', 'gems', 'ground rewards', 'reward queue'], keywords: ['threshold', 'magnet', 'pickup', 'enemy shove', 'slow moment', 'volume dip', 'next bar', 'heal fallback'], adapter: 'world',
    presets: [preset('single-level', 'Single level-up', 'Collect enough XP for one physical three-choice reward.'), preset('stacked-levels', 'Stacked rewards', 'Queue multiple levels and present one triangle at a time.'), preset('full-build', 'Full-build heal', 'Resolve a reward after every slot reaches tier four.')], blockers: [29, 30, 31],
    statusNote: 'Current shell and world behavior; reward-item collection never inherits the gem magnet radius.',
  }),
  room({
    issue: 38, slug: 'picks-band', kind: 'gym', status: 'CURRENT', title: 'Pick pool, offer distribution, and seven-slot band rules',
    purpose: 'Make offer eligibility, weighting, slot exclusion, tier progression, and full-build behavior observable and reproducible.',
    systems: ['pick pool', 'band slots', 'offer RNG'], keywords: ['legal pool', 'weights', 'three cards', 'early nudge', 'permanent slot', 'tier four', 'heal'], adapter: 'picks',
    presets: [preset('empty-build', 'Empty build', 'Inspect the legal pool and early Beat/Snap weighting.'), preset('occupied-slots', 'Occupied slots', 'Verify competing roles leave the pool once their slot is owned.'), preset('thousands', '10,000 rolls', 'Describe a seeded offer distribution without deciding balance.', { trials: '10000' })], blockers: [29, 30, 31],
    statusNote: 'Current fourteen-weapon/seven-slot rules; dormant crash/riser are invariant failures if offered.',
  }),
  room({
    issue: 39, slug: 'music-rehearsal', kind: 'gym', status: 'CURRENT', title: 'Music/build rehearsal for the current fourteen-weapon soundset',
    purpose: 'Turn the Rehearsal Room into a truthful current-build Music Gym rather than a mixture of current voices and old six-role progression presets.',
    systems: ['MusicEngine', 'timing patterns', 'soundset'], keywords: ['one hit', 'one voice', 'tier', 'slot fork', 'wide build', 'deep build', 'full band', 'draft'], adapter: 'music',
    presets: [preset('one-voice', 'One current voice', 'Hear a selected active voice alone in a consistent context.'), preset('slot-fork', 'Two choices, one slot', 'Compare both active choices for a band position.'), preset('full-band', 'Seven-slot band', 'Hear one current role in every slot at the selected tiers.')], blockers: [29, 30, 31],
    statusNote: 'Current active voices by default; crash/riser appear only behind the dormant-audio filter.',
  }),
  room({
    issue: 40, slug: 'replay-divergence', kind: 'gym', status: 'CURRENT', title: 'Replay and deterministic-simulation divergence inspector',
    purpose: 'Make live/browser/headless agreement inspectable rather than relying only on successful replay observation.',
    systems: ['determinism', 'replay', 'headless simulation'], keywords: ['seed', 'mover', 'policy', 'state hash', 'seek', 'RNG position', 'first divergence'], adapter: 'determinism',
    presets: [preset('same-seed', 'Matching worlds', 'Step two identical worlds and compare state hashes.'), preset('unsafe-random', 'Injected divergence', 'Demonstrate the first mismatch caused by unsafe randomness.')], blockers: [29, 30],
    statusNote: 'Current diagnostic path; normal replay semantics and recorded inputs remain untouched.',
  }),
  room({
    issue: 41, slug: 'ui-state-matrix', kind: 'gym', status: 'CURRENT', title: 'UI and run-state interaction matrix',
    purpose: 'Jump directly into every shell/UI state and test behavior, focus, audio lifecycle, and resizing without playing through a full run.',
    systems: ['game shell', 'HUD', 'UI states'], keywords: ['start', 'run', 'pause', 'reward', 'death', 'victory', 'sandbox', 'replay', 'focus', 'resize'], adapter: 'ui',
    presets: [preset('run-paused', 'Paused run', 'Open a populated run, pause, and verify focus/input ownership.'), preset('reward', 'Ground reward', 'Open the physical-choice state with nearby enemies.'), preset('phone', 'Phone viewport', 'Exercise the same state at a representative narrow size.', { viewport: 'phone' })], blockers: [29, 30, 31],
    statusNote: 'Current UI behavior, including compound shell flags that are not separate simulation states.',
  }),
  room({
    issue: 42, slug: 'scratch', kind: 'gym', status: 'CURRENT', title: 'Migrate the free-form combat Sandbox as the Scratch Gym',
    purpose: "Preserve today's flexible Sandbox for unpredictable ad hoc investigation while making curated rooms the primary workflow.",
    systems: ['Sandbox', 'RunWorld', 'loadout editor'], keywords: ['scratch', 'spawn enemy', 'add weapon', 'tier', 'kill visible', 'free form'], adapter: 'world',
    presets: [preset('blank', 'Blank scratch world', 'Stage-free production world with no automatic spawns.'), preset('full-band', 'Full band scratch', 'Start with seven active weapons for immediate ad hoc testing.')], blockers: [29, 30, 31],
    statusNote: 'Current production Sandbox migrated into disposable campus lifecycle ownership.',
  }),
  room({
    issue: 43, slug: 'input-device', kind: 'gym', status: 'CURRENT', title: 'Input, viewport, safe-area, and audio-interruption testing',
    purpose: 'Exercise required mobile behavior and current desktop inputs across representative devices and lifecycle interruptions.',
    systems: ['input', 'viewport', 'safe area', 'audio lifecycle'], keywords: ['WASD', 'arrows', 'touch', 'joystick', 'orientation', 'resize', 'background', 'AudioContext'], adapter: 'input',
    presets: [preset('desktop', 'Desktop keyboard', 'Compare WASD and arrow-key input on the reference viewport.'), preset('phone-portrait', 'Phone portrait', 'Show touch controls and safe-area markers.', { viewport: 'phone' }), preset('interrupt', 'Background/resume', 'Exercise pause, background, audio suspension, and recovery.')], blockers: [29, 30],
    statusNote: 'Current desktop behavior plus required future-platform coverage; unsupported platform work is not silently implemented.',
  }),
  room({
    issue: 44, slug: 'stage-timeline', kind: 'gym', status: 'CURRENT', title: 'Stage timeline scrub and event-window runner',
    purpose: 'Inspect the data-driven 0:00–7:00 schedule and its exact event neighborhoods without playing unrelated minutes.',
    systems: ['stage director', 'waves', 'events'], keywords: ['timeline', 'scrub', 'wave row', 'boss', 'bat sweep', 'flower wall', 'event window'], adapter: 'world',
    presets: [preset('minute-0', '0:00 opening', 'Run the opening row and starting population.'), preset('flower-wall', '5:00 flower wall', 'Reconstruct the boss and enclosure event window.'), preset('finale', '7:00–8:00 finale', 'Run the final row through the explicit 8:00 boundary.')], blockers: [29, 31, 36],
    statusNote: 'Current canonical Mad Forest stage data; time jumps rebuild by simulation or validated snapshots.',
  }),
  room({
    issue: 45, slug: 'kick-calibration', kind: 'gym', status: 'CURRENT', title: 'Dedicated Kick calibration: facing strips and repeat-hit lock',
    purpose: "Give the pending parity gate a focused surface for Kick's front strip, delayed opposite strip, scale, damage, and shared per-target 1.35-second repeat-hit lock.",
    systems: ['Kick', 'strip geometry', 'repeat-hit lock'], keywords: ['facing', 'opposite strip', '100 ms growth', '200 ms lifetime', '1.35 seconds', 'Whip mapping'], adapter: 'world',
    presets: [preset('front-edge', 'Front-strip edges', 'Place targets just inside and outside the production strip.'), preset('opposite-delay', 'Delayed opposite side', 'Step through the tier-two follow-up timing.'), preset('repeat-lock', 'Shared hit lock', 'Trigger repeatedly against one durable target.')], blockers: [35],
    statusNote: 'Current Kick production path; this surface supports but cannot pass the pending hands gate.',
  }),
  room({
    issue: 46, slug: 'horde-pressure', kind: 'gym', status: 'CURRENT', title: 'Horde pressure, formations, and population limits',
    purpose: 'Test crowd pressure separately from the full stage timeline.',
    systems: ['horde', 'formations', 'population caps'], keywords: ['ring', 'surge', 'sweep', 'flower enclosure', 'minimum population', 'soft cap', 'hard cap'], adapter: 'world',
    presets: [preset('steady-floor', 'Steady population floor', 'Hold a selected current enemy mix at a production minimum.'), preset('bat-sweep', 'Bat sweep', 'Run the fixed-direction sweep formation.'), preset('flower-enclosure', 'Flower enclosure', 'Build and expire the production closing ring.')], blockers: [36],
    statusNote: 'Current horde mechanics and caps, isolated from unrelated stage minutes.',
  }),
  room({
    issue: 47, slug: 'sync', kind: 'gym', status: 'CURRENT', title: 'Audio–gameplay synchronization and timing-boundary inspector',
    purpose: 'Protect the core “one event, two outputs” contract by making sound and world timing inspectable.',
    systems: ['audio scheduling', 'gameplay triggers', 'heard-time actions'], keywords: ['lookahead', 'heard time', 'next bar', 'pause', 'background stall', 'slow motion', 'trigger'], adapter: 'music',
    presets: [preset('one-trigger', 'One trigger, two outputs', 'Slow the same event into an audible and visible trace.'), preset('next-bar', 'Next-bar entry', 'Add or upgrade a weapon and observe heard-time application.'), preset('background-stall', 'Background stall', 'Freeze and resume without a queued attack burst.')], blockers: [35, 39],
    statusNote: 'Current production clock/engine/world seam; deliberately early application is shown only as a labeled bad example.',
  }),
  room({
    issue: 48, slug: 'visible-bot', kind: 'gym', status: 'CURRENT', title: 'Visible bot, small-batch balance, and outlier replay workflow',
    purpose: 'Make existing bot policies and movers accessible for quick experiments while retaining the CLI for heavy batches.',
    systems: ['bot', 'movers', 'policies', 'replay'], keywords: ['Kiter', 'Greedy', 'Harvester', 'small batch', 'outlier', 'damage share', 'survival'], adapter: 'bot',
    presets: [preset('visible-kiter', 'Visible Kiter', 'Watch one seeded production simulation with the Kiter mover.'), preset('small-batch', 'Small batch', 'Run a bounded set and rank descriptive outliers.', { runs: '20' })], blockers: [40],
    statusNote: 'Current balance instrument; bots find regressions and floors but never decide balance or a gate.',
  }),
  room({
    issue: 49, slug: 'performance-stress', kind: 'gym', status: 'CURRENT', title: 'Performance and stress presets for hordes, weapons, FX, and pickups',
    purpose: 'Provide fixed, reproducible stress scenes and separate simulation, rendering, and audio costs.',
    systems: ['performance', 'simulation', 'rendering', 'audio'], keywords: ['frame time', 'fixed-step debt', 'entity count', 'projectile', 'field', 'FX', 'gem cap', 'culling'], adapter: 'world',
    presets: [preset('horde-cap', 'Horde cap', 'Drive current enemies through soft and hard population limits.'), preset('projectile-storm', 'Projectile and field storm', 'Exercise active weapon entity counts.'), preset('fx-pickups', 'FX and pickup saturation', 'Stress cosmetic caps and gem merging.')], blockers: [35, 36],
    statusNote: 'Current production budgets; synthetic stress is labeled and does not redefine stage balance.',
  }),
  room({
    issue: 50, slug: 'vfx-feel', kind: 'gym', status: 'CURRENT', title: 'VFX and feedback feel controls',
    purpose: 'Trigger and study feedback effects in isolation without needing the matching gameplay event.',
    systems: ['VFX', 'feedback', 'RunView'], keywords: ['death pop', 'hit flash', 'damage number', 'shake', 'level burst', 'keyframe', 'background'], adapter: 'world',
    presets: [preset('enemy-death', 'Enemy vanish', 'Replay the production vanish at adjustable body sizes.'), preset('level-moment', 'Level-up moment', 'Inspect pulse, ring burst, cue, and slowdown together.'), preset('camera-feedback', 'Shake and flash', 'Compare bounded camera feedback on dark and light backgrounds.')], blockers: [29, 30, 31],
    statusNote: 'Current cosmetic feedback; tuning controls are local fixtures and never mutate production constants silently.',
  }),
  room({
    issue: 51, slug: 'boss-hazards', kind: 'gym', status: 'EXPERIMENTAL', title: 'Boss hazard and attack-pattern isolation',
    purpose: 'Expose each reusable `BossWorld` hazard independently from a whole song or boss arrangement.',
    systems: ['BossWorld', 'boss hazards', 'telegraphs'], keywords: ['bullet', 'ring', 'spread', 'shockwave', 'beam', 'lane', 'field', 'melee arc', 'lunge'], adapter: 'boss-hazard',
    presets: [preset('projectiles', 'Projectiles and rings', 'Inspect experimental bullet, ring, and spread grammars.'), preset('telegraphed-field', 'Telegraphed field', 'Step through warning, live, and damage states.'), preset('lunge', 'Lunge and melee', 'Inspect movement and close-range attack timing.')], blockers: [29, 30, 31],
    statusNote: 'EXPERIMENTAL standalone boss mechanics; no normal-run integration is implied.',
  }),
  room({
    issue: 52, slug: 'boss-fights', kind: 'gym', status: 'EXPERIMENTAL', title: 'Existing boss fights and dodge calibration',
    purpose: 'Migrate the standalone Boss Fights area into the Dev Campus while preserving its status as an undecided experiment.',
    systems: ['boss fights', 'BossConductor', 'dodge calibration'], keywords: ['Metamorphosis', 'Satisfaction', 'Pursuit', 'song phase', 'attack timing', 'record transport'], adapter: 'legacy-frame',
    presets: [preset('metamorphosis', 'METAMORPHOSIS', 'Launch the experimental chase fight.'), preset('satisfaction', 'Satisfaction', 'Launch the experimental duel grammar.'), preset('pursuit', 'Pursuit synth', 'Launch the synthesized rhythm-survival fight.')], blockers: [29, 30],
    statusNote: 'EXPERIMENTAL and outside the current run; a good result does not decide boss integration.',
  }),
  room({
    issue: 53, slug: 'accessibility-readability', kind: 'gym', status: 'CURRENT', title: 'Accessibility and readability controls',
    purpose: 'Evaluate whether gameplay remains readable across visual, motion, input, and audio conditions.',
    systems: ['accessibility', 'readability', 'input'], keywords: ['contrast', 'motion', 'shake', 'flash', 'mute', 'color', 'text size', 'touch target'], adapter: 'world',
    presets: [preset('muted', 'Muted gameplay', 'Enforce the Pillar 3 muted-run read.'), preset('reduced-motion', 'Reduced motion', 'Compare key information with camera motion minimized.'), preset('low-contrast', 'Contrast stress', 'Expose semantic reads against difficult backgrounds.')], blockers: [41, 43],
    statusNote: 'Current evaluation surface with future-facing controls clearly labeled; it does not invent shipped settings.',
  }),
  room({
    issue: 54, slug: 'onboarding-placeholder', kind: 'gym', status: 'PARKED', title: 'First-time experience and onboarding scenarios',
    purpose: 'Reserve reproducible onboarding test cases without designing M4 before its grilling/spec.',
    systems: ['onboarding', 'M4'], keywords: ['first-time experience', 'tutorial', 'new player', 'locked spec'], adapter: 'parked',
    presets: [preset('parked', 'Parked placeholder', 'No scenario exists until the locked M4 first-time-experience specification exists.')], blockers: [41],
    statusNote: 'PARKED PLACEHOLDER ONLY — no onboarding mechanic or fake behavior may launch from this entry.',
  }),
  room({
    issue: 55, slug: 'future-systems-placeholder', kind: 'gym', status: 'PARKED', title: 'Register future-system Gym placeholders without implementing mechanics',
    purpose: 'Reserve discoverable status entries for future testing surfaces while preventing a Dev Campus task from silently implementing parked mechanics.',
    systems: ['future systems', 'locked phases'], keywords: ['placeholder', 'boss integration', 'tempo progression', 'instrument swapping', 'visual style'], adapter: 'parked',
    presets: [preset('parked', 'Parked placeholder', 'Lists named future surfaces and their required locked specs; launches no mechanic.')], blockers: [30],
    statusNote: 'PARKED PLACEHOLDER ONLY — entries stay non-launchable until the relevant phase specification is locked.',
  }),

  room({
    issue: 56, slug: 'dormant-audio', kind: 'zoo', status: 'DORMANT', title: 'Dormant audio-only crash/riser catalog wing',
    purpose: 'Preserve audible crash/riser catalog content without letting it masquerade as playable weapons.',
    systems: ['audio catalog', 'dormant roles'], keywords: ['crash', 'riser', 'audio only', 'removed FX slot', 'one-shot', 'timing pattern'], adapter: 'catalog',
    presets: [preset('both', 'Crash and riser', 'Audition both dormant voices beside an explicit no-gameplay warning.'), preset('one-shots', 'One shots', 'Compare each retained sample and synthesized fallback.')], blockers: [30, 31],
    statusNote: 'DORMANT audio only; neither role has a legal slot, weapon tiers, offer, or ground-pick glyph.',
  }),
  room({
    issue: 57, slug: 'active-weapons', kind: 'zoo', status: 'CURRENT', title: 'Active weapon catalog: fourteen weapons × four tiers',
    purpose: 'Display every offered weapon side by side, grouped by the seven band slots, at consistent scale and context.',
    systems: ['weapon catalog', 'band slots', 'tiers'], keywords: ['fourteen', 'seven', 'four tiers', 'stats', 'glyph', 'timing pattern', 'damage'], adapter: 'catalog',
    presets: [preset('all-tier-1', 'All tier I', 'Compare all fourteen current weapons at their first tier.'), preset('all-tier-4', 'All tier IV', 'Compare every current weapon at maximum tier.'), preset('slot-forks', 'Seven slot forks', 'Show each two-role choice at matched scale.')], blockers: [30, 31],
    statusNote: 'CURRENT offered weapons only, generated from supported roles, band slots, stats, and timing ladders.',
  }),
  room({
    issue: 58, slug: 'active-enemies', kind: 'zoo', status: 'CURRENT', title: 'Active Mad Forest enemy catalog',
    purpose: 'Show all twelve current enemies at comparable scale with production stats and states.',
    systems: ['enemy catalog', 'Mad Forest'], keywords: ['bat', 'zombie', 'skeleton', 'ghost', 'mudman', 'flower', 'mantis', 'swarm', 'elite'], adapter: 'catalog',
    presets: [preset('lineup', 'Twelve-enemy lineup', 'Compare every current enemy at the same reference scale.'), preset('states', 'Movement and damage states', 'Show idle, moving, hit, knockback, and death specimens.'), preset('level-scaling', 'Level-scaled HP', 'Compare HP×Level enemies at selected player levels.')], blockers: [30, 31],
    statusNote: 'CURRENT twelve-kind Mad Forest roster; legacy enemy behavior is separated into issue #61.',
  }),
  room({
    issue: 59, slug: 'weapon-bodies', kind: 'zoo', status: 'CURRENT', title: 'Projectile, field, and hit-area catalog',
    purpose: 'Compare the visual/gameplay bodies created by every current weapon archetype.',
    systems: ['projectiles', 'fields', 'hit areas'], keywords: ['strip', 'cone', 'homing', 'boomerang', 'orbiter', 'lob', 'shard', 'trail', 'mine', 'gravity well'], adapter: 'catalog',
    presets: [preset('all-bodies', 'All archetypes', 'Lay out one current specimen for every weapon body.'), preset('geometry', 'Geometry overlays', 'Show collision bodies, travel paths, and lifetime boundaries.'), preset('keyframes', 'Representative keyframes', 'Freeze spawn, middle, impact, and expiry states.')], blockers: [30, 31, 35],
    statusNote: 'Current production bodies only; specimens invoke the shared world/view implementation.',
  }),
  room({
    issue: 60, slug: 'sound-samples', kind: 'zoo', status: 'CURRENT', title: 'Production sound, sample, and one-shot catalog',
    purpose: 'Make every voice and sample variation audible and comparable without knowing internal filenames.',
    systems: ['sound kit', 'samples', 'synthesis'], keywords: ['variant', 'sample-backed', 'synthesized', 'fallback', 'waveform', 'duration', 'onset', 'peak'], adapter: 'music',
    presets: [preset('active-one-shots', 'Active one-shots', 'Audition every active role and chartable variant.'), preset('sample-vs-synth', 'Sample versus fallback', 'Compare retained source voicing with the synthesized fallback.'), preset('dormant-filter', 'Dormant audio', 'Include crash/riser under an explicit dormant filter.')], blockers: [30, 31],
    statusNote: 'CURRENT production sound plus clearly marked DORMANT audio; gameplay status follows the weapon catalog.',
  }),
  room({
    issue: 61, slug: 'legacy-enemies', kind: 'zoo', status: 'HISTORICAL', title: 'Legacy enemy archive wing',
    purpose: 'Keep swarmer, tank, darter, splitter, charger, circler, shielded, and elite discoverable without documenting them as the active stage roster.',
    systems: ['legacy enemies', 'pre-parity director'], keywords: ['swarmer', 'tank', 'darter', 'splitter', 'charger', 'circler', 'shielded', 'elite'], adapter: 'catalog',
    presets: [preset('lineup', 'Eight legacy enemies', 'Compare the complete pre-parity roster under a historical banner.'), preset('legacy-behaviors', 'Retained behaviors', 'Inspect compatibility behaviors without a current-stage claim.')], blockers: [30, 31],
    statusNote: 'HISTORICAL/DORMANT compatibility content; never mixed into current enemy selectors or stage data.',
  }),
  room({
    issue: 62, slug: 'vfx-catalog', kind: 'zoo', status: 'CURRENT', title: 'VFX and feedback catalog',
    purpose: 'Display every current visual-feedback family in one comparable, regression-friendly surface.',
    systems: ['FxEvent', 'RunView', 'feedback'], keywords: ['ring', 'death', 'whip', 'arc', 'damage number', 'spark', 'shake', 'flash', 'slam'], adapter: 'catalog',
    presets: [preset('all-fx', 'All canonical FX', 'Show every registered FxEvent and shell feedback family.'), preset('backgrounds', 'Three backgrounds', 'Compare specimens on black, game grey, and light.'), preset('stress', 'Bounded stress', 'Show cap activation for high-volume cosmetic events.')], blockers: [30, 31, 50],
    statusNote: 'CURRENT catalog generated from the production FxEvent registry plus shell-owned reward feedback.',
  }),
  room({
    issue: 63, slug: 'timing-patterns', kind: 'zoo', status: 'CURRENT', title: 'Weapon timing-pattern catalog across tiers',
    purpose: "Show every active weapon's four shipped firing patterns side by side and make progression understandable by sight and ear.",
    systems: ['timing patterns', 'soundset ladders', 'MusicEngine'], keywords: ['four bars', 'tier I', 'tier IV', 'density', 'strength', 'variation', 'note movement', 'draft'], adapter: 'music',
    presets: [preset('grid', 'Fourteen × four grid', 'Display all shipped active ladders on the four-bar grid.'), preset('solo', 'Selected role solo', 'Hear all four tiers for one active role.'), preset('band-context', 'Band context', 'Hear a selected tier change inside a representative seven-slot mix.')], blockers: [30, 31, 39],
    statusNote: 'CURRENT shipped ladders; local drafts remain visibly separate until an explicit apply/export action.',
  }),
  room({
    issue: 64, slug: 'pickups-rewards', kind: 'zoo', status: 'CURRENT', title: 'Pickups, ground rewards, and weapon glyphs',
    purpose: 'Compare all collectible and offer visuals, their states, and their interaction ranges.',
    systems: ['gems', 'ground rewards', 'weapon glyphs'], keywords: ['blue gem', 'green gem', 'red gem', 'magnet', 'pickup circle', 'shove radius', 'new weapon', 'tier up'], adapter: 'catalog',
    presets: [preset('gems', 'Gem tiers and overflow', 'Show blue, green, red, merged, and capped specimens.'), preset('all-glyphs', 'Fourteen reward glyphs', 'Render new-weapon and tier-up formats for every active role.'), preset('ranges', 'Interaction radii', 'Overlay magnet, gem pickup, item pickup, placement, and enemy-shove circles.')], blockers: [30, 31],
    statusNote: 'CURRENT active rewards; dormant roles have no ground-reward specimen.',
  }),
  room({
    issue: 65, slug: 'ui-catalog', kind: 'zoo', status: 'CURRENT', title: 'Complete UI state and responsive-layout catalog',
    purpose: 'Render real UI components in canonical states for visual comparison and regression.',
    systems: ['UI', 'responsive layout', 'HUD'], keywords: ['start', 'rack', 'pause', 'reward', 'death', 'victory', 'toast', 'sandbox', 'replay', 'desktop', 'phone'], adapter: 'ui',
    presets: [preset('desktop', 'Desktop state matrix', 'Render every current UI family at the reference desktop width.'), preset('tablet', 'Tablet state matrix', 'Repeat with tablet width and safe areas.', { viewport: 'tablet' }), preset('phone', 'Phone state matrix', 'Repeat with narrow width, long labels, and safe areas.', { viewport: 'phone' })], blockers: [30, 31, 41],
    statusNote: 'CURRENT real components; the experimental boss HUD is visibly segregated.',
  }),
  room({
    issue: 66, slug: 'visual-tokens', kind: 'zoo', status: 'CURRENT', title: 'Icon, palette, typography, and readability tokens',
    purpose: "Provide one comparison surface for the game's procedural visual language and semantic UI tokens.",
    systems: ['icons', 'palette', 'typography', 'semantic tokens'], keywords: ['weapon glyph', 'enemy color', 'elite', 'slot color', 'tier pip', 'gem color', 'contrast', 'text size'], adapter: 'catalog',
    presets: [preset('game-background', 'Game background', 'Show canonical tokens in their normal context.'), preset('diagnostic-backgrounds', 'Contrast backgrounds', 'Compare black, grey, and light surfaces.'), preset('maximum-labels', 'Readability stress', 'Exercise smallest text and longest labels together.')], blockers: [30, 31],
    statusNote: 'CURRENT production metadata where available; proposed future tokens remain explicitly non-current.',
  }),
  room({
    issue: 67, slug: 'audio-mix', kind: 'zoo', status: 'CURRENT', title: 'Audio mix, mute/solo, and low-end interaction catalog',
    purpose: 'Compare active voices in the same musical context and expose mix interactions that cannot be judged from isolated one-shots.',
    systems: ['audio mix', 'gain path', 'low-end ducking'], keywords: ['full band', 'solo', 'mute', 'meter', 'voice volume', 'weapons group', 'master', 'kick', 'bass'], adapter: 'music',
    presets: [preset('full-band', 'Equal-context band', 'Hear one current role per slot at matched tiers.'), preset('wide-build', 'Wide build', 'Hear seven tier-I roles across every slot.'), preset('deep-build', 'Deep build', 'Hear fewer roles at high tiers and compare density.'), preset('low-end', 'Kick and low interaction', 'See and hear the brief kick-driven space in the low instrument.')], blockers: [30, 31, 39],
    statusNote: 'CURRENT audio-only controls; mute/solo never changes gameplay or timing data.',
  }),
  room({
    issue: 68, slug: 'boss-catalog', kind: 'zoo', status: 'EXPERIMENTAL', title: 'Boss bodies, hazards, telegraphs, and HUD',
    purpose: 'Lay out boss-specific content side by side while preserving its undecided status.',
    systems: ['boss visuals', 'hazards', 'boss HUD'], keywords: ['boss body', 'palette', 'bullet', 'shockwave', 'beam', 'field', 'melee', 'song bar'], adapter: 'legacy-frame',
    presets: [preset('bosses', 'Boss body lineup', 'Compare all experimental boss bodies and palettes.'), preset('hazards', 'Hazard lineup', 'Show warning, live, and damage states at consistent scale.'), preset('hud', 'Boss HUD states', 'Compare boss health, player health, phase label, and song progress.')], blockers: [30, 31, 51],
    statusNote: 'EXPERIMENTAL and separate from the normal-run current catalogs.',
  }),
  room({
    issue: 69, slug: 'track-lab', kind: 'archive', status: 'HISTORICAL', title: 'Track Lab covers and superseded experiments',
    purpose: 'Preserve valuable Track Lab and prototype work without presenting it as current game documentation.',
    systems: ['Track Lab', 'covers', 'superseded experiments'], keywords: ['Sahara', 'METAMORPHOSIS', 'Pursuit', 'Satisfaction', 'Da Funk', 'full track', 'genre', 'drop'], adapter: 'legacy-frame',
    presets: [preset('tracks', 'Five retained tracks', 'Browse every cover/research experiment with provenance warnings.'), preset('full-track-history', 'Dropped full-track direction', 'Explain the superseded destination-song and genre-drop work.')], blockers: [30, 31],
    statusNote: 'HISTORICAL/EXPERIMENTAL research — never a current weapon, build, or music source of truth.', sourceLinks: [{ label: 'Track registry', path: 'src/tracklab/tracks/index.ts' }],
  }),

  room({
    issue: 70, slug: 'causality', kind: 'museum', status: 'CURRENT', title: 'One trigger, two outputs: sound and gameplay causality',
    purpose: "Functionally explain the game's central contract: one scheduled event produces both a sound and a gameplay attack.",
    systems: ['timing pattern', 'MusicEngine', 'RunWorld'], keywords: ['one trigger', 'sound', 'attack', 'mute', 'single step', 'forbidden split trigger'], adapter: 'music',
    presets: [preset('slow-chain', 'Slow causal chain', 'Trace one event from timing pattern to sound and attack.'), preset('muted', 'Muted but active', 'Disable audio monitoring while the same gameplay attacks continue.'), preset('bad-split', 'Forbidden split trigger', 'Show a labeled incorrect design where sound and damage use separate clocks.')], blockers: [47],
    statusNote: 'CURRENT central architecture; bad examples are inert demonstrations, not alternate production modes.',
  }),
  room({
    issue: 71, slug: 'musical-clock', kind: 'museum', status: 'CURRENT', title: 'Clock, beats, bars, phrase, tempo, and swing',
    purpose: 'Explain the musical clock in plain language for a non-musician developer.',
    systems: ['Clock', 'timing grid', 'tempo'], keywords: ['smaller step', 'beat', 'bar', 'four-bar phrase', 'tempo', 'swing', 'playhead', 'event strength'], adapter: 'music',
    presets: [preset('timeline', 'Plain-language timeline', 'See and hear smaller steps, beats, bars, and a four-bar phrase.'), preset('swing', 'Straight versus swing', 'Hear alternating hits shifted slightly so the rhythm feels less rigid.'), preset('tiers', 'Tier-pattern examples', 'Compare how progression changes density on the same grid.')], blockers: [39, 47],
    statusNote: 'CURRENT production clock; every musical term is defined in plain language before use.',
  }),
  room({
    issue: 72, slug: 'audio-scheduling', kind: 'museum', status: 'CURRENT', title: 'Audio scheduling, lookahead, heard-time changes, and next-bar entry',
    purpose: 'Explain why audio is scheduled ahead while visible/gameplay state changes at the heard instant.',
    systems: ['lookahead scheduler', 'heard-time queue', 'weapon entry'], keywords: ['scheduled time', 'due time', 'heard time', 'next bar', 'pause', 'resume', 'background stall'], adapter: 'music',
    presets: [preset('lookahead', 'Schedule versus hear', 'Show ahead-of-time queue entries and their later audible/world due time.'), preset('next-bar', 'Next-bar change', 'Queue a new role and apply it at the boundary the player hears.'), preset('early-bad', 'Intentionally early', 'Compare a labeled bad early world upgrade with the production path.')], blockers: [47],
    statusNote: 'CURRENT scheduling architecture; unsafe early application is demonstration-only.',
  }),
  room({
    issue: 73, slug: 'audio-signal-path', kind: 'museum', status: 'CURRENT', title: 'Audio signal path, volume groups, mute, and low-end ducking',
    purpose: 'Explain and audition the production audio path without unexplained studio terminology.',
    systems: ['audio graph', 'gain groups', 'output meter'], keywords: ['voice', 'per-voice volume', 'weapons group', 'master', 'limiter', 'slot mute', 'reward dip', 'level cue'], adapter: 'music',
    presets: [preset('signal-path', 'Voice to speakers', 'Follow one active voice through every production volume stage.'), preset('reward-duck', 'Reward moment', 'Hear the weapon group dip while the level cue bypasses it.'), preset('low-end-duck', 'Kick makes space', 'See and hear the kick briefly lower the low instrument.')], blockers: [67],
    statusNote: 'CURRENT production mix path; audio-only controls never disable gameplay.',
  }),
  room({
    issue: 74, slug: 'band-rules', kind: 'museum', status: 'CURRENT', title: 'Seven-slot band, offer eligibility, and build completion',
    purpose: 'Explain how fourteen weapons compete for seven permanent band positions and how that shapes offers.',
    systems: ['band slots', 'offer eligibility', 'build completion'], keywords: ['Beat', 'Snap', 'Tick', 'Groove', 'Low', 'Color', 'Hook', 'permanent slot', 'heal fallback'], adapter: 'picks',
    presets: [preset('empty-band', 'Empty seven-slot band', 'Show both legal choices for every slot.'), preset('slot-owned', 'Owned slot', 'Accept one role and demonstrate why its competitor is rejected.'), preset('complete', 'Complete tier-IV band', 'Show no legal upgrade and the full-build heal fallback.')], blockers: [38, 57],
    statusNote: 'CURRENT seven slots and fourteen weapons; the removed FX slot can never appear legal.',
  }),
  room({
    issue: 75, slug: 'weapon-archetypes', kind: 'museum', status: 'CURRENT', title: 'Weapon archetypes, geometry, lifetime, pierce, and repeat hits',
    purpose: "Teach how one shared trigger contract branches into the game's different weapon behaviors.",
    systems: ['weapon archetypes', 'geometry', 'collision'], keywords: ['strip', 'cone', 'projectile', 'homing', 'boomerang', 'orbiter', 'lob', 'shards', 'fields'], adapter: 'world',
    presets: [preset('body-map', 'Archetype map', 'Trigger one minimal example of every current body type.'), preset('boundaries', 'Boundary cases', 'Place targets around exact geometry, pierce, lifetime, and repeat-hit limits.'), preset('strength', 'Event strength', 'Show which gameplay dimensions respond to soft and accented events.')], blockers: [35, 59],
    statusNote: 'CURRENT production archetypes with live geometry overlays; limitations are shown alongside happy paths.',
  }),
  room({
    issue: 76, slug: 'progression-lifecycle', kind: 'museum', status: 'CURRENT', title: 'XP, reward queue, physical choice, and next-bar application',
    purpose: 'Explain the complete progression lifecycle through a functional state diagram and live example.',
    systems: ['XP lifecycle', 'reward queue', 'picks'], keywords: ['kill', 'XP drop', 'magnet', 'collect', 'threshold', 'offers', 'ground choice', 'next bar'], adapter: 'picks',
    presets: [preset('one-level', 'One complete level', 'Walk a kill through XP, offer, ground collection, and next-bar application.'), preset('stacked', 'Stacked levels', 'Show the reward queue serializing multiple earned levels.'), preset('complete-build', 'Build complete', 'Show the healing fallback after all active upgrades are exhausted.')], blockers: [37, 38],
    statusNote: 'CURRENT lifecycle with simulation-owned and shell-owned state visibly distinguished.',
  }),
  room({
    issue: 77, slug: 'enemy-collision', kind: 'museum', status: 'CURRENT', title: 'Enemy movement, circle collision, separation, and spatial hash',
    purpose: 'Explain how the horde moves and collides efficiently at scale.',
    systems: ['spatial hash', 'enemy movement', 'collision'], keywords: ['cell', 'broad phase', 'narrow phase', 'circle', 'feet origin', 'separation', 'contact lock', 'knockback'], adapter: 'world',
    presets: [preset('cell-edge', 'Cell-edge queries', 'Show membership and collision checks across spatial-hash boundaries.'), preset('dense-overlap', 'Dense overlap', 'Run production separation on a packed current horde.'), preset('knockback-level', 'Resistance and scaling', 'Compare immune and level-scaled current enemies.')], blockers: [34, 36, 58],
    statusNote: 'CURRENT production simulation; the Museum visualizes real broad/narrow checks rather than duplicating them.',
  }),
  room({
    issue: 78, slug: 'stage-director', kind: 'museum', status: 'CURRENT', title: 'Stage director, wave timeline, events, and dividing rule',
    purpose: "Explain how time-driven stage pressure remains separate from the player's music.",
    systems: ['stage director', 'wave timeline', 'dividing rule'], keywords: ['0:00', '8:00', 'minimum population', 'spawn interval', 'boss', 'sweep', 'flower wall', 'music separation'], adapter: 'museum',
    presets: [preset('timeline', 'Eight-minute timeline', 'Browse every canonical wave row and event in time order.'), preset('row-preview', 'Selected row preview', 'Run a small live production preview for the chosen row.'), preset('dividing-rule', 'Pressure versus build', 'Show that stage data cannot edit weapon timing patterns.')], blockers: [44],
    statusNote: 'CURRENT stage data ends at the explicit 8:00 boundary and never composes the build.',
  }),
  room({
    issue: 79, slug: 'mad-forest-provenance', kind: 'museum', status: 'CURRENT', title: 'Mad Forest reference provenance and adopted values',
    purpose: 'Keep source versions and project adaptations honest while making adopted parity values easy to inspect.',
    systems: ['reference provenance', 'parity values'], keywords: ['CURRENT', 'LEGACY', 'DERIVED', 'ADOPTED', 'INFERENCE', 'movement', 'bodies', 'waves', 'Kick'], adapter: 'museum',
    presets: [preset('movement-bodies', 'Movement and bodies', 'Compare labeled source values with adopted project values.'), preset('enemies-waves', 'Enemies and waves', 'Keep source versions separate while linking current reproductions.'), preset('kick', 'Kick mapping', 'Trace reference evidence into the adopted production strip.')], blockers: [44, 58],
    statusNote: 'CURRENT reference navigator; every shown number retains its provenance label and source version.', sourceLinks: [{ label: 'Research record', path: 'docs/research/mad-forest-reference.md' }],
  }),
  room({
    issue: 80, slug: 'time-systems', kind: 'museum', status: 'CURRENT', title: 'Global speed, reward slowdown, fixed ticks, and replay speed',
    purpose: 'Explain the separate time systems and how they compose without changing fixed-step simulation.',
    systems: ['time scale', 'fixed step', 'replay speed'], keywords: ['developer speed', 'reward slowdown', 'SIM_DT', 'audio rate', 'visual rate', 'pause', 'zero rate'], adapter: 'determinism',
    presets: [preset('compose', 'Speed × reward moment', 'Show developer speed multiplied by the transient reward slowdown.'), preset('fixed-tick', 'Fixed-tick payout', 'Vary rate while every simulation step remains the same SIM_DT.'), preset('replay', 'Separate replay speed', 'Compare replay seek/speed ownership with live developer speed.')], blockers: [47],
    statusNote: 'CURRENT time ownership; no example advances the simulation with a larger variable delta.',
  }),
  room({
    issue: 81, slug: 'determinism', kind: 'museum', status: 'CURRENT', title: 'Seeded determinism, virtual conductor, bot, and exact replay',
    purpose: 'Explain how browser play, headless bot simulation, and replay share one world and remain reproducible.',
    systems: ['seeded RNG', 'VirtualConductor', 'replay'], keywords: ['fixed tick', 'deterministic trigonometry', 'state hash', 'unsafe random', 'wall clock', 'bot authority'], adapter: 'determinism',
    presets: [preset('matching', 'Same-seed worlds', 'Step identical worlds and keep their state hashes matched.'), preset('random-divergence', 'Unsafe random', 'Inject a labeled unsafe random read and explain the first divergence.'), preset('clock-divergence', 'Wall-clock misuse', 'Show why simulation state cannot depend on elapsed wall time.')], blockers: [40],
    statusNote: 'CURRENT architecture; bot evidence is regression/balance input, never developer judgment.',
  }),
  room({
    issue: 82, slug: 'audio-provenance', kind: 'museum', status: 'CURRENT', title: 'Audio asset provenance, licenses, processing, and health',
    purpose: "Make every shipped or experimental sound asset's source and health inspectable before store preparation.",
    systems: ['audio assets', 'licenses', 'health reports'], keywords: ['source pack', 'author', 'license', 'active', 'dormant', 'duration', 'onset', 'peak', 'format', 'fallback'], adapter: 'health',
    presets: [preset('production', 'Production asset audit', 'List every referenced production sample with live manifest and health data.'), preset('warnings', 'Missing or unclear metadata', 'Surface unknown licenses and contradictory report rows prominently.'), preset('raw-processed', 'Raw versus corrected', 'Compare legally retained raw sources with processed outputs.')], blockers: [60],
    statusNote: 'CURRENT provenance surface; unknown or unclear licenses are failures, never softened into informational copy.',
  }),
  room({
    issue: 83, slug: 'world-view-headless', kind: 'museum', status: 'CURRENT', title: 'World simulation, Pixi view, cosmetic FX, and headless mode',
    purpose: 'Explain which state is authoritative and how the same simulation runs live, replayed, or headless.',
    systems: ['RunWorld', 'RunView', 'headless bot'], keywords: ['authoritative state', 'rendering', 'FX queue', 'ground reward', 'shell owned', 'headless', 'lifecycle'], adapter: 'museum',
    presets: [preset('live', 'World + view + FX', 'Run the production simulation with rendering and cosmetics.'), preset('no-fx', 'View without FX', 'Disable cosmetic events while the authoritative outcome continues.'), preset('headless', 'World only', 'Run the same seeded simulation without Pixi or FX allocation.')], blockers: [40, 50],
    statusNote: 'CURRENT architecture; rendering and cosmetic toggles cannot change simulation outcomes.',
  }),
  room({
    issue: 84, slug: 'horde-architecture', kind: 'museum', status: 'CURRENT', title: 'Horde performance architecture, caps, culling, and budgets',
    purpose: 'Explain why large hordes remain bounded and which budgets protect simulation and rendering.',
    systems: ['performance budgets', 'culling', 'caps'], keywords: ['spatial partition', 'off-screen', 'gem cap', 'FX cap', 'damage number cap', 'projectiles', 'fixed-step debt'], adapter: 'health',
    presets: [preset('budget-map', 'Production budget map', 'Read every current cap from its canonical production value.'), preset('cap-activation', 'Cap activation', 'Link to fixed stress fixtures that visibly hit each budget.'), preset('cost-lanes', 'Simulation/render/audio lanes', 'Separate authoritative and cosmetic work counters.')], blockers: [49],
    statusNote: 'CURRENT performance architecture; hard and soft budgets are distinguished and sourced from production.',
  }),
  room({
    issue: 85, slug: 'system-status', kind: 'museum', status: 'CURRENT', title: 'Current, dormant, removed, parked, and experimental system status',
    purpose: 'Prevent future developers and AI agents from resurrecting superseded mechanics or treating experiments as shipped systems.',
    systems: ['system status', 'history', 'parked decisions'], keywords: ['current', 'dormant', 'removed', 'parked', 'experimental', 'historical', 'genres', 'passives', 'boss'], adapter: 'catalog',
    presets: [preset('all-statuses', 'All status groups', 'Browse every status record with its authoritative source.'), preset('non-current', 'Non-current warning pass', 'Verify dormant, removed, parked, experimental, and historical search results retain context.')], blockers: [31, 69],
    statusNote: 'CURRENT documentation generated from status data; removed and parked entries are non-launchable.', sourceLinks: [{ label: 'Project status', path: 'docs/STATUS.md' }, { label: 'Parked decisions', path: 'docs/plan.md' }],
  }),
  room({
    issue: 86, slug: 'boss-conductor', kind: 'museum', status: 'EXPERIMENTAL', title: 'Boss conductor, song phases, and attack timing',
    purpose: 'Explain the standalone “boss track becomes fight” prototype without deciding whether it enters the game.',
    systems: ['BossConductor', 'song sections', 'attack timing'], keywords: ['phase', 'step', 'queued attack', 'synth transport', 'record transport', 'offset sync', 'inverted contract'], adapter: 'legacy-frame',
    presets: [preset('synth', 'Synthesized transport', 'Trace track sections into boss phases and attacks.'), preset('record', 'Record transport', 'Compare offset synchronization while mechanics stay identical.'), preset('inverted', 'Experimental inversion', 'Explain the track-driven attack prototype versus normal one-trigger/two-outputs.')], blockers: [52, 68],
    statusNote: 'EXPERIMENTAL standalone architecture; explicitly separate from the normal run and its causality contract.',
  }),
  room({
    issue: 87, slug: 'source-navigator', kind: 'museum', status: 'CURRENT', title: 'Canonical config and source-of-truth navigator',
    purpose: 'Provide a live index of where current gameplay truth comes from without becoming a static wiki.',
    systems: ['source navigator', 'canonical registries', 'documentation status'], keywords: ['roles', 'soundset', 'slots', 'weapon tiers', 'enemy stats', 'stage', 'pick rules', 'samples', 'FX', 'bot', 'replay'], adapter: 'catalog',
    presets: [preset('all-sources', 'Source-of-truth stations', 'Browse each canonical runtime source with a live specimen or room link.'), preset('superseded-docs', 'Documentation warnings', 'Highlight prose that is historical, superseded, or rationale-only.')], blockers: [30, 31],
    statusNote: 'CURRENT live navigator; runtime registries lead and prose documents supply rationale, evidence, or history.', sourceLinks: [{ label: 'Canonical sources', path: 'src/dev/catalogs.ts' }],
  }),
] as const;

export const DEFAULT_ROOM: DevRoomDefinition = DEV_ROOMS.find((entry) => entry.issue === 33)!;

export function findRoom(kind: DevRoomKind, slug: string): DevRoomDefinition | undefined {
  return DEV_ROOMS.find((entry) => entry.kind === kind && entry.slug === slug);
}

export function roomByIssue(issue: number): DevRoomDefinition | undefined {
  return DEV_ROOMS.find((entry) => entry.issue === issue);
}

export function roomsByStatus(status: DevStatus): readonly DevRoomDefinition[] {
  return DEV_ROOMS.filter((entry) => entry.status === status);
}

export function roomsByAdapter(adapter: RoomAdapter): readonly DevRoomDefinition[] {
  return DEV_ROOMS.filter((entry) => entry.adapter === adapter);
}

function assertRegistryIntegrity(): void {
  if (DEV_ROOMS.length !== 60) throw new Error(`Dev Campus: expected issues #28–#87 exactly once, got ${DEV_ROOMS.length} rooms`);
  const issues = DEV_ROOMS.map(({ issue }) => issue);
  const paths = DEV_ROOMS.map(({ kind, slug }) => `${kind}/${slug}`);
  if (new Set(issues).size !== issues.length) throw new Error('Dev Campus: duplicate issue in room registry');
  if (new Set(paths).size !== paths.length) throw new Error('Dev Campus: duplicate room path in registry');
  for (let issue = 28; issue <= 87; issue++) {
    if (!issues.includes(issue)) throw new Error(`Dev Campus: issue #${issue} is missing from the room registry`);
  }
  for (const entry of DEV_ROOMS) {
    if (entry.presets.length === 0) throw new Error(`Dev Campus: #${entry.issue} has no canonical preset`);
    if (entry.keywords.length === 0 || entry.systems.length === 0) throw new Error(`Dev Campus: #${entry.issue} is not searchable`);
    if (!entry.statusNote) throw new Error(`Dev Campus: #${entry.issue} has no status note`);
  }
  for (const issue of [54, 55]) {
    const entry = roomByIssue(issue)!;
    if (entry.status !== 'PARKED' || entry.adapter !== 'parked' || entry.presets.length !== 1) {
      throw new Error(`Dev Campus: #${issue} must remain a non-implementing parked placeholder`);
    }
  }
}

assertRegistryIntegrity();
