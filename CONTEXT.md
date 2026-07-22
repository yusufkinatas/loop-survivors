# Loop Survivors

A survivors-like where the weapons are sounds: the build is a band, and a good
run makes a track. This glossary is the project's shared language — issues,
reviews, and code should use these terms exactly.

## Language

**Trigger**:
One musical-grid event with two outputs: a sound in the mix and one
fixed-strength attack in the world.
_Avoid_: hit event, note event

**Chart**:
The per-weapon pattern that says when it fires and how each hit sounds. A
chart never decides how hard a weapon hits the world.
_Avoid_: pattern, sequence, loop

**Variant**:
A chart event's choice of sample within the weapon's kit (for example a pad
chord — a softer, sustained chord sound). Sound-only: a variant never changes
damage, area, or visuals.
_Avoid_: weapon variant, alt fire

**Velocity**:
How loud a chart event plays its sound. Sound-only: velocity never changes
damage or size.
_Avoid_: intensity, strength

**Weapon module**:
The single owner of one weapon's gameplay identity — its tuning numbers, base
and evolved behavior, its own entity behavior, and its effects — behind one
small interface. One per weapon; a weapon's evolution lives in the same
module.
_Avoid_: weapon class, weapon handler, weapon system

**Weapon context**:
The narrow surface the world hands a weapon module: queries about the world
in, effects (damage, spawns, fx) out. A weapon module never touches the
world's entity arrays directly.
_Avoid_: world reference, world access

**Encore**:
A maxed-build level-up. Once every weapon and passive is at max level, each
level-up shows a fixed two-option screen — a First Aid (20%-of-max-HP heal)
or a Tip Jar — both always offered, even at full health. An Encore never
improves the build; its power is final.
_Avoid_: encore bonus, stat encore, Emergency Water, Hotter Signal, Quick
Change, Wider Stage

**Tip Jar**:
A bundle of 25 notes, granted instantly on pick. One of the two Encore
offers, and what each leftover chest hit converts to on a maxed build. Never
drops in the world and has no multiplier.
_Avoid_: coin bag, note bag, note bundle

**Stage Light**:
A destructible prop — a toppled follow-spot The Hush hasn't consumed, glowing
warm amber. Spawns off-screen on a timer, takes only incidental weapon hits
(never targeted), blocks nothing, and breaks silently into exactly one drop:
notes, First Aid, or a Stage Magnet. The only source of those pickups —
enemies drop only experience gems.
_Avoid_: brazier, light source, destructible, lamp
