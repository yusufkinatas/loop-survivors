# Run log: one played run

Recorded live from the game at `3b090c4`, played by the designer, by the
recorder in [`run-log.patch`](run-log.patch) (kept as a patch rather than live
code — see the README). **Died at 13:17, level 29** — less
than half of the 30-minute set.

| | |
|---|---|
| outcome | died at 13:17, player level 29 |
| offers made | 29 |
| things taken | 44 (level-up picks plus chest payouts) |
| chests | 7, paying 1-1-3-1-1-5-3 |
| final band | clap 4, hat 2, bass 8, chord 7, lead 6 — 27 of a possible 40 weapon levels |
| never seen | kick, snare, arp |
| passives | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 3, heavyAmp 1 |

## What the run's density did

Mapping the build at each take onto the shipped ladders:

- **2.00 → 23.00 triggers per bar** across the run (×11.5).
- **The curve never went down once.** Not at any of the 44 takes.
- **A decision every 16 seconds** (median gap between takes; min 0s when a chest
  pays five at once, max 62s).
- The bar filled early and stayed full: the run spent **57% of its time at 12–13
  of 16 grid steps occupied**, and only 6% at the opening's 2/16.
- The first six chests paid exactly the scripted `1-1-3-1-1-5` sequence from
  `CHEST.openingSequence`; the seventh rolled a ×3.

