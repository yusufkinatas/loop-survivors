# Music as gameplay: how player-driven music is kept good, varied, and shaped

Research for issue #250 (part of #247). Surveys games in which the player's
play generates or drives the music, and extracts how each one keeps the result
musical rather than incidental: who owns the arrangement, how simultaneous
sounds are stopped from turning to mud, how a piece gets an arc when the player
controls the timing, which games make music matter *mechanically* rather than
merely react, and what each does about repetition inside one session and across
many. Special attention is paid to the tightest bindings — games where one
input is simultaneously one gameplay action and one note — and to what broke
when studios bound the two that tightly.

Games covered: Crypt of the NecroDancer, Thumper, Rhythm Doctor, BPM: Bullets
Per Minute, Metal: Hellsinger, Everhood, Sayonara Wild Hearts, Ape Out, FRACT
OSC, Electroplankton, Melatonin, plus Rez, Sound Shapes, Vib-Ribbon, Patapon,
Hi-Fi Rush, Hades, FUSER, and the three survivors-likes that have attempted a
musical hook (Bandwagon, Survivors SymphonYs, Rhythm Storm).

Sources were fetched **2026-07-24 and 2026-07-25** and are cited inline at the
point of each claim. Priority was given to primary material: developer talks
(GDC, CEDEC, TGDF), audio-director and composer interviews, first-party
developer blogs and store text written by the developers themselves, official
patch notes, and official technical documentation — including two unusually
good specs, Metal: Hellsinger's own modding guide and BPM's team-written Wwise
blog post. Review coverage is not used as evidence for any design claim.
Everything that could not be confirmed against a primary source is listed in
section 8 rather than smoothed over, including several widely repeated claims
that turn out to be journalists' paraphrase rather than developers' words.

**Plain-language glossary** (each term is explained here the first time it is
used, so the rest of the document can move at speed):

- **Stem / layer** — one instrument's own recording inside a piece, kept as a
  separate file so the game can turn it on and off independently. "Drums stem"
  is the drum kit alone.
- **Vertical layering** — building intensity by adding and removing stems that
  all play *at the same time* over the same underlying music.
- **Horizontal resequencing** — building intensity by switching to a *different
  section* of the music (verse to chorus), rather than adding layers on top.
- **Quantize / snap** — moving an event to the nearest point on the musical
  grid. If a player presses a fraction of a second late and the game plays the
  sound exactly on the beat anyway, the input has been quantized.
- **Ducking / sidechain** — one sound automatically dropping in volume whenever
  another one hits, so the important one stays audible.
- **Beatmatching** — speeding up or slowing down two pieces of music until
  their beats line up.
- **Key** — the set of notes a piece is built from. Two pieces in different
  keys played together clash; matching their keys makes them fit.
- **BPM** — beats per minute; the tempo.
- **Fill** — a short burst of extra drumming that marks the end of a section.
- **Voice** — one sound currently playing. "Voice limit" is a cap on how many
  can sound at once; "voice stealing" is cutting off the oldest or least
  important one to make room for a new one.
- **Step sequencer** — a grid of time slots; you place a sound in a slot and it
  fires when the playhead reaches it. A drum machine is a step sequencer.
- **4/4** — four beats to the bar; the time-feel of almost all pop music.
- **Round robin** — several recordings of the same hit, cycled through so a
  repeated sound never plays the identical file twice in a row.
- **Stinger** — a short one-off musical flourish fired on an event, sitting on
  top of whatever is already playing.

---

## 1. Who owns the arrangement

The surveyed games do not sit on a two-way split of "game composes" versus
"player composes". They sit on a spectrum of **how much authority the player is
given over musical decisions, and which decisions those are**. Almost every
shipped game keeps the *harmonic and structural* decisions for itself and hands
the player only *triggering* and *instrumentation* authority.

### 1a. The system composes; the player supplies state

The most common shipped arrangement. The composer writes everything; the game
chooses which pre-written pieces to play back and in what order; the player's
input selects among authored options but never invents musical material.

Mick Gordon describes the working reality of this model bluntly:

> "A game's score is written specifically for an interactive music system and
> consists of hundreds (sometimes thousands) of short audio files. The game's
> audio system plays these files in a sequence determined by the player's
> actions."
>
> — Mick Gordon, *My full statement regarding DOOM Eternal*, Medium
> (https://medium.com/@mickgordon/my-full-statement-regarding-doom-eternal-5f98266b27ce,
> fetched 2026-07-25)

He also notes the composer's deliverable is not a track but a *system-ready
package*: "I deliver my music in a neatly packaged Wwise file complete with
tempo information and carefully crafted transitions designed to seamlessly
react to the player's actions" (same source). The authorship is entirely the
composer's; the sequencing is the game's; the player only supplies the
parameter.

*Hades* is the clearest small-scale example of this model, and the most
directly transferable to a run-based game. Darren Korb, in the Gameplay
podcast transcript (24 Dec 2020):

> "We have a, sort of, semi-randomised thing that happens with the stems, where
> either the guitar and bass stem can play, or just the bass stem can play, or
> neither the guitar, nor bass stem will play."
>
> "When you're sort of in combat, all the stems are playing, or at least the
> drums and bass are playing. And then at the end of combat, the drums turn
> off."
>
> "When you get to a mini boss, or a boss, it'll advance to the sort of rocking
> section of the piece...it'll rock with all the stems turned on, for the
> duration of the fight."
>
> — https://gameplay.co/hades-game-music-sound-design-darren-korb-supergiant-games/
> (fetched 2026-07-25)

Note what the player controls here: **nothing directly**. The player controls
game *state* (in combat, at a boss, entering a chamber), and state drives the
arrangement. This is vertical layering driven by combat state, with one
horizontal jump reserved for bosses.

### 1b. The track is fixed and the player contributes no audio at all

The three games most often cited as "rhythm games where you make the music"
turn out, on the evidence, not to be that. This is worth stating plainly
because it removes three apparent precedents.

**Crypt of the NecroDancer.** The track is an opaque, independent asset — which
is provable from the shipped feature that lets a player substitute an arbitrary
MP3 of their own ("Set your own beats with songs from your own MP3 collection",
official Steam page, https://store.steampowered.com/app/247080/Crypt_of_the_NecroDancer/,
fetched 2026-07-25). A system that can accept any file the player owns cannot
be writing that file. Even the game's one apparent live performer is baked: the
singing Shopkeeper ships as alternate mixes, "27 unique songs, with an
additional 15 tracks that include shopkeeper vocals!" (official OST store page,
https://store.steampowered.com/app/314680/Crypt_of_the_Necrodancer_Original_Danny_Baranowsky_Soundtrack/,
fetched 2026-07-25).

**Rhythm Doctor.** The player supplies a judgement, not a contribution.
Designer Hafiz Azman's framing is that the chart is not authored separately
from the music at all:

> "The song itself is the level. It has to introduce the musical gameplay
> mechanic clearly."
>
> "The want to do away with arbitrary beatmaps is why I wanted it to be
> one-button."
>
> — 7th Beat Games interviews on Game Developer
> (https://www.gamedeveloper.com/design/using-medical-stories-and-heart-conditions-to-create-musical-challenges-in-rhythm-doctor
> and https://www.gamedeveloper.com/design/road-to-the-student-igf-hafiz-azman-on-i-rhythm-doctor-i-,
> fetched 2026-07-25)

**Melatonin** inverts the *authoring order* without changing who owns the
audio. Developer David Huynh designs the rhythm first and commissions music to
fit it:

> "The sense of rhythm is the most important part as it determines how the
> gameplay feels... The music is determined afterward to make sure that sense
> of rhythm is emphasized and to create the right mood for the theme."
>
> — https://www.gamedeveloper.com/design/finding-the-beat-through-environmental-cues-in-the-rhythm-game-melatonin
> (fetched 2026-07-25)

> "I made all the levels with placeholder songs and songs I found off YouTube
> and tried to get it to feel right first... Then that's when I would either
> find other [licensed songs] or have an artist compose a song for the specific
> level."
>
> Composers received "technical requirements, like I just wanted this tempo and
> this length, but I didn't give that much in terms of artistic direction."
>
> — https://butwhytho.net/2024/08/melotonin-with-developer-david-huynh-vinyl/
> (fetched 2026-07-25)

The rhythmic skeleton is the design artifact; the music is commissioned to a
tempo and a length to dress it. That is a genuinely useful pattern — but the
player is still not generating anything.

### 1c. The system composes; the player performs it

*Patapon* moves one step toward the player: the player's button presses are the
rhythm track, and the game supplies everything else. Hiroyuki Kotani:

> "The basic idea of this game is about rhythm, so you have to beat the rhythm
> in the accurate way — and even though you are giving the command by beating
> the rhythm, you are also singing a song with the Patapons."
>
> "It's like creating the music with the Patapons, and that's what makes the
> deeper aspect of this game."
>
> — *The Rhythm of Creation: Hiroyuki Kotani and Patapon*, Game Developer
> (https://www.gamedeveloper.com/audio/the-rhythm-of-creation-hiroyuki-kotani-and-patapon,
> fetched 2026-07-24)

The cost of this is a hard global constraint on the music. Adachi, the
composer, in the PlayStation Blog creators' interview:

> "Every track has the same tempo. Marching tempo is 120BPM. It was tricky
> writing music to fit this."
>
> — https://blog.playstation.com/2017/08/01/marching-to-the-beat-of-their-own-drum-an-interview-with-the-creators-of-patapon/
> (fetched 2026-07-24)

That is the trade in one sentence: **binding the player's input to the musical
grid fixes the tempo of the entire game's soundtrack**, and the composer then
has to make an album's worth of material that is interesting at one tempo.

### 1d. The player's loadout composes; the system arranges

This is the model this project is proposing, and — as of July 2026 — two other
survivors-likes have shipped or announced it. See section 6 for both. The short
form: the player picks instruments (by picking weapons), and the system owns
every remaining musical decision.

### 1e. Level structure written as song structure

A distinct and underrated position: the *level* is authored to the shape of the
music, so the arrangement is fixed but the player's progress through it is what
advances the piece. John Johanas on *Hi-Fi Rush*:

> "We literally wrote out the level design in these bar graphs, like a song:
> intro, verse, and then it goes up to a chorus."
>
> The chorus sections "would be the fights."
>
> — https://www.digitaltrends.com/gaming/hi-fi-rush-john-johanas-interview/
> (fetched 2026-07-25)

Hi-Fi Rush also pushes the constraint into encounter design: bosses are
"specifically timed to musical tracks, with HP bars big enough to make sure the
accompanying song can get all its lyrics in before switching to the next phase"
(same source). The health bar is sized to the song, not the other way round.

### 1f. The player's action is literally a note, and the system quantizes it

This is the tightest binding found, and the closest published precedent for
"one weapon trigger is one attack and one note".

**Rez.** Tetsuya Mizuguchi's GDC 2016 Classic Game Postmortem states both the
intent and the mechanism:

> "The idea was that shooting gives you sounds; it's like a call and response.
> We had many types of experiments. The magic that happened is quantization.
> Even if a player wasn't great at matching their interactions with the beat,
> quantization would synch the rhythms of play and make you feel good. When we
> first made this work it felt like magic. This became the essence of
> perfecting the game mechanics of Rez, and I carried it through into later
> projects like Lumines and Child of Eden."
>
> — Mizuguchi, quoted in Simon Parkin, "Oral history of Rez recounts a marriage
> of game and music", Game Developer, 17 March 2016
> (https://www.gamedeveloper.com/audio/oral-history-of-i-rez-i-recounts-a-marriage-of-game-and-music,
> fetched 2026-07-25)

