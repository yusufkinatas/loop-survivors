// THE GIG, wired together.
//
// The shell (game.ts) keeps owning what it already owned — the Pixi app, the
// level-up economy, chests, the pause screen. This controller owns the four
// things that make the run a gig rather than a set:
//
//   THE SET LIST   which song is playing, its tempo, its swing, its pressure
//                  curve, and the two empty rooms between them.
//   THE TAPE       a level is a rung of tape, not a rung of somebody's ladder.
//   THE MICROPHONE which recording pass is open, and therefore which instrument
//                  is currently down.
//   THE VALLEY     an instrument being recorded does not attack. One boolean,
//                  read by the shell's trigger listener, and it is the entire
//                  cost model of the stack.
//
// EVERY DESIGN CALL THIS FILE MAKES IS COMMENTED AS A CALL. #268 was worked in
// agent-driven mode, which licenses making them without the designer and
// explicitly does not license making them quietly.

import type { MusicEngine } from '../../audio/engine';
import { SOUNDSET } from '../../audio/soundset';
import { PALETTE_SEATS, type Kit, type Role } from '../../audio/kits';
import type { RunWorld, StageScript } from '../run';
import type { RollShaping } from '../picks';
import { WEAPON_MAX_LEVEL } from '../weapons/levels';
import { chartFromTake, autoTake, growTake, normalizeTake, takeDensity, TAPE_LADDER, tapeRung, type Take, type TapeBars } from './tape';
import { Recorder, type RecordMode } from './recorder';
import { mountGigUi, type ChangeoverView, type StripView, type TrackView } from './strip';
import { GIG_LENGTH_S, GIG_SECTIONS, FAVOUR_FACTOR, buildGigStage, sectionAt, type GigSection } from './songs';
import { gigOn } from './toggles';

/** The tempo the base's balance was tuned at. Per-trigger damage is scaled
 *  against it so a fast song is not simply a damage buff — docs/plan.md's own
 *  "tempo and damage" rule, applied to a run that actually changes tempo. */
const BALANCE_BPM = SOUNDSET.bpm;

/** Seconds a tempo change takes. Long enough to hear the band change gear,
 *  short enough that the changeover is at its new speed while you still have
 *  time to cut something against it. */
const TEMPO_GLIDE_S = 3;

/** Extra hits an evolution grants (#273's own challenge: "a stack that wants max
 *  level to be audible has to make it audible itself").
 *
 *  DESIGN CALL. Evolution is musically silent everywhere in this game — locked
 *  as a rule on the map after #273 measured it — and The Gig has a nearly free
 *  answer, because its whole currency is tape. So an evolution buys four more
 *  hits on top of its geometry, and you overdub into them: max level becomes
 *  something you can hear AND something you authored.
 *
 *  THE ALTERNATIVE, NAMED: leave evolution exactly as #273 shipped it and add
 *  nothing, on the grounds that inventing an audible-evolution rule here
 *  confounds "did recording work?" with "did this new rule work?". That is why it
 *  is a toggle (`evoTape`) rather than a decision. */
const EVOLUTION_TAPE_BONUS = 4;

/** Voices The Gig cannot use, and the reason is structural rather than taste.
 *
 *  DESIGN CALL, and a real limitation rather than a tidy-up. The texture seat is
 *  BEDS: one continuous looping source that starts when the weapon is owned and
 *  never re-articulates (Kit.bed, and the engine returns out of `trigger` for
 *  them outright). A bed therefore has no firing moment, so there is no rhythm
 *  to perform — and a voice you can own without ever cutting a take would be the
 *  only free lunch in a stack whose entire cost model is the recording pass. Two
 *  beds in a five-slot band would be a build that never pays a valley.
 *
 *  THE ALTERNATIVE, NAMED: keep them and let a take's hits buy the bed's
 *  PRESENCE instead of its rhythm — more hits, louder background. That is a
 *  second, different power currency bolted onto the stack to rescue two voices,
 *  and it hides the free lunch rather than removing it. So: The Gig is a
 *  seventeen-voice band, and "the texture seat cannot be performed" is a finding
 *  this stack owes upward rather than a bug in it. */
const UNPERFORMABLE: ReadonlySet<Role> = new Set<Role>(PALETTE_SEATS.texture);

interface Track {
  role: Role;
  level: number;
  take: Take | null;
}

