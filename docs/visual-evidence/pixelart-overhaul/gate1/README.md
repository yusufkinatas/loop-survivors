# User gate 1: selected art-direction reference

Gate 1 closed on 2026-07-18 when the player selected **Arcade Reliquary**.
The temporary candidate runtime and generator have been retired. This packet
keeps the decision evidence that remains useful during production review.

## Preserved reference set

The `reference/` tree intentionally contains exactly ten lossless PNGs copied
byte-for-byte from the completed candidate packet:

| Selected-direction view | File |
| --- | --- |
| Truth scene | `reference/arcade-reliquary/truth-scene.png` |
| Grayscale | `reference/arcade-reliquary/grayscale.png` |
| Silhouettes | `reference/arcade-reliquary/silhouettes.png` |
| Hitbox overlay | `reference/arcade-reliquary/hitbox-overlay.png` |
| Crowded combat | `reference/arcade-reliquary/crowded-combat.png` |

The five boards in `reference/comparisons/` are `truth.png`, `grayscale.png`,
`silhouettes.png`, `hitboxes.png`, and `crowded.png`. Each compares Gilded
Ossuary, Moonlit Tapestry, and Arcade Reliquary from left to right under the
same scene composition and geometry.

## Review record

The first independent critique rejected all three directions. It identified an
over-similar Moonlit player/humanoid pair, transparent gaps inside collision
cores, weak projectile focal coverage, ambiguous size metadata, and a hitbox
view that had not yet proved runtime composition.

The revision separated the Moonlit silhouettes, filled actor and projectile
cores, distinguished frame dimensions from measured visible extents, named the
art-local and simulation-world coordinate spaces, and rebuilt the hitbox view
from the atlas plus runtime graphics. A final size pass aligned player and
rare-pickup visible heights without changing collision geometry. Independent
re-review then passed all three directions.

Arcade Reliquary was recommended and selected for its clearest native-size
scan, strongest grayscale and crowded-combat hierarchy, and lowest projected
catalog-production cost. Its box-and-token silhouettes, cyan player focus,
magenta hostile cores, orange attack language, and stepped UI construction
became the production rules.

## Archive status

These PNGs are decision evidence, not runtime inputs. The candidate atlases,
metadata, exact-enlargement boards, rejected-direction individual boards,
in-engine review captures, `#art-directions` route, and candidate build/check
tooling were removed after selection. Production art has its own deterministic
builder and verification path.