Note precisely what he claims: quantization of **rhythm**. The widely repeated
claim that Rez also snapped shots into the musical *key* is journalism, not a
developer statement — see section 8.

Rez's own director is careful about how much authorship this hands the player:

> "In the game, the player sort of remixes the songs depending on the rhythms
> he inputs."
>
> — Jun Kobayashi, *Rez – 2001 Developer Interview*, originally allabout.co.jp,
> 30 Nov 2001; translation at https://shmuplations.com/rez/ (fetched
> 2026-07-25)

Remixer, not composer. The material is authored; the player re-times it.

**Sound Shapes** goes further and makes the level itself the score. Composer
Shaw-Han Liem:

> "the basic underlying system is that this game has a sequencer built into it,
> right? So this game is basically music sequencing software, and it has a
> bunch of different interfaces to interact with that sequencer."
>
> "there's one master sequencer underneath that's controlling all the musical
> logic, and there's all these different ways of adding music to it. The notes
> are just one of the ways."
>
> — Brandon Sheffield, "The Shifting Saga Of Sound Shapes", Game Developer,
> 21 Sept 2011
> (https://www.gamedeveloper.com/audio/the-shifting-saga-of-i-sound-shapes-i-,
> fetched 2026-07-25)

**Vib-Ribbon** is the opposite extreme: the player supplies the entire piece
(their own CD) and the game only *reads* it, turning musical features into
obstacles. Masaya Matsuura:

> "particular changes or transformation in the music would, for example,
> translate into obstacles for vibri while taking a walk."
>
> — official Sony Computer Entertainment Europe press kit, August 2000,
> unpublished Q&A, preserved at
> https://archive.org/details/vib_ribbon_press_kit (fetched 2026-07-25)

### 1g. The play generates the arrangement outright — Ape Out

*Ape Out* is the most important single case in this survey, because it is the
only shipped game found where there is **no underlying track at all** and the
arrangement is assembled from play, in real time, at the level of individual
drum hits. Matt Boch (audio) and Gabe Cuzzillo (design) have described the
architecture in detail.

They started with loops and abandoned them:

> "In that version, the soundtrack consisted of composed drum loops that
> repeated ad infinitum. We tried out some variations on that system where we
> had many individual drum loops and a system for picking them, but it became
> quickly obvious that it would be untenable to have enough drum loops to sound
> reactive without ballooning the game's file size and load times."
>
> — Matt Boch, https://musictech.com/features/interviews/ape-out-matt-boch-game-soundtrack/
> (fetched 2026-07-25)

What replaced them is a custom sampler playing MIDI patterns, so every drum
stroke is an individual sample event. Cuzzillo states why that mattered:

> "every hit is playing a sample, every drum simulates its own sound, it just
> means that the drum is going to be way more reactive to what's going on. And
> in the game it's so fast. The typical approach to reactive music, having
> stems that come in and out or fading between tracks, is just way too slow for
> this game."
>
> — https://mcvuk.com/development-news/when-we-made-ape-out/ (fetched
> 2026-07-25)

That is a direct rejection of the Hades-style vertical-layering model on
latency grounds, from a game whose action is fast — which is the relevant
comparison for a survivors-like.

**The crucial detail is how little is directly event-driven.** Exactly one
thing is a 1:1 trigger; everything else routes through a single scalar:

> "the only thing that is a direct reaction to a distinct event is the cymbal
> crashes when guards die and those depend on where on the screen the guard
> dies – it will play a different cymbal – but the rest of the drums are just
> based on an intensity rating."
>
> "The intensity rating is generated basically by a couple of different factors
> like intensity events... the more guards on screen, the higher the intensity.
> Every time there's a gunshot, the intensity is raised, every time you kill a
> guard, the intensity is raised. Fire on screen also raises the intensity. And
> the way the drums react to that is immediately the drummer starts playing the
> drums harder if the intensity goes up and he also starts choosing denser
> patterns to play. So he has a giant pool of patterns that he draws from...
> Each one has a density rating and a similarity rating, and so it tries to
> start playing similar drum sequences that are denser – that just contain more
> hits per second."
>
> — Cuzzillo, MCV (fetched 2026-07-25)

So the pattern pool is **tagged with density and similarity**, and the selector
walks the pool by "more like what is playing, but busier". Boch confirms the
one event trigger is spatially mapped to a real kit: "The cymbal that crashes
when you kill an enemy is dependent on their position on screen, spatially
mapped on to a drum kit from the drummer's perspective – so for example,
killing an enemy on the bottom left side of the screen triggers an open hi-hat"
(MusicTech, fetched 2026-07-25).

Boch also names the design constraint that made the whole thing tractable:

> "The level design was left entirely up to [game designer] Gabe; my goal was to
> build a system that would aesthetically match any kind of combat encounter
> the game could procedurally throw at you."
>
> "Apart from the level introductions, there are no scripted moments in the game
> and therefore no fixed musical score. The drummer is always just reacting to
> whatever gameplay scenario is happening on screen."
>
> — MusicTech (fetched 2026-07-25)

*Thumper* sits alongside this as a case where the player's hit is a constituent
of the track rather than a layer on it, though the material is authored:

> "Because of the close relationship between our audio and gameplay, the audio
> cues don't just punctuate or overlay the soundtrack, they are a fundamental
> part of it."
>
> "We try to limit the distinction between music and sound effects. That makes
> it easier. If you think of percussive instruments, they are just two solid
> objects hitting each other. In our gameplay, there are many collisions between
> objects and we use them as musical opportunities."
>
> — Drool, *Road to the IGF*, Game Developer, 28 Jan 2015
> (https://www.gamedeveloper.com/audio/road-to-the-igf-drool-s-i-thumper-i-,
> fetched 2026-07-25)

Thumper's level geometry *is* the grid — in Marc Flury's GDC 2017 postmortem,
"the path that the beetle moves down every little square is One Beat", and
because a block is a fixed amount of *musical* time rather than space, "we can
scale the path and make the beetle go faster and slower really easily... and
everything's still seamless" (GDC 2017, *Seven Years in Alpha: The Thumper
Postmortem*, https://gdcvault.com/play/1024291/Seven-Years-in-Alpha-Thumper and
https://www.youtube.com/watch?v=ckm8_SEIXQM, ~21:27 and ~22:08; transcribed
from the video's automatic captions, see section 8). Gameplay and audio are
authored on one timeline in a tool Drool calls the sequence editor.

Notably, Thumper's authorship order is the *reverse* of most music games:

> "the way we approached It Was Always by like making the gameplay first in the
> visuals and kind of just adapting the audio to fit that kind of the reverse of
> how I think a lot of other music games are made"
>
> "the goal is never to make like songs that would be catchy or memorable it
> was more about to make like a game experience that that used sound"
>
> — Flury, GDC 2017 postmortem (~27:15 and ~58:58; automatic captions)

### 1h. Two rhythm shooters, opposite bets, both written down

*Metal: Hellsinger* and *BPM: Bullets Per Minute* solve the same problem in
opposite directions, and unusually, both teams published their reasoning.

**Hellsinger hands instrumentation to the player.** The official modding guide
(©2022 Funcom Oslo,
https://cdn.metalhellsinger.com/modding/MetalHellsinger-Modding-Guide.pdf,
fetched 2026-07-25) is a genuine technical spec. Its core:

> "Tiers in Metal: Hellsinger can be thought of as increasing music intensity
> where Tier 1 is low intensity and Tier 5 is high intensity. In FMOD Studio,
> each Tier corresponds to a FMOD track." (p.14)
>
> "The Fury multiplier travels through five tiers: 1x - 2x - 4x - 8x - 16x"
> (p.14)

Game director David Goldfarb on the composition method:

> "The composers designed the tracks around our Fury multiplier system, such
> that there were 5 gradations of instrumentation, and the highest would mean
> that the vocals came in when the player was performing well."
>
> — https://www.gamedeveloper.com/design/shredding-for-satan-how-i-metal-hellsinger-i-designed-fps-harmonies-in-hell
> (fetched 2026-07-25)

Composer Nicklas Hjertberg (Two Feathers) describes writing them by
subtraction — "We started with writing the entire track and then started
removing elements from it… So when you transition between two different Fury
levels, they crossfade between each other" — and notes the low tiers are not
merely the song minus parts: they contain material absent from the released
track, "all sorts of synths and stuff that aren't in the actual track during
that first two Fury tiers… that hint at the vocal melody"
(https://www.windowscentral.com/gaming/metal-hellsinger-interview-composing-the-music-soundtrack-with-two-feathers,
fetched 2026-07-25).

**And the player genuinely plays an instrument.** The on-beat reward is not a
UI blip; it unmutes a drum track that lives inside the music event:

> "The beat track is a separate track which only contains kick drumbeats in the
> same tempo as the song. This is what the player will hear when they perform
> actions on beat." (p.6)
>
> "BeatMatchSuccess is a Boolean variable that is either 0 or 1. It controls
> whether the beat track (traditionally the kick drum) should play or not…"
> (p.18)
>
> "FireRate decides the kick drum should play every beat or every other beat.
> Some weapons can´t fire on every beat." … "With some weapons we only want to
> play a kick drum on 1 and 3 or 2 and 4. Depending on when the weapon is fired,
> the game will tell FMod to start playing kicks on even or odd beats." (p.18)

Different weapons therefore occupy different rhythmic subdivisions — Goldfarb:
"We had specific rhythm goals for the weapons as 'instruments' that primarily
informed what we wound up making" (Game Developer, fetched 2026-07-25). The
system requires a constant tempo: "There is currently no runtime beat detection
in Metal: Hellsinger. This means that the tempo of the song needs to be constant
throughout and cannot change" (modding guide, p.5).

**BPM refuses to let gameplay touch the arrangement, and says why.** Awe
Interactive's own Wwise blog lays out three options they considered and their
verdict on each:

> "3. Just the beat (e.g. Crypt of the NecroDancer). The AI sticks to the beat
> of the song, but its actions aren't dependent on the track's state."
>
> Pros: "Dynamic, replayable, music can have its own musical journey, easier to
> make more content, game design isn't dependent on music deliverables."
> Cons: "Music isn't tailored to your experience."
>
> And on procedural music, their stated reason for rejecting it: "Music is
> defined by the player, rather than a song structure, making for a poor musical
> journey."
>
> — David Jones, Josh Sullivan, Sam Houghton, *Syncing Music and Gameplay in
> BPM: Bullets Per Minute*, Audiokinetic blog, 13 Jan 2022
> (https://www.audiokinetic.com/en/community/blog/syncing-music-and-gameplay-in-bpm/,
> fetched 2026-07-25)

That last sentence is the sharpest published argument against this project's
premise, from a team that shipped a rhythm roguelike and thought hard about it.

Yet BPM's player *is* audibly in the mix — the resolution is that the shots are
sounds written into holes the composer left, not arrangement decisions:

> "The weapons are the lead instrument in the mix, with the aim being
> exceptional levels of satisfaction when you get into the flow of the game and
> start making huge streaks. Conversely, when you fail to time a shot or a
> reload or an ability to the beat and no sound plays, it sounds empty and
> disappointing."
>
> "Because I also composed the music (alongside Joe Collinson), space had been
> left in the arrangements for these sounds." — Sam Houghton
>
> "BPM's gameplay is essentially a step sequencer running in 4/4 at 88 beats per
> minute."
>
> "The player's actions can only be performed on every half-beat... But on each
> one of these beats, they can perform only one action: reload, dodge, fire, or
> cast. (They can jump at any time, however, because it sucked when we made it
> so they had to jump on the beat.)"
>
> — Audiokinetic blog (fetched 2026-07-25)

One tempo for the entire game, and the consequence sound designer Josh Sullivan
draws from it: "Because of this consistent tempo throughout the whole game, I
could easily cut all of the audio sequences that had to be in time to a click
track at 88 bpm... However, it's worth noting that this method wouldn't have
worked if we had more than one tempo" (same source).

---

## 2. Mud control

Ten distinct mechanisms appear across the sources, operating at different
layers — before playback, at selection time, at playback, and in the writing of
the material itself. Nothing found relies on a single trick, and the one team
that tried the obvious signal-processing fix reported that it did not work
(2j).

### 2a. Constrain the material so nothing can clash (before playback)

Harmonix's *FUSER* is the strongest documented case of guaranteeing that
arbitrary player combinations sound acceptable, because guaranteeing it *is*
the product. The constraints are stated by the developers directly:

- **Fixed time signature.** Project manager Daniel Sussman: "every song needs
  to be in a 4/4 time signature."
- **A tempo band, with octave-style folding for outliers.** Audio lead Eric
  Brosius: songs play "between 90 and 157 beats per minute", using "double time
  and half time" for tracks outside it — "Let's say we do a punk rock song
  that's around 220...we think of it as 110 in the game."
- **A designated harmonic authority.** Brosius: "we determine which disc should
  be the chord progression master", and "we weigh the bass the strongest" for
  harmonic information. One element decides the harmony and the others conform.
- **A real-time mastering chain**, i.e. automatic final mixing applied live to
  whatever combination the player made: the game uses "its own real-time
  mastering chain" and they "adjust" overall brightness across genre mixes.
- **Curation against known-bad textures.** Sussman flags "heavy guitars" as
  textures that "tend to stick out most", and notes "the horns have a certain
  quality to them that can sound off in some songs".

— all from https://www.digitaltrends.com/gaming/fuser-developer-interview/
(fetched 2026-07-25)

The lesson for a build-makes-the-track design: FUSER did *not* solve mud purely
with a clever runtime mixer. It solved it by **restricting what is allowed into
the pool in the first place** (one time signature, one tempo band, one
harmonic authority), then curating out the specific timbres that fight, then
mastering the result automatically.

### 2b. Assign priority and let loud sounds mask quiet ones (at playback)

DICE's HDR audio, presented at GDC by Anders Clerwall, is the canonical game
solution to "too many important sounds at once". Its principle, as summarised
by Audiokinetic's Louis-Xavier Buffoni:

> "every sound is important, but not at the same time"
>
> — https://designingsound.org/2013/06/21/finding-your-way-with-high-dynamic-range-audio-in-wwise/
> (fetched 2026-07-25), summarising Anders Clerwall, *How High Dynamic Range
> Audio Makes Battlefield: Bad Company Go BOOM*, GDC 2009
> (session listed at https://www.ea.com/frostbite/news/how-hdr-audio-makes-battlefield-bad-company-go-boom,
> fetched 2026-07-25)

Mechanically: sounds are tagged with real-world loudness values in dB SPL,
those values "function as priority indicators", and a sliding window acts as a
compressor so that when loud sounds play, quieter elements "become inaudible or
significantly reduced (ducked)", returning when the loud sound finishes — "all
while preserving relative levels between sounds" (same source). Buffoni's
caveat is worth carrying: in practice designers "must heavily tweak dB SPL
values anyway", making it "similar to tweaking levels on a traditional mixer".

The generic middleware version of the same idea is **playback limiting,
priority, volume threshold and virtual voices** — capping how many instances of
a sound can play, and demoting the least important ones. (Audiokinetic's own
course and blog pages returned HTTP 403 to direct fetching; see section 8.)

### 2c. Separate roles so voices do not compete for the same space

Implicit across the sources rather than stated as a rule, with one explicit
instance: FUSER's "chord progression master" and bass-weighted harmony
assignment (2a) is role separation — exactly one element is allowed to define
harmony at a time.

### 2d. Keep simultaneous streams distinguishable from each other

Rhythm Doctor's real mud problem is perceptual rather than acoustic — it runs
several independent rhythmic lines at once and the player has to track them
separately. Designer Kyle Labriola on the requirement:

> "Players can play a level with four EKG rows running simultaneously without
> them looking the same."
>
> "Each new type of beat has to feel clear and distinct from each other."
>
> — https://www.gamedeveloper.com/design/using-medical-stories-and-heart-conditions-to-create-musical-challenges-in-rhythm-doctor
> (fetched 2026-07-25)

The transferable principle: when several voices run at once, the constraint is
that each must be *identifiable as itself*, which is a stronger requirement than
merely being audible.

### 2e. Reduce the number of things that can happen

*Patapon*'s command vocabulary is three commands, deliberately: "The most
important point about Patapon was to make it simple. The less of the
information, the better" (Kotani, Game Developer, fetched 2026-07-24). A small
vocabulary is a mud-control decision as much as a usability one — there is a
bounded set of sounds the player can produce.

### 2f. Route most events through one scalar instead of many triggers

Ape Out's answer, restated as a mud-control principle: of everything that
happens in a firefight, exactly one class of event (a kill) fires a specific
sound; all other activity — enemies on screen, gunshots, fire — is summed into
a single **intensity** value that selects denser patterns and harder hits
(Cuzzillo, MCV, fetched 2026-07-25; quoted in full in 1g). A crowded screen
therefore cannot produce a crowded *trigger* stream; it produces a higher
number, and the number picks a busier pattern.

This is the cleanest mud-control idea found for a game with hundreds of
simultaneous combat events, and it is structurally the opposite of "every
gameplay event is a note".

### 2g. Constrain the note pool, the polyphony, and the control surface

**A fixed scale.** Sound Shapes' entire musical logic is a bounded grid:

> "The musical logic, once you figure it out, is very similar to the way a drum
> machine works. So it's basically a 16-step sequencer with an eight-note
> scale."
>
> — Shaw-Han Liem, PlayStation.Blog (first-party), 25 July 2011
> (https://blog.playstation.com/2011/07/25/sound-shapes-for-ps-vita-jonathan-mak-demystifies-music-creation/,
> fetched 2026-07-25)

Sixteen steps and eight notes is a small enough space that arbitrary player
placement stays consonant. (No developer said the words "you can't play a wrong
note" — see section 8.)

**A hard voice budget with deliberate voice stealing.** FRACT OSC's developers
published theirs:

> "We have three primary synths in the game; Lead, Bass and Pad. The Lead and
> Bass synths are monophonic (1 voice/note played at a time) and the Pad is
> polyphonic (currently set around 4-5 voice/notes at a time)... the Pad
> sequencers will progressively steal voices as the patterns ask for new
> notes... Our current voice budget is 10 realtime voices spread accross the
> various synths... we do a lot of the sound effects (especially the
> reactive/interactive ones) with synth voices."
>
> — Richard Flanagan, Phosfiend Systems dev blog, 6 Feb 2013
> (https://web.archive.org/web/20130212124817/http://fractgame.com/news/117-voices-polyphony-and-wires-aplenty,
> fetched 2026-07-25)

Ten voices total, monophonic lead and bass, sound effects sharing the same
budget as the music. Note also that FRACT deliberately shrank the *control*
surface for the same reason — Flanagan calls the failure mode "the Wall of Knob
fear" and describes moving to "a curated set of controls, but offer a wide
variety of sound with little intimidation"
(https://web.archive.org/web/20130709234622/http://fractgame.com/news/120-curating-the-studio-synths,
fetched 2026-07-25).

### 2h. Guarantee per-hit variation so repeated triggers do not machine-gun

Ape Out's sample library is built for exactly the case where the same sound
fires many times in a row:

> "Each of the kits in the game has seven different velocity levels and 12 round
> robins per velocity level, because we were really concerned about making the
> drums feel as live as possible."
>
> — Boch, MusicTech (fetched 2026-07-25)

Seven loudness tiers, twelve alternate takes each — 84 recordings per drum. Boch
also names a *recording* choice made for cohesion rather than realism: "I opted
to use mostly a highly compressed room mic of a drum kit for all of the first
four levels of the game. The garage-y, live feel of the recording helps to sell
the idea that it was a real drummer" (same source). One room, one kit, one mic
position is itself a mud-control decision — everything shares an acoustic.

### 2i. Or: choose a palette that absorbs collisions

Drool's answer to the audio-cue-versus-soundtrack clash is the opposite of
avoidance. Asked directly how they dealt with cues becoming dissonant against
the music:

> "So we try to embrace this kind of dissonance when it happens. It suits the
> physical and cacophonous gameplay."
>
> "After a lot of experimentation, we found that waves of dissonant drones
> complement our look particularly well."
>
> — Drool, Road to the IGF (fetched 2026-07-25)

A drone-and-percussion palette has no chord changes to clash with, so player
input cannot be harmonically wrong. This is a real strategy, and its cost is
that the music gives up melody.

The counter-case is Sayonara Wild Hearts, where legibility was negotiated *in
the arrangement itself* because the gameplay reads off specific drum elements.
Simon Flesser:

> "Sometimes I'd have an idea for a level, and I'd come with a request to Daniel
> like 'This one needs the snare and base drum to be specifically clear and be
> closer to a hip hop song in tempo, as we are shifting dimensions on the
> beats.'"
>
> — unedited Retro Gamer interview transcript, March 2025
> (https://www.lowpolypigeons.com/blog/interview-transcript-sayonara-wild-hearts-simon-flesser-march-2025,
> fetched 2026-07-25)

Composer Daniel Olsén describes the same negotiation as ongoing across the
project: "There was a lot of back and forth work to balance music with gameplay
and visuals, to get it to a point where we felt like they were working
together, and taking turns to lead the game forward"
(https://simogo.com/work/sayonara-wild-hearts/daniel-about-sayonara-wild-hearts/,
fetched 2026-07-25). "Taking turns to lead" is a mix-hierarchy statement in
plain language.

### 2j. A documented negative result: ducking under player actions did not work

BPM's team is the only one found who tried sidechaining the music to the
player's own on-beat hits and reported back. Composer Sam Houghton:

> "Early on, I did play around with ducking the music channel when a player did
> an 'on-beat interaction', but the slight ducking really did nothing to enhance
> the satisfaction, and if anything just took away some of the energy of the
> game. So all I'm doing in Wwise is a few level tweaks here and there to make
> sure everything is clear and punchy in relation to the music."
>
> — Audiokinetic blog (fetched 2026-07-25)

Their replacement is compositional rather than technical: leave holes in the
arrangement where the player's sounds go (1h). Negative results are rare in
public game-audio writing, and this one directly contradicts the intuitive fix.

The same article documents three further mechanisms, all of which are caps
rather than processing:

> "An example where this is definitely required is the minigun, which fires
> every quarter note. Because of that rate of fire, the mix can get muddy, so
> it's best to limit it to one minigun shot sound at a time." — Josh Sullivan
>
> "An enemy can request to play an 'attack' in a few beats' time. They do this
> by querying the step sequencer to see if attacking on that beat would be
> overly cacophonous."
>
> "when enemies are making their chatter noises (grunting and growling to the
> beat). When the enemy's pain Wwise Event is triggered, it not only plays the
> 'ouch' Random Container, but it stops the enemy's chatter." — Josh Sullivan