export interface GigHost {
  engine: MusicEngine;
  kits: Map<Role, Kit>;
  world(): RunWorld | null;
  /** True only inside a live gig run — not the sandbox, not a menu. */
  live(): boolean;
  toast(text: string): void;
  /** Has the player switched this instrument off by hand? */
  deactivated(role: Role): boolean;
  /** Bank N more levels for a role through the shell's own promotion path, so
   *  world tiers and tape stay one number. Used by the changeover swap. */
  grantLevels(role: Role, count: number): void;
  /** Drop replacement pedestals for a swap. */
  offerReplacements(): void;
  /** Repaint the shell's rack / overlays after the gig changed the build. */
  refresh(): void;
}

export class Gig {
  private host: GigHost;
  private recorder: Recorder;
  private ui: ReturnType<typeof mountGigUi>;
  private tracks = new Map<Role, Track>();
  private section: GigSection | null = null;
  private bpmTarget = BALANCE_BPM;
  private swingTarget = SOUNDSET.swing;
  /** Where the glide started, and how far through it is. A LINEAR ramp with a
   *  known end, not an exponential approach: a changeover is 25 seconds and the
   *  player has to be able to cut a take against the tempo they are about to
   *  play, so "arrives eventually" is not good enough. */
  private bpmFrom = BALANCE_BPM;
  private swingFrom = SOUNDSET.swing;
  private glideT = TEMPO_GLIDE_S;
  /** Level of the track the player just dropped, waiting for its replacement. */
  private inherit = 0;
  private awaitingSwap = false;
  /** Every pass the run has cut, for the run report and the ticket's numbers. */
  readonly log: { timeS: number; role: Role; mode: RecordMode; hits: number; bars: number; bailed: boolean }[] = [];

  constructor(root: HTMLElement, host: GigHost) {
    this.host = host;
    this.recorder = new Recorder(host.engine);
    this.ui = mountGigUi(root, host.kits);
  }

  // ---- what the shell asks -------------------------------------------------

  /** THE VALLEY, in one boolean. The shell's trigger listener consults this
   *  before handing a trigger to the world, so an instrument being recorded
   *  makes no damage — including the audible preview of the player's own taps.
   *
   *  A `fresh` or `recut` pass silences the voice as well (see `installLevel`);
   *  an `overdub` keeps playing so the player can hear the hole they are filling
   *  and pays only the damage. #255 unlocked exactly that: silence implies not
   *  attacking, but audible does not imply attacking. */
  suppressesDamage(role: Role): boolean {
    const session = this.recorder.session;
    return session !== null && session.role === role;
  }

  /** The run shape. `undefined` hands the run back to Mad Forest's 30 minutes,
   *  which is what the `songs` toggle being off means. */
  stage(): StageScript | undefined {
    return gigOn('songs') ? buildGigStage() : undefined;
  }

  /** Roles the level-up pool must not offer, and roles it should draw heavier.
   *  Fed straight into `rollOffers`. */
  shaping(): RollShaping {
    return {
      exclude: gigOn('takes') ? UNPERFORMABLE : new Set<Role>(),
      favour: new Set(this.section?.favours ?? []),
      favourFactor: FAVOUR_FACTOR,
    };
  }

  get recording(): boolean {
    return this.recorder.recording;
  }

  get inChangeover(): boolean {
    return this.section?.kind === 'changeover';
  }

  /** Set at a run start; also the reset. */
  begin(): void {
    this.tracks.clear();
    this.log.length = 0;
    this.recorder.cancel();
    this.section = null;
    this.inherit = 0;
    this.awaitingSwap = false;
    const opening = gigOn('songs') ? GIG_SECTIONS[0] : null;
    this.bpmTarget = opening?.bpm ?? BALANCE_BPM;
    this.swingTarget = opening?.swing ?? SOUNDSET.swing;
    this.bpmFrom = this.bpmTarget;
    this.swingFrom = this.swingTarget;
    this.glideT = TEMPO_GLIDE_S;
    this.host.engine.clock.bpm = this.bpmTarget;
    this.host.engine.clock.swing = this.swingTarget;
    this.ui.setStrip(null);
    this.ui.setChangeover(null);
    this.ui.setCard(null, 0);
  }

  end(): void {
    this.recorder.cancel();
    this.ui.setStrip(null);
    this.ui.setChangeover(null);
    this.ui.setCard(null, 0);
    this.host.engine.clock.bpm = SOUNDSET.bpm;
    this.host.engine.clock.swing = SOUNDSET.swing;
  }