The two chests at the end are worth holding against the standard in
[#253](https://github.com/yusufkinatas/loop-survivors/issues/253). Between them
the ×5 at 12:31 and the ×3 at 13:05 dropped **nine free levels in the last 45
seconds**, and **eight of the nine were inaudible**: five passive levels, plus
Chord 5→6 and Clap 3→4, which each land inside the chart stage they were already
on. Density sat at exactly 20.00 triggers per bar across the entire ×5 payout.

The ninth — Chord 6→7 — crossed into the top chart stage and added 3.00 triggers
per bar. So the game's biggest reward beat, the jackpot ceremony, is audible
about one time in nine, and when it is audible the payoff is *more notes* rather
than a change of any other kind.

> **A note on accuracy.** Two build cells were corrected after recording. A
> scooped weapon level rides to the next bar line before it lands in `w.tiers`,
> so the original snapshot read one level short for a weapon whose take was
> still in flight, which made a level appear to go backwards between rows. Every
> weapon level comes from a logged take, so the true levels were recomputed by
> counting takes. The fix is in `buildSnapshot`, which folds in
> `pendingWeapons`, and it is carried in `run-log.patch` — so a log recorded
> from that patch needs no correction.

## The decisions, in order

| time | lvl | what happened | build after |
|---|---|---|---|
| 0:00 | 1 | **offered** (opening): Hi-hat / Clap / Chord | |
| 0:04 | 1 | **took** Clap | clap 1 | no passives |
| 0:14 | 2 | reached level 2 | |
| 0:14 | 2 | **offered** (level-up): Snare / Needle Tips / Fast Forward | |
| 0:19 | 2 | **took** Needle Tips | clap 1 | needleTips 1 |
| 0:32 | 3 | reached level 3 | |
| 0:32 | 3 | **offered** (level-up): Double Take / Arp / Clap | |
| 0:34 | 3 | **took** Clap | clap 2 | needleTips 1 |
| 0:51 | 4 | reached level 4 | |
| 0:51 | 4 | **offered** (level-up): Hi-hat / Fast Forward / Clap | |
| 0:53 | 4 | **took** Hi-hat | clap 2, hat 1 | needleTips 1 |
| 1:10 | 5 | reached level 5 | |
| 1:10 | 5 | **offered** (level-up): Wide Lens / Padded Jacket / Magnet | |
| 1:12 | 5 | **took** Padded Jacket | clap 2, hat 1 | needleTips 1, paddedJacket 1 |
| 1:34 | 6 | reached level 6 | |
| 1:34 | 6 | **offered** (level-up): Hi-hat / Kick / Bass | |
| 1:36 | 6 | **took** Bass | clap 2, hat 1, bass 1 | needleTips 1, paddedJacket 1 |
| 1:36 | 6 | **chest** ×1 | |
| 1:38 | 6 | **took** Bass (chest payout) | clap 2, hat 1, bass 2 | needleTips 1, paddedJacket 1 |
| 1:51 | 7 | reached level 7 | |
| 1:51 | 7 | **offered** (level-up): High-Tops / Clap / Kick | |
| 1:53 | 7 | **took** Clap | clap 3, hat 1, bass 2 | needleTips 1, paddedJacket 1 |
| 2:10 | 8 | reached level 8 | |
| 2:10 | 8 | **offered** (level-up): Extension Cable / Snare / Padded Jacket | |
| 2:15 | 8 | **took** Padded Jacket | clap 3, hat 1, bass 2 | needleTips 1, paddedJacket 2 |
| 2:18 | 9 | reached level 9 | |
| 2:18 | 9 | **offered** (level-up): Chord / Clap / Extension Cable | |
| 2:20 | 9 | **took** Chord | clap 3, hat 1, bass 2, chord 1 | needleTips 1, paddedJacket 2 |
| 2:26 | 10 | reached level 10 | |
| 2:26 | 10 | **offered** (level-up): Needle Tips / Lead / Kick | |
| 2:27 | 10 | **took** Lead | clap 3, hat 1, bass 2, chord 1, lead 1 | needleTips 1, paddedJacket 2 |
| 2:41 | 11 | reached level 11 | |
| 2:41 | 11 | **offered** (level-up): Padded Jacket / Chord / Hi-hat | |
| 2:42 | 11 | **took** Chord | clap 3, hat 1, bass 2, chord 2, lead 1 | needleTips 1, paddedJacket 2 |
| 3:00 | 12 | reached level 12 | |
| 3:00 | 12 | **offered** (level-up): Magnet / Padded Jacket / Extension Cable | |
| 3:03 | 12 | **took** Padded Jacket | clap 3, hat 1, bass 2, chord 2, lead 1 | needleTips 1, paddedJacket 3 |
| 3:35 | 13 | reached level 13 | |
| 3:35 | 13 | **offered** (level-up): Needle Tips / Bass / Extension Cable | |
| 3:38 | 13 | **took** Bass | clap 3, hat 1, bass 3, chord 2, lead 1 | needleTips 1, paddedJacket 3 |
| 4:04 | 14 | reached level 14 | |
| 4:04 | 14 | **offered** (level-up): Lead / Recovery Tape / Extension Cable | |
| 4:06 | 14 | **took** Lead | clap 3, hat 1, bass 3, chord 2, lead 2 | needleTips 1, paddedJacket 3 |
| 4:07 | 14 | **chest** ×1 | |
| 4:09 | 14 | **took** Chord (chest payout) | clap 3, hat 1, bass 3, chord 3, lead 2 | needleTips 1, paddedJacket 3 |
| 4:11 | 15 | reached level 15 | |
| 4:11 | 15 | **offered** (level-up): Lead / Chord / Hi-hat | |
| 4:12 | 15 | **took** Lead | clap 3, hat 1, bass 3, chord 3, lead 3 | needleTips 1, paddedJacket 3 |
| 4:35 | 16 | reached level 16 | |
| 4:35 | 16 | **offered** (level-up): Needle Tips / Magnet / Mirrorball | |
| 4:41 | 16 | **took** Needle Tips | clap 3, hat 1, bass 3, chord 3, lead 3 | needleTips 2, paddedJacket 3 |
| 4:59 | 17 | reached level 17 | |
| 4:59 | 17 | **offered** (level-up): Magnet / Recovery Tape / Lead | |
| 5:00 | 17 | **took** Lead | clap 3, hat 1, bass 3, chord 3, lead 4 | needleTips 2, paddedJacket 3 |
| 5:42 | 17 | **chest** ×3 | |
| 5:46 | 17 | **took** Needle Tips (chest payout) | clap 3, hat 1, bass 3, chord 3, lead 4 | needleTips 3, paddedJacket 3 |
| 5:47 | 17 | **took** Needle Tips (chest payout) | clap 3, hat 1, bass 3, chord 3, lead 4 | needleTips 4, paddedJacket 3 |
| 5:48 | 17 | **took** Lead (chest payout) | clap 3, hat 1, bass 3, chord 3, lead 5 | needleTips 4, paddedJacket 3 |
| 6:05 | 18 | reached level 18 | |
| 6:05 | 18 | **offered** (level-up): Bass / Magnet / Needle Tips | |
| 6:06 | 18 | **took** Bass | clap 3, hat 1, bass 4, chord 3, lead 5 | needleTips 4, paddedJacket 3 |
| 6:21 | 19 | reached level 19 | |
| 6:21 | 19 | **offered** (level-up): Extension Cable / Wide Lens / Heavy Amp | |
| 6:23 | 19 | **took** Wide Lens | clap 3, hat 1, bass 4, chord 3, lead 5 | needleTips 4, paddedJacket 3, wideLens 1 |
| 7:11 | 20 | reached level 20 | |
| 7:11 | 20 | **offered** (level-up): Padded Jacket / Bass / Wide Lens | |
| 7:15 | 20 | **took** Bass | clap 3, hat 1, bass 5, chord 3, lead 5 | needleTips 4, paddedJacket 3, wideLens 1 |
| 8:02 | 21 | reached level 21 | |
| 8:02 | 21 | **offered** (level-up): Bass / Fast Forward / Hi-hat | |
| 8:03 | 21 | **took** Bass | clap 3, hat 1, bass 6, chord 3, lead 5 | needleTips 4, paddedJacket 3, wideLens 1 |
| 8:09 | 22 | reached level 22 | |
| 8:09 | 22 | **offered** (level-up): Magnet / High-Tops / Wide Lens | |
| 8:11 | 22 | **took** Wide Lens | clap 3, hat 1, bass 6, chord 3, lead 5 | needleTips 4, paddedJacket 3, wideLens 2 |
| 8:26 | 23 | reached level 23 | |
| 8:26 | 23 | **offered** (level-up): Needle Tips / Mirrorball / High-Tops | |
| 8:27 | 23 | **took** Mirrorball | clap 3, hat 1, bass 6, chord 3, lead 5 | needleTips 4, paddedJacket 3, wideLens 2, mirrorball 1 |
| 8:31 | 23 | **chest** ×1 | |
| 8:33 | 23 | **took** Needle Tips (chest payout) | clap 3, hat 1, bass 6, chord 3, lead 5 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 8:54 | 24 | reached level 24 | |
| 8:54 | 24 | **offered** (level-up): Wide Lens / Heavy Amp / Bass | |
| 8:56 | 24 | **took** Bass | clap 3, hat 1, bass 7, chord 3, lead 5 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 9:52 | 25 | reached level 25 | |
| 9:52 | 25 | **offered** (level-up): Chord / Magnet / Double Take | |
| 9:54 | 25 | **took** Chord | clap 3, hat 1, bass 7, chord 4, lead 5 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 10:27 | 25 | **chest** ×1 | |
| 10:29 | 25 | **took** Chord (chest payout) | clap 3, hat 1, bass 7, chord 5, lead 5 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 10:33 | 26 | reached level 26 | |
| 10:33 | 26 | **offered** (level-up): Fast Forward / Hi-hat / Padded Jacket | |
| 10:37 | 26 | **took** Hi-hat | clap 3, hat 2, bass 7, chord 5, lead 5 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 11:38 | 27 | reached level 27 | |
| 11:38 | 27 | **offered** (level-up): Extension Cable / Lead / Chord | |
| 11:39 | 27 | **took** Lead | clap 3, hat 2, bass 7, chord 5, lead 6 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 12:02 | 28 | reached level 28 | |
| 12:02 | 28 | **offered** (level-up): Bass / Hi-hat / Magnet | |
| 12:03 | 28 | **took** Bass | clap 3, hat 2, bass 8, chord 5, lead 6 | needleTips 5, paddedJacket 3, wideLens 2, mirrorball 1 |
| 12:31 | 28 | **chest** ×5 | |
| 12:34 | 28 | **took** Padded Jacket (chest payout) | clap 3, hat 2, bass 8, chord 5, lead 6 | needleTips 5, paddedJacket 4, wideLens 2, mirrorball 1 |
| 12:34 | 28 | **took** Wide Lens (chest payout) | clap 3, hat 2, bass 8, chord 5, lead 6 | needleTips 5, paddedJacket 4, wideLens 3, mirrorball 1 |
| 12:35 | 28 | **took** Padded Jacket (chest payout) | clap 3, hat 2, bass 8, chord 5, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 1 |
| 12:36 | 28 | **took** Chord (chest payout) | clap 3, hat 2, bass 8, chord 6, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 1 |
| 12:36 | 28 | **took** Clap (chest payout) | clap 4, hat 2, bass 8, chord 6, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 1 |
| 13:05 | 28 | **chest** ×3 | |
| 13:07 | 28 | **took** Chord (chest payout) | clap 4, hat 2, bass 8, chord 7, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 1 |
| 13:09 | 28 | **took** Mirrorball (chest payout) | clap 4, hat 2, bass 8, chord 7, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 2 |
| 13:10 | 28 | **took** Mirrorball (chest payout) | clap 4, hat 2, bass 8, chord 7, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 3 |
| 13:12 | 29 | reached level 29 | |
| 13:12 | 29 | **offered** (level-up): Double Take / Heavy Amp / Clap | |
| 13:16 | 29 | **took** Heavy Amp | clap 4, hat 2, bass 8, chord 7, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 3, heavyAmp 1 |
| 13:17 | 29 | **run died** | clap 4, hat 2, bass 8, chord 7, lead 6 | needleTips 5, paddedJacket 5, wideLens 3, mirrorball 3, heavyAmp 1 |
