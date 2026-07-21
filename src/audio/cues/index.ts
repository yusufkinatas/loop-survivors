/** One-shot cues: the sounds the game makes about itself.
 *
 *  These are distinct from everything else in `audio/` — a voice, a kit, a
 *  chart is part of the *track* the build is playing. A cue is feedback about
 *  a game event, synthesised on the spot and thrown away. They share three
 *  rules: they ride master rather than the weapons bus (so no duck can swallow
 *  them), they hold no game tuning of their own (the caller passes numbers in
 *  from config.ts), and they are short.
 *
 *  Each takes the graph it should build into — `(ctx, dest, ...)` — so the
 *  engine decides where they land and these files only decide what they sound
 *  like. `MusicEngine` owns the mute check; by the time one of these is called
 *  the decision to make a sound has already been made. */
export { playLevelCue } from './level';
export { playHitCue } from './hit';
export { playStageMagnetCue } from './magnet';
export { playChestSpinCue, playChestLandCue, playChestDropCue } from './chest';
export { playPickupCue } from './reward';
export { playHealthPickupCue } from './health';
export { playGameOverCue } from './gameover';
export { playWinCue } from './win';
export { GemCue, type GemCueOptions } from './gem';
export { NoteCue, type NoteCueOptions } from './note';