  destroy(): void {
    this.recorder.dispose();
    this.ui.destroy();
  }

  // ---- the tape -----------------------------------------------------------

  /** A level landed on this role. Called from the shell's next-bar promotion,
   *  in place of `setVoiceTier` + `setVoiceEnabled`.
   *
   *  Three outcomes, and which one you get is the whole difference between
   *  hiring and deepening:
   *
   *    a brand-new track   the voice stays SILENT and a `fresh` pass opens. You
   *                        are handed a bar of empty tape with the band playing
   *                        around you.
   *    a deeper track      the loop lengthens (existing material copied into the
   *                        new bars, so nothing thins out), it keeps playing, and
   *                        an `overdub` pass opens for the rung's extra hits.
   *    autoTakes on        the system cuts it and nothing opens. The control arm. */
  installLevel(role: Role, level: number): void {
    const engine = this.host.engine;
    const capped = Math.max(1, Math.min(WEAPON_MAX_LEVEL, Math.floor(level)));
    const rung = tapeRung(capped);
    const existing = this.tracks.get(role);
    const track: Track = existing ?? { role, level: capped, take: null };
    track.level = capped;
    this.tracks.set(role, track);

    if (gigOn('autoTakes')) {
      track.take = autoTake(role, capped);
      engine.setVoiceChart(role, chartFromTake(track.take), tierForLevel(capped));
      if (!this.host.deactivated(role)) engine.setVoiceEnabled(role, true);
      this.host.refresh();
      return;
    }

    if (!track.take) {
      // Nothing on the tape yet. Silence is correct here rather than a penalty:
      // there is genuinely nothing to play.
      engine.setVoiceEnabled(role, false);
      this.openPass(role, 'fresh', rung.bars, [], rung.hits);
      return;
    }

    const grown = growTake(track.take, rung.bars);
    track.take = grown;
    engine.setVoiceChart(role, chartFromTake(grown), tierForLevel(capped));
    if (!this.host.deactivated(role)) engine.setVoiceEnabled(role, true);
    this.openPass(role, 'overdub', rung.bars, grown.steps, Math.max(0, rung.hits - grown.steps.length));
    this.host.refresh();
  }

  /** Wipe a track and play it again. Free, always available, and the expensive
   *  move — it hands back the whole rung's budget and takes the instrument out of
   *  the band for a full loop. The changeover is built around it. */
  recut(slot: number): void {
    if (!this.host.live() || !gigOn('takes')) return;
    const track = this.trackAtSlot(slot);
    if (!track) return;
    if (this.recorder.recording) {
      this.host.toast('one microphone — finish the take first');
      return;
    }
    const rung = tapeRung(track.level);
    this.host.engine.setVoiceEnabled(track.role, false);
    this.openPass(track.role, 'recut', rung.bars, [], rung.hits);
  }

  /** GIVE SOMETHING UP (#268's changeover: "you rebuild, swap and give things
   *  up"). Drop a track, free its slot, and keep HALF its tape for whoever comes
   *  in — so a swap costs real investment rather than being a free re-roll.
   *
   *  DESIGN CALL on the half. THE ALTERNATIVE, NAMED: a replacement starts from
   *  scratch at rung one. That makes swapping strictly worse than keeping almost
   *  any track past the early game, so the move would exist and never be taken —
   *  which fails the same test #255's pistol test applies to instruments. */
  dropTrack(slot: number): void {
    if (!this.host.live() || !gigOn('swap') || !this.inChangeover) return;
    if (this.recorder.recording || this.awaitingSwap) return;
    const track = this.trackAtSlot(slot);
    const world = this.host.world();
    if (!track || !world) return;
    this.inherit = Math.max(1, Math.floor(track.level / 2));
    this.tracks.delete(track.role);
    world.removeWeapon(track.role);
    this.host.engine.setVoiceEnabled(track.role, false);
    this.awaitingSwap = true;
    this.host.toast(`DROPPED ${this.host.kits.get(track.role)?.name ?? track.role} · ${this.inherit} rungs of tape survive`);
    this.host.offerReplacements();
    this.host.refresh();
  }

