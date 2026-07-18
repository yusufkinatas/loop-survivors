# Final clarity evidence

This directory is the audit index for the final 500 ms visual-read gate. The
counted packet is commit `3b82f73`; every counted export is schema v1, names
that commit, and contains the exact inert JSON emitted in the review page DOM.
All three independent reviewers reached the required score of at least 38/40
(95%) in both modes.

## Protocol and commands

The deterministic packet was generated from the running game with:

```sh
npm run clarity:plan -- --base-url=http://127.0.0.1:3201/ --settle-frames=4
```

Each reviewer used a reviewer-specific randomized order and completed both
`/#visual-read/player?reviewer=<id>` and
`/#visual-read/category?reviewer=<id>`. A sample was visible for 500 ms, then
masked. In player mode the reviewer clicked the remembered visible player body;
in category mode the reviewer classified the highlighted target as enemy,
friendly projectile, XP, music note, weapon reward, or decorative effect.
Reviewers did not inspect source, answer keys, browser storage, packet metadata,
or one another's results while reviewing.

The final machine check was:

```sh
npm run visual-read:results
```

Result: **PASS** — `clarity results passed: 3 independent reviewers reached at
least 95% on both 40-sample packets`.

## Counted v5 results

Reveal timing is computed from all 40 recorded samples in each export and is
shown in milliseconds as average (minimum–maximum), rounded to three decimals.

| Reviewer | Player result | Player reveal ms | Category result | Category reveal ms |
| --- | ---: | ---: | ---: | ---: |
| Alder | [40/40 (100%)](results/alder-final-v5-player.json) | 501.403 (500.500–502.300) | [38/40 (95%)](results/alder-final-v5-category.json) | 501.320 (500.400–502.100) |
| Birch | [40/40 (100%)](results/birch-final-v5-player.json) | 501.472 (500.800–502.200) | [38/40 (95%)](results/birch-final-v5-category.json) | 501.377 (500.300–502.900) |
| Cedar | [40/40 (100%)](results/cedar-final-v5-player.json) | 501.303 (500.500–502.000) | [40/40 (100%)](results/cedar-final-v5-category.json) | 501.240 (500.500–502.000) |

Together these exports record 120/120 correct player reads and 116/120 correct
category reads. The individual sample IDs, choices, click geometry, timing,
vision mode, and correctness remain in the linked JSON artifacts.

## Structural coverage

Each 40-sample mode is the complete product of four deterministic stress-frame
seeds, two animation offsets (`0` and `0.2` seconds), and five views: normal,
grayscale, protanopia, deuteranopia, and tritanopia. Thus every export contains
10 samples per seed, 20 per offset, and 8 per view. The category packet covers
all six answers: 7 enemy, 7 friendly-projectile, 7 XP, 7 music-note, 6
weapon-reward, and 6 decorative-effect targets. All exports also record the
same 1280 × 720 CSS viewport, device-pixel ratio 2, backing scale 4, and
world-to-logical scale 0.5.

## Preserved failure chronology

| Packet / archive | Observed result | Corrective change |
| --- | --- | --- |
| `aa4e747` — [pre-visible-body-radius](failed-results/pre-visible-body-radius/) | Three reviewers displayed 0/40 in player mode even though they clicked the visible torso. These are invalid protocol results, not art failures: the key scored an 8-pixel collision circle at the feet. | `09387b2` replaced it with a 23-pixel enclosing circle around the production idle/walk opaque-body union; packet images were unchanged. |
| `09387b2` — [pre-dom-export](failed-results/pre-dom-export/) | Two reviewers displayed 40/40, but per-sample data existed only in inaccessible browser state, so no formal export could be recovered. | `05c7396` emitted the completed object as inert `.visual-read-result` DOM JSON; a 40-sample smoke run verified the export but was not counted. |
| `09387b2` — [pre-category-layering](failed-results/pre-category-layering/) | Cedar scored 17/40 (42.5%); Birch stopped with 6 answers after sample 7 exposed overlapping highlights. Pickups were under opaque enemies, the selected enemy was buried by the player, and the decorative target blended into combat noise. | `718ec3c` raised pickups, promoted only the requested decorative effect, selected a real horde member away from the player, and switched to target-centred native-resolution crops. |
| `718ec3c` — [pre-enemy-target-separation](failed-results/pre-enemy-target-separation/) | Cedar scored 36/40 (90%); all four misses read the enemy as a friendly projectile because the two valid targets were about 15 logical pixels apart and later enemy rows could cover the body. | `3b82f73` moved the sampled enemy, promoted only that horde member, and added an invariant separating every highlight from all other category targets. The v5 results above are fresh reviews of this packet. |

The `player-passes/` artifacts under `failed-results/` are tied to superseded
packets. They are preserved for audit but are **uncounted**, even where they
show 40/40. The invalid scorer runs and pre-DOM displayed passes are likewise
preserved and uncounted; no missing per-sample values were reconstructed.