The middle one is the striking one: **enemy AI asks the sequencer for
permission before attacking**, and the criterion is musical. Programmer David
Jones states the resulting invariants: "You'll never have a dodge attack and a
jump attack on the same beat", and "If there's a room with five enemies and then
compare it to a room with thirty enemies, there's still the same amount of
projectiles coming at you because the system decides that and it doesn't
overwhelm you"
(https://www.gamedeveloper.com/design/building-ai-to-fight-on-the-beat-of-bpm-bullets-per-minute,
fetched 2026-07-25). Enemy density is decoupled from note density on purpose —
the arrangement has a fixed budget of attack events regardless of how many
enemies exist.

---

## 3. Arc

The arc problem is the hardest one in this survey and the least solved. Six
strategies appear, and they differ mainly in *where* the arc is stored — in the
level, in encounter state, in the campaign, in a scalar, or split across two
mechanisms with different rules.

### 3a. Author the level to the song (arc owned by the level)

*Hi-Fi Rush*, section 1e: the level is written as intro / verse / chorus, and
combat sits on the choruses. The arc is guaranteed because the designers built
the level to the arc. This works when the game controls pacing.

### 3b. Let game state advance the piece (arc owned by the encounter)

*Hades*, section 1a: chamber entry re-rolls stems, combat adds drums, a boss
promotes the piece to "the rocking section" with everything on. The arc is a
step function driven by encounter state, not by elapsed time.

### 3c. Fix tempo, vary elsewhere (arc deliberately flattened)

*Patapon* fixes 120 BPM across the whole game (Adachi, above) and buys variety
in orchestration and voices instead of in tempo or structure. Kotani on the
vocal layer:

> "we had weak Patapons, weird Patapons, and angry Patapons, etc. all singing
> for us...it really helped give the feeling that there were loads of Patapons."
>
> — PlayStation Blog creators' interview (fetched 2026-07-24)

Adachi states the risk plainly: "I had to be very careful that the tracks
didn't get too samey" (same source).

### 3d. One new idea per level (arc owned by the campaign)

Rhythm Doctor puts the arc above the individual song: the campaign is a
curriculum, and the rule is absolute.

> "Our goal is to have every successive level introduce some new kind of
> element, and to never break that rule."
>
> — https://www.gamedeveloper.com/design/road-to-the-student-igf-hafiz-azman-on-i-rhythm-doctor-i-
> (fetched 2026-07-25)

Melatonin does the same at chapter scale, and explicitly treats the game as an
album — Huynh describes sequencing it "like an album, because that was the
thought process", with "a sense of the finality behind the sequencing"
(https://butwhytho.net/2024/08/melotonin-with-developer-david-huynh-vinyl/,
fetched 2026-07-25). The mechanism he uses is **density contrast between
levels**:

> "Most chapters have a set of five playable levels, so I try to make sure each
> of those levels feels different from one another. They need to have a unique
> theme, tempo, and sense of rhythm to make sure the game has variety."
>
> "Some levels have you performing actions on almost every beat whereas other
> levels have you waiting a long time for your turn to react."
>
> — https://www.gamedeveloper.com/design/finding-the-beat-through-environmental-cues-in-the-rhythm-game-melatonin
> (fetched 2026-07-25)

Rests are composed at the sequence scale, not inside any one piece. That is an
arc built out of how *busy* the player is, which is a property a survivors-like
schedule already controls.

### 3e. Arc from a scalar plus a scheduled tempo ramp — the Ape Out answer

Ape Out is the one case found where a genuinely generative score gets a shape,
and it does it with two mechanisms working at different timescales.

**A tempo ramp across the album** (Ape Out's levels are grouped into "albums"
with "sides"):

> "The tempo goes up over the course of an album, and the drummer will lag or
> lead based on the intensity."
>
> — Cuzzillo, https://nygamecritics.com/2019/04/16/the-circle-interview-creator-gabe-cuzzillo-on-how-ape-out-changed-during-5-years-of-development/
> (fetched 2026-07-25)

**Micro-timing as a tension device**, stated by Boch as deliberate:

> "The drummer anticipates the beat in periods of high intensity and will lean
> back into the pocket at low intensity. This unsettles the player and adds to
> the intensity of combat."
>
> — MusicTech (fetched 2026-07-25)

("In the pocket" — playing very slightly behind the beat, which feels relaxed;
playing slightly ahead feels urgent.)

**Intensity is sticky, with named exits**, which is what stops the arc from
flickering:

> "When you get shot, the drummer stops for a couple of beats and will switch to
> playing something different from what they were playing before. If you stay in
> high-intensity situations, the drummer will keep going on a similar motif
> until either the level ends, you get shot, or the intensity level of your
> gameplay decreases."
>
> — Boch, MusicTech (fetched 2026-07-25)

And the arc is explicitly tied to **skill**, not only to time:

> "We endeavored to make the player sound stylish anytime they were doing well
> in the game. It's totally intentional that the most bombastic version of the
> soundtrack is the one that a skilled player would hear as they ape their way
> out."
>
> — Boch, MusicTech (fetched 2026-07-25)

Thumper's arc is shaped from density of drones rather than song sections:
"They wash over you and there's an intense feeling of dread as the next
challenge approaches. This bleakness lets us mix in some brief moments of
beauty, relief, and optimism" (Drool, Road to the IGF, fetched 2026-07-25).

FRACT OSC's arc is a **teach-then-release** structure — the campaign is the
tutorial for the free-form studio that follows it: "they are introduced
progressively to the tools that they will eventually use in the studio. The
studio acts as the culmination of their actions in rebuilding the world"
(https://web.archive.org/web/20120223005624/http://fractgame.com/news/52-fract-osc-dev-diary-explore-rebuild-create,
fetched 2026-07-25).

Sound Shapes declines a dramatic arc outright and says so: "The metaphor that
we're using is that you're sitting down with your record collection and you've
got a bunch of levels – tracks – to leaf through... In terms of a 'narrative,'
that's what we're thinking" (Liem, PlayStation.Blog, fetched 2026-07-25).

### 3f. Split the arc in two: reversible intensity, irreversible form

Metal: Hellsinger's architecture is the most directly reusable arc design found,
because it separates two things most systems conflate.

**Intensity (tiers) is owned by the player, is reversible, and is *not*
quantized.** It runs off a continuous parameter with volume curves:

> "PlayerTier is a number between 0 and 100. The game will increase this number
> when the player increases their multiplier. Conversely when the player
> multiplier drops, the number decreases."
>
> "when the PlayerTier variable is between 0 and 14, Tier 1 is at maximum
> volume. As the value increases to 20, the volume follows a curve to decrease
> to minus infinity. At the same time… Tier 2 will increase in volume from
> roughly 14 to 20."
>
> — modding guide, p.17

**Form (acts) is owned by the level, is one-way, and *is* quantized to a bar:**

> "1. Game tells FMOD to transition/jump to the next act. 2. We wait until the
> next even bar of music is played. 3. We play a short transition piece. 4. We
> begin laying the next act." (p.15)
>
> "Note that it is only possible to progress between acts in a linear fashion."
> — the only legal path being `Intro → Act1 → Act2 → Act3 → End` (p.7, p.15)

And the reason the split exists is stated as a scheduling problem that any
survivors-like will recognise:

> "In Metal: Hellsinger, we want the player to experience a song from start to
> finish when playing through a level. The issue however is that we as
> developers have no control over how much time a playthrough of a level will
> take – hence, we cannot write a song of perfect length." (p.7)

The consequence: **the song cannot lose its place in the arrangement because
the player played badly.** Instrumentation can collapse and rebuild freely;
structure only ever moves forward.

Goldfarb confirms the fall is deliberately cushioned rather than instant:

> "As a player loses or gains Fury in sufficient amounts, the soundtrack adds or
> subtracts instrumentation layers from the song, and there is some delay and
> smoothing to keep it from being overly jarring when one goes up or down."
>
> — Game Developer (fetched 2026-07-25)

BPM, having refused performance-driven layering, gets its arc from beat-synced
*track* changes instead — "using Music Switch Containers and Music Playlist
Containers in Wwise made it relatively simple for me to transition one piece of
music into another, all synced in time to the beat" (Audiokinetic blog). Its one
climactic gesture is a deliberate *release* of the grid: on killing a boss,
"each note shot is in your own time, and each note has to loop infinitely until
you shoot the next shot" (same source). The player gets to play out of tempo
exactly once per boss, at the moment of victory.

### 3g. The unsolved part

With Ape Out qualified in, the honest statement of the gap is narrower than it
first appears, but it is still a gap.

No source found describes a generative system that produces **resolution** —
a deliberate ending, a final cadence, a piece that finishes rather than stops.
Ape Out's arc is monotonic within an album (tempo up, intensity up and down)
and its endings are the authored between-level drum solos, which Boch names as
the only scripted music in the game (MusicTech, fetched 2026-07-25). Every other
surveyed game moves the arc somewhere the player does not control: authored
level structure (Hi-Fi Rush, Sayonara Wild Hearts), encounter state (Hades), a
campaign curriculum (Rhythm Doctor, Melatonin), or a fixed schedule.

The pattern across all of them: **rise is cheap and can be generated; ending is
expensive and gets authored.**

---

## 4. Mechanical weight, and what broke

### 4a. Bonus, not gate — the Hi-Fi Rush position

Hi-Fi Rush is the most explicit shipped statement of how to make rhythm matter
without making it a wall. John Johanas:

> "It doesn't matter if you don't press the button on time, but you'll get
> bonuses if you do."
>
> "So even if you're not on the beat, you'll feel like you're on beat."
>
> "The very easy thing in game design is to make it have a negative loop: If
> you don't press things correctly you fail."
>
> "You're not a rock star — but you can feel like one."
>
> — https://www.inverse.com/gaming/hi-fi-rush-creative-director-interview
> (fetched 2026-07-25)

And the rejected alternative, in his own words: "If you're not playing to the
beat, you'll stop or you can't attack" is the design he set out to avoid
(https://www.digitaltrends.com/gaming/hi-fi-rush-john-johanas-interview/,
fetched 2026-07-25).

The positive form of the same rule, and the name he gives the structure:

> "I did not want the player to be unable to do an action because of their lack
> of rhythm, but to have a positive result happen *because* they went with the
> rhythm."
>
> "The benchmark we kept coming back was always to see if it felt like the
> action and the music were matching... the experience needed to feel like you
> were performing a song as you fought, dodged and parried enemies."
>
> — https://press-start.com.au/features/2023/02/19/hi-fi-rush-interview-striking-a-new-rhythm/
> (fetched 2026-07-25)