  /** The replacement was collected. The shell has already banked its first
   *  level; bank the rest of the inherited tape so both land on one bar line and
   *  one recording pass covers the whole thing. */
  onReplacementChosen(role: Role): void {
    if (!this.awaitingSwap) return;
    this.awaitingSwap = false;
    const extra = Math.max(0, this.inherit - 1);
    this.inherit = 0;
    if (extra > 0) this.host.grantLevels(role, extra);
  }

  /** An evolution landed. With `evoTape` on it also buys tape, which is this
   *  stack's answer to evolution being musically silent everywhere else. */
  onEvolved(role: Role): void {
    if (!gigOn('evoTape') || !gigOn('takes')) return;
    const track = this.tracks.get(role);
    if (!track || !track.take) return;
    const bars = track.take.bars;
    this.host.toast(`${this.host.kits.get(role)?.name ?? role} · +${EVOLUTION_TAPE_BONUS} TAPE`);
    this.openPass(role, 'overdub', bars, track.take.steps, EVOLUTION_TAPE_BONUS);
  }

  // ---- input --------------------------------------------------------------

  /** Returns true when the key was the gig's, so the shell stops handling it. */
  onKey(e: KeyboardEvent): boolean {
    if (!this.host.live()) return false;
    if (e.code === 'Space') {
      if (!this.recorder.recording) return false;
      this.recorder.tap();
      return true;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!this.recorder.recording) return false;
      this.recorder.finish();
      return true;
    }
    if (!gigOn('takes')) return false;
    const digit = /^Digit([1-5])$/.exec(e.code);
    if (!digit) return false;
    const slot = Number(digit[1]);
    // DESIGN CALL: 1-5 is RE-CUT here, and the base's deactivate toggle moves to
    // SHIFT+1-5 in a song. In a changeover SHIFT+1-5 is the drop instead, because
    // muting an instrument on an empty stage means nothing and dropping it means
    // everything. THE ALTERNATIVE, NAMED: leave 1-5 as the deactivate toggle and
    // put re-cut somewhere else. Re-cutting is the stack's whole verb and the
    // deactivate toggle is a dev mechanism; the verb wins the good keys.
    if (e.shiftKey) {
      if (this.inChangeover) { this.dropTrack(slot); return true; }
      return false; // let the shell's deactivate toggle have it
    }
    this.recut(slot);
    return true;
  }

  /** Touch and mouse: a tap on the arena is a hit, so the whole verb works on a
   *  phone without a keyboard. */
  onPointer(): boolean {
    if (!this.host.live() || !this.recorder.recording) return false;
    this.recorder.tap();
    return true;
  }

  // ---- the frame ----------------------------------------------------------

  /** Once per frame from the shell's ticker, after the world has stepped.
   *  `frameS` is real seconds, for the tempo glide. */
  frame(frameS: number): void {
    const world = this.host.world();
    if (!world || !this.host.live()) {
      this.ui.setCard(null, 0);
      this.ui.setStrip(null);
      this.ui.setChangeover(null);
      return;
    }
    if (gigOn('songs')) this.advanceSetList(world, frameS);
    this.paintStrip();
    this.ui.setChangeover(this.inChangeover ? this.changeoverView(world) : null);
  }

  /** The set's own clock: which section, and everything that follows from it. */
  private advanceSetList(world: RunWorld, frameS: number): void {
    const section = sectionAt(Math.min(world.timeS, GIG_LENGTH_S - 0.001));
    if (section !== this.section) this.enterSection(section, world);
    // Glide rather than jump: the band changing gear is one of the three things
    // doing the work of "three different songs", and a step change reads as a
    // glitch where a glide reads as a decision.
    const engine = this.host.engine;
    if (this.glideT < TEMPO_GLIDE_S) {
      this.glideT = Math.min(TEMPO_GLIDE_S, this.glideT + frameS);
      const t = this.glideT / TEMPO_GLIDE_S;
      // Smoothstep, so the band leans into the new speed rather than snapping to
      // it — and lands exactly on it, exactly on time.
      const ease = t * t * (3 - 2 * t);
      engine.clock.bpm = this.bpmFrom + (this.bpmTarget - this.bpmFrom) * ease;
      engine.clock.swing = this.swingFrom + (this.swingTarget - this.swingFrom) * ease;
    }
    if (gigOn('tempoComp')) {
      world.powerMul = SOUNDSET.powerMul * (BALANCE_BPM / Math.max(40, engine.clock.bpm));
    }
    this.ui.setCard(section, section.endS - world.timeS);
  }

  private enterSection(section: GigSection, world: RunWorld): void {
    const previous = this.section;
    this.section = section;
    if (section.bpm !== this.bpmTarget || section.swing !== this.swingTarget) {
      this.bpmFrom = this.host.engine.clock.bpm;
      this.swingFrom = this.host.engine.clock.swing;
      this.glideT = 0;
    }
    this.bpmTarget = section.bpm;
    this.swingTarget = section.swing;
    if (section.kind === 'changeover') {
      // The room empties. Clearing rather than letting the field drain is what
      // makes the changeover a genuine free window: sweeps and flower walls
      // outlive their spawn instant by up to a minute, and a "free" rebuild with
      // fifty bats still crossing it is not one.
      world.clearEnemies();
      this.host.toast('CHANGEOVER — rebuild');
    } else if (previous) {
      this.host.toast(section.kind === 'encore' ? 'ENCORE' : `${section.label} — ${section.name}`);
    }
    this.awaitingSwap = false;
  }

  private paintStrip(): void {
    const session = this.recorder.session;
    if (!session) {
      this.ui.setStrip(null);
      return;
    }
    const view: StripView = {
      role: session.role,
      mode: session.mode,
      bars: session.bars,
      open: session.open,
      budget: session.budget,
      laid: session.laid,
      existing: session.existing,
      playhead: this.recorder.position(),
    };
    this.ui.setStrip(view);
  }

  private changeoverView(world: RunWorld): ChangeoverView {
    const next = GIG_SECTIONS.find((s) => s.startS >= (this.section?.endS ?? 0) && s.kind !== 'changeover');
    return {
      remainS: Math.max(0, Math.ceil((this.section?.endS ?? 0) - world.timeS)),
      nextName: next?.name ?? 'ENCORE',
      nextBpm: next?.bpm ?? 140,
      tracks: this.trackViews(),
      awaitingSwap: this.awaitingSwap,
      swapEnabled: gigOn('swap'),
    };
  }

  // ---- views and reporting ------------------------------------------------

  /** The set, in slot order — the same order the world's `tiers` map keeps, so
   *  slot numbers agree with the shell's rack and the number keys. */
  trackViews(): TrackView[] {
    const world = this.host.world();
    const order = world ? [...world.tiers.keys()] : [...this.tracks.keys()];
    const out: TrackView[] = [];
    let slot = 0;
    for (const role of order) {
      const track = this.tracks.get(role);
      if (!track) continue;
      slot++;
      out.push({
        role,
        slot,
        level: track.level,
        take: track.take,
        recording: this.recorder.session?.role === role,
        off: this.host.deactivated(role),
      });
    }
    return out;
  }

  paintRack(into: HTMLElement): void {
    this.ui.paintRack(into, this.trackViews());
  }

  /** Triggers per bar the whole set fires right now — the number the hard floor
   *  (#256) is about, live on screen rather than derived afterwards. A track
   *  being recorded, or switched off, contributes nothing, which is the point. */
  density(): number {
    let total = 0;
    for (const track of this.tracks.values()) {
      if (!track.take) continue;
      if (this.host.deactivated(track.role)) continue;
      if (this.recorder.session?.role === track.role && this.recorder.session.mode !== 'overdub') continue;
      total += takeDensity(track.take);
    }
    return total;
  }

  /** Console handle. Installing a take by hand is what makes a capture set
   *  reproducible: `docs/baseline/`'s rig sets a build by weapon level, and under
   *  The Gig a build is a set of performances, which no level can name. */
  handle(): object {
    return {
      layers: () => this.trackViews(),
      density: () => this.density(),
      /** The tape ladder, so a capture session can read the rungs without
       *  opening a source file. */
      ladder: () => TAPE_LADDER,
      /** The pass in flight, with its live playhead. A scripted session needs to
       *  see where the loop is to lay a hit on a chosen step. */
      recording: () => {
        const session = this.recorder.session;
        return session && { ...session, laid: [...session.laid], existing: [...session.existing], playhead: this.recorder.position() };
      },
      /** Lay a hit now, without a keyboard. The same path SPACE takes. */
      tap: () => this.recorder.tap(),
      /** Keep what has been played and hand the instrument back. */
      finish: () => this.recorder.finish(),
      log: () => this.log,
      section: () => this.section?.name ?? null,
      /** Install a take directly. `steps` is a list of 16th positions. */
      setTake: (role: Role, bars: TapeBars, steps: number[], level = 8): void => {
        const take = normalizeTake(role, bars, steps);
        this.tracks.set(role, { role, level, take });
        this.host.engine.setVoiceChart(role, chartFromTake(take), tierForLevel(level));
        this.host.engine.setVoiceEnabled(role, true);
        this.host.world()?.addWeapon(role, level);
        this.host.refresh();
      },
      /** Install the system's own take, off the authored ladder — the control
       *  arm, reachable without restarting into `autoTakes`. */
      setAutoTake: (role: Role, level = 8): void => {
        const take = autoTake(role, level);
        this.tracks.set(role, { role, level, take });
        this.host.engine.setVoiceChart(role, chartFromTake(take), tierForLevel(level));
        this.host.engine.setVoiceEnabled(role, true);
        this.host.world()?.addWeapon(role, level);
        this.host.refresh();
      },
      clearTakes: (): void => {
        for (const role of this.tracks.keys()) this.host.engine.setVoiceEnabled(role, false);
        this.tracks.clear();
        this.host.refresh();
      },
    };
  }

  // ---- internals ----------------------------------------------------------

  private trackAtSlot(slot: number): Track | undefined {
    const view = this.trackViews().find((t) => t.slot === slot);
    return view ? this.tracks.get(view.role) : undefined;
  }

  private openPass(role: Role, mode: RecordMode, bars: TapeBars, existing: readonly number[], budget: number): void {
    const started = this.recorder.arm({ role, mode, bars, existing, budget }, {
      onOpen: () => {
        this.host.engine.playPickupCue(0);
      },
      onTap: (result) => {
        if (result === 'full') this.host.toast('tape full');
      },
      onClose: (steps, bailed) => this.closePass(role, mode, bars, steps, bailed),
    });
    // One microphone. A pass already in flight keeps it; the level is banked and
    // the tape simply gets its room without a performance, which is the same
    // mercy the `autoTakes` arm provides.
    if (!started) {
      const track = this.tracks.get(role);
      if (track) {
        const filled = track.take
          ? growTake(track.take, bars)
          : autoTake(role, track.level);
        track.take = filled;
        this.host.engine.setVoiceChart(role, chartFromTake(filled), tierForLevel(track.level));
        if (!this.host.deactivated(role)) this.host.engine.setVoiceEnabled(role, true);
      }
    }
  }

  private closePass(role: Role, mode: RecordMode, bars: TapeBars, steps: number[], bailed: boolean): void {
    const track = this.tracks.get(role);
    if (!track) return;
    // THE LAST MERCY, and it is the strongest form of "let the system silently
    // correct a take" (#255's own mitigation list). A pass that ends with NOTHING
    // played — the player never found the key, or walked into a wall for the
    // whole loop, or bailed instantly — falls back to the system's take rather
    // than to one hit on the downbeat. `normalizeTake` would give you a legal,
    // playable track either way; this gives you a musical one.
    //
    // It also means the player can DECLINE: bail out of a pass and the system
    // cuts it for you. Which is exactly the `autoTakes` arm, available one take
    // at a time, and it is how the stack answers "recording under pressure is
    // stressful rather than exciting" without removing the pressure.
    const played = normalizeTake(role, bars, steps);
    const empty = mode !== 'overdub' && steps.length === 0;
    const take = empty ? autoTake(role, track.level) : played;
    track.take = take;
    const engine = this.host.engine;
    engine.setVoiceChart(role, chartFromTake(take), tierForLevel(track.level));
    if (!this.host.deactivated(role)) engine.setVoiceEnabled(role, true);
    this.log.push({
      timeS: this.host.world()?.timeS ?? 0,
      role, mode, hits: take.steps.length, bars, bailed,
    });
    const name = this.host.kits.get(role)?.name ?? role;
    this.host.toast(empty
      ? `${name} · nothing played — the system cut it · ${takeDensity(take).toFixed(2)}/bar`
      : `${name} · ${take.steps.length} hits · ${takeDensity(take).toFixed(2)}/bar`);
    this.host.refresh();
  }
}

/** A tape level's audio tier. The chart is the player's, so a tier is only
 *  doing the two other jobs it has ever done: setting a bed's presence and
 *  counting pips. Same two-levels-per-rung banding as the base. */
function tierForLevel(level: number): number {
  return Math.max(1, Math.min(4, Math.ceil(level / 2)));
}