The same interview describes the resulting scheme as a **"success" and "greater
success"** system rather than a success/failure one — there is no rhythm fail
state, only a better outcome for playing with the beat. Johanas also notes the
integration cost: "Animation, sound design, controls, and enemy AI always
needed to be tweaked" to keep action and music matching (same source).

The mechanism that makes this possible is **input quantization**: the game
snaps the player's action onto the beat regardless of when the button was
pressed, so the *world* stays musical while the *player* is free. Everything in
the world is on the grid — the CEDEC 2023 talk by Johanas and lead game
designer Masaaki Yamada reports the game "was animated for 120BPM
(beats-per-minute) at 60 frames per second and dynamically modified
thereafter", with "all elements matched to the BPM" and able to be "sped up and
down in sync" (https://www.gameanim.com/2023/09/08/hi-fi-rush-music-synced-animation/,
fetched 2026-07-25, reporting on CEDEC 2023).

The accessibility cost is not zero. Johanas: "the Y attack, which has a beat in
the middle, was tricky for some people to handle", and his conclusion was to
over-supply cues — "The right way to do accessibility was actually making a lot
of accessibility, and almost more than necessary because there're so many ways
to interpret the melody" (Digital Trends, fetched 2026-07-25). Hi-Fi Rush also
constrains itself to a "130- to 160-beats-per-minute sweet spot" (same source).

### 4b. Gate — the Patapon position, and what it cost

Patapon makes rhythm a hard requirement: a mistimed command is simply not
issued. The reported failure point is at the top of the difficulty curve, where
the required rhythm gets complex. Kotani: "quite a few people said the rhythm
for executing 'Miracles' was too difficult" (PlayStation Blog, fetched
2026-07-24). The remaster's fix was to loosen the reward threshold rather than
the input: "Fever is awarded for only a 3-combo now" (same source).

The other cost is decision time. Kotani: "You only have two seconds or so to
decide whether to attack, defend, or run away" (same source) — when input is
locked to musical phrases, the game's decision cadence is set by the bar, not
by the situation.

Notably, Kotani arrived at the same conclusion as Johanas about feedback
polarity, from a teaching background rather than an accessibility one:

> "if my students are happy, they would learn more; so, we had to praise them
> rather than scolding them."
>
> "I have to make the users happier, so they would feel like they are
> encouraged to go to the next stage."
>
> — *Patapon's Kotani: Praise Players, Don't Scold Them*, Game Developer
> (https://www.gamedeveloper.com/game-platforms/-i-patapon-s-i-kotani-praise-players-don-t-scold-them,
> fetched 2026-07-25)

Two designers who bound music to mechanics at opposite tightnesses — Patapon
gates on rhythm, Hi-Fi Rush does not — independently converged on the same
rule about how the resulting failure should feel.

---

### 4c. Clock, not judge — and the strongest "what broke" evidence found

*Crypt of the NecroDancer* is the most valuable case in this survey, because
its designer published a deep dive describing how he set out to build a rhythm
game and ended up deleting the rhythm judgement.

Ryan Clark, *Game Design Deep Dive: Finding the beat in Crypt of the
NecroDancer*, Game Developer, 17 Sept 2014
(https://www.gamedeveloper.com/audio/game-design-deep-dive-finding-the-beat-in-i-crypt-of-the-necrodancer-i-,
fetched 2026-07-25). On the timing window:

> "I implemented the game with about 20 percent leeway around the beat"
>
> "the times when you are least accurate are the times when you are most
> stressed!"
>
> "it felt best at 100 percent!"
>
> "I think I was unwise to emulate rhythm games here"
>
> "their challenge comes from doing that accurately. In NecroDancer the
> challenge comes from the fast tactical combat"
>
> "if the game tells them that they're wrong, in the heat of battle, they get
> frustrated"
>
> "When I decided that rhythm gameplay was the way to go, I did not expect to
> end up removing precise rhythm"

The result: the beat is a **clock**, not a **judge**. There is no
perfect/good/miss grading; the beat sets the pace of turns and nothing more.
Clark also could not bend the audio (it might be the player's own MP3), so he
bent the game's idea of where the beat is toward the player instead — an
"autocalibration" system built on a leaky integrator that shifts "the effective
position of each beat to match" the player, bounded so it never drifts "more
than 1/2 beat away from the true beat position" (same source). His stated
reason: "A player hits the key when they perceive the beat to be. They might be
wrong."

A second finding from the same article is that **partial synchronization felt
worse than none**. Clark first had the player move on the beat and enemies move
halfway between beats; the complaint was that "it doesn't feel like the whole
game world is visually synchronized to the beat". The fix was to "have both the
player and the enemies move at the same time, but allow the player's action to
take priority", which he resisted — "I worried that this priority system would
be confusing to players" — until pushed into trying it, after which "the game
does feel much more unified when everything happens on the beat" (same source).

**What broke, concretely.** NecroDancer's custom-music feature is the best
documented failure surface anywhere in this survey, and it is documented by the
studio itself in its own FAQ
(https://braceyourselfgames.com/crypt-of-the-necrodancer/faq/, fetched
2026-07-25):

> "The beat detection software requires a strong beat to automatically detect
> beats. Some songs may not work properly. If so, there is a Manual Beats
> option where you can set your own beat to the music!"
>
> "Our beat detector keeps the beat going until the end of a song, even if
> there's silence."
>
> "Our beat detection system needs to have the entire song loaded into memory
> before it can process it." (on why streaming services cannot work)
>
> "When I put custom music into the game, my character immediately falls down
> through all the floors!" (the FAQ's own named failure mode — a degenerate
> beat map resolves the entire run instantly)
>
> "Note: Using custom music will not allow you to get Steam Achievements and
> put you onto the Custom Music Leaderboards instead of the regular
> Leaderboards."

Compare the studio's public framing — "It performs beat detection on whatever
song you choose, and does a pretty darned good job of it"
(https://www.gameskinny.com/culture/interview-with-ryan-clark-of-crypt-of-the-necrodancer-rhythmic-charmer-and-indie-darling/,
fetched 2026-07-25). The gap between the marketing sentence and the
troubleshooting page is itself the finding: binding mechanics to a beat creates
a long tail of edge cases that has to be paid for in features, fallbacks, and
segregated leaderboards.

Finally, in June 2022 — seven years after launch — the studio shipped **No Beat
mode**, an official way to play the rhythm game with the rhythm removed. (This
is reported from the patch v3.0.0 announcement; both the Steam news post and
the studio's own patch page blocked automated fetching, so see section 8.)

### 4d. Audio as the truth channel, visuals as removable scaffolding

Rhythm Doctor and Melatonin converge independently on the same structure: the
*audio* carries the required information, the *visuals* are a teaching aid, and
difficulty is defined by taking the visuals away.

Melatonin's assist stack is the clearest statement of it — the chart exists,
it is simply normally hidden:

> "If you have a hard time keeping track of the rhythm, there is a visual assist
> that counts the beat visually and even shows you incoming 'hit windows'."
>
> "This is normally only shown in the practice mode, but you can choose to
> always display it."
>
> "You can also make the game more forgiving by making the hit windows bigger
> or by disabling harsh penalties for being early or late to the beat."
>
> And on hard mode: "I frequently add sequences where the player can no longer
> rely on visuals and they have to rely solely on listening."
>
> — https://www.gamedeveloper.com/design/finding-the-beat-through-environmental-cues-in-the-rhythm-game-melatonin
> (fetched 2026-07-25)

Melatonin also uses the player character itself as a **diegetic metronome** —
"The main character usually has an idling animation that matches the beat, too,
which makes it easier for the player to time their own actions" (same source) —
which is the same trick as Hi-Fi Rush's world-on-the-grid and Rhythm Storm's
pulsing world.

Rhythm Doctor arrives at the same place from a hard constraint: designer Hafiz
Azman required levels to be **playable with eyes closed**, which makes the
visuals informationally free and therefore available to be used adversarially.
One reported consequence is that some players found a boss level *easier* with
their eyes shut. (This comes from a Chinese-language write-up of Azman's TGDF
2021 talk, https://indienova.com/indie-game-development/tgdf2021-constraints-in-rhythm-doctor/,
fetched 2026-07-25 — a report of the talk, not the developer's own words; see
section 8.)

An accessibility consequence Azman states directly: "One interesting
side-effect of the one-button focus is that our game mechanics were easier to
translate into being blind-friendly"
(https://www.gamedeveloper.com/design/road-to-the-student-igf-hafiz-azman-on-i-rhythm-doctor-i-,
fetched 2026-07-25).

### 4e. Reactive, not required — and the designers who say so plainly

Two of the games most often assumed to make music mechanically load-bearing
explicitly deny it.

Matt Boch on Ape Out:

> "I think the role of music in Ape Out is fundamentally different from the role
> of music in [play along] rhythm games. Rhythm games ask you to pay attention
> to the music, whereas with Ape Out, the music is paying attention to you, the
> player."
>
> — MusicTech (fetched 2026-07-25)

And Rez's director, Jun Kobayashi, rejects the "music game" label for the same
reason:

> "In that sense, the actual gameplay of Rez isn't directly connected to the
> music, so it's not a music game."
>
> "In a music game you have to make the right sound at the right time or you
> lose, right? I wanted to make a game... where while you were playing it
> however you wanted, you'd realize 'oh, I'm making music here.'"
>
> — https://shmuplations.com/rez/ (fetched 2026-07-25)

Two of the most celebrated "your play makes the music" games in the medium are,
by their own creators' account, games where the music has **zero** mechanical
weight. The player's experience of authorship is produced entirely by
quantization and reactive arrangement.

### 4f. What broke: every object needing two jobs at once

The single most relevant "what broke" testimony in this survey comes from Sound
Shapes, whose premise is closest to this project's — every object in the world
has to be both a gameplay element and a musical one.

> Jon Mak: "The hard part is, we don't want to make any concessions on the
> gameplay side or the music side. So it's really hard. When everything you put
> in the game has to have a gameplay function and a musical function, it's
> really hard to do that, because you can make something that sounds really
> cool, but then the gameplay might get fucked up. Or you might make something
> that plays really well, but how are you going to make that musical?
>
> We had this thing with moving platforms. And then we had a game designer come
> in and play it, and they're like, 'You know what? We just need to make this
> moving platform stop for a few seconds every time it hits something.' And it's
> like, yeah, great, that's great, but that's going to mess up the music really
> badly. Because then it'll get all out of sync and stuff, so it's just
> balancing that."
>
> — Game Developer, 21 Sept 2011
> (https://www.gamedeveloper.com/audio/the-shifting-saga-of-i-sound-shapes-i-,
> fetched 2026-07-25)

Liem describes the resulting process cost:

> "when we're designing entities, me and Jon basically had to sit there and
> argue for a whole day about like, 'I need this entity to do this,' so that in
> the music editor you're going to be able to do cool music with it, and Jon's
> thing is, 'I need the entity to do this other thing,' because in the game it's
> going to make it really cool gameplay-wise... we have to spend a lot of time
> trying to find that overlap... And so when we find that overlap, that's how we
> know we've got something."
>
> — same source

That is the dual-mandate tax stated in the plainest available terms: a routine
combat-feel tweak (a platform pausing on contact) is a musical bug, and
resolving it costs a day of argument per entity.

### 4g. What broke: the tooling bill for total sync

Sayonara Wild Hearts locked every level to its song, and Simon Flesser's
retrospective assessment is blunt:

> "Each stage is built like and was supposed to feel like one long custom
> animation that always syncs to the beat, and that idea in itself was perhaps
> too much for a small team like us to handle."
>
> "While we did create a lot of systems, we didn't create enough tools to
> interact with them, so work often became laborious and slow, which led to
> frustration and stress."
>
> "Looking back, we should have built more robust design tools, which would have
> spared us a lot of headaches and time."
>
> — Low Poly Pigeons transcript and
> https://www.dualshockers.com/wild-hearts-never-die-an-interview-with-sayonara-wild-hearts-developer-simogo/
> (both fetched 2026-07-25)

A concrete casualty: a slow-motion mechanic was cut because it would have
required a second master of every song.

> "We did for a long time have mechanics that were tied to this, which involved
> slowing down time... We'd have one dreamy time stretch version of each song,
> and when you held down the button you'd consume a meter that made the level
> slower, but the character would still control as fast."
>
> — Flesser, Low Poly Pigeons transcript (fetched 2026-07-25)

The general lesson: when the music is baked, any mechanic that changes the flow
of time costs a whole alternate set of assets. (`docs/plan.md` already dodges
this specific bullet by using single sounds rather than baked clips, which makes
tempo changes nearly free.)

Thumper's failure was in the mix rather than the design, and Flury says so about
their own IGF-nominated build: "I went back and listened to that build that we
submitted and it sounds terrible like really bad like the mastering is off
there's a lot of distortion and I really think that it was the visual elements
and the funness of the game that convinced people to nominate it for audio"
(GDC 2017 postmortem, ~29:19, automatic captions). Mastering and headphone
levels were still being patched after launch
(https://thumpergame.com/blog/2016/11/8/play-mode-playstation-pro-support-and-more-updates,
fetched 2026-07-25).

Ape Out's named breakage was the seams rather than the system: Cuzzillo reports
"Until pretty late in development the level transitions were a big sticking
point – they were just bad", and that the music system "really came on line"
only in August 2018 for a 2019 game, with static temp tracks in place until
then (MCV, fetched 2026-07-25).

### 4h. Gate versus multiplier — and what the two shooters actually do

It is worth being precise, because the two are routinely lumped together:

- **Metal: Hellsinger scales.** On-beat play raises the Fury multiplier
  (1x/2x/4x/8x/16x), which is a score and power multiplier and simultaneously
  the music's intensity control. Goldfarb: "it felt right to have the player's
  dynamic achievements be rewarded with a power increase of some kind as they
  played better and better. This went hand in hand with the idea that you would
  experience the full song when you were performing well, with all the different
  audio layers present" (Game Developer, fetched 2026-07-25). Official store
  copy: "The more in sync you are with the rhythm, the more intense the music
  will become and the more destruction you will cause"
  (https://store.steampowered.com/app/1061910/Metal_Hellsinger/, fetched
  2026-07-25).
- **BPM gates.** Off-beat, the action does not happen and no sound plays. No
  primary source was found describing an on-beat *damage* bonus in BPM; the
  documented penalty is the shot not occurring — "when you fail to time a shot
  or a reload or an ability to the beat and no sound plays, it sounds empty and
  disappointing" (Audiokinetic blog). See section 8.

Hellsinger also treats tempo as an explicit difficulty axis: "Higher tempo means
everything is faster (enemy firing, player rate of fire, beatmatching), so it can
be quite challenging (but fun) to experience a really high BPM song" (Goldfarb,
Game Developer, fetched 2026-07-25) — the same coupling `docs/plan.md` names
under "Tempo and damage", surfaced as a per-song difficulty knob.

### 4i. What broke: latency, and what each studio conceded

This is the most consistent failure mode across every tightly bound game found.

**BPM names it as structurally unsolvable.** Their framing borrows Riot's Alex
Jaffe:

> "rhythm FPS has a 'Cursed Problem'."
>
> "During his 2019 GDC talk, Riot Games' Alex Jaffe defined a Cursed Problem as
> an 'unsolvable design problem, rooted in a conflict between core player
> promises'. In BPM, our player promises are: 'you shoot on the beat' and
> 'bullets are fired when you pull the trigger'—these two things conflict. The
> only way to fix this problem is to 'win by giving up'."
>
> — Audiokinetic blog (fetched 2026-07-25)

They also explain why the standard rhythm-game calibration trick does not port
to a game where aim matters: "the game looks into the past to see if you were
inside a window at: current time - latency time… This however is not viable in
an FPS, as your aim is defined at every moment in time" (same source).

Their shipped numbers and their asymmetry are the most useful concrete detail
in this survey:

> "In BPM, we assume the user has less than 80ms of latency. If the user has
> more latency than that, we detect that during the startup calibration sequence
> and enable auto-rhythm. Auto-rhythm holds the player's shots when they input
> until the next beat occurs. For users who have less than 80ms of latency, we
> delay their early shots so that they occur on the next beat and let their late
> shots fire immediately."

**Early input is held to the beat; late input fires immediately.** That
asymmetry is the concession.

Their enumerated error budget explains why: "10ms from clock calibration,
+[frametime]ms from frametime, +[frametime]ms extra from using the deferred
renderer, +?ms from input device, +?ms from console processing, +?ms from
TV/audio output processing. This gives you a potentially huge error on some
systems" (same source). Which makes framerate a rhythm feature — David Jones:
"the higher our framerate goes, the more accurately we can track your button
inputs"
(https://www.newsweek.com/bullets-per-minute-bpm-console-port-optimization-haptic-feedback-dualsense-ps5-1634975,
fetched 2026-07-25).

And they describe both the "proper" fix they could not afford and the hack they
shipped:

> the ideal being "Locking the input and audio very closely together in
> implementation so that the maximum possible precision can be achieved… This
> solution however was untenable for a team of our size. This is the sort of job
> that would require a full-time audio programmer"
>
> what shipped: "We register a callback on our music Event and look for
> EAkCallbackType::MusicSyncBeat… we find the difference between our game's
> clock and the implicit progress we've made through the track. If this
> difference is greater than 10ms, we recalibrate our game's clock… This keeps
> our enemies nicely in time with a ~10ms error, much smaller than our rhythm
> test window."

Their summary of the trade: "BPM also has a bunch of sorcery that forgives
players for certain poorly timed actions in favor of player feel... We went for
the experience of being in an epic rock opera shooter over being a tightly
defined rhythm game."

**Hellsinger's concession came about two months after launch.** The November
2022 accessibility patch added an opt-out, and the way it is scoped is worth
noting:

> "An optional Beat Assist mode has been added. A mode to always stay on beat
> and ignore all penalties."
>
> "Achievements will not be affected."
>
> "Scores will be omitted from Leaderboards."
>
> — official Funcom patch notes,
> https://forums.funcom.com/t/metal-hellsinger-accessibility-patch-2022/211854
> (fetched 2026-07-25)

Achievements are preserved; only the competitive ranking is withheld. (Compare
NecroDancer's custom music, which forfeits *both*.) The same patch fixed a
calibration bug — "Fixed an issue where inconsistent latency values were present
throughout the Calibration Run upon skipping calibration flow" — and the modding
format exposes a per-song `BeatInputOffset`, "Offset in MS (advanced topic)"
(modding guide, p.12), i.e. per-track input compensation is a shipped knob.

Across the whole survey the pattern is uniform: **every studio that made rhythm
mechanically load-bearing later shipped a way to turn it off, or never made it
mandatory in the first place.** NecroDancer took the timing window to 100% and
eventually added No Beat mode; Hellsinger added Beat Assist; BPM auto-disables
the requirement above 80 ms; Hi-Fi Rush never gated on it at all; Patapon
loosened the Fever threshold in its remaster.

---

## 5. Repetition

### 5a. Within a session

*Hades* re-rolls stems per chamber (section 1a) so the same underlying piece
presents differently each room, and gates the "rocking section" behind bosses
so the biggest variation is also the rarest.

*Patapon* varies the vocal character rather than the notes (section 3c).

### 5b. Across sessions

Korb's stated reason for the semi-randomised stem system is exactly the
across-sessions problem: "to keep things fresh and get some extra longevity out
of the music"
(https://www.lacedrecords.co/blogs/blog/how-rock-band-influenced-hades-soundtrack,
fetched 2026-07-25 — note this is a direct Korb quote inside an interviewer's
paraphrase of the system).

The structural observation from Hades is that the *combination* of (multiple
tracks per biome) × (semi-random stem subsets per chamber) × (state-driven
layers) is what produces longevity, not any one of them.

*Crypt of the NecroDancer* is the only game surveyed that is a run-based
roguelike with the music in the foreground, and its answer has three layers,
only one of which is compositional.

**Layer 1 — write arrangements denser than one listen can absorb.** Composer
Danny Baranowsky:

> "The player will hear the music so many times that there needs to be
> something new for them to hear each time."
>
> "Remember that melody is king, prefer harmonic progressions that are complex
> without being overwrought."
>
> — https://daily.bandcamp.com/high-scores/high-scores-danny-baranowsky
> (fetched 2026-07-25)

**Layer 2 — ship several complete alternate scores and let the player swap or
randomize them.** From the studio's own FAQ: "As long as the game is up-to-date,
you have access to all 5 soundtracks at no extra charge", and "The soundtracks
are not character-restricted. You can go to Change Soundtrack in Options,
scroll down to the character then change their soundtrack to whichever one
you'd like, or choose Random!"
(https://braceyourselfgames.com/crypt-of-the-necrodancer/faq/, fetched
2026-07-25). The Steam page advertises "Includes 6 playable remixes of the
entire soundtrack"
(https://store.steampowered.com/app/247080/Crypt_of_the_NecroDancer/, fetched
2026-07-25) — full re-scores of the whole game by different artists.

**Layer 3 — let the player bring their own music**, with all the costs
documented in 4c.

The shape of that answer is worth noting: the compositional trick (layer 1) is
the cheapest and weakest of the three, and the studio spent real money on
layers 2 and 3.

### 5c. Four more shipped answers, none of them generative

**Loop a long section rather than a short one.** Hellsinger's stated threshold
is concrete: "By splitting a song into acts, we can loop the same act until the
player has progressed to a certain point in a level. An act is usually long,
sometimes over a minute, so looping an act will not feel repetitive" (modding
guide, p.15). Each level also carries two songs, main and boss (p.11–12).

**Randomize the game, not the music.** BPM's team chose "just the beat"
precisely for run-based longevity: "As a small team, we wanted to make a pretty
big game that we could play for many hours... Since a roguelike requires high
replayability, we knew the 'note charts' approach wouldn't give us the 30 hours
(at the high end) of gameplay we needed" (Audiokinetic blog). Their listed con
for note-charting was "Very expensive to produce per minute of game. Low
replayability." Then they randomize the player's own sounds at the sample level:
"for things like gunshots, I have at least four unique sounds for each gun. Then
I put them all in a Random Container, so the gunfire doesn't get repetitive
subconsciously for the player" (Josh Sullivan, same source).

**Oversize the pattern pool so it cannot be exhausted.** Ape Out used a
variational autoencoder (a machine-learning model trained on Boch's own
playing) to expand the pool, and the reported result is that "players only hear
about one-hundredth of the total patterns in any given playthrough of the game",
with Boch's own claim that "everyone's Ape Out soundtrack is unique to their
playthrough" (MusicTech, fetched 2026-07-25 — the one-hundredth figure is the
journalist reporting Boch's claim, not a direct quote). Cuzzillo's reason for
procedural generation is about play, not music: "I didn't want to get rid of the
procedural generation because it was forcing you to play in an improvisational
way. So many repeat action games are about memorizing a level and honing a route
through it"
(https://nygamecritics.com/2019/04/16/the-circle-interview-creator-gabe-cuzzillo-on-how-ape-out-changed-during-5-years-of-development/,
fetched 2026-07-25).

**Make the repeat itself the point.** Thumper reframes retrying as practising a
musical phrase — Flury: "you'll die and then you just go back to the previous
checkpoint and you get to practice the same thing you just did" (GDC 2017
postmortem, ~1:01:25, automatic captions) — and shipped a quick-restart
affordance explicitly because "This reduces frustration for players who want to
grind out S-Ranks"
(https://thumpergame.com/blog/2016/11/8/play-mode-playstation-pro-support-and-more-updates,
fetched 2026-07-25).

Sayonara Wild Hearts' answer to replay is worth one line because it was designed
in 2019, cut for load times, and shipped in 2025 when hardware allowed: a
"Remix Arcade" mode that chops levels into short fragments at increasing pace,
with "a random element that would sometimes mirror the level visually to keep
players on their toes"
(https://simogo.com/work/sayonara-wild-hearts/sayonara-wild-hearts-remix-arcade/,
fetched 2026-07-25).

**The pattern across all of them:** not one shipped game answers repetition by
generating better music. They answer it with more authored material, larger
pools, randomized sample variants, structural shuffling, or by handing the
problem to the player's own music library.

---

## 6. Survivors-likes that have attempted a musical hook

Three were found. They occupy three different points on the coupling spectrum,
and the differences are instructive. (Architecturally the closest precedents to
this project's premise are not in this section — they are Ape Out's
generated-from-play arrangement (1g), Sound Shapes' every-object-has-two-jobs
mandate (4f), and Hellsinger's weapons-as-instruments beat track (1h).)

### 6a. Bandwagon (Bippinbits) — the same premise, in playtest now

Bippinbits, the *Dome Keeper* studio, announced Bandwagon at the Convergence
Games Showcase on 16 July 2026, with an open playtest 21 July – 3 August 2026.
Its own Steam text:

> "Recruit from a growing roster of cute animals, each with their own
> instruments, personalities, and musical combat styles. **Every note your band
> plays doubles as an attack against the grumpiness.**"
>
> "Each run you'll build unique, procedurally generated music based on the
> bandmates and upgrades you choose."
>
> — https://store.steampowered.com/app/3555740/Bandwagon/ (fetched 2026-07-25;
> developer and publisher Bippinbits; release "to be announced")

"Every note doubles as an attack" is this project's Model A coupling stated
almost word for word, and the loadout-composes-the-arrangement model of section
1d. It is unreleased, so there is no post-launch evidence about whether it
works; there is also no published developer talk or postmortem yet (section 8).

### 6b. Survivors SymphonYs (Surfin Bird, released 14 Aug 2025)

Developer store text:

> "Your weapons are musical instruments, and your attack patterns based on
> music."
>
> "The better your instruments harmonize, the more SymphonY you accumulate, the
> higher the tempo of the music, and the more damage you deal."
>
> "Each combination of instruments creates a musical variation, leading to over
> 28 million possible scores."
>
> — https://store.steampowered.com/app/3480980 (fetched 2026-07-25)

Two things are notable. First, it makes **harmonic fit a mechanical stat**:
instruments that harmonise well pay out in tempo and damage. Second, it makes
**tempo a damage multiplier** — the same coupling `docs/plan.md` already
acknowledges under "Tempo and damage", but exposed to the player as a scoring
resource rather than absorbed as a balance concern. It also claims a "special
sound system synchronizes sound effects with the music of your weapons" (same
source) — i.e. non-musical SFX are pulled onto the grid too.

### 6c. Rhythm Storm (Radiangames, released 25 July 2025) — the counter-example

Radiangames took the opposite decision and stated it explicitly:

> "Nothing your vehicle does is synced to the music, but much of the world IS
> synced."
>
> "Wave changes happen every 8 bars of music, powerups and the world pulse to
> the beat, the UI is jamming to the beat, and many of the enemies move to the
> beat. Enemy spawning is also synced."
>
> "no musical talent or beat-synced button pressing is required to succeed at
> the game."
>
> — developer's own product page,
> https://www.radiangames.com/pkrg/rhythmstorm/index.html, and the same text on
> https://store.steampowered.com/app/2135960/Rhythm_Storm/ (both fetched
> 2026-07-25; developer Radiangames / Luke Schneider)

Radiangames' own news archive describes it as Schneider's "first 'rhythm' game,
but also not really a rhythm game" (https://radiangames.com/?p=532, fetched
2026-07-25) — the distinction being that the *world* is a rhythm game and the
*player* is not.

Structurally it is a survivors-like whose stage schedule is quantized to the
music (waves on 8-bar boundaries) and whose run length is a song length: "3
main worlds, a boss, and a bonus world, each with its own unique song" (same
source). It is the same "authored set" idea as `docs/plan.md`'s 30-minute
schedule, but with the musical burden placed entirely on the *stage* and none
on the *build* — the inverse of this project's dividing rule.

---

## 7. Timing, because one trigger is one note

If a weapon trigger is literally a note, the note has to land on the grid to
sample accuracy, and the browser's main thread cannot be trusted to do it.
Chris Wilson's *A Tale of Two Clocks — Scheduling Web Audio with Precision*
(web.dev, https://web.dev/articles/audio-scheduling, fetched 2026-07-25) states
the failure mode and the fix:

> "the actual callback of timer events in JavaScript (through
> window.setTimeout() or window.setInterval) can easily be skewed by tens of
> milliseconds or more by layout, rendering, garbage collection"

The remedy is a lookahead scheduler: a JavaScript timer wakes periodically,
"checks to see if any notes are going to need to be scheduled 'soon' based on
the current tempo, and then schedules them" on the audio clock in advance.
Wilson's recommended starting values: "100ms of 'lookahead' time, with
intervals set to 25ms". `docs/plan.md` already commits to this ("The music
scheduler is a thin lookahead layer over the audio clock"); the citation is
recorded here so the numbers have a source.

---

## 8. What could not be verified

Listed rather than smoothed over.

1. **No GDC or developer talk was found for Bandwagon.** All Bandwagon claims
   above come from Bippinbits' own Steam store text and press-release-derived
   coverage. Nothing is known from a primary source about how its procedural
   arrangement actually works, how it handles mud, or whether it holds up.
2. **Bandwagon's title may be in flux.** Steam app 3555740 rendered as
   "Bandwagon" when fetched on 2026-07-25, but search indexing for the same
   app id also surfaced the title "Band Together". Which is current could not
   be determined; the app id is the reliable identifier.
3. **The Spore procedural-music talk could not be read.** Kent Jolly and Aaron
   McLeran presented *Procedural Music in SPORE* at GDC 2008
   (https://www.gdcvault.com/play/323/Procedural-Music-in, fetched 2026-07-25);
   the Vault entry is members-only and exposes no abstract, and the Internet
   Archive copy (https://archive.org/details/GDC2008Jolly) is audio. The only
   verifiable Jolly quotes found are about Eno's enthusiasm and the value of
   original over licensed music
   (https://www.moredarkthanshark.org/feature_spore.html and
   https://www.rollingstone.com/culture/culture-news/brian-enos-mutating-spore-score-reinventing-game-music-255336/,
   both fetched 2026-07-25) — **not** about how the generative rules keep the
   output musical. Any claim that Spore solved the "keep generative music good"
   problem is therefore unsupported by anything read here.
4. **Middleware documentation blocked automated fetching.** Audiokinetic's
   Wwise course pages and blog, and FMOD's docs, returned HTTP 403 or empty
   content on 2026-07-25. The playback-limiting / priority / virtual-voice
   mechanism in 2b is therefore reported from a secondary summary of official
   docs, not quoted from the docs themselves. Treat the exact terminology as
   unconfirmed.
5. **The HDR audio slide deck itself was not read.** The "every sound is
   important, but not at the same time" formulation is quoted from Buffoni's
   Designing Sound article attributing it to Clerwall; EA's own Frostbite page
   for the talk carries only the session abstract, not the content.
6. **No source states a solved method for generative *resolution*** (section
   3g). Absence of evidence here is genuine: the search covered developer talks
   and interviews for every game in the ticket, and endings were consistently
   authored.
7. **The Hi-Fi Rush CEDEC 2023 talk was read through a secondary write-up**
   (gameanim.com) which itself points at a deeper Japanese-language CGWorld
   article that was not fetched. The 120 BPM animation base and "all elements
   matched to the BPM" claims come through that write-up, not from the slides.
8. **Soundfall's developer interviews were not retrievable.** The Unreal Engine
   developer interview returned HTTP 403 and the Shacknews page did not expose
   the interview body (both 2026-07-25), so no Soundfall claim is made here
   beyond noting it exists.
9. **Survivors SymphonYs and Rhythm Storm are quoted from store text**, which
   is written by their developers but is marketing copy, not a design
   statement. In particular "over 28 million possible scores" is a marketing
   number with no published derivation, and no claim is made here about how
   good the resulting music is.
10. **Two attribution traps around Rez, both avoided above but worth recording.**
    (a) The widely repeated claim that Rez quantized shots into the musical
    *key* as well as the beat is journalism, not a developer statement.
    Mizuguchi's own words cover rhythm only. (b) The description of Rez's layers
    unlocking at checkpoints is Matthew Hawkins writing in 2005
    (https://www.gamedeveloper.com/design/go-to-synesthesia-jake-kazdal-s-journey-through-the-heart-of-i-rez-i-,
    fetched 2026-07-25); Jake Kazdal's own quotable sentence is only "That was
    always part of the theme, to go from nothing up and evolve into something
    very different."
11. **There is no "Iwata Asks" interview about Electroplankton.** The English
    `iwataasks.nintendo.com` DS archive was enumerated and contains no such
    entry (consistent with the series starting in 2006, after Electroplankton's
    2005 release). Toshio Iwai's toy-not-game framing is instead taken from a
    2006 Q&A with him (archived at
    https://web.archive.org/web/20241005061633/https://www.cubed3.com/news/5724/1/c3-exclusive-interview-toshio-iwai-on-nintendo-wiiand-musical-fish.html,
    fetched 2026-07-25), where he says Electroplankton and TENORI-ON "are just
    like instruments that you can manipulate", and describes deliberately
    omitting a save function so it stayed a toy rather than "more like a tool".
    **Also unverified:** whether Electroplankton constrains notes to a scale.
    No developer or first-party statement was found, and no such claim is made
    above.
12. **Nobody said "you can't play a wrong note."** The phrase is not in any
    source read. What is verified is Sound Shapes' "16-step sequencer with an
    eight-note scale" and Rez's rhythmic quantization. Do not attribute the
    slogan to Mak, Liem or Mizuguchi.
13. **No developer statement was found on FRACT OSC constraining key or
    scale.** Its verified mud-control mechanisms are the beat-grid timing
    requirement, the 10-voice budget with voice stealing, and the curated
    control surface.
14. **BPM's off-beat penalty is a gate, not a damage multiplier** (section 4h).
    No primary source was found for an on-beat damage bonus in BPM. Hellsinger's
    Fury multiplier is genuinely a power and score multiplier.
15. **The Windows Central interview's tier count for Hellsinger is wrong.** Its
    journalist prose says four Fury levels and four tracks and gives a
    self-contradicting layer ordering. The official modding guide and the game
    director both say five tiers (1x/2x/4x/8x/16x). Only the modding guide and
    Goldfarb are relied on above.
16. **Everhood is effectively undocumented on the audio-system question.** No
    GDC talk, no middleware case study, no developer writeup on mixing, arc,
    or repetition was found. The one reachable developer interview
    (George Yang, The Escapist, 29 Mar 2021, read via
    https://web.archive.org/web/20260318075227/https://www.escapistmagazine.com/everhood-interview-chris-nordgren-jordi-roca/,
    fetched 2026-07-25) establishes only that battles are authored around
    specific pre-existing tracks — Chris Nordgren: "We reached out to artists
    mainly when we had a certain battle in mind. Some of the compositions were
    already done, while some artists created their songs or modified them for
    Everhood!" Whether Everhood's music responds to player state at all is
    **not** documented; no claim either way is made above.
17. **Thumper quotes are transcribed from the GDC video's automatic captions.**
    Substance is reliable, exact wording is not; timestamps are given so they
    can be checked (~21:27, ~22:08, ~27:15, ~29:19, ~58:58, ~1:01:25 in
    https://www.youtube.com/watch?v=ckm8_SEIXQM, also free on GDC Vault).
18. **Several Game Developer articles were read through an automated page
    reader that paraphrased rather than reproducing text.** Where the same
    article was fetched twice, quote wording varied slightly. The substance of
    every quote above is reliable; the exact wording of quotes drawn from
    gamedeveloper.com should be spot-checked against the live page before being
    reproduced elsewhere.
19. **NecroDancer's per-zone BPM values, whether level tracks loop, and what
    happens musically when a slow player outlasts the song were not found in
    any primary source.** Clark's deep dive does not cover them and the
    community wikis blocked fetching. No claim about them is made above.
    Likewise **No Beat mode** (section 4c) is reported from coverage of the
    studio's patch announcement; the Steam news post and the studio's own patch
    page both blocked automated fetching.
20. **Rhythm Doctor's mixing and mud-control decisions were not found.** The
    likely source is Hafiz Azman's *Save & Sound* audio talk
    (https://www.youtube.com/watch?v=QwfqPheZJqo), whose captions could not be
    retrieved. Material attributed to his TGDF 2021 talk above comes via a
    Chinese-language write-up
    (https://indienova.com/indie-game-development/tgdf2021-constraints-in-rhythm-doctor/,
    fetched 2026-07-25), which is a report of the talk, not his own words. No
    7th Beat devlog arguing against metronomes was found; do not attribute one.
21. **No GDC talk on Ape Out's audio appears to exist**, and no Ape Out
    developer statement on ducking, voice limits or sound priority was found.
    The "mess of noise" phrasing that circulates is the MCV journalist's, not a
    developer's.
22. **What Sayonara Wild Hearts does *musically* when the player fails is
    undocumented.** A rewind-on-fail mechanic is confirmed only by an
    interviewer's phrasing of a question; Flesser's answer addressed the
    animation-timeline architecture instead. Whether the song restarts,
    resumes, or checkpoints at a musical boundary is unknown.

---

## 9. Pointers for the triad

Observations only. No recommendations, no preferred direction, no ranking of
options. Section references in brackets.

### (a) Bearing on the shape of a run

- **Hellsinger splits the arc in two and gives the halves different rules**
  (3f): intensity is player-owned, reversible, and unquantized (a 0–100
  parameter driving volume curves); form is level-owned, one-way, and quantized
  to the next even bar with a transition piece. Their stated reason is exactly
  the survivors-like scheduling problem — "we as developers have no control over
  how much time a playthrough of a level will take – hence, we cannot write a
  song of perfect length."
- **Rise can be generated; endings were authored everywhere** (3g). Ape Out
  generates a genuine arc from a tempo ramp across an album plus an intensity
  scalar (3e), but its only scripted music is the between-level drum solos.
- **Ape Out's arc responds to skill, not only to elapsed time**: "the most
  bombastic version of the soundtrack is the one that a skilled player would
  hear" (3e). Hi-Fi Rush and Hades instead place the arc in authored level
  structure and encounter state respectively (1e, 3b) — arcs that arrive at
  moments rather than on a clock. `docs/plan.md` currently places the run's
  shape in an authored 30-minute stage script, which is the Hi-Fi Rush location.
- **Rhythm Storm quantizes the stage schedule itself**: waves change "every 8
  bars" and a run's length is a song's length (6c) — a different relationship
  between schedule and grid than "constant tempo, timed schedule".
- **Melatonin composes rests at the sequence scale**, deliberately alternating
  levels where you act on almost every beat with levels where you wait a long
  time (3d). Density contrast is a property a wave schedule already controls.
- **Constant tempo is a real cost to whoever writes the material.** Patapon
  fixed 120 BPM game-wide and its composer's note is "I had to be very careful
  that the tracks didn't get too samey" (3c). Hi-Fi Rush confined itself to a
  130–160 BPM sweet spot, BPM to a single 88 BPM, Hellsinger requires constant
  tempo per song with no runtime beat detection (1h, 4a).
- **Hellsinger's boss health bars were sized to the song** so lyrics complete
  before a phase change (1e); BPM releases the grid entirely for a
  player-paced crescendo at each boss kill (3f). Both are cases of an encounter
  being shaped to musical form rather than the reverse.

### (b) Bearing on what powering up buys

- **Vertical layering is the near-universal way growth is expressed** (1a, 1h):
  Hades adds stems on combat state; Hellsinger has five authored gradations of
  instrumentation with vocals at the top tier, written by composing the whole
  track and then subtracting. Hellsinger's low tiers contain material *not* in
  the released song that hints at the vocal line — the layers are authored for
  the game, not extracted from a finished master.
- **Ape Out rejects stem layering on latency grounds** for a fast game — "The
  typical approach to reactive music, having stems that come in and out or
  fading between tracks, is just way too slow for this game" — and instead
  selects denser MIDI patterns from a pool tagged with density and similarity
  ratings, while raising hit velocity (1g).
- **Hellsinger's on-beat reward is a musical layer, not a UI sound**: a kick
  track inside the music event, unmuted by a `BeatMatchSuccess` boolean, with
  the kick pattern moved onto odd or even beats depending on the weapon's fire
  rate (1h). Different weapons occupy different rhythmic subdivisions by design.
- **Two shipped answers to "what does a musically better build buy":**
  Hellsinger makes it a power and score multiplier (1x→16x) that is
  simultaneously the music's intensity control (4h); Survivors SymphonYs makes
  harmonic fit a stat that pays out in tempo, and tempo in damage (6b) — the
  same tempo-damage coupling `docs/plan.md` already acknowledges.
- **BPM makes the opposite choice deliberately and published the reasoning**
  (1h): gameplay never touches the arrangement, because player-defined music
  "mak[es] for a poor musical journey" and note-charting has "Low
  replayability". Their player is still the lead instrument in the mix — via
  holes the composer left in the arrangement, not via arrangement authority.
- **Hi-Fi Rush frames the whole thing as "success" and "greater success"**
  rather than success/failure (4a): "It doesn't matter if you don't press the
  button on time, but you'll get bonuses if you do."
- **Hades' longevity came from stacking three cheap variation mechanisms**
  (multiple tracks per biome, random stem subsets per chamber, state-driven
  layers) rather than one expensive one (5b).

### (c) Bearing on what constrains a build

- **FUSER's guarantee that any combination sounds acceptable rests on
  restricting the pool, not on runtime cleverness** (2a): one time signature, a
  90–157 BPM band with half/double-time folding, one designated "chord
  progression master" with bass weighted strongest for harmony, a real-time
  mastering chain, plus curation against specific problem timbres (heavy
  guitars, horns).
- **Ape Out caps note density by routing almost everything through one scalar**
  (2f): exactly one event class (a kill) fires a specific sound; enemies on
  screen, gunshots and fire only raise an intensity number. A crowded screen
  produces a bigger number, not a bigger trigger stream.
- **BPM caps it by having enemy AI ask the sequencer for permission** before
  attacking, with a musical criterion — "to see if attacking on that beat would
  be overly cacophonous" — so a room with thirty enemies emits the same volume
  of attack events as a room with five (2j).
- **Ducking the music under the player's own on-beat hits was tried and
  rejected** by BPM's composer, who replaced it with arrangement-level space
  (2j). This is the one documented negative result found, and it contradicts
  the intuitive fix.
- **Hard voice budgets are published precedent**: FRACT OSC ran 10 realtime
  voices total, monophonic lead and bass, with the pad sequencers stealing
  voices, and sound effects drawing on the same budget (2g). BPM voice-limits
  its minigun to one shot sound at a time.
- **Per-hit variation is bought with baked assets, not engine nudges alone**:
  Ape Out ships seven velocity levels × twelve round robins per drum, and used
  a single compressed room mic across four levels so every drum shares one
  acoustic (2h). BPM keeps at least four sample variants per gun in a Random
  Container.
- **A restricted note pool is the Sound Shapes answer**: a 16-step sequencer
  with an eight-note scale (2g). Nobody in any source said "you can't play a
  wrong note" (section 8, item 12).
- **Palette choice can pre-empt harmonic clash entirely**: Thumper embraces
  dissonance with drones and percussion, which have no chord changes to fight
  (2i) — at the price of melody. Sayonara Wild Hearts instead negotiated
  legibility inside the arrangement, asking the composer for a clear snare and
  bass drum because gameplay read off them.
- **The dual-mandate tax is documented** (4f): in Sound Shapes, every object
  needed a gameplay function and a musical function, a routine combat-feel tweak
  (a platform pausing on contact) was a musical bug, and reconciling one entity
  cost a day of argument.
- **Latency is where tight binding broke, repeatedly** (4i): BPM calls it a
  Cursed Problem, assumes <80 ms, auto-disables the rhythm requirement above
  that, holds early shots to the beat and lets late shots fire immediately, and
  resyncs its clock whenever drift exceeds 10 ms. Hellsinger shipped
  calibration, then a calibration bug fix, then Beat Assist. If one trigger is
  one note, Wilson's lookahead numbers (100 ms lookahead, 25 ms interval) are
  the cited scheduling baseline (7).
- **Every studio that made rhythm load-bearing later shipped a way to turn it
  off**, or never gated on it (4i). NecroDancer went further and removed
  rhythm judgement outright — 100% timing leeway plus a leaky-integrator
  autocalibration that bends the game's beat grid toward the player by up to
  half a beat (4c).
- **Nobody solved repetition by generating better music** (5c). The shipped
  answers are more authored material, larger pools, randomized sample variants,
  looping longer sections, structural shuffling, or handing the problem to the
  player's own music library.
- **Bandwagon's premise text ("Every note your band plays doubles as an
  attack") and Rhythm Storm's explicit refusal ("Nothing your vehicle does is
  synced to the music") bracket the design space this project sits inside**
  (6a, 6c).
